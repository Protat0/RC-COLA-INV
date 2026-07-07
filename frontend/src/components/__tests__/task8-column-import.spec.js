import { shallowMount } from '@vue/test-utils'
import ColumnFilterModal from '@/components/products/ColumnFilterModal.vue'
import ImportModal from '@/components/products/ImportModal.vue'

describe('ColumnFilterModal expiry removal', () => {
  it('does not list Expiry Date as a column option', () => {
    const wrapper = shallowMount(ColumnFilterModal, {
      props: { show: true, visibleColumns: {} },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
    expect(wrapper.text()).not.toContain('Product expiration date')
  })
})

describe('ImportModal instructions', () => {
  it('does not mention expiry_date as required', () => {
    const wrapper = shallowMount(ImportModal, {
      props: { show: true },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.html()).not.toMatch(/expiry_date.*REQUIRED/i)
  })
})
