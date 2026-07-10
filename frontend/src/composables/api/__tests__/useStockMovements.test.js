import { vi } from 'vitest'

vi.mock('@/services/api.js', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/services/api.js'
import { useStockMovements } from '../useStockMovements.js'

const MOCK_MOVEMENTS = [
  { movement_id: 'mv_1', product_id: 'prod_a', date: '2026-07-05', type: 'in',  quantity: 10, note: null, created_at: '2026-07-05T09:00:00.000Z' },
  { movement_id: 'mv_2', product_id: 'prod_a', date: '2026-07-05', type: 'out', quantity: 3,  note: null, created_at: '2026-07-05T17:00:00.000Z' },
  { movement_id: 'mv_3', product_id: 'prod_a', date: '2026-07-06', type: 'out', quantity: 2,  note: null, created_at: '2026-07-06T17:00:00.000Z' },
  { movement_id: 'mv_4', product_id: 'prod_b', date: '2026-07-05', type: 'in',  quantity: 5,  note: null, created_at: '2026-07-05T09:00:00.000Z' },
  { movement_id: 'mv_5', product_id: 'prod_a', date: '2026-07-06', type: 'adjustment', adjustment_direction: 'increase', quantity: 1, note: null, created_at: '2026-07-06T11:00:00.000Z' },
]

describe('useStockMovements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchMovements returns data from api', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: MOCK_MOVEMENTS } })
    const { movements, fetchMovements } = useStockMovements()
    await fetchMovements()
    expect(api.get).toHaveBeenCalledWith('/stock/movements/', { params: {} })
    expect(movements.value).toHaveLength(5)
  })

  it('fetchMovements forwards dateFrom/dateTo/productId as query params', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [] } })
    const { fetchMovements } = useStockMovements()
    await fetchMovements({ dateFrom: '2026-07-01', dateTo: '2026-07-31', productId: 'prod_a' })
    expect(api.get).toHaveBeenCalledWith('/stock/movements/', {
      params: { date_from: '2026-07-01', date_to: '2026-07-31', product_id: 'prod_a' },
    })
  })

  it('groupByProductAndDate produces per-product-per-date sums', () => {
    const { groupByProductAndDate } = useStockMovements()
    const grouped = groupByProductAndDate(MOCK_MOVEMENTS, ['2026-07-05', '2026-07-06'], [{ product_id: 'prod_a' }, { product_id: 'prod_b' }])
    const aOn5 = grouped.get('prod_a').get('2026-07-05')
    expect(aOn5).toEqual({ in: 10, out: 3, adjustment: 0, net: 7 })
    const aOn6 = grouped.get('prod_a').get('2026-07-06')
    expect(aOn6).toEqual({ in: 0, out: 2, adjustment: 1, net: -1 })
    const bOn5 = grouped.get('prod_b').get('2026-07-05')
    expect(bOn5).toEqual({ in: 5, out: 0, adjustment: 0, net: 5 })
    const bOn6 = grouped.get('prod_b').get('2026-07-06')
    expect(bOn6).toEqual({ in: 0, out: 0, adjustment: 0, net: 0 })
  })

  it('computeRunningBalance walks dates forward ending at current total_stock', () => {
    const product = { product_id: 'prod_a', total_stock: 6 }
    // net over [05, 06] = 7 + (-1) = 6, so start balance for the range = 0
    const { computeRunningBalance } = useStockMovements()
    const balances = computeRunningBalance(product, MOCK_MOVEMENTS, ['2026-07-05', '2026-07-06'])
    expect(balances.get('2026-07-05')).toBe(7)   // 0 + 7
    expect(balances.get('2026-07-06')).toBe(6)   // 7 + (-1)
  })

  it('computeDailyTotals sums across all products per date', () => {
    const { computeDailyTotals } = useStockMovements()
    const totals = computeDailyTotals(MOCK_MOVEMENTS, ['2026-07-05', '2026-07-06'])
    expect(totals.get('2026-07-05')).toEqual({ in: 15, out: 3, net: 12 })
    expect(totals.get('2026-07-06')).toEqual({ in: 0, out: 2, net: -1 })
  })

  it('adjustment with direction=decrease subtracts from net', () => {
    const decreaseMovements = [
      { movement_id: 'mv_x', product_id: 'prod_a', date: '2026-07-05', type: 'adjustment', adjustment_direction: 'decrease', quantity: 4, note: null, created_at: '2026-07-05T11:00:00.000Z' },
    ]
    const { groupByProductAndDate } = useStockMovements()
    const grouped = groupByProductAndDate(decreaseMovements, ['2026-07-05'], [{ product_id: 'prod_a' }])
    const cell = grouped.get('prod_a').get('2026-07-05')
    expect(cell).toEqual({ in: 0, out: 0, adjustment: -4, net: -4 })
  })
})
