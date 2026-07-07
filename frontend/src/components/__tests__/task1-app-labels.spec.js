import { describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import Sidebar from '@/layouts/Sidebar.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})

describe('Sidebar brand subtitle', () => {
  it('shows Distribution Inventory subtitle', async () => {
    const wrapper = shallowMount(Sidebar, {
      global: {
        plugins: [router],
        stubs: { 'router-link': true }
      }
    })
    expect(wrapper.text()).toContain('Distribution Inventory')
    expect(wrapper.text()).not.toContain('POS & Inventory')
  })
})
