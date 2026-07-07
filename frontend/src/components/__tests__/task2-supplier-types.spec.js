import { describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import SupplierFormModal from '@/components/suppliers/SupplierFormModal.vue'

const minimalFormData = {
  supplier_name: '', contact_person: '', email: '',
  phone_number: '', type: '', address: '', notes: ''
}

describe('SupplierFormModal type options', () => {
  it('shows Beverage Distributor and not Food & Beverages', () => {
    const wrapper = shallowMount(SupplierFormModal, {
      props: { show: true, isEdit: false, formData: minimalFormData, isValid: false, formErrors: {}, loading: false, addAnother: false },
      global: { stubs: { Teleport: true } }
    })
    const text = wrapper.text()
    expect(text).toContain('Beverage Distributor')
    expect(text).not.toContain('Food & Beverages')
    expect(text).not.toContain('Raw Materials')
  })

  it('shows Logistics Partner and not Packaging Materials', () => {
    const wrapper = shallowMount(SupplierFormModal, {
      props: { show: true, isEdit: false, formData: minimalFormData, isValid: false, formErrors: {}, loading: false, addAnother: false },
      global: { stubs: { Teleport: true } }
    })
    const text = wrapper.text()
    expect(text).toContain('Logistics Partner')
    expect(text).not.toContain('Packaging Materials')
  })
})
