import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock api before importing composable
vi.mock('@/services/api.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const MOCK_ACTIVE = [
  { product_id: 'prod_001', product_name: 'RC Cola 330mL', status: 'active', total_stock: 100, loose_bottles: 5 },
  { product_id: 'prod_002', product_name: 'RC Cola 500mL', status: 'active', total_stock: 50,  loose_bottles: 0 },
]
const MOCK_INACTIVE = { product_id: 'prod_003', product_name: 'Inactive', status: 'inactive', total_stock: 10, loose_bottles: 0 }

vi.mock('../useProducts.js', () => ({
  useProducts: vi.fn(() => ({
    products: { value: [...MOCK_ACTIVE, MOCK_INACTIVE] },
    loading: { value: false },
    initializeProducts: vi.fn(),
  })),
}))

import { useEodUpdate } from '../useEodUpdate.js'

describe('useEodUpdate', () => {
  it('initEntries creates entries only for active products', () => {
    const { entries, initEntries } = useEodUpdate()
    initEntries()
    expect(Object.keys(entries.value)).toHaveLength(2)
    expect(entries.value['prod_001']).toEqual({ cases_sold: 0, loose_bottles: 5 })
    expect(entries.value['prod_002']).toEqual({ cases_sold: 0, loose_bottles: 0 })
    expect(entries.value['prod_003']).toBeUndefined()
  })

  it('changedItems is empty when no cases_sold and no loose_bottles change', () => {
    const { changedItems, initEntries } = useEodUpdate()
    initEntries()
    expect(changedItems.value).toHaveLength(0)
  })

  it('changedItems includes product when cases_sold > 0', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].cases_sold = 10
    expect(changedItems.value).toHaveLength(1)
    expect(changedItems.value[0].product_id).toBe('prod_001')
    expect(changedItems.value[0].stock_before).toBe(100)
    expect(changedItems.value[0].stock_after).toBe(90)
  })

  it('changedItems includes product when loose_bottles value changes', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].loose_bottles = 8  // was 5
    expect(changedItems.value).toHaveLength(1)
    expect(changedItems.value[0].product_id).toBe('prod_001')
  })

  it('sets needs_reconciliation true when stock_after < 0', () => {
    const { entries, changedItems, flaggedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].cases_sold = 150  // stock is 100
    expect(changedItems.value[0].needs_reconciliation).toBe(true)
    expect(changedItems.value[0].stock_after).toBe(-50)
    expect(flaggedItems.value).toHaveLength(1)
  })

  it('does not flag items where stock_after >= 0', () => {
    const { entries, changedItems, flaggedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].cases_sold = 100  // exactly 0 remaining
    expect(changedItems.value[0].needs_reconciliation).toBe(false)
    expect(flaggedItems.value).toHaveLength(0)
  })

  it('hasChanges is false initially, true after editing', () => {
    const { entries, hasChanges, initEntries } = useEodUpdate()
    initEntries()
    expect(hasChanges.value).toBe(false)
    entries.value['prod_002'].cases_sold = 5
    expect(hasChanges.value).toBe(true)
  })
})
