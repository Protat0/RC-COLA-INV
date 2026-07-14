import { ref } from 'vue'
import { api } from '@/services/api.js'

// Per-instance state. Consumers that need shared state should coordinate
// at the page level, matching the pattern used by useEodUpdate.

export function useAssortments() {
  const assortments = ref([])
  const loading = ref(false)
  const error = ref(null)

  const fetchAssortments = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/assortments/')
      assortments.value = response.data?.data ?? []
      return assortments.value
    } catch (err) {
      error.value = err.message || 'Failed to load assortments'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { assortments, loading, error, fetchAssortments }
}
