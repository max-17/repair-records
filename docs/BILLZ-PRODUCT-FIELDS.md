# BILLZ product field reference

Checked 15 November 2026 against the official API reference:
- https://docs.billz.io/en/reference/api/operations/post_v2_product/
- https://docs.billz.io/en/reference/api/operations/get_v2_products/
- https://docs.billz.io/en/concepts/data-model/

The creation request and read response have different shapes. They are not a
single schema that should be copied into every form.

| Concept | BILLZ creation | BILLZ response | This app |
|---|---|---|---|
| Identity | name, sku, barcode | name, sku, barcode | name, sku, barcode |
| Classification | category_ids[], brand_id | categories[], brand_id, brand_name | category, brand |
| Unit | measurement_unit_id | measurement_unit {id,name,short_name} | Fixed Dona (integer units) |
| Selling price | shop_prices[].retail_price | shop_prices[].retail_price, retail_currency | price, UZS |
| Initial stock | shipments[].measurement_value | shop_measurement_values[].active_measurement_value | stock and stock movements |
| Properties | product_custom_fields[] {product_characteristic_id,value} | custom_fields[] {custom_field_id,custom_field_name,custom_field_system_name,custom_field_value,from_parent} | customFields[] {name,value} |
| Variations | selected_attributes[], variants[] | parent_id, is_variative, product_attributes[] | Sellable products grouped by modelId; dedicated color, ramGb, storageGb, condition |
| Images | images[] {image,sequence_number,is_main} | photos[] {photo_url,sequence,is_main} | Ordered images[] URLs; first is main |

This implementation matches the supported product concepts, not the BILLZ wire
format. It does not call BILLZ, manufacture BILLZ reference IDs, or implement
bundles, multi-shop prices, accounting or suppliers. The public storefront still
uses its own visibility, featured, hero and old-price fields.

Optional SKU and barcode are unique when present. Barcode is also registered as a
scan alias. Existing printed QR codes and older barcode aliases remain valid
for that product; deleted-product aliases are not reassigned. Camera scanning
remains QR-only until the separate physical-barcode scanner work is done.

The current product editor itself was not accessed in a signed-in BILLZ session;
API reference fields do not establish exact UI layout or mandatory form controls.
