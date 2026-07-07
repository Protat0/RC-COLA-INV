import { shallowMount } from '@vue/test-utils'
import Dashboard from '@/pages/Dashboard.vue'

describe('Dashboard labels', () => {
  it('shows Total Units Sold instead of Total Items Sold', () => {
    const wrapper = shallowMount(Dashboard, {
      global: {
        stubs: { CardTemplate: true, RefreshCw: true }
      }
    })
    expect(wrapper.html()).toContain('Total Units Sold')
    expect(wrapper.html()).not.toContain('Total Items Sold')
  })
})
