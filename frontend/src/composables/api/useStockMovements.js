import { ref } from 'vue'
import { api } from '@/services/api.js'

export function useStockMovements() {
  const movements = ref([])
  const loading = ref(false)
  const error = ref(null)

  const fetchMovements = async ({ dateFrom, dateTo, productId } = {}) => {
    loading.value = true
    error.value = null
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo)   params.date_to = dateTo
      if (productId) params.product_id = productId
      const response = await api.get('/stock/movements/', { params })
      movements.value = response.data.data || []
    } catch (err) {
      error.value = err.message || 'Failed to load movements'
    } finally {
      loading.value = false
    }
  }

  const groupByProductAndDate = (mvs, dates, products) => {
    const map = new Map()
    products.forEach(p => {
      const inner = new Map()
      dates.forEach(d => inner.set(d, { in: 0, out: 0, adjustment: 0, net: 0 }))
      map.set(p.product_id, inner)
    })
    mvs.forEach(m => {
      const perProduct = map.get(m.product_id)
      if (!perProduct) return
      const cell = perProduct.get(m.date)
      if (!cell) return
      if (m.type === 'in') {
        cell.in += m.quantity
        cell.net += m.quantity
      } else if (m.type === 'out') {
        cell.out += m.quantity
        cell.net -= m.quantity
      } else if (m.type === 'adjustment') {
        const signed = m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity
        cell.adjustment += signed
        cell.net += signed
      }
    })
    return map
  }

  const computeRunningBalance = (product, mvs, dates) => {
    if (dates.length === 0) return new Map()
    const relevant = mvs.filter(m => m.product_id === product.product_id)
    const netInRange = relevant
      .filter(m => m.date >= dates[0] && m.date <= dates[dates.length - 1])
      .reduce((sum, m) => {
        if (m.type === 'in') return sum + m.quantity
        if (m.type === 'out') return sum - m.quantity
        if (m.type === 'adjustment') {
          return sum + (m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity)
        }
        return sum
      }, 0)
    const afterRangeNet = relevant
      .filter(m => m.date > dates[dates.length - 1])
      .reduce((sum, m) => {
        if (m.type === 'in') return sum + m.quantity
        if (m.type === 'out') return sum - m.quantity
        if (m.type === 'adjustment') {
          return sum + (m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity)
        }
        return sum
      }, 0)
    let running = (product.total_stock ?? 0) - netInRange - afterRangeNet
    const balances = new Map()
    dates.forEach(d => {
      const dayMovements = relevant.filter(m => m.date === d)
      dayMovements.forEach(m => {
        if (m.type === 'in') running += m.quantity
        else if (m.type === 'out') running -= m.quantity
        else if (m.type === 'adjustment') {
          running += m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity
        }
      })
      balances.set(d, running)
    })
    return balances
  }

  const computeDailyTotals = (mvs, dates) => {
    const totals = new Map()
    dates.forEach(d => totals.set(d, { in: 0, out: 0, net: 0 }))
    mvs.forEach(m => {
      const cell = totals.get(m.date)
      if (!cell) return
      if (m.type === 'in') {
        cell.in += m.quantity
        cell.net += m.quantity
      } else if (m.type === 'out') {
        cell.out += m.quantity
        cell.net -= m.quantity
      } else if (m.type === 'adjustment') {
        const signed = m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity
        cell.net += signed
      }
    })
    return totals
  }

  return {
    movements,
    loading,
    error,
    fetchMovements,
    groupByProductAndDate,
    computeRunningBalance,
    computeDailyTotals,
  }
}
