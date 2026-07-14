import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const isoDay = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

const mockMovements = ref([
  { movement_id: 'm1', product_id: 'prod_a', date: isoDay(-2), type: 'in',  quantity: 5, note: null, created_at: '' },
  { movement_id: 'm2', product_id: 'prod_a', date: isoDay(-1), type: 'out', quantity: 2, note: null, created_at: '' },
])

const mockMovementsComposable = {
  movements: mockMovements,
  loading: ref(false),
  error: ref(null),
  fetchMovements: vi.fn().mockResolvedValue(undefined),
  groupByProductAndDate: vi.fn(() => new Map()),
  computeRunningBalance: vi.fn(() => new Map()),
  computeDailyTotals: vi.fn(() => new Map()),
}

vi.mock('@/composables/api/useStockMovements.js', () => ({
  useStockMovements: () => mockMovementsComposable,
}))

const mockProductsComposable = {
  products: ref([
    { product_id: 'prod_a', product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 5, back_order: 0, loose_bottles: 8, status: 'active' },
    { product_id: 'prod_b', product_name: '240mL Lemon',  flavor: 'Lemon',   pack_size: '240mL', total_stock: 3, back_order: 1, loose_bottles: 0, status: 'active' },
  ]),
  loading: ref(false),
  initializeProducts: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/api/useProducts.js', () => ({
  useProducts: () => mockProductsComposable,
}))

import StockHistory from '../StockHistory.vue'

describe('StockHistory.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.text()).toContain('Stock History')
  })

  it('calls fetchMovements on mount', () => {
    shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(mockMovementsComposable.fetchMovements).toHaveBeenCalled()
  })

  it('renders a row per active product', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const rows = wrapper.findAll('[data-testid="matrix-row"]')
    expect(rows).toHaveLength(2)
  })

  it('renders a Loose column with each row showing the product loose_bottles', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const headers = wrapper.findAll('th')
    const looseHeader = headers.find(h => h.text() === 'Loose')
    expect(looseHeader).toBeTruthy()
    const looseCells = wrapper.findAll('[data-testid="loose-cell"]')
    expect(looseCells).toHaveLength(2)
    expect(looseCells[0].text()).toBe('8')
    expect(looseCells[1].text()).toBe('0')
  })

  it('renders a BO column showing back_order or em-dash when zero', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const headers = wrapper.findAll('th')
    const boHeader = headers.find(h => h.text() === 'BO')
    expect(boHeader).toBeTruthy()
    const boCells = wrapper.findAll('[data-testid="bo-cell"]')
    expect(boCells).toHaveLength(2)
    expect(boCells[0].text()).toBe('—') // prod_a has back_order: 0
    expect(boCells[1].text()).toBe('1') // prod_b has back_order: 1
  })

  it('renders a date column per day in the range', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const dateHeaders = wrapper.findAll('[data-testid="date-header"]')
    expect(dateHeaders.length).toBe(14)
  })

  it('renders the aggregate footer row', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="aggregate-footer"]').exists()).toBe(true)
  })
})
