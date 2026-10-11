# OpenAI usage in the private hub

The page is `/openai-usage` on the existing File Store service. It uses the same password, SMS MFA, session cookie, HTTPS proxy, reverse SSH tunnel, and loopback listener as `/area-51`. No new server, Tailscale Serve route, browser credential, or public-site asset is required. The dashboard remains unavailable until this File Store release is installed; a pull request alone does not deploy it.

## Private account setup

Create `.private/openai-usage.json` for the running File Store identity. The optional `FILESTORE_OPENAI_USAGE_ACCOUNTS_FILE` setting may point to another private absolute path. Configure up to four independent account slots:

```json
[
  {"name":"Personal","products":["chatgpt","codex"],"codex_account_id":"expected-account-id","subscription":"Plus"},
  {"name":"API workspace 1","products":["api"],"subscription":"API","admin_key_env":"OPENAI_ADMIN_KEY_ONE","organization_id":"org-example1"},
  {"name":"API workspace 2","products":["api"],"subscription":"API","admin_key_env":"OPENAI_ADMIN_KEY_TWO","organization_id":"org-example2"},
  {"name":"Other","products":["chatgpt","codex"],"subscription":"Pro"}
]
```

These are examples, not live account identities. Store each organization Admin API key as the named environment variable in the existing private service environment (`.private/filestore.env` is loaded by the application). Set the JSON and environment file permissions to the running user only. Never put keys or personal account cookies in JSON, the repository, the browser, or logs. An ordinary project API key cannot authorize organization reporting. Restart only the File Store process after private configuration changes; its existing session will expire. Invalid dashboard JSON leaves the existing hub running and marks the dashboard configuration unavailable.

For a Codex account, `codex_account_id` is the expected opaque account ID returned by the documented Codex app-server `account/rateLimits/read` method. This binding prevents one logged-in profile from being shown under another account's name. The optional `codex_home` must be an absolute path to that account's existing Codex profile. Without it, the File Store process uses its normal Codex profile. Set `FILESTORE_CODEX_BIN` in the private service environment to an absolute Codex CLI path if `codex` is not on that process's PATH. The adapter calls only `account/read` with `refreshToken:false` and `account/rateLimits/read`; it never starts a login, logs out, or returns OAuth tokens. Codex may manage/refresh its own stored authentication internally. Each independently signed-in profile can be reused without repeated logins; profiles or expected IDs that are not configured remain unavailable.

For multiple Google or ChatGPT identities, create one `CODEX_HOME` directory per identity beneath the existing user-only `.private` directory. Put `cli_auth_credentials_store = "file"` in each profile's `config.toml`, then run `codex login` with `CODEX_HOME` set to that directory. The account owner must complete each browser or device-code sign-in. Afterward, use `codex app-server` with the same `CODEX_HOME` to check the returned email and `accountId` before writing that profile path and ID into its dashboard slot. Check that the original/default profile still returns its original email; a Google browser session alone is not a Codex CLI sign-in. Treat every profile's `auth.json` as a password. A ChatGPT/Codex sign-in does not authorize organization API costs or token reports; those still require the separate Admin API key and organization ID above.

The organization ID is required for a complete combined spend because it lets the collector avoid counting the same organization twice. Each API slot reports its own month-to-date costs and completion input/output tokens. The combined total is unavailable if any configured API organization lacks an ID or a successful costs response. Only identical organization scopes are deduplicated; configure one slot per organization for the clearest result.

## Data and limitations

- API spend: official [organization costs endpoint](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs). This is month to date in USD, with bounded pagination.
- API tokens: official [organization completions usage endpoint](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions). These totals cover completions reporting only, not every API product.
- Codex five-hour/weekly remaining percentages and reset times come from the documented [Codex app-server account rate limits](https://learn.chatgpt.com/docs/app-server) when a signed-in account profile and matching account ID are configured and those exact duration windows are returned. Other quota windows remain unavailable. The Codex subscription can also come from `account/read` when no local label is configured. The dashboard does not access or copy Codex token files directly.
- Personal ChatGPT model allowances and prepaid API credit balance remain unavailable without a supported source for those specific figures. Do not infer them from spend, Codex plan credits, or published plan limits.
- A successful empty report is displayed as zero. Missing credentials, denied requests, malformed responses, and inaccessible figures are displayed as unavailable. The API never serializes keys, organization IDs, or provider error bodies.

The first authenticated request collects data. Subsequent requests share a five-minute cache; manual refresh can bypass it once per minute. Failures cool down for at least two minutes, and each API reporting operation honors bounded `Retry-After` on 429 responses. Provider requests time out after eight seconds, Codex app-server reads after twelve seconds, and pagination stops after twelve pages. The browser automatically refreshes every five minutes while visible.

## Acceptance checks

Run `uv run --frozen pytest` and `uvx ruff check app tests` in the integrated File Store checkout. Verify anonymous and expired-session requests to the page, assets, and API redirect to login; an authenticated owner sees four cards; the refresh POST rejects an absent/invalid CSRF token; zero, unavailable, and mixed account failures render distinctly. Use an authenticated desktop and mobile browser after deploying to check actual layout. Verify the public lozknowles.com homepage remains unchanged. No live API data is proven until real admin keys are configured and the provider responses are observed.
