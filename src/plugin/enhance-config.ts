import { ModelStatusCache } from '../cache/model-status-cache'
import { ToastNotifier } from '../ui/toast-notifier'
import { categorizeModel, formatModelName, extractModelOwner } from '../utils'
import {
  normalizeBaseURL,
  normalizeProviderBaseURL,
  discoverLMStudioModels,
  autoDetectLMStudio,
  extractProviderAPIKey,
  getCandidateAPIKeys,
} from '../utils/lmstudio-api'
import type { PluginInput } from '@opencode-ai/plugin'
import type { JanModel } from '../types'

const modelStatusCache = new ModelStatusCache()

function getProvider(config: any): { id: 'jan' | 'lmstudio' | null; provider: any | null } {
  if (config?.provider?.jan) {
    return { id: 'jan', provider: config.provider.jan }
  }

  if (config?.provider?.lmstudio) {
    return { id: 'lmstudio', provider: config.provider.lmstudio }
  }

  return { id: null, provider: null }
}

function ensureProviderDefaults(provider: any): void {
  if (!provider.npm) {
    provider.npm = '@ai-sdk/openai-compatible'
  }

  if (!provider.name) {
    provider.name = 'Jan API Server (local)'
  }

  if (!provider.options) {
    provider.options = {}
  }

  if (!provider.models) {
    provider.models = {}
  }
}

export async function enhanceConfig(
  config: any,
  _client: PluginInput['client'], // kept for interface compatibility
  toastNotifier: ToastNotifier,
): Promise<void> {
  try {
    let { id: providerID, provider } = getProvider(config)
    let baseURL: string
    let apiKey: string | undefined

    if (provider) {
      ensureProviderDefaults(provider)
      baseURL = normalizeBaseURL(provider.options?.baseURL || 'http://127.0.0.1:1337')

      const explicitKey = extractProviderAPIKey(provider.options)
      const keyCandidates = getCandidateAPIKeys(explicitKey)
      apiKey = keyCandidates[0]

      if (!provider.options.apiKey && apiKey) {
        provider.options.apiKey = apiKey
      }

      provider.options.baseURL = normalizeProviderBaseURL(provider.options.baseURL || baseURL)
    } else {
      const detected = await autoDetectLMStudio()
      if (!detected) {
        return
      }

      if (!config.provider) {
        config.provider = {}
      }

      config.provider.jan = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Jan API Server (local)',
        options: {
          baseURL: detected.providerBaseURL,
        },
        models: {},
      }

      if (detected.apiKey) {
        config.provider.jan.options.apiKey = detected.apiKey
      }

      providerID = 'jan'
      provider = config.provider.jan
      baseURL = detected.baseURL
      apiKey = detected.apiKey

      if (detected.status === 'unauthorized') {
        console.warn('[opencode-jan] Jan server detected but API key is missing/invalid')
        await toastNotifier.warning(
          'Jan API server detected, but requests are unauthorized. Set JAN_API_KEY or provider.options.apiKey.',
          'Jan API Key Required',
          7000,
        )
      }
    }

    if (!provider || !providerID) {
      return
    }

    let models: JanModel[]
    try {
      models = await discoverLMStudioModels(baseURL, apiKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.includes('AUTH_REQUIRED')) {
        console.warn('[opencode-jan] Jan API key missing/invalid. Model discovery skipped.', {
          baseURL,
          provider: providerID,
        })
        return
      }

      if (message.includes('ENDPOINT_NOT_FOUND')) {
        console.warn('[opencode-jan] Jan API endpoint not found. Check API prefix/base URL.', {
          baseURL,
          providerBaseURL: provider.options?.baseURL,
        })
        return
      }

      console.warn('[opencode-jan] Model discovery failed', { message, baseURL })
      return
    }

    if (models.length > 0) {
      const existingModels = provider.models || {}
      const discoveredModels: Record<string, any> = {}
      let chatModelsCount = 0
      let embeddingModelsCount = 0

      for (const model of models) {
        const modelKey = model.id

        // Only add if not already configured
        if (!existingModels[modelKey]) {
          const modelType = categorizeModel(model.id)
          const owner = extractModelOwner(model.id)
          const modelConfig: any = {
            id: model.id,
            name: formatModelName(model),
          }

          if (owner) {
            modelConfig.organizationOwner = owner
          }

          if (modelType === 'embedding') {
            embeddingModelsCount++
            modelConfig.modalities = {
              input: ['text'],
              output: ['embedding'],
            }
          } else if (modelType === 'chat') {
            chatModelsCount++
            modelConfig.modalities = {
              input: ['text', 'image'],
              output: ['text'],
            }
          }

          discoveredModels[modelKey] = modelConfig
        }
      }

      if (Object.keys(discoveredModels).length > 0) {
        provider.models = {
          ...existingModels,
          ...discoveredModels,
        }

        if (chatModelsCount === 0 && embeddingModelsCount > 0) {
          console.warn('[opencode-jan] Only embedding models found. To use chat models:', {
            steps: [
              '1. Open Jan > Hub',
              '2. Download a chat-capable model',
              '3. Start the model in Jan',
              '4. Retry your OpenCode request',
            ],
          })
        }
      }
    } else {
      console.warn('[opencode-jan] No models returned by Jan API server. Please:', {
        steps: [
          '1. Open Jan desktop app',
          '2. Start at least one model',
          '3. Ensure Local API Server is running',
          '4. Confirm API key and base URL are correct',
        ],
      })
    }

    // Warm up the cache with current model status
    try {
      await modelStatusCache.getModels(baseURL, async () => {
        return await discoverLMStudioModels(baseURL, apiKey).then(items => items.map(model => model.id))
      })
    } catch {
      // cache warming is non-critical
    }
  } catch (error) {
    console.error('[opencode-jan] Unexpected error in enhanceConfig:', error)
    toastNotifier.warning('Plugin configuration failed', 'Configuration Error').catch(() => {})
  }
}
