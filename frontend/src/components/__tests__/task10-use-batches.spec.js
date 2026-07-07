import { useBatches } from '@/composables/api/useBatches.js'

describe('useBatches expiry cleanup', () => {
  it('does not expose expiredBatches', () => {
    const result = useBatches()
    expect(result.expiredBatches).toBeUndefined()
  })

  it('does not expose checkExpiryAlerts', () => {
    const result = useBatches()
    expect(result.checkExpiryAlerts).toBeUndefined()
  })

  it('does not expose markExpiredBatches', () => {
    const result = useBatches()
    expect(result.markExpiredBatches).toBeUndefined()
  })
})
