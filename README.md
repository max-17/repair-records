# Shop and repair assistant

Combined from max-17/tokcha-shop and repair-records. Next.js serves the storefront,
inventory, sales, channel posting and repair admin; the existing repair API and
Uzbek Telegram voice/text bot run in Next.js Node API routes.

## Run

Copy `.env.example` to `.env`, fill the keys, then `bun install` and `bun run dev`.
Development uses `data/development.db` for both modules, never the remote database.
Run `bun run db:setup:local` before using local repair routes.

Production uses one Turso database: `DATABASE_URL` and `DATABASE_TOKEN`.
Run `bun run db:setup` to add the repair tables before enabling the webhook.
The shop initializes its own tables. Existing test catalog data is not copied from
another database. First initialization includes the shop's existing demo products.

## Routes

- `/`: storefront
- `/admin`: stock; `/admin/sales`: sales; `/admin/analytics`: reports
- `/admin/repairs`: repair list, using the same owner login
- `/admin/settings/telegram`: shop channel settings
- `/api/telegram/webhook`: existing repair bot webhook (secret-header protected)
- `/api/repairs`, `/api/commands`: existing repair API, bearer protected
- `/api/repair-health`: repair configuration health
- `/repairs/index.html`: legacy repair dashboard (separate read-only key)

The AI bot manages repairs; sales and inventory AI commands are not added by this merge.

## Environment variables

Existing repair variables stay unchanged: `DATABASE_URL`, `DATABASE_TOKEN`,
`ACTION_API_KEY`, `DASHBOARD_KEY`, `MASTER_ID`, `GOOGLE_GENERATIVE_AI_API_KEY`,
`GEMINI_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_MASTERS`, `SPEECH_PROVIDER=aisha`, `AISHA_API`, `PUBLIC_BASE_URL`.

Add `ADMIN_PASSWORD` (owner login), `ADMIN_SESSION_SECRET` (random signing secret),
and `UPLOADTHING_TOKEN` (product image uploads). All are server-only.

For channel posting, additionally set `SHOP_TELEGRAM_BOT_TOKEN` (shop posting bot),
`TELEGRAM_APP_URL` (combined public URL), and `CRON_SECRET` (random secret).
Use a separate bot token for channel posting to keep the repair conversation separate.
Local bots are opt-in: `REPAIR_DEV_BOT_TOKEN` for repairs; the shop uses
`TELEGRAM_DEV_BOT_TOKEN`, `TELEGRAM_DEV_APP_URL`, `TELEGRAM_DEV_CHANNEL_IDS`.

Deploy this repository as a Next.js project with root directory `.`. Update
`PUBLIC_BASE_URL` and `TELEGRAM_APP_URL` to the final combined URL and run
`bun run telegram:setup` to register the repair webhook there. Do not point the same
repair bot at two deployments simultaneously.

## Validation

`bun run test`, `bun run typecheck`, `bun run build`, `bun run test:auth`,
`bun run test:telegram`. No real customer data or external AI calls are needed.

---

## Original repair API documentation

# Ustaxona repair records

Uzbek text and voice commands in Telegram, Aisha/VoiceLab for speech recognition, Gemini 3.5 Flash-Lite for interpretation, Turso for records and conversation state, and a read-only web dashboard. Hosted at https://repair-records.vercel.app.

## Local setup

1. `npm ci`
2. Fill your private `.env` using `.env.example`. Never commit it or paste secrets in chat.
3. `bun run db:setup` adds the required tables and indexes without deleting existing records.
4. `bun run test`, then `npm start`.

Node 24 is used in development. Managed workspaces that require an HTTPS proxy need `NODE_USE_ENV_PROXY=1` before Node/npm commands. Hosts with direct outbound access do not.

## Deployment and Telegram

Set these in Vercel's Production environment, then redeploy after changing them:

- `DATABASE_URL`, `DATABASE_TOKEN`
- `ACTION_API_KEY`, `MASTER_ID`, `DASHBOARD_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_MASTERS` — JSON mapping actual numeric Telegram user IDs to master IDs, e.g. `{"123456789":"owner"}`. The number is a placeholder. Names are not identities.

