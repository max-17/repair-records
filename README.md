# Text repair records: ChatGPT + Turso

Two interfaces share the same Turso records: a Custom GPT can call the structured API without a separate model API key, or a Telegram bot can interpret text using your Google Gemini API key. The existing dashboard remains read-only.

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

One credential represents one configured master (`MASTER_ID=owner` by default); change it to a stable real master identifier before creating records. Do not share this GPT or its key with other masters. Multi-master access requires individual authentication, ideally OAuth. No payment ledger, deletion, or voice API yet. Gemini commands provide job counts by status and totals of agreed prices; these are not received payments or profit. Search returns at most 100 recent jobs. Writes use request IDs to make retries safe; records are scoped to the configured master. Date-only promises use Asia/Tashkent in the GPT instructions. Remote setup creates only the table; automated tests use temporary local SQLite databases.

In managed workspaces requiring an HTTPS proxy, run Node 24 with `NODE_USE_ENV_PROXY=1` (for example, `NODE_USE_ENV_PROXY=1 npm run db:setup`). This is unnecessary on hosts with direct outbound access.

## Web dashboard

Open `/` on the running API host. The Uzbek dashboard reads the same Turso repair records and offers customer/device search, status filters, refresh, and 100-record pages. It does not create or change records.

Use `DASHBOARD_KEY` from your private `.env` to sign in. Set that variable on the deployed host too. The key grants read-only access for the configured `MASTER_ID`; it is separate from the GPT Action write key. It stays only in browser memory and is cleared on sign-out or reload. Use HTTPS when hosted. Do not use your Turso token as a dashboard login. The current database is empty, so an empty list is expected until a repair is saved. The login page and static assets are public; customer data requires a valid access key.

Verified: local API/static-asset tests, rejected unauthenticated reads, rejected writes with the dashboard key, pagination, and an authenticated live read from Turso through the dashboard API. Browser visual verification and public deployment have not been completed.

## Vercel startup errors

`.env` is intentionally excluded from GitHub. In Vercel → Project → Settings → Environment Variables, set `DATABASE_URL`, `DATABASE_TOKEN`, `ACTION_API_KEY`, `MASTER_ID`, and `DASHBOARD_KEY` using the values in your local `.env`. Select Production (and Preview if needed), then redeploy: existing deployments do not pick up new environment variables. Never commit `.env` to fix missing deployment variables.

The dashboard now loads even when database or Action configuration is absent. Its API returns a setup message with HTTP 503 instead of throwing during function initialization. `/health` returns 503 until the database client, Action key, and master are configured; it does not check live database connectivity. Invalid tokens and network errors still require checking runtime logs. If the function still crashes, inspect Vercel runtime logs for the actual error.


## Gemini text commands and Telegram

Selected model: `gemini-3.5-flash-lite`. Google is called directly through the Vercel AI SDK Google provider, using your own free-tier Google account rather than a billed AI Gateway route. There is no fallback model. Account quotas apply; enabling Google billing can make usage billable. Regular `gemini-3.5-flash` is a different deprecated model and Google redirects it to 3.6.

1. Get a Google API key from https://aistudio.google.com/api-keys and put it in your private `.env` as `GOOGLE_GENERATIVE_AI_API_KEY`. Never send the key in chat or commit it.
2. Set `GEMINI_MODEL=gemini-3.5-flash-lite`.
3. Configure `TELEGRAM_MASTERS` as a JSON object mapping numeric Telegram **user IDs** to stable master IDs, e.g. `{"123456789":"owner"}`. The example number is a placeholder. Use `owner` for the same master whose current dashboard records are assigned to owner. Telegram display names are not identities. Only allowlisted private-chat senders are processed.
4. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (random secret; generated locally), and `PUBLIC_BASE_URL=https://repair-records.vercel.app`.
5. Run `npm run db:setup` once to add `command_requests` for retry protection. This preserves existing repairs.
6. Configure these variables in Vercel (in addition to the database and existing API/dashboard keys), then deploy.
7. Run `npm run telegram:setup` locally to register the Telegram webhook. This requires a Google key and at least one configured master. It never discards pending Telegram updates.
8. Test the bot with fictional records first. The webhook returns Telegram's sendMessage response. API failures return 503 so Telegram can retry; database mutations and cached command results commit atomically to prevent duplicate changes.

Supported examples:
- `Bekzod akadan iPhone 14 Pro oldim, ekran almashtirish, 1 million so‘m, ertaga tayyor.`
- `Bekzod aka iPhone 14 Pro tayyor.`
- `Bugun nechta buyurtma oldim?`
- `Bu oy kelishilgan narxlar jami qancha?`

Telegram keeps the last ten exchanges per authenticated master + Telegram chat/user for 30 minutes of inactivity. Short replies can answer a pending question or refer to the recent identified repair. /new or /start resets conversation context without deleting repairs. New complete requests start a new topic. The structured command API remains stateless. Ambiguous matches require a more specific message. Payments, profit, changing assigned masters, completion-time reports, and voice are unsupported. Analytics date filters apply to **creation dates in Asia/Tashkent**, scoped to the authenticated master, and query all matching rows rather than the dashboard's 100-row page. Agreed totals disclose missing prices and are not revenue.

For another client, `POST /api/commands` with the Action Bearer key and JSON `{ "request_id": "a UUID", "text": "your full command" }`. Preserve request_id and text for retries. The read-only dashboard key cannot invoke commands. Telegram uses a separate webhook secret and derives the master from its sender allowlist.

Verified with an injected parser: command persistence, duplicate retries, conflict rejection, ambiguous updates, cross-master isolation, date validation, analytics across more than 100 jobs, and webhook authentication. The live Gemini/Telegram flow still requires your Google key, Telegram user ID mapping, deployment variables, and webhook registration before it can be tested.


## Conversation memory

`conversation_memory` in Turso holds at most ten exchanges per master and Telegram chat/user. Context expires after 30 minutes of inactivity; expired context is ignored and replaced when the next command succeeds. This is conversational context, not a source for analytics totals. The model still queries the database for counts and prices. Cached command results and updated memory commit with repair changes in one transaction, so repeated webhook deliveries do not append duplicate turns or repeat writes. Concurrent replies generated against stale context are rejected and Telegram retries them with refreshed memory. `/new` and `/start` resets are idempotent. The command-result audit cache remains stored separately and is not automatically purged by the memory timeout.

Verification includes a live Gemini test for `Menga atchot ber` → `1 kun`, plus persistence across service restarts, user/master isolation, expiry, reset, bounded history, duplicate retries and concurrent-message tests.

Conversation context is additionally capped at 16,000 serialized characters by dropping whole oldest exchanges. Long exchanges may therefore reduce the retained count below ten. The 30-minute inactivity timeout and /new behavior are unchanged.
