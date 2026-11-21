import {
  subscribeCart,
  setCartOpen,
  addLine,
  updateLineQuantity,
  removeCartLine,
  applyCartCoupon,
  removeCartCoupon,
  setCartNote,
  goToCheckout
} from "/js/wix/cart-store.js";
import { imgSrc } from "/js/wix/media.js";

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTilePrice(p) {
  if (p.fromPrice) {
    return `<span class="price-current">From ${esc(p.price)}</span>`;
  }
  if (p.price !== p.maxPrice) {
    return `<span class="price-current">${esc(p.price)} – ${esc(p.maxPrice)}</span>`;
  }
  let html = `<span class="price-current">${esc(p.price)}</span>`;
  if (p.compareAtPrice) {
    html += `<span class="price-compare">${esc(p.compareAtPrice)}</span>`;
  }
  if (p.pricePerUnit) {
    html += `<span class="price-unit">${esc(p.pricePerUnit)}</span>`;
  }
  return html;
}

export function renderProductTile(p, pendingProductId) {
  const url = `/product.html?slug=${encodeURIComponent(p.slug)}`;
  const mainUrl = p.imageUrl ? imgSrc(p.imageUrl, 640, 640) : "";
  const hoverUrl = p.hoverImageUrl ? imgSrc(p.hoverImageUrl, 640, 640) : "";
  const ribbonsHtml = (p.ribbons || []).length
    ? `<div class="ribbon-stack">${p.ribbons.map((r) => `<span class="ribbon-tag">${esc(r)}</span>`).join("")}</div>`
    : "";
  const discountsHtml = (p.discountNames || []).length
    ? `<p class="discount-line">${p.discountNames.map(esc).join(" · ")}</p>`
    : "";
  const swatchesHtml = (p.swatches || []).length
    ? `<span class="swatch-dots" aria-label="Available colors">${p.swatches
        .map((hex) => `<span class="swatch-dot" style="background-color:${esc(hex)}"></span>`)
        .join("")}</span>`
    : "";
  const optionsHtml = p.optionsSummary
    ? `<span class="options-summary">${esc(p.optionsSummary)}</span>`
    : "";

  let actionHtml = "";
  if (p.availability === "OUT_OF_STOCK" && !p.preorder) {
    actionHtml = `<a class="tile-action" href="${url}">View details</a>`;
  } else if (p.hasSubscriptions) {
    actionHtml = `<a class="tile-action" href="${url}">Select plan</a>`;
  } else if (p.quickAddable && p.minPriceVariantId) {
    const busy = pendingProductId === p.id;
    actionHtml = `<button type="button" class="tile-action" data-quick-add="${esc(p.id)}" data-variant="${esc(p.minPriceVariantId)}"${busy ? " disabled" : ""}>${busy ? "Adding…" : "Add to cart"}</button>`;
  } else {
    actionHtml = `<a class="tile-action" href="${url}">Choose options</a>`;
  }

  return `
    <article class="product-tile">
      <a class="tile-media-link" href="${url}">
        ${ribbonsHtml}
        ${
          mainUrl
            ? `<img class="main-img" src="${esc(mainUrl)}" alt="${esc(p.name)}" loading="lazy">`
            : `<div class="tile-placeholder">${esc(p.name)}</div>`
        }
        ${hoverUrl ? `<img class="hover-img" src="${esc(hoverUrl)}" alt="" loading="lazy">` : ""}
      </a>
      <div class="tile-body">
        <h3 class="tile-title"><a href="${url}">${esc(p.name)}</a></h3>
        <div class="tile-price-row">${formatTilePrice(p)}</div>
        ${discountsHtml}
        ${swatchesHtml || optionsHtml ? `<div class="tile-meta-row">${swatchesHtml}${optionsHtml}</div>` : ""}
        <div class="tile-footer">${actionHtml}</div>
      </div>
    </article>
  `;
}

export function bindTileQuickAdd(container) {
  if (!container) return;
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick-add]");
    if (!btn) return;
    const productId = btn.dataset.quickAdd;
    const variantId = btn.dataset.variant;
    if (productId && variantId) {
      addLine(productId, variantId, 1).catch(() => {});
    }
  });
}

