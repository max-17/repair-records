# Product requirements

This is the source of truth for current product scope. Explicit user instructions take precedence.

## Business and interfaces

One electronics shop selling phones, tablets, laptops and accessories, with a repair service and delivery operation. Five workers share duties, with a leader and a main repair technician. Repair intake employee and technician are separate fields.

One installation contains the public storefront, owner inventory/sales interface, staff Telegram bot and customer Telegram bot. Uzbek is the primary language; storefront also supports Russian. Prices are integer UZS and reporting dates use Asia/Tashkent.

Match BILLZ's operational layout: compact catalog table, status tabs, contextual actions, grouped product form, cart work area with side summary, and print settings beside a live label preview. Preserve existing theme tokens. Mobile remains touch friendly with 44px controls. No exports, supplier orders, stock transfers or reservations.

## Products and categories

Product API writes require name, selling price, purchase price, description and at least one photo. Existing unknown purchase prices stay null until edited; never invent costs. Purchase price is private admin data and must never enter public products, Telegram channel posts, customer retrieval, embeddings or AI prompts.

Create/edit categories with optional text, numeric or select field definitions. Every product in that category shows those optional inputs. Default phone/tablet fields are combined RAM/storage (8/256), color and new/used condition. Other categories can define length or other appropriate fields. Do not require optional category values. Preserve legacy values and other products when definitions change.

Phone/tablet variants share a model but retain independent stock, selling price, purchase price, photos and identifiers. Configured attributes distinguish variants; duplicate combinations in the same model are rejected. Separate product IDs remain the unit of inventory and sales. Public catalog cards group models and detail pages select published variants.

Inventory supports adding/removing stock, exact counts, notes and immutable before/after history. Low stock remains a fixed rule of three units or fewer. Do not add per-product thresholds. Sales deduct stock only after confirmation and preserve product/variant selling-price snapshots. Recorded sales are not proof of payment received.

Barcode labels show product/variant, selling price and Code128 code. Old inventory identifiers remain valid. Camera scanning supports 1D codes and legacy QR; keyboard Enter scans deliberately increment the cart. Camera duplicate detection remains guarded. Thermal printer formats are not configured; current print layout uses A4.

## Staff bot

The staff bot uses /start, /pul and /tamirlash commands with separate conversation state. There are no persistent reply menus or Pul subsections. Contextual inline buttons may switch sections. Pul supports ledger-only product/service sales, explicit split cash/card/transfer payments in UZS/USD, trusted-customer debts and partial repayments, provider-financed principal and fully paid purchases of used phones/items from customers as outgoing money. It does not update stock or sync BILLZ. Customer name is required for standalone debts and sales with customer debt owed to the shop. Phone is optional. Fully paid sales/services, vendor-covered sales and purchases may omit customer name. Missing optional contacts remain null; exact IDs identify unnamed paid records. Repair customer requirements are unchanged. A partially paid sale is itself the debt; never duplicate it as a standalone debt. Provider-financed principal is not customer debt. Only provider name and explicit financed principal are tracked: no commission, markup, expected payout, actual provider receipt or settlement balance. Names may be entered directly; owners can manage a provider-name list. The stated sale price is authoritative. USD and UZS payments remain separate, with no exchange-rate fields or conversion. Mixed-currency records require explicit settlement status/customer debt and explicit financed remainder; never infer a converted balance. Customer debt repayments use the debt currency. Used-phone purchases are separate from sales, require explicitly paid purchase amounts, record outgoing cash/card/transfer payments and never create customer receivables or change stock. General expenses/payables are outside scope.

Every Pul write requires structured data review and confirmation. Optional Telegram sale photo can be attached/replaced before confirmation. Attached photos are sent with the structured review as their caption and confirmation buttons below; confirming edits that original draft text/photo caption into the saved receipt and removes its buttons, without sending a second receipt or a separate view-photo button. Telegram retries reuse the cached edit, including harmless already-applied edits. Legacy view-photo callbacks remain valid. Raw transcripts are not displayed. Editing a draft requires a new confirmation token. Every saved create/edit/soft-delete/restore appends before/after data and the authenticated Telegram worker to immutable history in the same transaction. No physical deletion of financial records is permitted. Deleting a parent with active payments is blocked. Staff see their own records and relevant repayments; the owner sees all and can collect another worker's debt without changing seller attribution. Sales and money collected are reported separately, grouped by worker/method/currency. Queries and daily reports use Asia/Tashkent dates. Pul is a separate ledger from the existing inventory checkout; entering the same sale in both is not synchronized.

