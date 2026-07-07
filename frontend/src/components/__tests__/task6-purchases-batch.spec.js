import { shallowMount } from '@vue/test-utils'
import ProductPurchases from '@/components/products/ProductPurchases.vue'
import BatchDetailsModal from '@/components/products/BatchDetailsModal.vue'

describe('ProductPurchases expiry removal', () => {
  it('does not show Expired status option or Expiring Soon filter', () => {
    const wrapper = shallowMount(ProductPurchases, {
      props: {
        productId: 1,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', unit: 'bottle' }
      }
    })
    expect(wrapper.text()).not.toContain('Expired')
    expect(wrapper.text()).not.toContain('Expiring Soon')
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})

describe('BatchDetailsModal (products) expiry removal', () => {
  it('does not show Expiry Date row', () => {
    const wrapper = shallowMount(BatchDetailsModal, {
      props: {
        show: true,
        batch: { batch_id: 'B001', quantity_received: 100, quantity_remaining: 50, expiry_date: '2026-12-01' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
