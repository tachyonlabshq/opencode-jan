# opencode-jan

OpenCode plugin for Jan Local API Server with auto-detection, API-key-aware setup, and dynamic model discovery.

## Features

- Auto-detection of Jan API Server endpoints (default `127.0.0.1:1337`)
- Auto-setup of `provider.jan` when Jan is detected
- API key detection from config or environment (`JAN_API_KEY`, `JAN_API_SERVER_KEY`, `OPENCODE_JAN_API_KEY`, `OPENAI_API_KEY`)
- Dynamic model discovery from `GET /v1/models`
- Smart model formatting and owner extraction
- Model merging into existing OpenCode config
- Runtime model validation in `chat.params`
- Cache-backed model checks for lower API overhead
- Actionable error handling for offline/unauthorized/missing model cases

## Installation

```bash
npm install opencode-jan
# or
bun add opencode-jan
```

## Usage

Set your Jan API key in your shell:

```bash
export JAN_API_KEY="your-jan-local-api-key"
```

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-jan@latest"
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

## Auto Setup Behavior

If `provider.jan` is missing, the plugin attempts to detect Jan automatically and creates it for you.

Detection checks:

- Common Jan local endpoints (`127.0.0.1:1337`, `localhost:1337`, plus common alternates)
- API key from provider config or environment variables
- OpenAI-compatible model endpoint health via `/v1/models`

If Jan is reachable but unauthorized, the plugin keeps configuration safe and prompts you to set a valid API key.

## Requirements

- OpenCode with plugin support
- Jan Desktop app running
- Local API Server started in Jan (`Settings > Local API Server`)
- Valid API key configured in Jan and provided to OpenCode

## License

MIT
