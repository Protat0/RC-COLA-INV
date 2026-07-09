import { ref, computed } from 'vue'
import { api } from '@/services/api.js'
import { useProducts } from './useProducts.js'

// State (entries, submitted, lastSubmission, history, error) is scoped per
// component instance — each useEodUpdate() call produces fresh refs.
// Cross-route continuity for submitted EOD entries relies on the mock
// interceptor mutating MOCK_EOD_HISTORY in place, which StockHistory.vue
// re-reads on mount via fetchHistory().
export function useEodUpdate() {
  const { products, loading: productsLoading, initializeProducts } = useProducts()

  const entries = ref({})
  const loading = ref(false)
  const error = ref(null)
  const submitted = ref(false)
  const lastSubmission = ref(null)
  const history = ref([])
  const historyLoading = ref(false)

  const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'active')
  )

  const initEntries = () => {
    const map = {}
    activeProducts.value.forEach(p => {
      map[p.product_id] = {
        cases_sold: 0,
        loose_bottles: p.loose_bottles ?? 0,
      }
    })
    entries.value = map
  }

  const changedItems = computed(() =>
    activeProducts.value
      .map(p => {
        const entry = entries.value[p.product_id] || { cases_sold: 0, loose_bottles: p.loose_bottles ?? 0 }
        const stock_before = p.total_stock ?? 0
        const stock_after = stock_before - entry.cases_sold
        const looseOriginal = p.loose_bottles ?? 0
        const looseChanged = entry.loose_bottles !== looseOriginal
        return {
          product_id: p.product_id,
          product_name: p.product_name,
          cases_sold: entry.cases_sold,
          loose_bottles: entry.loose_bottles,
          stock_before,
          stock_after,
          needs_reconciliation: stock_after < 0,
          _has_changes: entry.cases_sold > 0 || looseChanged,
        }
      })
      .filter(item => item._has_changes)
      .map(({ _has_changes, ...item }) => item)
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
        items: changedItems.value,
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

  const fetchHistory = async () => {
    historyLoading.value = true
    try {
      const response = await api.get('/stock/eod/history/')
      history.value = response.data.data || []
    } catch (err) {
      error.value = err.message || 'Failed to load history'
    } finally {
      historyLoading.value = false
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
    history,
    historyLoading,
    changedItems,
    flaggedItems,
    hasChanges,
    initEntries,
    initializeProducts,
    submitEod,
    fetchHistory,
    resetForm,
  }
}