Set `PUBLIC_BASE_URL=https://repair-records.vercel.app` locally and run `bun run telegram:setup` to register `/api/telegram/webhook`, its secret, and both `message` and `callback_query` updates. Re-run this after upgrading from a message-only webhook. Pending updates are not discarded.

Only allowlisted senders in private chats are processed. All database access is scoped to the authenticated master. Google is called directly through the AI SDK Google provider; there is no paid fallback model. Google account quotas and billing settings apply.

## Commands and buttons

- `Bekzod akadan iPhone 14 Pro oldim, ekran almashtirish, 1 million so‘m, ertaga tayyor.`
- `Bekzod aka iPhone 14 Pro tayyor.`
- `Narxini 900 mingga o‘zgartir.`
- `Menga hisobot ber` → `1 kun`.
- `/new` or `/start` clears conversation context without deleting repairs.

The server manages task phases: `idle`, `collecting_details`, `awaiting_selection`, `awaiting_confirmation`, and `completed`.

Clear staff instructions execute directly, including price, status and technician changes. Ambiguous matches get record-selection buttons; a valid selection executes the requested action immediately. Missing details still require clarification. Snapshot checks prevent a stale selection from changing a record. Legacy confirmation buttons remain supported for proposals issued before this change.

Buttons are tied to a random token for the current proposal, user/chat, repair ID, and snapshot. Old buttons cannot approve a new proposal. A changed record or a proposal older than 15 minutes cannot be approved. This limit applies only to pending write approval: conversation state itself does not expire. Typed `ha`/`yo‘q`, `/confirm` and `/cancel` also work for the current task.

## Memory and analytics

Turso stores compact structured state per master + Telegram chat/user: a pending task, known fields, backend-confirmed repair ID, report filters and the latest exchange. This is operational context, not private reasoning or an unlimited transcript. The backend updates state from validated plans and actual database results. Completed creates are not replayed as new records; a clear new topic replaces old draft details.

Gemini receives previous/current timestamps, inactivity duration, Tashkent local date and whether a pause crossed a calendar day. A pause is a relevance cue, not automatic forgetting. Clear answers may continue pending tasks; ambiguous references ask for clarification. Implicit repair references from a previous calendar day require customer/device clarification.

Analytics queries all matching rows in Turso. Date filters use **creation dates in Asia/Tashkent**. Counts and sums are calculated by SQL, not invented from conversation context or the dashboard's 100-row page. Agreed price totals disclose missing prices and are not payments or profit.

Payments, debt, parts costs, profit, completion-speed reports and master reassignment are not implemented. Telegram voice notes are supported through the separate Whisper transcript-review flow below.

## Reliability and audit

Repair writes, their audit events, updated state and cached command results commit in one transaction. Request IDs prevent repeated mutations on retries. Optimistic revisions reject generations against superseded context.

Telegram deliveries are persisted with status, attempts, reply payload and Telegram message ID. A per-conversation lease serializes processing; expired leases can be recovered after a crash. The server explicitly calls Telegram's `sendMessage` and acknowledges the webhook after successful delivery. Failed sends retry the saved reply without rerunning the command. Callback queries are acknowledged separately to stop the button spinner.

This is **retry-driven synchronous processing**, not an independent background worker. Recovery depends on Telegram retrying failed updates. A permanently failing earlier message can delay later messages in that chat. Telegram cannot guarantee exactly-once message delivery if it accepts a send but the network response is lost; a duplicate notification is possible, while request IDs protect repair mutations.

`repair_events` records the authenticated actor, request ID and before/after record snapshots for both AI and structured API writes from this version onward. Historical changes before this version are not backfilled. `GET /api/repairs/{id}/events` exposes up to 100 events to authenticated readers for their master's records.

The old `conversation_memory` table is retained for compatibility with older deployments but is no longer used. Conversation state and command-result caches persist separately.

## Web dashboard and structured API

Open `/` and log in with `DASHBOARD_KEY`. The key stays only in browser memory and grants read-only access for `MASTER_ID`. Search by customer/device, filter status, refresh, and page through records. Static assets are public; customer data requires authentication.

A Custom GPT can import `openapi.json` (replace its placeholder server URL) and use `GPT-INSTRUCTIONS.md`. Configure Action Bearer authentication with `ACTION_API_KEY`, never the Turso token. This chat does not automatically gain a GPT Action. Custom GPT access depends on your ChatGPT plan.

