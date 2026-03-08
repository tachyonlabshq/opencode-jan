# opencode-jan

OpenCode plugin for Jan Local API Server with auto-detection, API-key-aware setup, and dynamic model discovery.

## Quick Start (Easiest Setup)

This is the simplest flow, equivalent to the original plugin experience:

1. Install plugin.
2. Start Jan Local API Server.
3. Add plugin in `opencode.json`.

### 1) Install

```bash
npm install github:tachyonlabshq/opencode-jan
# or
bun add tachyonlabshq/opencode-jan
```

### 2) Start Jan Local API Server

In Jan Desktop:

- Go to `Settings` > `Local API Server`
- Set an API key
- Click `Start Server`

Default endpoint is usually:

- `http://127.0.0.1:1337/v1`

### 3) Set API key once in shell

```bash
export JAN_API_KEY="your-jan-local-api-key"
```

### 4) Add plugin to `opencode.json`

Minimal config (recommended):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-jan"
  ]
}
```

That is enough in most cases. The plugin auto-detects Jan, creates `provider.jan`, and auto-discovers models.

## Manual Provider Config (Optional)

Use this only if you want explicit control:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-jan"
  ],
  "provider": {
    "jan": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Jan API Server (local)",
      "options": {
        "baseURL": "http://127.0.0.1:1337/v1",
        "apiKey": "${JAN_API_KEY}"
      }
    }
  }
}
```

## What Happens Automatically

If `provider.jan` is missing, the plugin attempts to detect Jan automatically and creates it for you.

Detection checks:

- Common Jan local endpoints (`127.0.0.1:1337`, `localhost:1337`, plus common alternates)
- API key from provider config or environment variables
- OpenAI-compatible model endpoint health via `/v1/models`

If Jan is reachable but unauthorized, the plugin keeps configuration safe and prompts you to set a valid API key.

## Quick Verify

You can verify Jan server access directly:

```bash
curl http://127.0.0.1:1337/v1/models -H "Authorization: Bearer $JAN_API_KEY"
```

## Exact Model ID Fix

Jan requires the exact model `id` returned by `/v1/models`.

Example:

- This may fail: `Qwen3.5-27B-Heretic-I1-GGUF`
- This is what Jan may actually expose: `Qwen3_5-27B-heretic_i1-IQ4_XS`

If OpenCode reports:

- `Not Found: No running session found for model '...'`

check the exact Jan model IDs:

```bash
curl -s http://127.0.0.1:1337/v1/models \
  -H "Authorization: Bearer $JAN_API_KEY"
```

Then use the exact returned `id` in your config:

```json
{
  "provider": {
    "jan": {
      "models": {
        "Qwen3_5-27B-heretic_i1-IQ4_XS": {
          "id": "Qwen3_5-27B-heretic_i1-IQ4_XS",
          "name": "Qwen3.5 27B Heretic I1"
        }
      }
    }
  }
}
```

## Requirements

- OpenCode with plugin support
- Jan Desktop app running
- Local API Server started in Jan (`Settings > Local API Server`)
- Valid API key configured in Jan and provided to OpenCode

## License

MIT
