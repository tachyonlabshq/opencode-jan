import { ToastNotifier } from '../ui/toast-notifier'
import { validateConfig } from '../utils/validation'
import { enhanceConfig } from './enhance-config'
import type { PluginInput } from '@opencode-ai/plugin'

function getConfiguredProvider(config: any): any {
  return config?.provider?.jan || config?.provider?.lmstudio
}

export function createConfigHook(client: PluginInput['client'], toastNotifier: ToastNotifier) {
  return async (config: any) => {
    const initialProvider = getConfiguredProvider(config)
    const initialModelCount = initialProvider?.models ? Object.keys(initialProvider.models).length : 0

    // Check if config is modifiable
    if (config && (Object.isFrozen?.(config) || Object.isSealed?.(config))) {
      console.warn('[opencode-jan] Config object is frozen/sealed - cannot modify directly')
      return
    }

    const validation = validateConfig(config)
    if (!validation.isValid) {
      console.error('[opencode-jan] Invalid config provided:', validation.errors)
      // Don't await toast - don't block startup
      toastNotifier.error('Plugin configuration is invalid', 'Configuration Error').catch(() => {})
      return
    }

    if (validation.warnings.length > 0) {
      console.warn('[opencode-jan] Config warnings:', validation.warnings)
    }

    // Wait for initial model discovery with timeout (max 5 seconds)
    // This ensures models are available when OpenCode reads the config
    const discoveryPromise = enhanceConfig(config, client, toastNotifier)
    const timeoutMs = 5000

    try {
      await Promise.race([
        discoveryPromise,
        new Promise<void>((resolve) => {
          setTimeout(() => resolve(), timeoutMs)
        }),
      ])
    } catch (error) {
      console.error('[opencode-jan] Config enhancement failed:', error)
      console.error('[opencode-jan:DEBUG] Error stack:', error instanceof Error ? error.stack : String(error))
    }

    const finalProvider = getConfiguredProvider(config)
    const finalModelCount = finalProvider?.models ? Object.keys(finalProvider.models).length : 0

    if (finalModelCount === 0 && finalProvider) {
      console.warn('[opencode-jan] No models discovered - Jan API server may be offline, unauthorized, or empty')
    } else if (finalModelCount > 0 && finalModelCount !== initialModelCount) {
      console.log(`[opencode-jan] Loaded ${finalModelCount} models`)
    }
  }
}
