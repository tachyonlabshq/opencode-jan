import { validateHookInput } from '../utils/validation'

export function createEventHook() {
  return async ({ event }: { event: any }) => {
    // Validate event input
    const validation = validateHookInput('event', { event })
    if (!validation.isValid) {
      console.error('[opencode-jan] Invalid event input:', validation.errors)
      return
    }
    
    // Monitor for session events to provide Jan API status
    if (event.type === "session.created" || event.type === "session.updated") {
      // Could add Jan health check monitoring here in the future
    }
  }
}
