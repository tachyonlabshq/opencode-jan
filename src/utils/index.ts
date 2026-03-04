import type { ModelValidationError, AutoFixSuggestion, SimilarModel } from '../types'

export { formatModelName, extractModelOwner } from './format-model-name'

// Categorize models by type
export function categorizeModel(modelId: string): 'chat' | 'embedding' | 'unknown' {
  const lowerId = modelId.toLowerCase()
  if (lowerId.includes('embedding') || lowerId.includes('embed')) {
    return 'embedding'
  }
  if (lowerId.includes('gpt') || lowerId.includes('llama') || 
      lowerId.includes('claude') || lowerId.includes('qwen') ||
      lowerId.includes('mistral') || lowerId.includes('gemma') ||
      lowerId.includes('phi') || lowerId.includes('falcon')) {
    return 'chat'
  }
  return 'unknown'
}

// Enhanced model similarity matching
export function findSimilarModels(targetModel: string, availableModels: string[]): SimilarModel[] {
  const target = targetModel.toLowerCase()
  const targetTokens = target.split(/[-_\s]/).filter(Boolean)
  
  return availableModels
    .map(model => {
      const candidate = model.toLowerCase()
      const candidateTokens = candidate.split(/[-_\s]/).filter(Boolean)
      
      let similarity = 0
      const reasons: string[] = []
      
      // Exact match gets highest score
      if (candidate === target) {
        similarity = 1.0
        reasons.push("Exact match")
      }
      
      // Check for common model family prefixes
      const targetPrefix = targetTokens[0]
      const candidatePrefix = candidateTokens[0]
      if (targetPrefix && candidatePrefix && targetPrefix === candidatePrefix) {
        similarity += 0.5
        reasons.push(`Same family: ${targetPrefix}`)
      }
      
      // Check for common suffixes (quantization levels, sizes)
      const commonSuffixes = ['3b', '7b', '13b', '70b', 'q4', 'q8', 'instruct', 'chat', 'base']
      for (const suffix of commonSuffixes) {
        if (target.includes(suffix) && candidate.includes(suffix)) {
          similarity += 0.2
          reasons.push(`Shared suffix: ${suffix}`)
        }
      }
      
      // Token overlap score
      const commonTokens = targetTokens.filter(token => candidateTokens.includes(token))
      if (commonTokens.length > 0) {
        similarity += (commonTokens.length / Math.max(targetTokens.length, candidateTokens.length)) * 0.3
        reasons.push(`Common tokens: ${commonTokens.join(', ')}`)
      }
      
      return {
        model,
        similarity: Math.min(similarity, 1.0),
        reason: reasons.join(", ")
      }
    })
    .filter(item => item.similarity > 0.1) // Only include models with some similarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5) // Top 5 suggestions
}

// Retry logic with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<{ success: boolean; result?: T; error?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation()
      return { success: true, result }
    } catch (error) {
      if (attempt === maxRetries) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        }
      }
      
      const delay = baseDelay * Math.pow(2, attempt)
      console.warn(`[opencode-jan] Retrying operation after ${delay}ms`, { 
        attempt: attempt + 1, 
        maxRetries: maxRetries + 1,
        error: error instanceof Error ? error.message : String(error)
      })
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return { success: false, error: "Max retries exceeded" }
}

// Smart error categorization
export function categorizeError(error: any, context: { baseURL: string; modelId: string }): ModelValidationError {
  const errorStr = String(error).toLowerCase()
  const { baseURL, modelId } = context
  
  // Network/connection issues
  if (errorStr.includes('econnrefused') || errorStr.includes('fetch failed') || errorStr.includes('network_error') || errorStr.includes('network')) {
    return {
      type: 'offline',
      severity: 'critical',
      message: `Cannot connect to Jan API Server at ${baseURL}. Ensure Jan is running and Local API Server is active.`,
      canRetry: true,
      autoFixAvailable: true
    }
  }
  
  // Timeout issues
  if (errorStr.includes('timeout') || errorStr.includes('aborted')) {
    return {
      type: 'timeout',
      severity: 'medium',
      message: `Request to Jan API timed out. This can happen with large models or a busy machine.`,
      canRetry: true,
      autoFixAvailable: false
    }
  }
  
  // Model not found
  if (errorStr.includes('404') || errorStr.includes('not found') || errorStr.includes('endpoint_not_found')) {
    return {
      type: 'not_found',
      severity: 'high',
      message: `Model '${modelId}' was not found. Verify the model is available in Jan and API Prefix is correct.`,
      canRetry: false,
      autoFixAvailable: false
    }
  }
  
  // Permission issues
  if (errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('unauthorized') || errorStr.includes('auth_required')) {
    return {
      type: 'permission',
      severity: 'high',
      message: `Authentication issue with Jan API server. Check Authorization Bearer API key configuration.`,
      canRetry: false,
      autoFixAvailable: false
    }
  }
  
  // Unknown errors
  return {
    type: 'unknown',
    severity: 'medium',
    message: `Unexpected error: ${errorStr}`,
    canRetry: true,
    autoFixAvailable: false
  }
}

// Generate auto-fix suggestions
export function generateAutoFixSuggestions(errorCategory: ModelValidationError): AutoFixSuggestion[] {
  const suggestions: AutoFixSuggestion[] = []
  
  switch (errorCategory.type) {
    case 'offline':
      suggestions.push({
        action: "Check if Jan API Server is running",
        steps: [
          "1. Open Jan desktop app",
          "2. Go to Settings > Local API Server",
          "3. Click Start Server",
          "4. Verify host/port (default 127.0.0.1:1337)",
          "5. Ensure the server is not blocked by firewall"
        ],
        automated: false
      })
      suggestions.push({
        action: "Verify API key and endpoint",
        steps: [
          "1. Set a Local API Server key in Jan",
          "2. Export JAN_API_KEY in your shell",
          "3. Check the server URL and port",
          "4. Confirm API prefix (default /v1)"
        ],
        automated: false
      })
      break
      
    case 'not_found':
      suggestions.push({
        action: "Use an available Jan model ID",
        steps: [
          "1. Open Jan > Hub and download your model",
          "2. Start the model in Jan",
          "3. Run GET /v1/models to list valid IDs",
          "4. Use one exact model ID in your request"
        ],
        automated: false
      })
      break
      
    case 'timeout':
      suggestions.push({
        action: "Increase timeout or use smaller model",
        steps: [
          "1. Try a smaller model version",
          "2. Increase request timeout in OpenCode settings",
          "3. Close other applications to free up system resources"
        ],
        automated: false
      })
      break
  }
  
  return suggestions
}
