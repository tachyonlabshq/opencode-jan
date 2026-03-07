# Debugging opencode-jan

## Expected Logs

1. `[opencode-jan] Jan plugin initialized`
2. Config validation / enhancement logs
3. Jan detection or provider setup logs
4. Model discovery success/warning logs

## Quick Checks

1. Confirm Jan server is running:

```bash
curl http://127.0.0.1:1337/v1/models -H "Authorization: Bearer $JAN_API_KEY"
```

2. Confirm plugin in OpenCode config:

```json
"plugin": ["opencode-jan"]
```

3. Confirm provider config exists:

```json
"provider": {
  "jan": {
    "options": {
      "baseURL": "http://127.0.0.1:1337/v1",
      "apiKey": "${JAN_API_KEY}"
    }
  }
}
```

## Common Issues

- `401 Unauthorized`: Jan API key missing/invalid.
- `404 Not Found`: wrong API prefix/base URL (check `/v1`).
- Connection refused: Jan Local API Server is not started.
