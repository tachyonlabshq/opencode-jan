import type { JanModel, JanModelsResponse } from '../types'

const DEFAULT_JAN_BASE_URL = "http://127.0.0.1:1337"
const DEFAULT_API_PREFIX = "/v1"
const MODELS_ENDPOINT = "/models"

export interface JanDetectionResult {
  baseURL: string
  providerBaseURL: string
  apiKey?: string
  status: 'ok' | 'unauthorized' | 'unreachable' | 'not_found'
}

interface ProbeResult {
  ok: boolean
  status: number
  models: JanModel[]
}

function sanitizeBaseURL(input: string): string {
  return input.trim().replace(/\/+$/, '')
}

export function normalizeBaseURL(baseURL: string = DEFAULT_JAN_BASE_URL): string {
  const normalized = sanitizeBaseURL(baseURL)
  if (!normalized) {
    return DEFAULT_JAN_BASE_URL
  }

  try {
    const url = new URL(normalized)
    let path = url.pathname.replace(/\/+$/, '')
    if (path === '/v1') {
      path = ''
    }
    url.pathname = path || '/'
    return url.toString().replace(/\/$/, '')
  } catch {
    return sanitizeBaseURL(DEFAULT_JAN_BASE_URL)
  }
}

export function normalizeProviderBaseURL(baseURL: string = DEFAULT_JAN_BASE_URL): string {
  const normalized = sanitizeBaseURL(baseURL)

  try {
    const url = new URL(normalized)
    let path = url.pathname.replace(/\/+$/, '')

    if (!path || path === '/') {
      path = DEFAULT_API_PREFIX
    }

    url.pathname = path
    return url.toString().replace(/\/$/, '')
  } catch {
    return `${DEFAULT_JAN_BASE_URL}${DEFAULT_API_PREFIX}`
  }
}

// Build full API URL with endpoint
export function buildAPIURL(baseURL: string, endpoint: string = MODELS_ENDPOINT): string {
  const providerBaseURL = normalizeProviderBaseURL(baseURL)

  try {
    const url = new URL(providerBaseURL)
    const path = url.pathname.replace(/\/+$/, '')
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    url.pathname = `${path}${normalizedEndpoint}`.replace(/\/{2,}/g, '/')
    return url.toString()
  } catch {
    return `${providerBaseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  }
}

export function extractProviderAPIKey(options?: { apiKey?: string; headers?: Record<string, string> }): string | undefined {
  const directApiKey = options?.apiKey?.trim()
  if (directApiKey) {
    return directApiKey
  }

  const authHeader = options?.headers?.Authorization || options?.headers?.authorization
  if (!authHeader) {
    return undefined
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

export function getCandidateAPIKeys(explicitKey?: string): string[] {
  const rawCandidates = [
    explicitKey,
    process.env.JAN_API_KEY,
    process.env.JAN_API_SERVER_KEY,
    process.env.OPENCODE_JAN_API_KEY,
    process.env.OPENAI_API_KEY,
  ]

  const seen = new Set<string>()
  const keys: string[] = []

  for (const candidate of rawCandidates) {
    const key = candidate?.trim()
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    keys.push(key)
  }

  return keys
}

export function getCandidateBaseURLs(configuredBaseURL?: string): string[] {
  const rawCandidates = [
    configuredBaseURL,
    process.env.JAN_API_BASE_URL,
    process.env.JAN_BASE_URL,
    process.env.OPENCODE_JAN_BASE_URL,
    'http://127.0.0.1:1337',
    'http://localhost:1337',
    'http://127.0.0.1:1337/v1',
    'http://localhost:1337/v1',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8000',
  ]

  const seen = new Set<string>()
  const urls: string[] = []

  for (const candidate of rawCandidates) {
    if (!candidate) {
      continue
    }

    const normalized = sanitizeBaseURL(candidate)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    urls.push(normalized)
  }

  return urls
}

function buildRequestHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  return headers
}

async function probeModelsEndpoint(baseURL: string, apiKey?: string): Promise<ProbeResult> {
  const url = buildAPIURL(baseURL)

  const response = await fetch(url, {
    method: 'GET',
    headers: buildRequestHeaders(apiKey),
    signal: AbortSignal.timeout(3000),
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      models: [],
    }
  }

  const data = (await response.json()) as JanModelsResponse
  return {
    ok: true,
    status: response.status,
    models: data.data ?? [],
  }
}

// Check if Jan API server is accessible
export async function checkLMStudioHealth(baseURL: string = DEFAULT_JAN_BASE_URL, apiKey?: string): Promise<boolean> {
  try {
    const result = await probeModelsEndpoint(baseURL, apiKey)
    return result.ok
  } catch {
    return false
  }
}

// Discover models from Jan API server
export async function discoverLMStudioModels(baseURL: string = DEFAULT_JAN_BASE_URL, apiKey?: string): Promise<JanModel[]> {
  try {
    const result = await probeModelsEndpoint(baseURL, apiKey)

    if (result.ok) {
      return result.models
    }

    if (result.status === 401 || result.status === 403) {
      throw new Error('AUTH_REQUIRED: Jan API key is missing or invalid')
    }

    if (result.status === 404) {
      throw new Error('ENDPOINT_NOT_FOUND: Check Jan API prefix and base URL')
    }

    throw new Error(`HTTP_${result.status}: Jan model discovery failed`)
  } catch (error) {
    if (error instanceof Error && (error.message.includes('AUTH_REQUIRED') || error.message.includes('ENDPOINT_NOT_FOUND') || error.message.includes('HTTP_'))) {
      throw error
    }

    throw new Error(`NETWORK_ERROR: Failed to discover Jan models: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Get currently loaded/active models from Jan (bypass cache)
export async function fetchModelsDirect(baseURL: string = DEFAULT_JAN_BASE_URL, apiKey?: string): Promise<string[]> {
  const models = await discoverLMStudioModels(baseURL, apiKey)
  return models.map(model => model.id)
}

// Auto-detect Jan API server if not configured
export async function autoDetectLMStudio(options?: {
  configuredBaseURL?: string
  explicitApiKey?: string
}): Promise<JanDetectionResult | null> {
  const baseURLs = getCandidateBaseURLs(options?.configuredBaseURL)
  const apiKeys = getCandidateAPIKeys(options?.explicitApiKey)

  let unauthorizedCandidate: JanDetectionResult | null = null

  for (const baseURL of baseURLs) {
    const keysToTry = apiKeys.length > 0 ? apiKeys : [undefined]

    for (const apiKey of keysToTry) {
      try {
        const result = await probeModelsEndpoint(baseURL, apiKey)

        if (result.ok) {
          return {
            baseURL: normalizeBaseURL(baseURL),
            providerBaseURL: normalizeProviderBaseURL(baseURL),
            apiKey,
            status: 'ok',
          }
        }

        if (result.status === 401 || result.status === 403) {
          if (!unauthorizedCandidate) {
            unauthorizedCandidate = {
              baseURL: normalizeBaseURL(baseURL),
              providerBaseURL: normalizeProviderBaseURL(baseURL),
              apiKey,
              status: 'unauthorized',
            }
          }
          continue
        }

        if (result.status === 404) {
          continue
        }
      } catch {
        // ignore network failures and continue scanning
      }
    }
  }

  return unauthorizedCandidate
}
