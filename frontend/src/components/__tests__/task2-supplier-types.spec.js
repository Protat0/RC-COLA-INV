import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SupplierFormModal from '@/components/suppliers/SupplierFormModal.vue'

const minimalFormData = {
  supplier_name: '', contact_person: '', email: '',
  phone_number: '', type: '', address: '', notes: ''
}

describe('SupplierFormModal type options', () => {
  afterEach(() => {
    // Clean up the body after each test
    document.body.innerHTML = ''
  })

  it('shows Beverage Distributor and not Food & Beverages', () => {
    const wrapper = mount(SupplierFormModal, {
      props: { show: true, isEdit: false, formData: minimalFormData, isValid: false, formErrors: {}, loading: false, addAnother: false }
    })
    const bodyText = document.body.textContent
    expect(bodyText).toContain('Beverage Distributor')
    expect(bodyText).not.toContain('Food & Beverages')
    expect(bodyText).not.toContain('Raw Materials')
  })

  it('shows Logistics Partner and not Packaging Materials', () => {
    const wrapper = mount(SupplierFormModal, {
      props: { show: true, isEdit: false, formData: minimalFormData, isValid: false, formErrors: {}, loading: false, addAnother: false }
    })
    const bodyText = document.body.textContent
    expect(bodyText).toContain('Logistics Partner')
    expect(bodyText).not.toContain('Packaging Materials')
  })
})
