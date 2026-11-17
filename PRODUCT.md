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

The existing staff bot has persistent Ta’mirlash / Pul navigation. Each authenticated worker/chat keeps its own selected section. Pul has Sotuv / xizmat, Qarz daftar and Hisobot menu entries, but financial recording and reminders are not implemented yet. These entries must state that limitation rather than save repair records or imply successful money actions. Switching sections cancels outstanding voice drafts and clears repair working state so old buttons cannot execute across sections. /menu opens the section selector; /repair and /pul are shortcuts. No second bot token is needed. Money commands must not reach repair AI or transcription while Pul is selected.

Authenticated staff text instructions execute directly without routine confirmations. Repair-bot voice instructions require transcript review with Uzbek Confirm, Edit and Cancel buttons before execution; edited transcripts must be reviewed again. Ask for missing details or ambiguous/stale identities. Maintain per-master access, transactional audit records, idempotency and original voice timestamps/transcripts across retries. Old issued buttons remain compatible. Software services were planned as service/customer/worker/price without device or payment status; do not claim they are implemented yet.

## Customer bot and retrieval

Separate customer bot searches/recommends published in-stock variants and answers from public shop knowledge. Explicit buy buttons notify admin and record a lead; they do not create orders, reserve stock, take payment or access repairs/staff data. Show current prices and verify availability and price at action time.

Use hybrid keyword and multilingual semantic retrieval. Exact model anchors and strict live budget/spec/availability filters cannot be relaxed by embeddings. Vectors use recorded public product facts and public FAQ only. Product/knowledge content hashes invalidate stale vectors. Query caches and indexing avoid repeated embedding work; keyword retrieval remains available when embeddings fail. No extra vector database or new API key is required; account quotas still apply.

The owner can manage public knowledge and index status under customer-bot settings. Shared delivery/lease primitives support separate domain workflows. Persist conversation state, action identity, update caches and uncertain delivery outcomes. Never automatically resend an admin lead after an ambiguous send.

## Observability

Owner-only operations page shows request/stage traces, latency, failures and operational alerts. Store only safe metadata: generated trace IDs, stage labels, durations and error codes. Never log message bodies, prompts, credentials or customer identities. Telemetry must not change business outcomes. Retain at most seven days and 10,000 events.

## Explicit exclusions

No buyer accounts, public checkout, payment collection, payment status, money-flow management, expenses, profit/margin accounting, refunds, stock reservations, transfers, supplier orders or exports. Purchase price is required storage, not authorization to add accounting workflows.

## Technology and environments

Bun package management, Next.js, shadcn/Base UI, TanStack Query, libSQL/Turso, UploadThing and AI SDK. Production modules share DATABASE_URL/DATABASE_TOKEN. Development uses isolated data/development.db and local uploads. Never commit secrets, local databases or uploaded photos. Development bots/channels are isolated from production. The staff bot uses TELEGRAM_BOT_TOKEN; customer/channel bot uses SHOP_TELEGRAM_BOT_TOKEN.
