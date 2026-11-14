# Text repair records: ChatGPT + Turso

No AI API key needed. A Custom GPT extracts details and calls this API. This ordinary Express backend contains no AI model. Requires access to create a Custom GPT with Actions.

## Run

1. `npm ci`
2. Set `DATABASE_URL`, `DATABASE_TOKEN`, `ACTION_API_KEY` (random secret), and `MASTER_ID` in `.env`. Keep it private. Existing Telegram credentials are unused.
3. `npm run db:setup` creates `repair_jobs` without changing existing tables.
4. `npm test`, then `npm start`.

## Connect ChatGPT

1. Host the API at a public HTTPS URL on a provider whose terms permit your use. Localhost cannot be reached by GPT Actions. This project includes a Vercel function adapter; hosting is not configured or deployed yet.
2. Configure the same four environment variables on the host. Never place the Turso token in GPT instructions or the OpenAPI schema.
3. Replace the placeholder server URL in `openapi.json` with your HTTPS URL.
4. Create a **private** Custom GPT, paste `GPT-INSTRUCTIONS.md` into Instructions, and import `openapi.json` into Actions.
5. Set Action authentication to API key / Bearer using `ACTION_API_KEY` from `.env`.
6. Test: “Bekzod akadan Samsung S23 oldim, ekran almashtirish 200 ming, ertaga tayyor.” Confirm the Action if ChatGPT asks, then search for the saved record.

The GPT-to-API flow has not been verified until deployment and this test succeed. This current chat has no automatically attached Action.

## Limits

One credential represents one configured master (`MASTER_ID=owner` by default); change it to a stable real master identifier before creating records. Do not share this GPT or its key with other masters. Multi-master access requires individual authentication, ideally OAuth. No payment ledger, deletion, voice API, or reporting totals yet. Search returns at most 100 recent jobs. Writes use request IDs to make retries safe; records are scoped to the configured master. Date-only promises use Asia/Tashkent in the GPT instructions. Remote setup creates only the table; automated tests use temporary local SQLite databases.

In managed workspaces requiring an HTTPS proxy, run Node 24 with `NODE_USE_ENV_PROXY=1` (for example, `NODE_USE_ENV_PROXY=1 npm run db:setup`). This is unnecessary on hosts with direct outbound access.

## Web dashboard

Open `/` on the running API host. The Uzbek dashboard reads the same Turso repair records and offers customer/device search, status filters, refresh, and 100-record pages. It does not create or change records.

Use `DASHBOARD_KEY` from your private `.env` to sign in. Set that variable on the deployed host too. The key grants read-only access for the configured `MASTER_ID`; it is separate from the GPT Action write key. It stays only in browser memory and is cleared on sign-out or reload. Use HTTPS when hosted. Do not use your Turso token as a dashboard login. The current database is empty, so an empty list is expected until a repair is saved. The login page and static assets are public; customer data requires a valid access key.

Verified: local API/static-asset tests, rejected unauthenticated reads, rejected writes with the dashboard key, pagination, and an authenticated live read from Turso through the dashboard API. Browser visual verification and public deployment have not been completed.
