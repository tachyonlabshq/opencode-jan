import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { JanPlugin, LMStudioPlugin } from '../src/index.ts'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock AbortSignal.timeout for older Node versions
if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 3000)
    return controller.signal
  })
}

describe('Jan Plugin', () => {
  let mockClient: any
  let pluginHooks: any
  let originalJanKey: string | undefined

  beforeEach(async () => {
    mockFetch.mockReset()

    originalJanKey = process.env.JAN_API_KEY
    process.env.JAN_API_KEY = 'test-jan-key'

    mockClient = {
      tui: {
        showToast: vi.fn().mockResolvedValue(true),
      },
    }

    const mockInput: any = {
      client: mockClient,
      project: {
        id: 'test-project',
        name: 'test',
        path: '/tmp',
        worktree: '',
        time: { created: Date.now() },
      },
      directory: '/tmp',
      worktree: '',
      $: vi.fn(),
    }

    pluginHooks = await JanPlugin(mockInput)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.JAN_API_KEY = originalJanKey
  })

  describe('Plugin Initialization', () => {
    it('should initialize successfully with valid client', async () => {
      const mockInput: any = {
        client: mockClient,
        project: {
          id: 'test-project',
          name: 'test',
          path: '/tmp',
          worktree: '',
          time: { created: Date.now() },
        },
        directory: '/tmp',
        worktree: '',
        $: vi.fn(),
      }
      const hooks = await JanPlugin(mockInput)
      expect(hooks).toBeDefined()
      expect(hooks.config).toBeTypeOf('function')
      expect(hooks.event).toBeTypeOf('function')
      expect(hooks['chat.params']).toBeTypeOf('function')
    })

    it('should expose backward-compatible export alias', async () => {
      expect(LMStudioPlugin).toBe(JanPlugin)
    })

    it('should handle invalid client gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockInput: any = {
        client: null,
        project: {
          id: 'test-project',
          name: 'test',
          path: '/tmp',
          worktree: '',
          time: { created: Date.now() },
        },
        directory: '/tmp',
        worktree: '',
        $: vi.fn(),
      }
      const hooks = await JanPlugin(mockInput)

      expect(hooks.config).toBeTypeOf('function')
      expect(hooks.event).toBeTypeOf('function')
      expect(hooks['chat.params']).toBeTypeOf('function')
      expect(consoleSpy).toHaveBeenCalledWith('[opencode-jan] Invalid client provided to plugin')

      consoleSpy.mockRestore()
    })
  })

  describe('Config Hook', () => {
    it('should validate config and reject invalid configurations', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await pluginHooks.config(null)
      expect(consoleSpy).toHaveBeenCalledWith('[opencode-jan] Invalid config provided:', expect.arrayContaining(['Config must be an object']))

      consoleSpy.mockRestore()
    })

    it('should auto-detect Jan when not configured', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'jan-model-1', object: 'model', created: 1234567890, owned_by: 'jan' },
            { id: 'jan-model-2', object: 'model', created: 1234567890, owned_by: 'jan' },
          ],
        }),
      })

      const config: any = {}
      await pluginHooks.config(config)

      expect(config.provider?.jan).toBeDefined()
      expect(config.provider?.jan?.npm).toBe('@ai-sdk/openai-compatible')
      expect(config.provider?.jan?.options?.baseURL).toBe('http://127.0.0.1:1337/v1')
      expect(config.provider?.jan?.options?.apiKey).toBe('test-jan-key')
      expect(config.provider?.jan?.models?.['jan-model-1']).toBeDefined()
    })

    it('should merge discovered models with existing Jan config', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'new-model', object: 'model', created: 1234567890, owned_by: 'jan' },
          ],
        }),
      })

      const config: any = {
        provider: {
          jan: {
            npm: '@ai-sdk/openai-compatible',
            name: 'Jan API Server (local)',
            options: { baseURL: 'http://127.0.0.1:1337/v1', apiKey: 'test-jan-key' },
            models: {
              'existing-model': { name: 'Existing Model' },
            },
          },
        },
      }

      await pluginHooks.config(config)

      expect(config.provider.jan.models).toEqual({
        'existing-model': { name: 'Existing Model' },
        'new-model': expect.objectContaining({
          id: 'new-model',
          name: 'New Model',
        }),
      })
    })

    it('should handle unauthorized Jan API gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const config: any = {
        provider: {
          jan: {
            npm: '@ai-sdk/openai-compatible',
            name: 'Jan API Server (local)',
            options: { baseURL: 'http://127.0.0.1:1337/v1', apiKey: 'bad-key' },
          },
        },
      }

      await pluginHooks.config(config)

      expect(consoleSpy).toHaveBeenCalledWith('[opencode-jan] Jan API key missing/invalid. Model discovery skipped.', expect.any(Object))

      consoleSpy.mockRestore()
    })
  })

  describe('Event Hook', () => {
    it('should validate event input', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await pluginHooks.event({ event: null })
      expect(consoleSpy).toHaveBeenCalledWith('[opencode-jan] Invalid event input:', expect.arrayContaining(['event: event is required and must be an object']))

      consoleSpy.mockRestore()
    })

    it('should handle session events gracefully', async () => {
      await pluginHooks.event({ event: { type: 'session.created' } })
      expect(true).toBe(true)
    })
  })

  describe('Chat Params Hook', () => {
    it('should validate chat params input', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const output: any = {}

      await pluginHooks['chat.params'](null, output)
      expect(consoleSpy).toHaveBeenCalledWith('[opencode-jan] Invalid chat.params input')

      consoleSpy.mockRestore()
    })

    it('should skip non-Jan providers', async () => {
      const input = {
        model: { id: 'test-model' },
        provider: { info: { id: 'anthropic' } },
      }
      const output: any = {}

      await pluginHooks['chat.params'](input, output)
      expect(output).toEqual({})
      expect(mockClient.tui.showToast).not.toHaveBeenCalled()
    })

    it('should validate Jan model availability', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'test-model', object: 'model', created: 1234567890, owned_by: 'jan' },
          ],
        }),
      })

      const input = {
        sessionID: 'test-session',
        model: { id: 'test-model' },
        provider: {
          info: { id: 'jan' },
          options: { baseURL: 'http://127.0.0.1:1337/v1', apiKey: 'test-jan-key' },
        },
      }
      const output: any = {}

      await pluginHooks['chat.params'](input, output)

      expect(mockClient.tui.showToast).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({
          variant: 'success',
          message: 'Model \'test-model\' is ready to use',
        }),
      }))
      expect(output.options?.janValidation).toEqual(expect.objectContaining({
        status: 'success',
        model: 'test-model',
      }))
    })

    it('should handle missing model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
        }),
      })

      const input = {
        sessionID: 'test-session',
        model: { id: 'missing-model' },
        provider: {
          info: { id: 'jan' },
          options: { baseURL: 'http://127.0.0.1:1337/v1', apiKey: 'test-jan-key' },
        },
      }
      const output: any = {}

      await pluginHooks['chat.params'](input, output)

      expect(output.options?.janValidation).toEqual(expect.objectContaining({
        status: 'error',
        model: 'missing-model',
      }))
    })

    it('should handle unauthorized responses as permission errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const input = {
        sessionID: 'test-session',
        model: { id: 'test-model' },
        provider: {
          info: { id: 'jan' },
          options: { baseURL: 'http://127.0.0.1:1338/v1', apiKey: 'bad-key' },
        },
      }
      const output: any = {}

      await pluginHooks['chat.params'](input, output)

      expect(output.options?.janValidation).toEqual(expect.objectContaining({
        status: 'error',
        errorCategory: 'permission',
      }))
    })
  })
})
