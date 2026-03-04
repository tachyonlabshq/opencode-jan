import { ToastNotifier } from '../ui/toast-notifier'
import { findSimilarModels, retryWithBackoff, categorizeError, generateAutoFixSuggestions } from '../utils'
import { getLoadedModels, getLoadedModelsCacheKey, getLoadedModelsCacheStats, isLoadedModelsCacheValid } from './get-loaded-models'
import { normalizeBaseURL, extractProviderAPIKey, getCandidateAPIKeys } from '../utils/lmstudio-api'
import { safeAsyncOperation, isPluginHookInput, isLMStudioProvider, isValidModel } from '../utils/validation'

function assignValidationOutput(output: any, payload: any): void {
  if (!output.options) {
    output.options = {}
  }

  output.options.janValidation = payload
  // Backward-compatible key
  output.options.lmstudioValidation = payload
}

export function createChatParamsHook(toastNotifier: ToastNotifier) {
  return async (input: any, output: any) => {
    if (!isPluginHookInput(input)) {
      console.error('[opencode-jan] Invalid chat.params input')
      return
    }

    const { sessionID, model, provider } = input

    if (!isValidModel(model)) {
      console.error('[opencode-jan] Invalid model object')
      return
    }

    if (!isLMStudioProvider(provider)) {
      // Not a Jan-compatible local provider, skip.
      return
    }

    const providerName = provider.info?.id || 'jan'
    const baseURL = normalizeBaseURL(provider.options?.baseURL || 'http://127.0.0.1:1337')
    const explicitApiKey = extractProviderAPIKey(provider.options)
    const apiKey = getCandidateAPIKeys(explicitApiKey)[0]

    await safeAsyncOperation(
      () => toastNotifier.progress(`Checking model ${model.id}...`, 'Model Validation', 10),
      undefined,
      (error: Error) => console.warn('[opencode-jan] Failed to show progress toast:', error),
    )

    const validationResult = await retryWithBackoff(
      async () => {
        const loadedModels = await getLoadedModels(baseURL, apiKey)
        const isModelLoaded = loadedModels.includes(model.id)

        if (!isModelLoaded) {
          throw new Error(`Model '${model.id}' not loaded`)
        }

        return loadedModels
      },
      2,
      500,
    )

    if (!validationResult.success || !validationResult.result) {
      const errorCategory = categorizeError(validationResult.error || 'Validation operation failed', { baseURL, modelId: model.id })
      const autoFixSuggestions = generateAutoFixSuggestions(errorCategory)

      console.warn('[opencode-jan] Model validation failed', {
        sessionID,
        provider: providerName,
        model: model.id,
        error: validationResult.error,
        errorType: errorCategory.type,
        severity: errorCategory.severity,
        baseURL,
      })

      let availableModels: string[] = []
      try {
        availableModels = await getLoadedModels(baseURL, apiKey)
      } catch (e) {
        console.warn('[opencode-jan] Failed to get available models for suggestions', { error: e })
      }

      const similarModels = findSimilarModels(model.id, availableModels)

      await toastNotifier.error(
        `Model '${model.id}' not ready: ${errorCategory.message}`,
        'Model Validation Failed',
        8000,
      )

      assignValidationOutput(output, {
        status: 'error',
        provider: providerName,
        model: model.id,
        availableModels,
        errorCategory: errorCategory.type,
        severity: errorCategory.severity,
        message: errorCategory.message,
        canRetry: errorCategory.canRetry,
        autoFixAvailable: errorCategory.autoFixAvailable,
        autoFixSuggestions,
        steps: errorCategory.type === 'permission'
          ? [
              '1. Open Jan > Settings > Local API Server',
              '2. Set or confirm API Key',
              '3. Export JAN_API_KEY in your shell',
              '4. Retry your request',
            ]
          : errorCategory.type === 'not_found'
            ? [
                '1. Open Jan and start a model',
                '2. Verify model id via GET /v1/models',
                '3. Use the exact model id in config/request',
                '4. Retry your request',
              ]
            : [
                '1. Open Jan desktop app',
                '2. Go to Settings > Local API Server',
                '3. Verify server URL, port, and API prefix',
                '4. Ensure server is running',
                '5. Retry your request',
              ],
        similarModels: similarModels.map(item => ({
          model: item.model,
          similarity: Math.round(item.similarity * 100),
          reason: item.reason,
        })),
      })
      return
    }

    const cacheStats = getLoadedModelsCacheStats()
    const cacheKey = getLoadedModelsCacheKey(baseURL, apiKey)
    const cacheEntry = cacheStats.entries.find(entry => entry.baseURL === cacheKey)
    const cacheAge = cacheEntry ? cacheEntry.age : 0

    const loadedModels = validationResult.result || []

    await toastNotifier.success(`Model '${model.id}' is ready to use`, 'Model Validated')

    assignValidationOutput(output, {
      status: 'success',
      provider: providerName,
      model: model.id,
      availableModels: loadedModels,
      message: `Model '${model.id}' is loaded and ready.`,
      cacheInfo: {
        age: cacheAge,
        valid: isLoadedModelsCacheValid(baseURL, apiKey),
        totalCacheEntries: cacheStats.size,
      },
      performanceHint: loadedModels.length > 1
        ? `Note: ${loadedModels.length} models loaded. Consider unloading unused models for better performance.`
        : cacheAge > 20000
          ? `Cache is ${Math.round(cacheAge / 1000)}s old. Consider refreshing if model status seems outdated.`
          : undefined,
    })
  }
}
