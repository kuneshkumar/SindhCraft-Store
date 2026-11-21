import { WixApiError, wixRequest } from "./client.js";
import { imgSrc } from "./media.js";
import { EMPTY_TOTALS, WIX_STORES_APP_ID, addOptions, assertAdded, assertCheckoutable, cartErrorMessage, rawId, summaryTotals, toCart } from "./cart-core.js";
const CART = "/ecom/v2/carts/current";
async function loud(op) {
    try {
        return await op();
    }
    catch (e) {
        throw new Error(cartErrorMessage(e));
    }
}
const lineImageCache = new Map();
async function fillLineImages(cart, raws) {
    const wanted = new Map();
    raws.forEach((raw, i) => {
        if (cart.lines[i].imageUrl)
            return;
        const pid = raw.source?.catalogReference?.catalogItemId;
        if (!pid)
            return;
        const cached = lineImageCache.get(pid);
        if (cached !== undefined) {
            cart.lines[i].imageUrl = cached;
            return;
        }
        wanted.set(pid, [...(wanted.get(pid) ?? []), i]);
    });
    if (!wanted.size)
        return;
    try {
        const res = await wixRequest("/stores/v3/products/query", { body: { query: { filter: { id: { $in: [...wanted.keys()] } }, cursorPaging: { limit: 100 } } } });
        for (const p of (res?.products ?? [])) {
            const url = imgSrc(p.media?.main, 300, 300);
            lineImageCache.set(rawId(p), url);
            for (const i of wanted.get(rawId(p)) ?? [])
                cart.lines[i].imageUrl = url;
        }
    }
    catch {
        /* images are a nicety — the cart stays correct without them */
    }
}
async function readCart(raw) {
    if (!raw?.lineItems?.length)
        return toCart(raw, EMPTY_TOTALS, imgSrc);
    let totals = EMPTY_TOTALS;
    try {
        totals = summaryTotals(await wixRequest(`${CART}/estimate`, { body: { calculateTax: true, calculateAdditionalFees: true } }), raw);
    }
    catch {
        /* the estimate is a display nicety — the cart itself is still valid */
    }
    const cart = toCart(raw, totals, imgSrc);
    await fillLineImages(cart, raw.lineItems);
    return cart;
}
async function getCurrentCartRaw() {
    try {
        return (await wixRequest(CART, { method: "GET" }))?.cart ?? null;
    }
    catch (e) {
        if (e instanceof WixApiError && e.status === 404)
            return null;
        throw e;
    }
}
export async function fetchCart() {
    return readCart(await getCurrentCartRaw());
}
export async function addToCart(productId, variantId, quantity = 1, extras = {}) {
    return loud(async () => {
        const options = addOptions({ variantId, ...extras });
        const res = await wixRequest(`${CART}/add-line-items`, {
            body: { catalogItems: [{ quantity, catalogReference: { catalogItemId: productId, appId: WIX_STORES_APP_ID, ...(Object.keys(options).length ? { options } : {}) } }] },
        });
        assertAdded(res?.cart, productId, variantId);
        return readCart(res?.cart ?? null);
    });
}
export async function updateQuantity(lineItemId, quantity) {
    return loud(async () => {
        const res = await wixRequest(`${CART}/update-line-items`, { body: { lineItems: [{ lineItemId, quantity: { newQuantity: quantity } }] } });
        return readCart(res?.cart ?? null);
    });
}
export async function removeLine(lineItemId) {
    return loud(async () => {
        const res = await wixRequest(`${CART}/remove-line-items`, { body: { lineItemIds: [lineItemId] } });
        return readCart(res?.cart ?? null);
    });
}
export async function applyCoupon(code) {
    return loud(async () => {
        const res = await wixRequest(`${CART}/add-coupon`, { body: { coupon: { code: code.trim() } } });
        return readCart(res?.cart ?? null);
    });
}
export async function removeCoupon() {
    return loud(async () => {
        const current = await getCurrentCartRaw();
        const couponId = rawId((current?.coupons ?? [])[0]);
        if (!couponId)
            return readCart(current);
        const res = await wixRequest(`${CART}/remove-coupon`, { body: { couponId } });
        return readCart(res?.cart ?? null);
    });
}
export async function setNote(note) {
    return loud(async () => {
        const res = await wixRequest(CART, { method: "PATCH", body: { cart: { note: note.trim() || null } } });
        return readCart(res?.cart ?? null);
    });
}
export async function checkoutUrl(origin = typeof window !== "undefined" ? window.location.origin : "") {
    const raw = await getCurrentCartRaw();
    assertCheckoutable(raw);
    const res = await wixRequest("/headless/v1/redirect-session", {
        body: { ecomCheckout: { checkoutId: rawId(raw) }, callbacks: origin ? { postFlowUrl: `${origin}/`, thankYouPageUrl: `${origin}/` } : {} },
    });
    const url = res?.redirectSession?.fullUrl;
    if (!url)
        throw new Error("Checkout couldn't start: no redirect URL returned.");
    return url;
}