Other clients can `POST /api/commands` with the Action key and JSON `{ "request_id": "a UUID", "text": "a full command" }`. This API is stateless; Telegram owns the interactive task/button flow. The direct structured CRUD API remains available for trusted clients and has its own Action confirmation settings. Do not share the Action credential with other masters.

`/health` checks basic configuration, not live database/model connectivity. Missing variables return a setup response instead of crashing the static dashboard. Environment changes require redeployment.

## Verification

`bun run test` uses temporary SQLite databases and mocked model/Telegram calls to exercise auth, isolation, transactional audit, retries, concurrent state updates, task phases, button confirmation/edit/cancel, stale proposals, delivery failures and lease recovery.

`bun run eval` checks 50 fictional Uzbek examples against live Gemini without reading or writing shop records. It covers number phrases, models, statuses, reports, follow-ups, unsupported payments and unrelated chatter. It consumes Google API quota. Use `bun run eval -- --limit 8` for a smaller sample; `EVAL_INTERVAL_MS` controls spacing (default 4 seconds). A passing sample is not a measured production accuracy guarantee.

Latest validation: 17 automated tests passed; all 50 fictional Uzbek model-evaluation cases passed in one run. A separate live Gemini test passed intake → price proposal → edit → revised proposal → confirmation using a temporary database. These checks do not measure real-world shop accuracy or guarantee exactly-once Telegram notifications.


## Uzbek voice notes

Aisha/VoiceLab is the selected speech provider. Set `AISHA_API` in Vercel Production (aliases `AISHA_API_KEY` and `VOICELAB_API_KEY` are accepted), then redeploy. The supported developer endpoint is `https://api.voicelab.uz/v1/stt` with Bearer authentication, not the older Aisha `back.aisha.group` endpoint. Default language is Uzbek; optionally set `AISHA_SPEECH_LANGUAGE=uz`.

`SPEECH_PROVIDER=aisha` explicitly selects Aisha. `SPEECH_PROVIDER=groq` explicitly selects Whisper. When no provider is specified, configured Aisha credentials select Aisha; otherwise the existing Groq configuration keeps working during setup. Runtime errors never silently switch providers. `/health` reports the active provider and whether its key is configured, without exposing secrets.

An allowlisted user sends a Telegram **voice note** of up to 120 seconds and 10 MB. The server fetches Telegram bytes and uploads them to the selected provider; it never sends the Telegram download URL containing the bot token. No audio bytes are stored in Turso or on disk. The provider receives the audio; transcripts, provider job IDs and review results are persisted for retries.

Staff voice is transcribed and executed directly. The original message timestamp and transcript are saved for safe retries; unclear commands ask a focused question. Legacy transcript buttons remain compatible.

VoiceLab returns asynchronous jobs even for short recordings. The server immediately checks the first result, respects Retry-After for pending jobs, and spends at most about 20 seconds in a processing attempt. Jobs that remain pending resume on webhook retry. Stable UUID idempotency keys and persisted `speech_jobs` IDs prevent reuploading on retries. Logs contain provider upload/poll timing, not keys or spoken content.

The user's test clip returned “Kechagilik analitika.” One run took 2.2 seconds: approximately 1.8 seconds for upload/job creation and 0.4 seconds for the first result fetch, with no polling sleep. These are sample measurements, not latency guarantees. Telegram transfer, database access and outgoing reply add to total bot latency. Gemini runs only after transcript acceptance.

To test a local recording without writing repair records:

```sh
bun run speech:try -- /absolute/path/voice.ogg --provider aisha
bun run speech:try -- /absolute/path/voice.ogg --provider groq --compare
```

The Aisha command persists only its provider job ID to resume polling; the Groq comparison calls both Whisper models. Use real recordings to evaluate names, phone models, amounts and informal Uzbek. Tests verify endpoint/authentication, job resumption, transcript review, date references, isolation and duplicate protection.

### Optional Whisper settings

Set `GROQ_API_KEY` with `SPEECH_PROVIDER=groq`. Optional settings: `GROQ_WHISPER_MODEL=whisper-large-v3` (default) or `whisper-large-v3-turbo`, and `GROQ_SPEECH_LANGUAGE=uz` (default; `auto` enables language detection).