export function initSiteShell({ activePath = "" } = {}) {
  const headerMount = document.getElementById("site-header");
  if (headerMount) {
    headerMount.innerHTML = `
      <header class="site-header">
        <div class="container-wide header-inner">
          <a class="brand-mark" href="/index.html">
            <span>SindhCraft</span>
            <span class="brand-sub">Sindh · PK</span>
          </a>
          <nav class="main-nav" aria-label="Primary">
            <a class="nav-link" href="/index.html"${activePath === "home" ? ' aria-current="page"' : ""}>Home</a>
            <a class="nav-link" href="/shop.html"${activePath === "shop" ? ' aria-current="page"' : ""}>Shop All</a>
            <a class="nav-link" href="/category.html?slug=everyday-carry">Everyday Carry</a>
            <a class="nav-link" href="/category.html?slug=desk-studio">Desk &amp; Studio</a>
            <a class="nav-link" href="/category.html?slug=home-table">Home &amp; Table</a>
          </nav>
          <div class="header-actions">
            <a class="icon-action" href="/shop.html" aria-label="Search catalog">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.2" y2="16.2"></line></svg>
              <span>Search</span>
            </a>
            <button type="button" class="icon-action" id="header-cart-btn" aria-label="Open shopping cart">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"></path><path d="M9 7V5a3 3 0 0 1 6 0v2"></path></svg>
              <span>Cart</span>
              <span class="cart-badge" id="header-cart-count"></span>
            </button>
          </div>
        </div>
      </header>
    `;
  }

  const footerMount = document.getElementById("site-footer");
  if (footerMount) {
    footerMount.innerHTML = `
      <footer class="site-footer">
        <div class="container-wide footer-inner">
          <div>
            <a class="brand-mark" href="/index.html"><span>SindhCraft</span></a>
            <p class="footer-note">Small-batch Sindhi craft goods, everyday carry, and home pieces priced in PKR.</p>
          </div>
          <nav class="footer-links" aria-label="Footer">
            <a href="/index.html">Home</a>
            <a href="/shop.html">Shop Catalog</a>
            <a href="/category.html?slug=everyday-carry">Everyday Carry</a>
            <a href="/category.html?slug=desk-studio">Desk &amp; Studio</a>
            <a href="/category.html?slug=home-table">Home &amp; Table</a>
          </nav>
        </div>
      </footer>
    `;
  }

  let drawerMount = document.getElementById("cart-drawer-root");
  if (!drawerMount) {
    drawerMount = document.createElement("div");
    drawerMount.id = "cart-drawer-root";
    document.body.appendChild(drawerMount);
  }

  drawerMount.innerHTML = `
    <div class="cart-backdrop" id="cart-backdrop" hidden>
      <aside class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" tabindex="-1">
        <div class="cart-head">
          <h2 id="cart-drawer-title">Your Cart</h2>
          <button type="button" class="cart-close" id="cart-close-btn" aria-label="Close cart">&times;</button>
        </div>
        <div class="cart-body" id="cart-body"></div>
        <div class="cart-foot" id="cart-foot"></div>
      </aside>
    </div>
  `;

  const backdrop = document.getElementById("cart-backdrop");
  const panel = backdrop.querySelector(".cart-panel");
  const closeBtn = document.getElementById("cart-close-btn");
  const bodyEl = document.getElementById("cart-body");
  const footEl = document.getElementById("cart-foot");
  const countEl = document.getElementById("header-cart-count");
  const openBtn = document.getElementById("header-cart-btn");

  let lastFocus = null;
  let wasOpen = false;

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      lastFocus = document.activeElement;
      setCartOpen(true);
    });
  }

  closeBtn.addEventListener("click", () => setCartOpen(false));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) setCartOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) {
      setCartOpen(false);
    }
  });

  bodyEl.addEventListener("click", (e) => {
    const stepBtn = e.target.closest("[data-cart-step]");
    if (stepBtn) {
      const id = stepBtn.dataset.lineId;
      const nextQty = Number(stepBtn.dataset.cartStep);
      if (nextQty <= 0) removeCartLine(id).catch(() => {});
      else updateLineQuantity(id, nextQty).catch(() => {});
      return;
    }
    const removeBtn = e.target.closest("[data-cart-remove]");
    if (removeBtn) {
      removeCartLine(removeBtn.dataset.cartRemove).catch(() => {});
      return;
    }
    const removeCouponBtn = e.target.closest("[data-remove-coupon]");
    if (removeCouponBtn) {
      removeCartCoupon().catch(() => {});
    }
  });

  bodyEl.addEventListener("submit", (e) => {
    if (e.target.matches("#cart-coupon-form")) {
      e.preventDefault();
      const input = e.target.querySelector("input[name='code']");
      const code = (input?.value || "").trim();
      if (code) applyCartCoupon(code).catch(() => {});
    }
  });

  bodyEl.addEventListener("change", (e) => {
    if (e.target.matches("#cart-note-input")) {
      setCartNote(e.target.value).catch(() => {});
    }
  });

  footEl.addEventListener("click", (e) => {
    if (e.target.closest("#cart-checkout-btn")) {
      goToCheckout().catch(() => {});
    }
  });

  subscribeCart((s) => {
    const count = s.cart ? s.cart.itemCount : 0;
    if (countEl) countEl.textContent = count ? String(count) : "";

    backdrop.hidden = !s.open;
    document.body.classList.toggle("drawer-open", Boolean(s.open));

    if (s.open && !wasOpen) {
      lastFocus = lastFocus || document.activeElement;
      requestAnimationFrame(() => panel.focus());
    } else if (!s.open && wasOpen && lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
      lastFocus = null;
    }
    wasOpen = Boolean(s.open);

    const errorHtml = s.error ? `<p class="error-text" role="alert">${esc(s.error)}</p>` : "";

    if (!s.cart) {
      bodyEl.innerHTML = `${errorHtml}<p>Loading cart…</p>`;
      footEl.innerHTML = "";
      return;
    }

    const lines = s.cart.lines || [];
    if (!lines.length) {
      bodyEl.innerHTML = `
        ${errorHtml}
        <div class="state-box">
          <h2>Your cart is empty</h2>
          <p>Browse small-batch brass, textile, and woodwork pieces to add items to your bag.</p>
          <a class="btn-primary" href="/shop.html">Browse catalog</a>
        </div>
      `;
      footEl.innerHTML = "";
      return;
    }

    const linesHtml = lines
      .map((line) => {
        const thumb = line.imageUrl ? imgSrc(line.imageUrl, 160, 160) : "";
        const desc = (line.descriptionLines || []).join(" · ");
        const maxReached = line.availableQuantity != null && line.quantity >= line.availableQuantity;
        const statusWarning =
          line.status && line.status !== "IN_STOCK"
            ? `<p class="error-text">${esc(line.status.replace(/_/g, " "))}</p>`
            : "";
        return `
          <div class="cart-line">
            ${
              thumb
                ? `<img class="cart-line-img" src="${esc(thumb)}" alt="${esc(line.productName)}">`
                : `<div class="cart-line-img"></div>`
            }
            <div>
              <div class="cart-line-top">
                <h3 class="cart-line-title">${esc(line.productName)}</h3>
                <span class="cart-line-price">${esc(line.linePrice)}</span>
              </div>
              ${desc ? `<p class="cart-line-desc">${esc(desc)}</p>` : ""}
              ${line.subscription ? `<p class="cart-line-desc">${esc(line.subscription)}</p>` : ""}
              ${statusWarning}
              <div class="cart-line-controls">
                <div class="stepper stepper-sm">
                  <button type="button" data-line-id="${esc(line.lineItemId)}" data-cart-step="${line.quantity - 1}" aria-label="Decrease quantity"${s.busy ? " disabled" : ""}>−</button>
                  <span>${line.quantity}</span>
                  <button type="button" data-line-id="${esc(line.lineItemId)}" data-cart-step="${line.quantity + 1}" aria-label="Increase quantity"${s.busy || maxReached ? " disabled" : ""}>+</button>
                </div>
                <button type="button" class="btn-text" data-cart-remove="${esc(line.lineItemId)}"${s.busy ? " disabled" : ""}>Remove</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const couponHtml = s.cart.coupon
      ? `<div class="total-row"><span>Promo: <strong>${esc(s.cart.coupon.code)}</strong></span><button type="button" class="btn-text" data-remove-coupon${s.busy ? " disabled" : ""}>Remove</button></div>`
      : `<form class="coupon-row" id="cart-coupon-form">
          <input class="field-input" type="text" name="code" placeholder="Promo code" aria-label="Promo code"${s.busy ? " disabled" : ""}>
          <button type="submit" class="btn-secondary"${s.busy ? " disabled" : ""}>Apply</button>
        </form>`;

    bodyEl.innerHTML = `
      ${errorHtml}
      ${linesHtml}
      <div class="cart-extras">
        ${couponHtml}
        <div>
          <label class="sr-only" for="cart-note-input">Order note</label>
          <input class="field-input" id="cart-note-input" type="text" placeholder="Add a note for the workshop (optional)" value="${esc(s.cart.note || "")}"${s.busy ? " disabled" : ""}>
        </div>
      </div>
    `;

    const discountRows = (s.cart.discounts || [])
      .map((d) => `<div class="total-row"><span>${esc(d.name)}</span><span>−${esc(d.amount)}</span></div>`)
      .join("");
    const feeRows = (s.cart.fees || [])
      .map((f) => `<div class="total-row"><span>${esc(f.name)}</span><span>${esc(f.amount)}</span></div>`)
      .join("");
    const taxRow = s.cart.pricesIncludeTax
      ? ""
      : (s.cart.taxes || []).length
      ? s.cart.taxes.map((t) => `<div class="total-row"><span>${esc(t.name)}</span><span>${esc(t.amount)}</span></div>`).join("")
      : `<div class="total-row"><span>Taxes &amp; shipping</span><span>Calculated at checkout</span></div>`;

    footEl.innerHTML = `
      <div class="total-row"><span>Subtotal</span><span>${esc(s.cart.subtotal)}</span></div>
      ${discountRows}
      ${feeRows}
      ${taxRow}
      ${s.cart.total ? `<div class="total-row grand"><span>Estimated total</span><span>${esc(s.cart.total)}</span></div>` : ""}
      <button type="button" class="btn-primary checkout-btn" id="cart-checkout-btn"${s.busy ? " disabled" : ""}>Proceed to checkout</button>
    `;
  });
}