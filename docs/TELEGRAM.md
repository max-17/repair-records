# Telegram integration

## Behavior
- Same app and database, with the existing password-only admin login. No Telegram sign-in is used or trusted for authorization.
- New products post automatically when published. Initially unpublished products post on their first publication. Connecting a channel does not publish the existing catalog; select existing products under Settings → Telegram to publish them.
- Every available photo (up to the product limit of ten) is included. Photos are downloaded server-side and sent as multipart file uploads, avoiding Telegram’s 5 MB URL-download limit. Each uploaded photo is limited to 10 MB; missing files and non-image responses are rejected before sending. The owner's title and description are kept as written, without translation or a language selector. Long descriptions use a companion text message; albums have a companion message for the two buttons.
- Buttons open the storefront Mini App and the owner's Telegram chat. The chat draft includes the product name and product page link; the customer presses Send.
- Product edits and stock changes update existing posts. A price/discount change or crossing between available and sold out reposts posts at least seven days old. Routine quantity changes update in place.
- A replacement is published and recorded before old messages are deleted. Telegram generally prohibits deleting messages older than 48 hours, including with the Bot API. When deletion is refused, old content is updated where possible and a cleanup notice/link appears in Settings. Full automatic deletion of week-old posts is not guaranteed by Telegram.
- Unpublishing/deleting removes posts where allowed, otherwise marks them unavailable and removes the contact buttons.

## Production setup
1. Create a bot in Telegram's official @BotFather. Set its Main Mini App URL to the shop's public HTTPS root URL. This enables channel buttons using the bot's `startapp` link. The integration also configures the private-chat menu button when connecting a channel.
2. Set server-only Vercel production variables: `SHOP_TELEGRAM_BOT_TOKEN`, `TELEGRAM_APP_URL` (e.g. the public HTTPS root), and a random `CRON_SECRET`. Never use NEXT_PUBLIC for the token or cron secret.
3. In normal shop settings, save the owner's personal Telegram username. It must be an account customers can message, not the channel or bot.
4. Add the bot as a channel administrator with posting, editing, and deletion permissions. Settings → Telegram → connect `@channel_username` or the private channel's numeric `-100…` ID. Up to five channels are supported.
5. New published products now queue for all enabled channels. Pause a channel from Settings to stop further processing. Already published posts are not erased when pausing.

## Development and previews
- Development and Vercel previews never read the production bot token. They require `TELEGRAM_DEV_BOT_TOKEN`, `TELEGRAM_DEV_APP_URL`, and `TELEGRAM_DEV_CHANNEL_IDS` (comma-separated numeric channel IDs).
- Use a separate test bot and private test channel. Only IDs explicitly in the development allowlist can connect or receive posts.
- Mini App testing requires an HTTPS development tunnel. Local photo uploads must be reachable through that test HTTPS URL for Telegram to fetch them. Localhost image URLs are not accessible to Telegram.
- Local development still uses local SQLite and local image uploads. Vercel previews should have separately scoped preview storage variables; never populate preview environments with production credentials.

## Delivery and recovery
Product/stock changes and queue updates share a database transaction. A leased worker runs after mutations using Next.js `after()`. Admin status polling also drains the queue. The included Vercel cron is a daily backup, compatible with Hobby; an authenticated external scheduler can invoke GET `/api/telegram/cron` more frequently with `Authorization: Bearer <CRON_SECRET>` if faster unattended recovery is required. Normal saves trigger immediate processing; offline recovery is not guaranteed to be immediate on a daily schedule.

Confirmed photo/message IDs are journaled so an album can resume after a companion-message failure. Explicit temporary Telegram errors back off and retry. A lost response or expired in-flight worker is marked "check channel" rather than automatically resending: Telegram does not provide an idempotency key for these send methods, so exactly-once delivery cannot be guaranteed. The owner must inspect the channel and acknowledge before retrying an uncertain send. Channel pause is honored before claiming jobs; a send already in progress may complete.

The bot uses HTTP API calls; there is no separate always-running bot server or long-polling process. A webhook is unnecessary for the current menu/Mini App and outbound-posting features.

## Verification
`npm run test:telegram` runs against temporary SQLite and mocked Telegram responses; it never contacts real Telegram, Turso, or UploadThing. It covers albums, contextual buttons, no initial catalog flood, in-place updates, old-post replacement/deletion limits, partial delivery retry, ambiguous responses, sales/stock hooks, and development isolation. The photo transport tests cover large multipart albums, single photos, media edits, bounded downloads, failed sources, redacted provider errors, and ambiguous sends. Real-device Telegram camera, keyboard, and launch behavior must also be checked with the test bot before production activation.