Daily cron runs at 21:00 Asia/Tashkent (16:00 UTC) and sends the owner a daily report with due/overdue debts; responsible workers receive their own debt reminders. Optional reminder dates snooze the next reminder. Settled/deleted debts do not generate reminders. Notification claims prevent automatic duplicates; uncertain sends require manual investigation. Owners and staff access derive from database roles; legacy environment mappings are imported once for bootstrap and cannot reactivate revoked users. No customer messages are sent. /start explains commands; /tamirlash (/repair compatible) and /pul switch sections and invalidate pending actions. Incoming staff messages show a silent Xabaringizni ko‘rib chiqyapman… notice before command processing, removed after the result is delivered. Notice claims are durable per Telegram update; uncertain sends are not repeated, cleanup failures are retried and cosmetic errors never block business actions. Callback buttons use their existing loading state without an extra notice. Telegram typing indicators refresh while working and pressed buttons temporarily show Bajarilmoqda…; failures restore controls.


Authenticated staff text instructions execute directly without routine confirmations. Repair-bot voice instructions require structured field review with Uzbek Confirm, Edit and Cancel buttons before execution; edited commands must be reviewed again. Ask for missing details or ambiguous/stale identities. Maintain per-master access, transactional audit records, idempotency and original voice timestamps/transcripts across retries. Old issued buttons remain compatible. Software services were planned as service/customer/worker/price without device or payment status; do not claim they are implemented yet.

## Customer bot and retrieval

Separate customer bot searches/recommends published in-stock variants and answers from public shop knowledge. Explicit buy buttons notify admin and record a lead; they do not create orders, reserve stock, take payment or access repairs/staff data. Show current prices and verify availability and price at action time.

Use hybrid keyword and multilingual semantic retrieval. Exact model anchors and strict live budget/spec/availability filters cannot be relaxed by embeddings. Vectors use recorded public product facts and public FAQ only. Product/knowledge content hashes invalidate stale vectors. Query caches and indexing avoid repeated embedding work; keyword retrieval remains available when embeddings fail. No extra vector database or new API key is required; account quotas still apply.

The owner can manage public knowledge and index status under customer-bot settings. Shared delivery/lease primitives support separate domain workflows. Persist conversation state, action identity, update caches and uncertain delivery outcomes. Never automatically resend an admin lead after an ambiguous send.

## Observability

Owner-only operations page shows request/stage traces, latency, failures and operational alerts. Store only safe metadata: generated trace IDs, stage labels, durations and error codes. Never log message bodies, prompts, credentials or customer identities. Telemetry must not change business outcomes. Retain at most seven days and 10,000 events.

## Explicit exclusions

No buyer accounts, public checkout, actual payment processing, trade-ins/netting, general expenses, profit/margin accounting, refunds, stock reservations, transfers, supplier orders or exports. Pul records incoming payments, customer debts and outgoing customer-item purchases; it does not move money. Purchase price is required storage, not authorization to add accounting workflows.

## Technology and environments

Bun package management, Next.js, shadcn/Base UI, TanStack Query, libSQL/Turso, UploadThing and AI SDK. Production modules share DATABASE_URL/DATABASE_TOKEN. Development uses isolated data/development.db and local uploads. Never commit secrets, local databases or uploaded photos. Development bots/channels are isolated from production. The staff bot uses TELEGRAM_BOT_TOKEN; customer/channel bot uses SHOP_TELEGRAM_BOT_TOKEN.

## Pul web and staff access

/admin/pul uses the same ledger as the staff bot: searchable/paginated records, debt balances, worker/currency analytics, details and immutable history, manual sales/services, customer-item purchases, debt entries, repayments, provider names and soft deletion/restoration. Manual entries have a review before saving and retry-safe request IDs. Owners can select the responsible worker separately from the authenticated actor; other workers cannot impersonate another worker. Optional manual sale photos are private image blobs (JPG/PNG/WebP, 2 MB limit), served through authorized endpoints, never public catalog URLs. Bot and web can view each other's sale photos.

staff_users/staff_roles are the authority for bot and web access; roles have explicit Pul read/write/all-workers, repair and admin permissions. /admin/staff lets an owner create roles, assign them, enable/disable users, and generate 7-day single-use invitation links. Login approval occurs in the existing Telegram bot and is bound to a 10-minute HttpOnly browser proof cookie. Invitations cannot silently alter an existing account's role. Sessions consult current database access on each request, so revocation is immediate. At least one active database owner must remain. Permission/user changes and invitation acceptance append immutable staff history. The existing owner password is retained for bootstrap/recovery and is audited as Veb administrator; Telegram sessions identify the actual user. Restricted web users can access only Pul; the existing inventory/admin APIs remain owner-only. Staff can use /tamirlash in the bot when granted repair access.

## Source evidence

New Pul and repair writes preserve original contributing messages as immutable sources linked to mutation history in the same transaction. Text retains original wording; voice retains transcript, original Telegram file ID, SHA-256 hash and privately archived audio. Telegram sender, chat/message identifiers and source timestamp are retained when available. Corrections add sources, never replace earlier evidence. Manual Pul forms retain submitted structured input. Cancelled/unfinished sources do not create financial records. Existing historical records are not backfilled with invented evidence.

