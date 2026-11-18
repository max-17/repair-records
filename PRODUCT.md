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

The staff bot uses /start, /pul and /tamirlash commands with separate conversation state. There are no persistent reply menus or Pul subsections. Contextual inline buttons may switch sections. Pul supports ledger-only product/service sales, explicit split cash/card/transfer payments in UZS/USD, trusted-customer debts and partial repayments, provider financing and actual provider receipts. It does not update stock or sync BILLZ. Customer name and phone are optional for all Pul sales, services, standalone debts and provider-financed sales. Missing/blank contact details remain null; unnamed records are identified by their unique ID for later edits and repayments. Repair customer requirements are unchanged. A partially paid sale is itself the debt; never duplicate it as a standalone debt. Provider-financed principal is not customer debt; provider payout remains separate from approval. Provider percentages/type are explicit, owner-managed and snapshotted on sale. The stated sale price is authoritative; markup is not silently added again.

Every Pul write requires structured data review and confirmation. Optional Telegram sale photo can be attached/replaced before confirmation. Raw transcripts are not displayed. Editing a draft requires a new confirmation token. Every saved create/edit/soft-delete/restore appends before/after data and the authenticated Telegram worker to immutable history in the same transaction. No physical deletion of financial records is permitted. Deleting a parent with active payments is blocked. Staff see their own records and relevant repayments; the owner sees all and can collect another worker's debt without changing seller attribution. Sales and money collected are reported separately, grouped by worker/method/currency. Queries and daily reports use Asia/Tashkent dates. Pul is a separate ledger from the existing inventory checkout; entering the same sale in both is not synchronized.

Daily cron runs at 21:00 Asia/Tashkent (16:00 UTC) and sends the owner a daily report with due/overdue debts; responsible workers receive their own debt reminders. Optional reminder dates snooze the next reminder. Settled/deleted debts do not generate reminders. Notification claims prevent automatic duplicates; uncertain sends require manual investigation. Owners and staff access derive from database roles; legacy environment mappings are imported once for bootstrap and cannot reactivate revoked users. No customer messages are sent. /start explains commands; /tamirlash (/repair compatible) and /pul switch sections and invalidate pending actions. Telegram typing indicators refresh while working and pressed buttons temporarily show Bajarilmoqda…; failures restore controls.


Authenticated staff text instructions execute directly without routine confirmations. Repair-bot voice instructions require structured field review with Uzbek Confirm, Edit and Cancel buttons before execution; edited commands must be reviewed again. Ask for missing details or ambiguous/stale identities. Maintain per-master access, transactional audit records, idempotency and original voice timestamps/transcripts across retries. Old issued buttons remain compatible. Software services were planned as service/customer/worker/price without device or payment status; do not claim they are implemented yet.

## Customer bot and retrieval

Separate customer bot searches/recommends published in-stock variants and answers from public shop knowledge. Explicit buy buttons notify admin and record a lead; they do not create orders, reserve stock, take payment or access repairs/staff data. Show current prices and verify availability and price at action time.

Use hybrid keyword and multilingual semantic retrieval. Exact model anchors and strict live budget/spec/availability filters cannot be relaxed by embeddings. Vectors use recorded public product facts and public FAQ only. Product/knowledge content hashes invalidate stale vectors. Query caches and indexing avoid repeated embedding work; keyword retrieval remains available when embeddings fail. No extra vector database or new API key is required; account quotas still apply.

The owner can manage public knowledge and index status under customer-bot settings. Shared delivery/lease primitives support separate domain workflows. Persist conversation state, action identity, update caches and uncertain delivery outcomes. Never automatically resend an admin lead after an ambiguous send.

## Observability

Owner-only operations page shows request/stage traces, latency, failures and operational alerts. Store only safe metadata: generated trace IDs, stage labels, durations and error codes. Never log message bodies, prompts, credentials or customer identities. Telemetry must not change business outcomes. Retain at most seven days and 10,000 events.

## Explicit exclusions

No buyer accounts, public checkout, actual payment processing, phone purchases/trade-ins, expenses, profit/margin accounting, refunds, stock reservations, transfers, supplier orders or exports. Pul records incoming payments and debts; it does not move money. Purchase price is required storage, not authorization to add accounting workflows.

## Technology and environments

Bun package management, Next.js, shadcn/Base UI, TanStack Query, libSQL/Turso, UploadThing and AI SDK. Production modules share DATABASE_URL/DATABASE_TOKEN. Development uses isolated data/development.db and local uploads. Never commit secrets, local databases or uploaded photos. Development bots/channels are isolated from production. The staff bot uses TELEGRAM_BOT_TOKEN; customer/channel bot uses SHOP_TELEGRAM_BOT_TOKEN.

## Pul web and staff access

/admin/pul uses the same ledger as the staff bot: searchable/paginated records, debt balances, worker/currency analytics, details and immutable history, manual sales/services, debt entries, repayments, provider settings and soft deletion/restoration. Manual entries have a review before saving and retry-safe request IDs. Owners can select the responsible worker separately from the authenticated actor; other workers cannot impersonate another worker. Optional manual sale photos are private image blobs (JPG/PNG/WebP, 2 MB limit), served through authorized endpoints, never public catalog URLs. Bot and web can view each other's sale photos.

staff_users/staff_roles are the authority for bot and web access; roles have explicit Pul read/write/all-workers, repair and admin permissions. /admin/staff lets an owner create roles, assign them, enable/disable users, and generate 7-day single-use invitation links. Login approval occurs in the existing Telegram bot and is bound to a 10-minute HttpOnly browser proof cookie. Invitations cannot silently alter an existing account's role. Sessions consult current database access on each request, so revocation is immediate. At least one active database owner must remain. Permission/user changes and invitation acceptance append immutable staff history. The existing owner password is retained for bootstrap/recovery and is audited as Veb administrator; Telegram sessions identify the actual user. Restricted web users can access only Pul; the existing inventory/admin APIs remain owner-only. Staff can use /tamirlash in the bot when granted repair access.
