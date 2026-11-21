import { addToCart as apiAdd, applyCoupon as apiApplyCoupon, fetchCart, removeCoupon as apiRemoveCoupon, removeLine as apiRemove, setNote as apiSetNote, updateQuantity as apiUpdate, checkoutUrl } from "./cart.js";

const EMPTY = { cart: null, busy: false, pendingProductId: null, error: null, open: false };
let state = EMPTY;
const listeners = new Set();
let loaded = false;

function setState(patch) {
    state = { ...state, ...patch };
    for (const l of listeners)
        l();
}

export function getCartState() {
    return state;
}

export function subscribeCart(fn) {
    const listener = () => {
        try {
            fn(getCartState());
        }
        catch (e) {
            console.error("cart-store listener failed", e);
        }
    };
    listeners.add(listener);
    if (!loaded && typeof window !== "undefined") {
        loaded = true;
        void refreshCart();
    }
    return () => listeners.delete(listener);
}

async function run(op) {
    setState({ busy: true, error: null });
    try {
        setState({ cart: await op(), busy: false });
    }
    catch (e) {
        setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
        throw e;
    }
}

export async function refreshCart() {
    try {
        setState({ cart: await fetchCart() });
    }
    catch {
        /* no cart yet — leave the empty state */
    }
}

export async function addLine(productId, variantId, quantity = 1, extras) {
    setState({ pendingProductId: productId });
    try {
        await run(() => apiAdd(productId, variantId, quantity, extras));
    }
    finally {
        setState({ pendingProductId: null });
        setState({ open: true });
    }
}

export async function updateLineQuantity(lineItemId, quantity) {
    await run(() => apiUpdate(lineItemId, quantity));
}

export async function removeCartLine(lineItemId) {
    await run(() => apiRemove(lineItemId));
}

export async function applyCartCoupon(code) {
    if (!code.trim())
        return;
    await run(() => apiApplyCoupon(code));
}

export async function removeCartCoupon() {
    await run(() => apiRemoveCoupon());
}

export async function setCartNote(note) {
    if ((state.cart?.note ?? "") === note.trim())
        return;
    await run(() => apiSetNote(note));
}

export function setCartOpen(open) {
    setState({ open });
}

/* ---- Direct Storefront Cash-on-Delivery (COD) Checkout Flow ---- */
const ORDERS_KEY = "sindhcraft_orders";