Production voice archives use the existing UPLOADTHING_TOKEN and AES-256-GCM encryption before upload, compatible with UploadThing free storage; uploads must succeed before the voice draft proceeds. Development archives audio in the isolated local database. Evidence keys/URLs are never public catalog assets and must not be included in image cleanup. Pul history exposes source text and an authenticated audio player, scoped to the same record permissions, including soft-deleted records. Repair sources are linked to repair_events for later review. Evidence records what was submitted and approved, not proof of an actual payment.

## Optional Pul sale totals and incomplete drafts

Sale totals and individual item prices are optional; unknown prices remain null, never zero or fabricated. A ready record may use explicit payments, financed principal and settlement status instead of a single-currency price. Where total is absent, preserve the currency breakdown (payments plus explicit financed/customer-debt amounts), without conversion. Show that breakdown in bot/web and aggregate it in its original currencies. Do not require an overall price for the USD upfront plus UZS financed-remainder case.

When a worker asks to record something but required information is missing, respond with all extracted draft fields and a short Uzbek follow-up question. Persist the draft and supporting sources, offer cancellation, and withhold confirmation until required details are ready. Clarification itself does not create a financial record. Later answers/corrections refine the same draft and receive a fresh confirmation token. Optional contact details and optional total must not block an otherwise complete sale.

## Staff message failure recovery

Recognized speech/archive/input failures return a useful Uzbek error reply instead of indefinitely failing the webhook. Use stable error types rather than constructor-name strings, which production minification can change. After three failed processing attempts with no cached reply, the next attempt delivers a durable result-unknown notice and releases subsequent messages. The notice must never claim a financial operation was not saved. Cached business replies retain delivery retry behavior and are never replaced by the notice. Recovery does not delete financial data or silently replay commands.

## Free-plan archive encryption

UploadThing private ACLs require a paid plan. New production evidence therefore uploads only an authenticated-encryption envelope as an opaque .bin file, using the app default ACL; raw audio is never sent as a public object. Only the authorized source endpoint decrypts, checks the original content hash and returns playable audio. Legacy private objects and local development blobs remain readable. Upload/provider failures expose only allowlisted diagnostic codes, never credentials or raw provider messages.

Encryption uses a domain-separated HKDF key derived from AUDIO_ARCHIVE_KEY when explicitly configured, otherwise the existing ADMIN_SESSION_SECRET. Persist that key for the lifetime of evidence. Before rotating either secret, retain old archive key material in AUDIO_ARCHIVE_PREVIOUS_KEYS (comma-separated); key IDs in source metadata select the correct retained key. Changing a session secret without retaining it can make earlier encrypted evidence unreadable. No encryption key is stored in the database or uploaded object. Existing server secret is sufficient; no new variable is required for this free-plan fix.

## Response latency

Exact read-only phrases for today's/yesterday's reports and the debt list use deterministic local-date parsing and current worker-scoped ledger data, without an AI call. Extra names, filters, financial writes or unrecognized phrases stay on normal parsing. No financial write bypasses review or history. Startup DDL is batched and cached per database client, not staff authorization or business data. Ledger state reads, history/source links and draft/result persistence use batches inside their existing transaction boundaries. Version checks and atomic audit rollback remain required. Fresh Gemini 3 Flash requests use minimal thinking; active-draft follow-ups retain normal model reasoning.

For sales and customer-item purchases, stated payments are treated as the full price by default, including mixed currencies, unless the worker explicitly mentions an unpaid remainder. Do not ask whether the payment is complete. Explicit unpaid balances still require debt details and customer names. Ready reviews retain confirmation/edit/cancel buttons; incomplete field previews omit the action/qoralama heading.

## Separate Pul business tables

Pul sales, purchases, debts, payments and provider names live in pul_sales, pul_purchases, pul_debts, pul_payments and pul_vendors. pul_records is an identity registry only (shop, kind, worker, version, soft-delete and timestamps). Typed generated columns expose validated amounts, currencies, methods and contacts from each business snapshot; item rows are stored separately in pul_items with append-only record versions. Domain snapshots retain optional/legacy fields without losing information.

A sale-linked debt uses sale_id and shares the sale identity, so the application does not display/count a second standalone debt. Its principal excludes initial customer payments and provider financing; repayments link to that debt and sale. Standalone debts have no sale_id. Payments explicitly reference their sale, purchase or standalone debt, and cross-shop/invalid target links are rejected. USD and UZS remain separate. Purchases remain separate from sales; this migration does not enable exchange/netting commands.

Schema migration imports existing data transactionally, preserving IDs, attribution, versions, deletion flags, timestamps, history and evidence links. Original rows remain in an immutable pul_legacy_records archive; no financial record is physically deleted. A private export can be checked with scripts/pul-import-check.js in an isolated local database before deployment. Migration fails atomically on invalid data or references. Shared immutable history remains authoritative for every business edit.
