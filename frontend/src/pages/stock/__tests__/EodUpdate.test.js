import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const mockComposable = {
  activeProducts: ref([
    { product_id: 'prod_a', product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 100, back_order: 0, loose_bottles: 8, case_size: 12 },
    { product_id: 'prod_b', product_name: '240mL Lemon',  flavor: 'Lemon',   pack_size: '240mL', total_stock: 50,  back_order: 1, loose_bottles: 0, case_size: 24 },
  ]),
  entries: ref({
    prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
    prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
  }),
  assortedSales: ref({}),
  assortments: ref([
    { assortment_id: 'asrt_mega', name: 'Mega Assorted', price: 275, pack_size_label: 'Case of 12', items: [
      { product_id: 'prod_a', bottles: 4 },
    ] },
  ]),
  assortmentsLoading: ref(false),
  fetchAssortments: vi.fn().mockResolvedValue(undefined),
  assortmentEffects: ref({}),
  assortmentPreview: ref([]),
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
    mockComposable.assortedSales.value = {}
    mockComposable.assortmentPreview.value = []
    mockComposable.assortmentEffects.value = {}
    mockComposable.entries.value = {
      prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
      prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
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

  it('shows the Assorted Sales section on the entry step', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="assorted-sales-section"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Assorted Sales')
    const rows = wrapper.findAll('[data-testid="assortment-row"]')
    expect(rows).toHaveLength(1)
  })

  it('adding a product to the working set renders four inputs (cases in, out, bo, loose)', async () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    await wrapper.vm.addToWorkingSet('prod_a')
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('[data-testid="product-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('[data-testid="input-cases-in"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-cases-out"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-bo-delta"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-loose-delta"]').exists()).toBe(true)
  })

  it('renders assortment preview breakdown when assortmentPreview is populated', async () => {
    mockComposable.assortedSales.value = { asrt_mega: 1 }
    mockComposable.assortmentPreview.value = [{
      assortment_id: 'asrt_mega',
      name: 'Mega Assorted',
      qty: 1,
      effects: [
        { product_id: 'prod_a', bottles_needed: 4, from_loose: 4, from_cases_broken: 0, cases_broken: 0 },
      ],
    }]
    mockComposable.hasChanges.value = true
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    wrapper.vm.step = 'preview'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="assortment-preview"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Mega Assorted')
  })

  it('preview button disabled when hasChanges is false', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    const btn = wrapper.find('[data-testid="preview-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows reconciliation banner in preview when flaggedItems present', async () => {
    mockComposable.flaggedItems.value = [{
      product_id: 'prod_a', product_name: 'Mega RC Cola', cases_in: 0, cases_out_direct: 150,
      cases_broken: 0, cases_out_total: 150, bo_delta: 0,
      loose_delta_direct: 0, loose_delta_from_assortment: 0, loose_delta_total: 0,
      stock_before: 100, stock_after: -50, loose_before: 8, loose_after: 8,
      needs_reconciliation: true,
    }]
    mockComposable.hasChanges.value = true
    mockComposable.changedItems.value = mockComposable.flaggedItems.value
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    wrapper.vm.step = 'preview'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="recon-banner"]').exists()).toBe(true)
  })

  it('shows success view when submitted is true', () => {
    mockComposable.submitted.value = true
    mockComposable.lastSubmission.value = { movements: [], status: 'applied' }
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="success-view"]').exists()).toBe(true)
  })
})
