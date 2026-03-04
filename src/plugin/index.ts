import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import { ToastNotifier } from '../ui/toast-notifier'
import { createConfigHook } from './config-hook'
import { createEventHook } from './event-hook'
import { createChatParamsHook } from './chat-params-hook'

/**
 * Jan Plugin - Enhanced Modular Version
 *
 * Features:
 * - Auto-detection of running Jan local API server
 * - Dynamic model discovery from Jan's OpenAI-compatible API
 * - Real-time model validation with smart error handling
 * - Comprehensive caching system with reduced API calls
 * - Model loading state monitoring with progress tracking
 * - Toast notifications for better UX
 * - Intelligent model suggestions and error recovery
 */
export const JanPlugin: Plugin = async (input: PluginInput) => {
  console.log('[opencode-jan] Jan plugin initialized')

  const { client } = input

  // Validate client
  if (!client || typeof client !== 'object') {
    console.error('[opencode-jan] Invalid client provided to plugin')
    return {
      config: async () => {},
      event: async () => {},
      'chat.params': async () => {},
    }
  }

  const toastNotifier = new ToastNotifier(client)

  return {
    config: createConfigHook(client, toastNotifier),
    event: createEventHook(),
    'chat.params': createChatParamsHook(toastNotifier),
  }
}

// Backward compatible export name
export const LMStudioPlugin = JanPlugin
