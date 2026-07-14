import { ref, computed } from 'vue'
import { api } from '@/services/api.js'
import { useProducts } from './useProducts.js'
import { useAssortments } from './useAssortments.js'
import { applyAssortedSales } from '@/utils/assortmentAlgorithm.js'
import { sortByVariant } from '@/data/mockData.js'

// State (entries, submitted, lastSubmission, error, assortedSales) is scoped
// per component instance — each useEodUpdate() call produces fresh refs.
// Cross-route continuity relies on the mock interceptor mutating
// MOCK_STOCK_MOVEMENTS + product state in place.

export function useEodUpdate() {
  const { products, loading: productsLoading, initializeProducts } = useProducts()
  const {
    assortments,
    loading: assortmentsLoading,
    fetchAssortments,
  } = useAssortments()

  const entries = ref({})
  const assortedSales = ref({})     // { [assortment_id]: qty }
  const loading = ref(false)
  const error = ref(null)
  const submitted = ref(false)
  const lastSubmission = ref(null)

  const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'active').sort(sortByVariant)
  )

  const initEntries = () => {
    const map = {}
    activeProducts.value.forEach(p => {
      map[p.product_id] = { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 }
    })
    entries.value = map
  }

  // Convert assortedSales object into the algorithm's `sales` array
  const activeAssortedSales = computed(() =>
    Object.entries(assortedSales.value)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([assortment_id, qty]) => ({ assortment_id, qty: Number(qty) }))
  )

  // Run the algorithm live against the current products + loose state
  const algoResult = computed(() => {
    if (activeAssortedSales.value.length === 0 || assortments.value.length === 0) {
      return { casesBroken: {}, looseChanges: {}, breakdown: [] }
    }
    const initialLoose = {}
    activeProducts.value.forEach(p => {
      initialLoose[p.product_id] = p.loose_bottles ?? 0
    })
    try {
      return applyAssortedSales({
        sales: activeAssortedSales.value,
        assortments: assortments.value,
        products: activeProducts.value,
        initialLoose,
      })
    } catch {
      // Bad state (e.g. selected assortment references a missing product) —
      // return an empty result rather than exploding the preview. The UI
      // will still show the entries; the interceptor will surface any
      // real error on submit.
      return { casesBroken: {}, looseChanges: {}, breakdown: [] }
    }
  })

  const assortmentEffects = computed(() => {
    const effects = {}
    const { casesBroken, looseChanges } = algoResult.value
    Object.keys(casesBroken).forEach(pid => {
      effects[pid] = effects[pid] || { cases_broken: 0, loose_delta: 0 }
      effects[pid].cases_broken = casesBroken[pid]
    })
    Object.keys(looseChanges).forEach(pid => {
      effects[pid] = effects[pid] || { cases_broken: 0, loose_delta: 0 }
      effects[pid].loose_delta = looseChanges[pid]
    })
    return effects
  })

  const assortmentPreview = computed(() => {
    const nameById = new Map(assortments.value.map(a => [a.assortment_id, a.name]))
    return algoResult.value.breakdown.map(b => ({
      assortment_id: b.assortment_id,
      name: nameById.get(b.assortment_id) || b.assortment_id,
      qty: b.qty,
      effects: b.effects,
    }))
  })

  const changedItems = computed(() =>
    activeProducts.value
      .map(p => {
        const entry = entries.value[p.product_id] || { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 }
        const effect = assortmentEffects.value[p.product_id] || { cases_broken: 0, loose_delta: 0 }
        const cases_in = entry.cases_in
        const cases_out_direct = entry.cases_out
        const cases_broken = effect.cases_broken
        const cases_out_total = cases_out_direct + cases_broken
        const bo_delta = entry.bo_delta
        const loose_delta_direct = entry.loose_delta
        const loose_delta_from_assortment = effect.loose_delta
        const loose_delta_total = loose_delta_direct + loose_delta_from_assortment
        const stock_before = p.total_stock ?? 0
        const stock_after = stock_before + cases_in - cases_out_total
        const loose_before = p.loose_bottles ?? 0
        const loose_after = Math.max(0, loose_before + loose_delta_total)
        const changed =
          cases_in !== 0 ||
          cases_out_direct !== 0 ||
          cases_broken !== 0 ||
          bo_delta !== 0 ||
          loose_delta_direct !== 0 ||
          loose_delta_from_assortment !== 0
        return {
          product_id: p.product_id,
          product_name: p.product_name,
          flavor: p.flavor,
          pack_size: p.pack_size,
          cases_in,
          cases_out_direct,
          cases_broken,
          cases_out_total,
          bo_delta,
          loose_delta_direct,
          loose_delta_from_assortment,
          loose_delta_total,
          stock_before,
          stock_after,
          loose_before,
          loose_after,
          needs_reconciliation: stock_after < 0,
          _changed: changed,
        }
      })
      .filter(item => item._changed)
      .map(({ _changed, ...item }) => item)
  )

  const flaggedItems = computed(() =>
    changedItems.value.filter(i => i.needs_reconciliation)
  )

  const hasChanges = computed(() =>
    changedItems.value.length > 0 || activeAssortedSales.value.length > 0
  )

  const submitEod = async (entryDate) => {
    loading.value = true
    error.value = null
    try {
      // items payload uses DIRECT values only; the interceptor re-runs the
      // algorithm against server-side state to produce assortment cases.
      const itemsPayload = Object.entries(entries.value)
        .filter(([, e]) =>
          e.cases_in !== 0 ||
          e.cases_out !== 0 ||
          e.bo_delta !== 0 ||
          e.loose_delta !== 0
        )
        .map(([product_id, e]) => ({
          product_id,
          cases_in: e.cases_in,
          cases_out: e.cases_out,
          bo_delta: e.bo_delta,
          loose_delta: e.loose_delta,
        }))

      const payload = {
        entry_date: entryDate,
        items: itemsPayload,
        assorted_sales: activeAssortedSales.value,
      }
      const response = await api.post('/stock/eod/', payload)
      lastSubmission.value = response.data.data
      submitted.value = true
      return response.data
    } catch (err) {
      error.value = err.message || 'Failed to submit EOD update'
      throw err
    } finally {
      loading.value = false
    }
  }

  const resetForm = () => {
    submitted.value = false
    lastSubmission.value = null
    error.value = null
    assortedSales.value = {}
    initEntries()
  }

  return {
    products,
    activeProducts,
    entries,
    assortedSales,
    assortments,
    assortmentsLoading,
    fetchAssortments,
    assortmentEffects,
    assortmentPreview,
    loading,
    productsLoading,
    error,
    submitted,
    lastSubmission,
    changedItems,
    flaggedItems,
    hasChanges,
    initEntries,
    initializeProducts,
    submitEod,
    resetForm,
  }
}
