import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref, computed } from 'vue'

const mockComposable = {
  activeProducts: ref([
    { product_id: 'prod_001', product_name: 'RC Cola 330mL Can (Case/24)', total_stock: 100, loose_bottles: 5 },
    { product_id: 'prod_002', product_name: 'RC Cola 500mL PET (Case/24)', total_stock: 50,  loose_bottles: 0 },
  ]),
  entries: ref({
    prod_001: { cases_sold: 0, loose_bottles: 5 },
    prod_002: { cases_sold: 0, loose_bottles: 0 },
  }),
  changedItems: ref([]),
  flaggedItems: ref([]),
  hasChanges: ref(false),
  loading: ref(false),
  productsLoading: ref(false),
  submitted: ref(false),
  lastSubmission: ref(null),
  error: ref(null),
  initEntries: vi.fn(),
  initializeProducts: vi.fn().mockResolvedValue(undefined),
  submitEod: vi.fn().mockResolvedValue({ success: true }),
  resetForm: vi.fn(),
}

vi.mock('@/composables/api/useEodUpdate.js', () => ({
  useEodUpdate: () => mockComposable,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import EodUpdate from '../EodUpdate.vue'

describe('EodUpdate.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComposable.submitted.value = false
    mockComposable.hasChanges.value = false
    mockComposable.flaggedItems.value = []
    mockComposable.changedItems.value = []
  })

  it('renders the page heading', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.text()).toContain('End of Day Stock Update')
  })

  it('renders a row for each active product in entry step', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="product-row"]')).toHaveLength(2)
  })

  it('preview button is disabled when no changes', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    const btn = wrapper.find('[data-testid="preview-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows reconciliation warning banner when flaggedItems exist in preview step', async () => {
    mockComposable.flaggedItems.value = [{ product_id: 'prod_001', product_name: 'RC Cola 330mL', cases_sold: 150, loose_bottles: 5, stock_before: 100, stock_after: -50, needs_reconciliation: true }]
    mockComposable.hasChanges.value = true
    mockComposable.changedItems.value = mockComposable.flaggedItems.value
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    // Switch to preview step
    // setData fails with Vue 3 setup() refs ("object is not extensible"), use direct vm assignment
    wrapper.vm.step = 'preview'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="recon-banner"]').exists()).toBe(true)
  })

  it('shows success view when submitted is true', async () => {
    mockComposable.submitted.value = true
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="success-view"]').exists()).toBe(true)
  })
})
