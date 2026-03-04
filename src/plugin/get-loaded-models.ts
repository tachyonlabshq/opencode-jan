import { ModelStatusCache } from '../cache/model-status-cache'
import { fetchModelsDirect } from '../utils/lmstudio-api'

const modelStatusCache = new ModelStatusCache()

export function getLoadedModelsCacheKey(baseURL: string, apiKey?: string): string {
  return apiKey?.trim() ? `${baseURL}::auth` : `${baseURL}::noauth`
}

export function getLoadedModels(baseURL: string = 'http://127.0.0.1:1337', apiKey?: string): Promise<string[]> {
  const cacheKey = getLoadedModelsCacheKey(baseURL, apiKey)

  return modelStatusCache.getModels(cacheKey, async () => {
    return await fetchModelsDirect(baseURL, apiKey)
  })
}

export function getLoadedModelsCacheStats() {
  return modelStatusCache.getStats()
}

export function isLoadedModelsCacheValid(baseURL: string, apiKey?: string): boolean {
  return modelStatusCache.isValid(getLoadedModelsCacheKey(baseURL, apiKey))
}
