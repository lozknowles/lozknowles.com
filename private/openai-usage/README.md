# Private OpenAI usage dashboard

This is deliberately **not** part of the public static website build. It uses a separate Python service, loopback-only, exposed via **Tailscale Serve** on a tailnet HTTPS hostname. Do not copy it into the public document root or configure a public reverse proxy to it.

## Configure

Python 3.11+. Set OPENAI_USAGE_ACCOUNTS to a JSON array of at most four objects, for example:

```json
[
  {"name":"API organisation 1","type":"api","admin_key_env":"OPENAI_ADMIN_KEY_1"},
  {"name":"ChatGPT personal","type":"chatgpt"},
  {"name":"Codex account","type":"codex"},
  {"name":"API organisation 2","type":"api","admin_key_env":"OPENAI_ADMIN_KEY_2"}
]
```

Provide the JSON through a private environment variable or private config injection. Set OPENAI_ADMIN_KEY_1 etc in the process environment. Never commit credentials or configuration with sensitive account details. API organisation admin keys must have the appropriate costs permission. If an account's key cannot access the organisation costs endpoint, the dashboard reports failure rather than inventing values.

Run `python private/openai-usage/server.py` on the tailnet host. It binds **only to 127.0.0.1:8765**. Configure Tailscale Serve for the host's private HTTPS URL to proxy to `http://127.0.0.1:8765`, following the installed Tailscale version's syntax. Verify access from a tailnet device and rejection from a non-tailnet device. Never enable Tailscale Funnel for this service.

The dashboard intentionally does not claim to show ChatGPT/Codex remaining quotas or prepaid API credit balances. It shows API month-to-date costs where authorised and provides account shortcuts. The public site's appearance and routes are untouched.
