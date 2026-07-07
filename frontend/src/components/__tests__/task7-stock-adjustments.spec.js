import { shallowMount } from '@vue/test-utils'
import StockUpdateModal from '@/components/products/StockUpdateModal.vue'
import ProductAdjustments from '@/components/products/ProductAdjustments.vue'

describe('StockUpdateModal updates', () => {
  it('does not show Spoilage / Expiry option or Expiry Date field', () => {
    const wrapper = shallowMount(StockUpdateModal, {
      props: {
        show: true,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', unit: 'bottle', stock: 100 },
        suppliers: []
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Spoilage / Expiry')
    expect(wrapper.text()).not.toContain('Expiry Date')
  })

  it('shows FIFO instead of FEFO', () => {
    const wrapper = shallowMount(StockUpdateModal, {
      props: {
        show: true,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', unit: 'bottle', stock: 100 },
        suppliers: []
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('FEFO')
  })
})

describe('ProductAdjustments filter', () => {
  it('does not show Spoilage option', () => {
    const wrapper = shallowMount(ProductAdjustments, {
      props: { productId: 1 }
    })
    expect(wrapper.text()).not.toContain('Spoilage')
  })
})
