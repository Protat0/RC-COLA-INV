import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const MOCK_HISTORY = [
  {
    eod_id: 'eod_001',
    entry_date: '2026-07-07',
    created_at: '2026-07-07T18:15:00.000Z',
    items: [
      { product_id: 'prod_001', product_name: 'RC Cola 330mL', cases_sold: 15, loose_bottles: 3, stock_before: 465, stock_after: 450, needs_reconciliation: false },
    ],
    status: 'applied',
  },
  {
    eod_id: 'eod_002',
    entry_date: '2026-07-05',
    created_at: '2026-07-05T19:00:00.000Z',
    items: [
      { product_id: 'prod_005', product_name: 'RC Cola 2L PET', cases_sold: 68, loose_bottles: 2, stock_before: 60, stock_after: -8, needs_reconciliation: true },
    ],
    status: 'flagged',
  },
]

const mockComposable = {
  history: ref(MOCK_HISTORY),
  historyLoading: ref(false),
  error: ref(null),
  fetchHistory: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/api/useEodUpdate.js', () => ({
  useEodUpdate: () => mockComposable,
}))

import StockHistory from '../StockHistory.vue'

describe('StockHistory.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComposable.history.value = MOCK_HISTORY
    mockComposable.historyLoading.value = false
  })

  it('renders a row for each history entry', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="history-entry"]')).toHaveLength(2)
  })

  it('shows flagged badge for entries with status flagged', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const badges = wrapper.findAll('[data-testid="flagged-badge"]')
    expect(badges).toHaveLength(1)
  })

  it('shows empty state when history is empty', () => {
    mockComposable.history.value = []
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('calls fetchHistory on mount', () => {
    shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(mockComposable.fetchHistory).toHaveBeenCalledOnce()
  })
})
