import type { ValidationResult } from './validation-result'

function getLocalProvider(config: any): any {
  return config.provider?.jan || config.provider?.lmstudio
}

export function validateConfig(config: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object')
    return { isValid: false, errors, warnings }
  }

  // Validate provider configuration
  if (config.provider && typeof config.provider === 'object') {
    const jan = getLocalProvider(config)
    if (jan) {
      // Auto-fix missing required fields instead of failing
      if (!jan.npm) {
        jan.npm = '@ai-sdk/openai-compatible'
        warnings.push('Jan provider missing npm field, auto-set to @ai-sdk/openai-compatible')
      }
      if (!jan.name) {
        jan.name = 'Jan API Server (local)'
        warnings.push('Jan provider missing name field, auto-set to "Jan API Server (local)"')
      }
      if (!jan.options) {
        jan.options = {}
        warnings.push('Jan provider missing options field, auto-created empty options')
      } else {
        // Validate options
        if (!jan.options.baseURL) {
          warnings.push('Jan provider missing baseURL, will use default http://127.0.0.1:1337/v1')
        } else if (typeof jan.options.baseURL !== 'string') {
          errors.push('Jan provider baseURL must be a string')
        } else if (!isValidURL(jan.options.baseURL)) {
          warnings.push('Jan provider baseURL may be invalid')
        }

        if (jan.options.apiKey !== undefined && typeof jan.options.apiKey !== 'string') {
          errors.push('Jan provider apiKey must be a string when provided')
        }
      }

      // Validate models configuration
      if (jan.models && typeof jan.models !== 'object') {
        errors.push('Jan provider models must be an object')
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

function isValidURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
