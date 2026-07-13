import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const mockComposable = {
  activeProducts: ref([
    { product_id: 'prod_a', product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 100, back_order: 0 },
    { product_id: 'prod_b', product_name: '240mL Lemon', flavor: 'Lemon', pack_size: '240mL',   total_stock: 50,  back_order: 1 },
  ]),
  entries: ref({
    prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0 },
    prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0 },
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

import EodUpdate from '../EodUpdate.vue'

describe('EodUpdate.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComposable.submitted.value = false
    mockComposable.hasChanges.value = false
    mockComposable.flaggedItems.value = []
    mockComposable.changedItems.value = []
    mockComposable.entries.value = {
      prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0 },
      prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0 },
    }
  })

  it('renders the page heading', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.text()).toContain('End of Day Stock Update')
  })

  it('starts with empty working set (sparse mode) and shows the picker', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="product-row"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="product-picker"]').exists()).toBe(true)
  })

  it('adding a product to the working set renders a product row with three inputs', async () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    await wrapper.vm.addToWorkingSet('prod_a')
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('[data-testid="product-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('[data-testid="input-cases-in"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-cases-out"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-bo-delta"]').exists()).toBe(true)
  })

  it('preview button disabled when hasChanges is false', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    const btn = wrapper.find('[data-testid="preview-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows reconciliation banner in preview when flaggedItems present', async () => {
    mockComposable.flaggedItems.value = [
      { product_id: 'prod_a', product_name: 'Mega RC Cola', cases_in: 0, cases_out: 150, bo_delta: 0, stock_before: 100, stock_after: -50, needs_reconciliation: true },
    ]
    mockComposable.hasChanges.value = true
    mockComposable.changedItems.value = mockComposable.flaggedItems.value
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
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
