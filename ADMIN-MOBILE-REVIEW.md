# Admin mobile and touch review

Reviewed October 18, 2026 against the running local shop, in dark mode.

## Verdict

The admin is usable on small screens, but needs a touch-target and form-readability pass. No blocking navigation or layout defect was observed in the checked flows.

## Evidence and limits

- Browser viewport checks at 320, approximately 389, and 430 CSS pixels wide. Product edit and settings were checked at 320; inventory and dialogs at the wider sizes.
- Browser DOM measurements and screenshots; browser clicks and form input, not a physical touchscreen test.
- Search reduced the inventory to AirPods; the out-of-stock filter returned JBL Go 4. Settings navigation, new/edit form opening, and delete confirmation cancellation worked.
- No observed horizontal page overflow in these views. The product editor's scroll width fit its client width at 320.
- Closed forms and restored search/filter and viewport settings. No product or shop data was saved or deleted.
- Not tested: physical iOS/Android keyboards, pinch gestures, browser text enlargement, actual save/upload workflows, or a full accessibility/performance audit.

## Findings

| Priority | Finding | Evidence | Recommended change |
|---|---|---|---|
| P1 | Checkbox rows are hard to tap | Product editor checkbox labels are only 18px high; checkboxes are 16px squares | Give the whole label a minimum 44px tap area and separate rows on narrow phones |
| P2 | Repeated action controls are undersized | Inventory edit/delete buttons measure 35 × 40px; image move/remove and dialog close controls are 40 × 40px; add-image button is about 37px high | Use at least 44 × 44px targets with space between destructive and edit actions |
| P2 | Form text can cause mobile input zoom | Product editor and shop settings inputs use 14px text; inventory search/filter text is smaller still | Use 16px form text on mobile. Confirm behavior on a physical iPhone; auto-zoom was not reproduced here |
| P2 | Small secondary text is difficult to scan | Mobile inventory uses very small metadata and search/filter text | Increase mobile supporting text, especially search/filter and stock/status labels |
| P2 | Returning to the catalog has a small target | Admin top-bar catalog link measures about 59 × 16px | Increase its padded tap area to 44px high |

44px is the comfort target used for this review, not a claim that every smaller control automatically fails WCAG. Formal target-size compliance requires spacing and exception checks.

## What works

- Mobile inventory presents products as stacked cards rather than forcing a wide desktop table. This corrects the earlier verbal description of its mobile behavior.
- Main navigation buttons measure 44 × 44px and retain accessible names when visually rendered as icons.
- Most text inputs and save/cancel buttons are already at least 44px high.
- Product editor fits narrow phones and scrolls internally; labels and current image order remain visible.
- Destructive actions have a confirmation step, with cancel focused first in the tested dialog.

Recommended next pass: adapt touch targets and mobile typography, then polish and repeat the same checks on physical iOS and Android devices.