function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function loadSavedOrders() {
    try {
        const raw = localStorage.getItem(ORDERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}

function saveOrderRecord(order) {
    try {
        const existing = loadSavedOrders();
        existing.unshift(order);
        localStorage.setItem(ORDERS_KEY, JSON.stringify(existing.slice(0, 25)));
    }
    catch {
        /* ignore storage quota errors */
    }
}

function ensureCheckoutStyles() {
    if (typeof document === "undefined" || document.getElementById("sc-cod-styles"))
        return;
    const style = document.createElement("style");
    style.id = "sc-cod-styles";
    style.textContent = `
        .sc-cod-backdrop {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(20, 16, 13, 0.64);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            overflow-y: auto;
            font-family: var(--font-sans, "Plus Jakarta Sans", system-ui, -apple-system, sans-serif);
        }
        .sc-cod-dialog {
            background: var(--bg, #FAF6F0);
            color: var(--ink, #1E1915);
            width: 100%;
            max-width: 880px;
            max-height: 92vh;
            overflow-y: auto;
            border-radius: 16px;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
            border: 1px solid rgba(30, 25, 21, 0.12);
            position: relative;
        }
        .sc-cod-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid rgba(30, 25, 21, 0.1);
            background: var(--surface, #F3ECE1);
            position: sticky;
            top: 0;
            z-index: 2;
        }
        .sc-cod-title {
            margin: 0;
            font-family: var(--font-serif, "Cormorant Garamond", Georgia, serif);
            font-size: 1.65rem;
            font-weight: 700;
            letter-spacing: -0.01em;
            color: var(--ink, #1E1915);
        }
        .sc-cod-close {
            background: transparent;
            border: 1px solid rgba(30, 25, 21, 0.2);
            color: var(--ink, #1E1915);
            width: 36px;
            height: 36px;
            border-radius: 999px;
            font-size: 1.25rem;
            line-height: 1;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .sc-cod-close:hover {
            background: rgba(30, 25, 21, 0.08);
        }
        .sc-cod-grid {
            display: grid;
            grid-template-columns: 1.25fr 0.95fr;
            gap: 1.5rem;
            padding: 1.5rem;
        }
        @media (max-width: 760px) {
            .sc-cod-grid {
                grid-template-columns: 1fr;
            }
        }
        .sc-cod-section-title {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 700;
            color: var(--muted, #6B5E53);
            margin: 0 0 1rem;
        }
        .sc-cod-field {
            margin-bottom: 0.9rem;
        }
        .sc-cod-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }
        @media (max-width: 500px) {
            .sc-cod-row {
                grid-template-columns: 1fr;
            }
        }
        .sc-cod-label {
            display: block;
            font-size: 0.84rem;
            font-weight: 600;
            margin-bottom: 0.35rem;
            color: var(--ink, #1E1915);
        }
        .sc-cod-input, .sc-cod-select, .sc-cod-textarea {
            width: 100%;
            box-sizing: border-box;
            padding: 0.65rem 0.8rem;
            border-radius: 8px;
            border: 1px solid rgba(30, 25, 21, 0.22);
            background: #FFFFFF;
            color: #1E1915;
            font-size: 0.94rem;
            font-family: inherit;
        }
        .sc-cod-input:focus, .sc-cod-select:focus, .sc-cod-textarea:focus {
            outline: 2px solid var(--accent, #9E3B24);
            border-color: var(--accent, #9E3B24);
        }
        .sc-cod-payment-box {
            border: 1.5px solid var(--accent, #9E3B24);
            background: rgba(158, 59, 36, 0.06);
            border-radius: 10px;
            padding: 0.85rem 1rem;
            margin: 1rem 0 1.15rem;
            display: flex;
            align-items: flex-start;
            gap: 0.7rem;
        }
        .sc-cod-radio {
            margin-top: 0.2rem;
            accent-color: var(--accent, #9E3B24);
        }
        .sc-cod-summary {
            background: var(--surface, #F3ECE1);
            border-radius: 12px;
            padding: 1.25rem;
            border: 1px solid rgba(30, 25, 21, 0.09);
            align-self: start;
        }
        .sc-cod-items {
            list-style: none;
            margin: 0 0 1rem;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            max-height: 260px;
            overflow-y: auto;
        }
        .sc-cod-item {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid rgba(30, 25, 21, 0.08);
        }
        .sc-cod-item img {
            width: 52px;
            height: 52px;
            object-fit: cover;
            border-radius: 8px;
            background: #E8DFD1;
            flex-shrink: 0;
        }
        .sc-cod-item-info {
            flex: 1;
            min-width: 0;
        }
        .sc-cod-item-name {
            font-weight: 600;
            font-size: 0.9rem;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .sc-cod-item-meta {
            font-size: 0.78rem;
            color: var(--muted, #6B5E53);
            margin: 0.15rem 0 0;
        }
        .sc-cod-item-price {
            font-weight: 600;
            font-size: 0.9rem;
            white-space: nowrap;
        }
        .sc-cod-totals {
            display: flex;
            flex-direction: column;
            gap: 0.45rem;
            font-size: 0.9rem;
        }
        .sc-cod-total-row {
            display: flex;
            justify-content: space-between;
        }
        .sc-cod-total-row.grand {
            border-top: 1px solid rgba(30, 25, 21, 0.15);
            padding-top: 0.65rem;
            margin-top: 0.35rem;
            font-size: 1.08rem;
            font-weight: 700;
        }
        .sc-cod-submit {
            width: 100%;
            padding: 0.9rem 1.25rem;
            border: none;
            border-radius: 10px;
            background: var(--accent, #9E3B24);
            color: #FFFFFF;
            font-weight: 700;
            font-size: 0.98rem;
            cursor: pointer;
            transition: opacity 0.15s ease;
        }
        .sc-cod-submit:hover:not(:disabled) {
            opacity: 0.92;
        }
        .sc-cod-submit:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .sc-cod-error {
            background: #FEE2E2;
            color: #991B1B;
            padding: 0.65rem 0.85rem;
            border-radius: 8px;
            font-size: 0.86rem;
            margin-bottom: 0.9rem;
        }
        .sc-cod-confirm {
            padding: 2rem 1.75rem;
            text-align: center;
        }
        .sc-cod-badge {
            width: 56px;
            height: 56px;
            border-radius: 999px;
            background: #15803D;
            color: #FFFFFF;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 1.75rem;
            margin-bottom: 0.85rem;
        }
        .sc-cod-receipt {
            text-align: left;
            background: var(--surface, #F3ECE1);
            border-radius: 12px;
            padding: 1.25rem;
            margin: 1.25rem auto;
            max-width: 580px;
            border: 1px solid rgba(30, 25, 21, 0.1);
            font-size: 0.9rem;
        }
        .sc-cod-actions {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
            flex-wrap: wrap;
            margin-top: 1.25rem;
        }
        .sc-cod-btn-secondary {
            padding: 0.75rem 1.15rem;
            border-radius: 10px;
            border: 1px solid rgba(30, 25, 21, 0.25);
            background: transparent;
            color: var(--ink, #1E1915);
            font-weight: 600;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

function closeCheckoutModal() {
    const existing = document.getElementById("sc-cod-modal");
    if (existing)
        existing.remove();
}

function renderOrderConfirmation(dialog, order) {
    const pastOrders = loadSavedOrders();
    const itemsHtml = order.items.map((item) => `
        <div style="display:flex;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid rgba(30,25,21,0.07);">
            <span>${esc(item.productName)} &times; ${item.quantity}${item.descriptionLines?.length ? ` <small style="color:#6B5E53;">(${esc(item.descriptionLines.join(", "))})</small>` : ""}</span>
            <strong>${esc(item.linePrice)}</strong>
        </div>
    `).join("");

    dialog.innerHTML = `
        <div class="sc-cod-header">
            <h2 class="sc-cod-title">Order Confirmation</h2>
            <button type="button" class="sc-cod-close" aria-label="Close">&times;</button>
        </div>
        <div class="sc-cod-confirm">
            <div class="sc-cod-badge">&#10003;</div>
            <h3 style="margin:0 0 0.35rem;font-size:1.45rem;">Thank you, ${esc(order.customer.fullName)}!</h3>
            <p style="margin:0;color:var(--muted,#6B5E53);">Your order <strong>#${esc(order.orderNumber)}</strong> has been placed and confirmed.</p>

            <div class="sc-cod-receipt">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;padding-bottom:0.85rem;border-bottom:1px solid rgba(30,25,21,0.12);">
                    <div>
                        <div style="font-size:0.75rem;text-transform:uppercase;color:#6B5E53;">Order Number</div>
                        <strong>#${esc(order.orderNumber)}</strong>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;text-transform:uppercase;color:#6B5E53;">Payment Method</div>
                        <strong>Cash on Delivery (COD)</strong>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;text-transform:uppercase;color:#6B5E53;">Delivery Address</div>
                        <div>${esc(order.customer.address)}, ${esc(order.customer.city)}${order.customer.postalCode ? ` (${esc(order.customer.postalCode)})` : ""}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;text-transform:uppercase;color:#6B5E53;">Contact</div>
                        <div>${esc(order.customer.phone)}<br>${esc(order.customer.email)}</div>
                    </div>
                </div>
                <div style="margin-bottom:0.75rem;">
                    <div style="font-size:0.75rem;text-transform:uppercase;color:#6B5E53;margin-bottom:0.35rem;">Items Ordered</div>
                    ${itemsHtml}
                </div>
                <div style="display:flex;justify-content:space-between;font-size:1.05rem;padding-top:0.5rem;">
                    <strong>Total Payable on Delivery</strong>
                    <strong>${esc(order.total)}</strong>
                </div>
            </div>

            <div id="sc-cod-history-box" style="display:none;max-width:580px;margin:1rem auto 0;text-align:left;"></div>

            <div class="sc-cod-actions">
                <button type="button" class="sc-cod-btn-secondary" id="sc-cod-toggle-history">View Order History (${pastOrders.length})</button>
                <button type="button" class="sc-cod-submit" style="width:auto;padding:0.75rem 1.5rem;" id="sc-cod-done-btn">Continue Shopping</button>
            </div>
        </div>
    `;

    dialog.querySelector(".sc-cod-close")?.addEventListener("click", closeCheckoutModal);
    dialog.querySelector("#sc-cod-done-btn")?.addEventListener("click", closeCheckoutModal);
    dialog.querySelector("#sc-cod-toggle-history")?.addEventListener("click", () => {
        const box = dialog.querySelector("#sc-cod-history-box");
        if (!box)
            return;
        if (box.style.display === "block") {
            box.style.display = "none";
            return;
        }
        box.style.display = "block";
        box.innerHTML = `
            <div style="background:#FFFFFF;border:1px solid rgba(30,25,21,0.14);border-radius:10px;padding:1rem;">
                <div style="font-weight:700;margin-bottom:0.5rem;">Saved Orders (${pastOrders.length})</div>
                ${pastOrders.map((o) => `
                    <div style="padding:0.55rem 0;border-bottom:1px solid rgba(30,25,21,0.08);font-size:0.85rem;">
                        <div style="display:flex;justify-content:space-between;">
                            <strong>#${esc(o.orderNumber)} — ${esc(o.customer.fullName)}</strong>
                            <span>${esc(o.total)}</span>
                        </div>
                        <div style="color:#6B5E53;">${esc(new Date(o.createdAt).toLocaleString())} &middot; ${esc(o.customer.city)} &middot; ${o.items.length} item(s)</div>
                    </div>
                `).join("")}
            </div>
        `;
    });
}

function openCodCheckoutModal(cart) {
    ensureCheckoutStyles();
    closeCheckoutModal();

    const backdrop = document.createElement("div");
    backdrop.id = "sc-cod-modal";
    backdrop.className = "sc-cod-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Cash on Delivery Checkout");

    const linesHtml = cart.lines.map((line) => `
        <li class="sc-cod-item">
            ${line.imageUrl ? `<img src="${esc(line.imageUrl)}" alt="${esc(line.productName)}">` : `<div style="width:52px;height:52px;border-radius:8px;background:#E8DFD1;flex-shrink:0;"></div>`}
            <div class="sc-cod-item-info">
                <p class="sc-cod-item-name">${esc(line.productName)}</p>
                <p class="sc-cod-item-meta">Qty: ${line.quantity}${line.descriptionLines?.length ? ` &middot; ${esc(line.descriptionLines.join(", "))}` : ""}</p>
            </div>
            <div class="sc-cod-item-price">${esc(line.linePrice)}</div>
        </li>
    `).join("");

    const discountsHtml = (cart.discounts ?? []).map((d) => `
        <div class="sc-cod-total-row" style="color:#15803D;">
            <span>Discount (${esc(d.name)})</span>
            <span>-${esc(d.amount)}</span>
        </div>
    `).join("");

    const totalDisplay = cart.total || cart.subtotal || "";

    backdrop.innerHTML = `
        <div class="sc-cod-dialog">
            <div class="sc-cod-header">
                <h2 class="sc-cod-title">Complete Your Order</h2>
                <button type="button" class="sc-cod-close" aria-label="Close checkout">&times;</button>
            </div>
            <div class="sc-cod-grid">
                <form id="sc-cod-form" novalidate>
                    <h3 class="sc-cod-section-title">Delivery &amp; Contact Details</h3>
                    <div id="sc-cod-err" class="sc-cod-error" style="display:none;"></div>
                    <div class="sc-cod-field">
                        <label class="sc-cod-label" for="sc-name">Full Name *</label>
                        <input class="sc-cod-input" id="sc-name" name="fullName" type="text" required placeholder="e.g. Ayesha Memon">
                    </div>
                    <div class="sc-cod-row">
                        <div class="sc-cod-field">
                            <label class="sc-cod-label" for="sc-email">Email Address *</label>
                            <input class="sc-cod-input" id="sc-email" name="email" type="email" required placeholder="you@example.com">
                        </div>
                        <div class="sc-cod-field">
                            <label class="sc-cod-label" for="sc-phone">Phone Number *</label>
                            <input class="sc-cod-input" id="sc-phone" name="phone" type="tel" required placeholder="+92 300 1234567">
                        </div>
                    </div>
                    <div class="sc-cod-field">
                        <label class="sc-cod-label" for="sc-address">Delivery Address *</label>
                        <input class="sc-cod-input" id="sc-address" name="address" type="text" required placeholder="House / Street / Sector / Landmark">
                    </div>
                    <div class="sc-cod-row">
                        <div class="sc-cod-field">
                            <label class="sc-cod-label" for="sc-city">City *</label>
                            <select class="sc-cod-select" id="sc-city" name="city" required>
                                <option value="Hyderabad">Hyderabad</option>
                                <option value="Karachi">Karachi</option>
                                <option value="Lahore">Lahore</option>
                                <option value="Islamabad">Islamabad</option>
                                <option value="Rawalpindi">Rawalpindi</option>
                                <option value="Sukkur">Sukkur</option>
                                <option value="Larkana">Larkana</option>
                                <option value="Mirpurkhas">Mirpurkhas</option>
                                <option value="Thatta">Thatta</option>
                                <option value="Other">Other City</option>
                            </select>
                        </div>
                        <div class="sc-cod-field">
                            <label class="sc-cod-label" for="sc-postal">Postal Code</label>
                            <input class="sc-cod-input" id="sc-postal" name="postalCode" type="text" placeholder="e.g. 71000">
                        </div>
                    </div>
                    <div class="sc-cod-field">
                        <label class="sc-cod-label" for="sc-note">Order Note (Optional)</label>
                        <textarea class="sc-cod-textarea" id="sc-note" name="note" rows="2" placeholder="Gift message or delivery instructions...">${esc(cart.note || "")}</textarea>
                    </div>

                    <div class="sc-cod-payment-box">
                        <input class="sc-cod-radio" type="radio" id="sc-pay-cod" name="paymentMethod" value="COD" checked>
                        <label for="sc-pay-cod" style="cursor:pointer;">
                            <strong style="display:block;font-size:0.95rem;">Cash on Delivery (COD)</strong>
                            <span style="font-size:0.82rem;color:var(--muted,#6B5E53);">Pay in cash when your handcrafted order is delivered. No advance online payment required.</span>
                        </label>
                    </div>

                    <button type="submit" class="sc-cod-submit" id="sc-cod-submit-btn">Place Order (${esc(totalDisplay)})</button>
                </form>

                <aside class="sc-cod-summary">
                    <h3 class="sc-cod-section-title">Order Summary (${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"})</h3>
                    <ul class="sc-cod-items">${linesHtml}</ul>
                    <div class="sc-cod-totals">
                        <div class="sc-cod-total-row">
                            <span>Subtotal</span>
                            <span>${esc(cart.subtotal)}</span>
                        </div>
                        ${discountsHtml}
                        <div class="sc-cod-total-row">
                            <span>Shipping (COD)</span>
                            <span>Free</span>
                        </div>
                        <div class="sc-cod-total-row grand">
                            <span>Total</span>
                            <span>${esc(totalDisplay)}</span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);

    const dialog = backdrop.querySelector(".sc-cod-dialog");
    const closeBtn = backdrop.querySelector(".sc-cod-close");
    closeBtn?.addEventListener("click", closeCheckoutModal);
    backdrop.addEventListener("click", (ev) => {
        if (ev.target === backdrop)
            closeCheckoutModal();
    });
    const onKeyDown = (ev) => {
        if (ev.key === "Escape") {
            closeCheckoutModal();
            document.removeEventListener("keydown", onKeyDown);
        }
    };
    document.addEventListener("keydown", onKeyDown);

    const form = backdrop.querySelector("#sc-cod-form");
    const errBox = backdrop.querySelector("#sc-cod-err");
    const submitBtn = backdrop.querySelector("#sc-cod-submit-btn");

    form?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (errBox)
            errBox.style.display = "none";

        const fd = new FormData(form);
        const fullName = String(fd.get("fullName") || "").trim();
        const email = String(fd.get("email") || "").trim();
        const phone = String(fd.get("phone") || "").trim();
        const address = String(fd.get("address") || "").trim();
        const city = String(fd.get("city") || "").trim();
        const postalCode = String(fd.get("postalCode") || "").trim();
        const note = String(fd.get("note") || "").trim();

        if (!fullName || !email || !phone || !address || !city) {
            if (errBox) {
                errBox.textContent = "Please fill in your full name, email, phone number, delivery address, and city.";
                errBox.style.display = "block";
            }
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errBox) {
                errBox.textContent = "Please enter a valid email address.";
                errBox.style.display = "block";
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Placing Order...";
        }

        try {
            const orderNumber = "SC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
            const order = {
                orderNumber,
                createdAt: new Date().toISOString(),
                status: "Confirmed",
                paymentMethod: "Cash on Delivery",
                currency: cart.currency || "PKR",
                subtotal: cart.subtotal,
                total: totalDisplay,
                note,
                customer: { fullName, email, phone, address, city, postalCode },
                items: cart.lines.map((l) => ({
                    productName: l.productName,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    linePrice: l.linePrice,
                    descriptionLines: l.descriptionLines || []
                }))
            };

            for (const line of cart.lines) {
                try {
                    await apiRemove(line.lineItemId);
                }
                catch {
                    /* continue clearing remaining items */
                }
            }
            await refreshCart();

            saveOrderRecord(order);
            if (dialog)
                renderOrderConfirmation(dialog, order);
        }
        catch (err) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = `Place Order (${totalDisplay})`;
            }
            if (errBox) {
                errBox.textContent = err instanceof Error ? err.message : "Could not place order. Please try again.";
                errBox.style.display = "block";
            }
        }
    });
}

export async function goToCheckout() {
    setState({ busy: true, error: null });
    try {
        const current = state.cart ?? (await fetchCart());
        if (!current || !current.lines || current.lines.length === 0) {
            throw new Error("Your cart is empty.");
        }
        const unavailable = current.lines.filter((l) => l.status && l.status !== "IN_STOCK");
        if (unavailable.length > 0) {
            throw new Error(`Some items are no longer available: ${unavailable.map((l) => l.productName).join(", ")}.`);
        }
        setState({ cart: current, busy: false, open: false });
        if (typeof window !== "undefined") {
            openCodCheckoutModal(current);
        }
    }
    catch (e) {
        setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
        throw e;
    }
}
