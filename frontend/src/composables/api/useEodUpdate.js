import { ref, computed } from 'vue'
import { api } from '@/services/api.js'
import { useProducts } from './useProducts.js'

// State (entries, submitted, lastSubmission, history, error) is scoped per
// component instance — each useEodUpdate() call produces fresh refs.
// Cross-route continuity relies on the mock interceptor mutating
// MOCK_STOCK_MOVEMENTS in place, which StockHistory.vue re-reads on mount.

export function useEodUpdate() {
  const { products, loading: productsLoading, initializeProducts } = useProducts()

  const entries = ref({})
  const loading = ref(false)
  const error = ref(null)
  const submitted = ref(false)
  const lastSubmission = ref(null)

  const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'active')
  )

  const initEntries = () => {
    const map = {}
    activeProducts.value.forEach(p => {
      map[p.product_id] = { cases_in: 0, cases_out: 0, bo_delta: 0 }
    })
    entries.value = map
  }

  const changedItems = computed(() =>
    activeProducts.value
      .map(p => {
        const entry = entries.value[p.product_id] || { cases_in: 0, cases_out: 0, bo_delta: 0 }
        const stock_before = p.total_stock ?? 0
        const stock_after = stock_before + entry.cases_in - entry.cases_out
        const changed = entry.cases_in !== 0 || entry.cases_out !== 0 || entry.bo_delta !== 0
        return {
          product_id: p.product_id,
          product_name: p.product_name,
          cases_in: entry.cases_in,
          cases_out: entry.cases_out,
          bo_delta: entry.bo_delta,
          stock_before,
          stock_after,
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

  const hasChanges = computed(() => changedItems.value.length > 0)

  const submitEod = async (entryDate) => {
    loading.value = true
    error.value = null
    try {
      const payload = {
        entry_date: entryDate,
        items: changedItems.value.map(i => ({
          product_id: i.product_id,
          cases_in: i.cases_in,
          cases_out: i.cases_out,
          bo_delta: i.bo_delta,
        })),
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
    initEntries()
  }

  return {
    products,
    activeProducts,
    entries,
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
