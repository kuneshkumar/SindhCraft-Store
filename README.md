# SindhCraft 

Complete static HTML, CSS, and modular ES JavaScript source code for the **SindhCraft** online store.

## File Structure

- `index.html` — Homepage with hero showcase, department grid, featured products, and brand values.
- `shop.html` — Full catalog view with live search, price range filter, stock toggle, facet filters, sorting, and cursor pagination.
- `category.html` — Department/collection page filtered by URL slug (`?slug=everyday-carry`, etc.).
- `product.html` — Product Detail Page (PDP) with gallery thumbnails, option swatches/chips, quantity stepper, restock alerts, and accordion info sections.
- `styles.css` — Complete design tokens, responsive grid layouts, product cards, and slide-over cart drawer styles.
- `js/ui-shell.js` — Shared navigation header, footer, product card renderer, and cart drawer UI.
- `js/wix/config.js` — Store OAuth client configuration.
- `js/wix/client.js` — Visitor token authentication and REST API client (`https://www.wixapis.com`).
- `js/wix/catalog.js` & `js/wix/catalog-core.js` — Catalog search, categories, facets, variants, and inventory logic.
- `js/wix/cart.js` & `js/wix/cart-core.js` — Cart V2 operations (add/update/remove items, promo codes, order notes).
- `js/wix/cart-store.js` — Reactive cart state and Cash on Delivery (COD) checkout modal with order confirmation and history.
- `js/wix/shop-store.js` — Reactive catalog filtering, URL state synchronization, and pagination store.
- `js/wix/product-detail-store.js` — Reactive PDP state, variant resolution, and back-in-stock notifications.
- `js/wix/media.js` — Responsive image URL builder.
- `js/wix/rich-content.js` — Rich content document to sanitized HTML converter.
- `js/wix/storefront-types.js` — Storefront data model definitions.

## Running Locally

Because the site uses native ES modules (`<script type="module">`) and root-relative paths (`/styles.css`, `/js/...`), serve the root folder with any static HTTP server:

```bash
npx serve .
# or
python -m http.server 8080
```
