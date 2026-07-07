import { shallowMount } from '@vue/test-utils'
import BatchDetailsModal from '@/components/suppliers/BatchDetailsModal.vue'
import CreateOrderModal from '@/components/suppliers/CreateOrderModal.vue'

describe('Supplier BatchDetailsModal expiry removal', () => {
  it('does not show Expiry Date column', () => {
    const wrapper = shallowMount(BatchDetailsModal, {
      props: {
        show: true,
        order: { order_id: 'O001', batches: [] },
        supplier: { supplier_id: 1, supplier_name: 'RC Cola Distrib.' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})

describe('CreateOrderModal expiry removal', () => {
  it('does not show Expiry Date field in order items', () => {
    const wrapper = shallowMount(CreateOrderModal, {
      props: {
        show: true,
        supplier: { supplier_id: 1, supplier_name: 'RC Cola Distrib.' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
