# Webhook Drift Scanner

Compare two webhook JSON payloads locally, identify consumer-breaking change candidates, and generate a regression fixture/test.

## Privacy architecture

- No backend is required for scanning.
- Payloads, paths, values, and generated tests are not sent by the application.
- Product analytics uses an explicit event-name allow-list only.
- No account, GitHub OAuth, payment, or email collection is implemented.

## Run locally

Serve this directory with any static HTTP server and open `index.html`. The scanner has no runtime dependencies.

## Scope and limitations

Two samples cannot establish a complete provider contract, required/optional fields, or all enum variants. Results are candidates, not guarantees. Confirm against provider documentation and consumer code.

## Repository topics

Suggested: `webhooks`, `contract-testing`, `json-diff`, `api-testing`, `developer-tools`, `testing`, `javascript`, `local-first`.

## License

MIT.
