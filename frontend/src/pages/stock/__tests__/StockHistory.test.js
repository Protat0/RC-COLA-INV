import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const MOCK_MOVEMENTS = [
  { movement_id: 'mv_1', product_id: 'prod_a', date: '2026-07-05', type: 'in',  quantity: 10, note: null, created_at: '2026-07-05T09:00:00.000Z' },
  { movement_id: 'mv_2', product_id: 'prod_a', date: '2026-07-05', type: 'out', quantity: 3,  note: null, created_at: '2026-07-05T17:00:00.000Z' },
  { movement_id: 'mv_3', product_id: 'prod_b', date: '2026-07-06', type: 'out', quantity: 2,  note: null, created_at: '2026-07-06T17:00:00.000Z' },
]

const mockMovementsComposable = {
  movements: ref(MOCK_MOVEMENTS),
  loading: ref(false),
  error: ref(null),
  fetchMovements: vi.fn().mockResolvedValue(undefined),
  groupByProductAndDate: vi.fn((mvs, dates, products) => {
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
      if (m.type === 'in')  { cell.in += m.quantity;  cell.net += m.quantity }
      if (m.type === 'out') { cell.out += m.quantity; cell.net -= m.quantity }
    })
    return map
  }),
  computeRunningBalance: vi.fn(() => new Map([['2026-07-05', 7], ['2026-07-06', 5]])),
  computeDailyTotals: vi.fn(() => new Map([
    ['2026-07-05', { in: 10, out: 3, net: 7 }],
    ['2026-07-06', { in: 0, out: 2, net: -2 }],
  ])),
}

const mockProductsComposable = {
  products: ref([
    { product_id: 'prod_a', product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 5, back_order: 0, status: 'active' },
    { product_id: 'prod_b', product_name: '240mL Lemon', flavor: 'Lemon', pack_size: '240mL',   total_stock: 3, back_order: 1, status: 'active' },
  ]),
  loading: ref(false),
  initializeProducts: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/api/useStockMovements.js', () => ({
  useStockMovements: () => mockMovementsComposable,
}))
vi.mock('@/composables/api/useProducts.js', () => ({
  useProducts: () => mockProductsComposable,
}))

import StockHistory from '../StockHistory.vue'

describe('StockHistory.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMovementsComposable.movements.value = MOCK_MOVEMENTS
  })

  it('renders a row per active product in the matrix', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="matrix-row"]')).toHaveLength(2)
  })

  it('renders a date column per day in the range', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    // Default range = 14 days
    const dateHeaders = wrapper.findAll('[data-testid="date-header"]')
    expect(dateHeaders.length).toBe(14)
  })

  it('renders the aggregate footer row', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="aggregate-footer"]').exists()).toBe(true)
  })

  it('shows empty state when no movements load', async () => {
    mockMovementsComposable.movements.value = []
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('calls fetchMovements on mount', async () => {
    shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(mockMovementsComposable.fetchMovements).toHaveBeenCalled()
  })

  it('shows load-error banner when error is set', async () => {
    mockMovementsComposable.error.value = 'Network Error'
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="error-banner"]').exists()).toBe(true)
    mockMovementsComposable.error.value = null
  })
})
