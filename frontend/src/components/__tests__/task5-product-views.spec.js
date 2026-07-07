import { shallowMount } from '@vue/test-utils'
import ViewProductModal from '@/components/products/ViewProductModal.vue'
import ProductOverview from '@/components/products/ProductOverview.vue'

describe('ViewProductModal expiry removal', () => {
  it('does not show Expiry Date label', () => {
    const wrapper = shallowMount(ViewProductModal, {
      props: {
        show: true,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', expiry_date: '2026-12-01' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})

describe('ProductOverview nearest expiry removal', () => {
  it('does not show Nearest Expiry label', () => {
    const wrapper = shallowMount(ProductOverview, {
      props: {
        product: { product_id: 1, product_name: 'RC Cola 1.5L', batches: [] }
      }
    })
    expect(wrapper.text()).not.toContain('Nearest Expiry')
  })
})
