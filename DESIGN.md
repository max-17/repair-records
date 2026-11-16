# TechSpace visual system

## Direction
A product-first electronics catalog: precise cobalt controls on porcelain or graphite surfaces. Product photography supplies the visual interest. The store should feel like a focused gadget shop, with a practical owner workspace rather than a marketing dashboard.

## Palette
- Porcelain: #f5f6fa — light canvas
- White: #ffffff — light surfaces
- Graphite: #15161b — dark canvas
- Charcoal: #202127 — dark surfaces
- Cobalt: #315efb — light primary; #94adff for dark primary
- Ink: #191c26 — light text; #f4f5fa for dark text
Secondary text and borders use neutral slate; red is reserved for errors and deletion. Green is removed.

## Type
Self-hosted Manrope throughout, with purposeful weights: 800 product/display headings, 600 controls, 400 supporting text. Mobile form inputs are at least 16px. Supporting interface text is generally 12–14px, never decorative microtype.

## Layout
Storefront: compact navigation, an asymmetric product-led introduction, then searchable products with horizontal category tabs. Mobile has two product columns, with imagery taking priority over promotional copy. Product cards are fully clickable; their galleries retain independent swiping.

Product: large square gallery beside a quiet information column on desktop. On mobile the gallery comes first, followed by name, price, description and seller contact. Seller actions remain exclusive to the product page.

Owner workspace: labeled navigation, a compact title/add action, category creation and a sticky search/filter toolbar. Desktop uses a table. Mobile uses compact rows with large vertically centered thumbnails and 44px action targets. This feature branch adds stock adjustments, QR scanning and printable labels directly in the product list. Tablet navigation sits above the full-width workspace, with 44px stock action targets. No buyer auth, cart or checkout.

Dialogs: consistent headings, separated field groups, legible errors and clear cancel/save actions. Long product editors become a full-width mobile sheet with internally scrolling content. Fullscreen imagery remains image-only with a close action, pinch zoom and swipe navigation.

## Interaction principles
Preserve native scrolling and visible keyboard focus. Keep table/gallery controls independent of whole-card navigation. Form validation and mutations show actionable errors; pending actions prevent duplicate submission. Theme choice is persisted. Respect reduced motion. Use color for selection and state, not decoration.

## Review of direction
Rejected a generic full-width promo banner and dashboard metric tiles. Product photography, a short direct headline and a working catalog are more relevant to local contact-based selling. Retained the existing Manrope family because its Uzbek/Russian glyph coverage and readable forms already fit the product; the redesign changes hierarchy and spacing rather than adding a decorative font.

### Inventory and point of sale extension
Inventory remains the product source of truth; sales has a persistent basket and a single confirmation action. Analytics uses confirmed receipt snapshots and compact metric rows. Tablet landscape keeps the basket beside products; narrow tablets and phones stack it with a basket jump action. Four owner destinations are available in the responsive navigation. Local-only storage and uploads are mandatory for this feature branch.

## BILLZ workflow layout, 15 November 2026

The owner requests BILLZ's information architecture and interaction layout,
not a palette imitation. Use official catalog, cart and label-printing reference
screens as the layout baseline. Keep existing theme tokens and shop branding.

- Catalog: status tabs, one search/filter/action/create toolbar, compact aligned
  table, checkboxes, SKU/barcode/category/price/stock columns, contextual actions
  and pagination. Phones adapt into compact rows with essential info visible.
- Product editor: identity/classification/variant data in a main column;
  price/quantity, images and storefront options in a side column. Group related
  fields, keep secondary storefront options collapsed, anchor save/cancel.
- Checkout: lookup at the top, large cart work area, quantity/name/price alignment,
  separate summary on the right. Product discovery is secondary to the cart.
- Printing: selection and copy quantities beside a live sticker preview with
  product/variant name, price and code. Preview reflects the actual printed layout.

Do not add controls for unsupported payments, customers, exports or printers
just because they appear in a reference screen. Match supported workflows.