The default Whisper context includes analytics vocabulary as well as repair terms. In a user-confirmed two-second sample saying “Kechagi analitika”, the original repair-only prompt produced “Gece gelik analitika”; adding analytics examples recovered the intended phrase. This is a single-sample result, not a general accuracy guarantee. `GROQ_SPEECH_PROMPT` optionally overrides the default context (keep it short and in the audio language). Staff voice now executes directly after transcription; no automatic rewriting of names, prices or dates is applied. User audio files are not included in the repository.


After a button action completes, the bot removes the clicked message’s inline keyboard. Completed text actions also clear older tracked keyboards in that conversation. New response buttons remain available, and delayed retries do not clear newer messages. Explicit cancellation replies use the exact text `Amal bekor qilindi.`; expired proposals keep their explanatory error. Cleanup failures can retry without repeating the saved command or reply.


The product-label printing screen uses Code 128 barcodes. Camera scanning accepts
1D barcodes and legacy QR codes. A keyboard scanner can submit codes with Enter
in the sales search field. Label layouts are A4; thermal-printer-specific formats
are not configured by this change.

## Customer search bot and retrieval harness

The customer bot is separate from the staff bot. Set `SHOP_TELEGRAM_BOT_TOKEN`,
`SHOP_TELEGRAM_WEBHOOK_SECRET`, `SHOP_ADMIN_CHAT_ID`, and `TELEGRAM_APP_URL`.
The admin must start the customer bot once so it can send purchase-interest
messages to that admin chat. Register its webhook after deployment with
`bun run customer:setup`. Its endpoint is `/api/customer-bot/webhook`.
Development uses `TELEGRAM_DEV_BOT_TOKEN`, `TELEGRAM_DEV_APP_URL`, and
`SHOP_DEV_ADMIN_CHAT_ID`. The existing Google key and GEMINI_MODEL are reused.

Add public policies/FAQ at `/admin/settings/customer-bot`. Knowledge is stored
in Turso. Product retrieval uses SQLite FTS5 with automatic update triggers,
strict price/spec filters, and only published in-stock variants. No embedding
provider or extra database is needed. The AI extracts preferences and ranks
retrieved candidates; backend code renders live prices and verified knowledge
quotes. Customer bot data never includes repairs, staff analytics or secrets.

The buy button is bound to the chat and offered variant. It rechecks availability
and price before creating an admin lead. A lead records buying interest only;
it does not create an order, reserve inventory, deduct stock or collect payment.
Leads and delivery status appear in the customer-bot settings page. Ambiguous
Telegram send outcomes are kept as uncertain rather than automatically resent.
Conversation state, update cache and chat locks prevent repeated interpretation
and duplicate leads. Customer replies may still duplicate if Telegram accepts a
send but its acknowledgement is lost; admin handoffs are not automatically
repeated in that situation.

Checks: `bun run test:customer`. Optional live model evaluation:
`bun x tsx --conditions=react-server scripts/customer-ai-eval.ts --live`.

## Category fields, privacy and hybrid retrieval

Product create/edit requires name, selling price, purchase price, description and
at least one image. Configure optional category fields with “Turkum maydonlari”.
The public catalog and customer AI never receive purchase prices.

Hybrid search combines FTS with multilingual `gemini-embedding-2` vectors (768
components), using the existing Google key. Public documents and query vectors
are cached in Turso; content hashes reject stale embeddings. Price/stock changes
are always checked live rather than embedded. Keyword fallback remains available
when embedding calls fail. `CUSTOMER_SEMANTIC_SEARCH=false` disables vectors;
`CUSTOMER_EMBEDDING_MODEL` optionally selects a supported embedding model.

Customer-bot Settings shows index coverage and a batch index action. New/edited
products and public knowledge schedule indexing after their writes; customer
requests and the existing daily cron advance initial backfill. No separate vector
service is needed. Google model/account quotas apply.

`/admin/operations` shows safe request/stage traces, latency metrics and derived
alerts. Both bots use shared lease, delivery acknowledgement and error-classification
primitives. Telemetry excludes message text, prompts, keys and customer IDs and
is bounded to seven days/10,000 events.
