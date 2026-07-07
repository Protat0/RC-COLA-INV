import { shallowMount } from '@vue/test-utils'
import AddProductModal from '@/components/products/AddProductModal.vue'

describe('AddProductModal expiry removal', () => {
  it('does not render an expiry date input', () => {
    const wrapper = shallowMount(AddProductModal, {
      props: { show: true },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.find('#batch_expiry_date').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
