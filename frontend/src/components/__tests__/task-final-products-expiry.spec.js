import { shallowMount } from '@vue/test-utils'
import Products from '@/pages/inventory/Products.vue'

describe('Products inventory table expiry removal', () => {
  it('does not show Expiry Date column header', () => {
    const wrapper = shallowMount(Products, {
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
