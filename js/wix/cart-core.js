export const WIX_STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";
export const rawId = (raw) => raw?._id ?? raw?.id ?? "";
export function formatMoney(money, currencyCode) {
    const value = money?.convertedAmount ?? money?.amount;
    if (value == null || value === "")
        return "";
    const currency = currencyCode || "USD";
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
    }
    catch {
        return `${value} ${currency}`;
    }
}
const amountOf = (money) => {
    const n = Number(money?.convertedAmount ?? money?.amount);
    return Number.isFinite(n) ? n : 0;
};
export const cartCurrency = (raw) => raw?.customerInfo?.currencyCode ?? raw?.businessInfo?.currencyCode ?? "";
const translated = (t) => typeof t === "string" ? t : t?.translated ?? t?.original ?? "";
export function subscriptionTerms(info) {
    if (!info)
        return "";
    const s = info.subscriptionSettings ?? {};
    const unit = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };
    const parts = [];
    const title = translated(info.title);
    if (title)
        parts.push(title);
    const u = unit[String(s.frequency ?? "")];
    if (u)
        parts.push(`every ${s.interval && s.interval > 1 ? `${s.interval} ${u}s` : u}`);
    if (!s.autoRenewal && s.billingCycles)
        parts.push(`${s.billingCycles} payments`);
    return parts.join(" · ");
}
export function compareAtLinePrice(pricing, quantity, currency) {
    const unit = amountOf(pricing?.unitPrice);
    const b = pricing?.breakdown ?? {};
    const candidate = [b.salePrice, b.fullPrice].find((m) => m && amountOf(m) > unit);
    if (!candidate || quantity < 1)
        return null;
    return formatMoney({ amount: String(amountOf(candidate) * quantity) }, currency);
}
export function toLine(raw, currency, imgSrc) {
    const quantity = raw.quantityInfo?.confirmedQuantity ?? 0;
    const url = raw.attributes?.url;
    return {
        lineItemId: rawId(raw),
        productName: translated(raw.name),
        quantity,
        unitPrice: formatMoney(raw.pricing?.unitPrice, currency),
        linePrice: formatMoney(raw.pricing?.totalPrice, currency),
        compareAtLinePrice: compareAtLinePrice(raw.pricing, quantity, currency),
        availableQuantity: typeof raw.quantityInfo?.availableQuantity === "number" ? raw.quantityInfo.availableQuantity : null,
        imageUrl: imgSrc(raw.attributes?.image, 300, 300),
        productUrl: typeof url === "string" ? url : url?.url ?? "",
        descriptionLines: (raw.attributes?.descriptionLines ?? [])
            .map((d) => {
            const label = translated(d.name), value = translated(d.plainText) || translated(d.colorInfo);
            return label && value ? `${label}: ${value}` : value || label;
        })
            .filter(Boolean),
        status: raw.status ?? "IN_STOCK",
        subscription: subscriptionTerms(raw.attributes?.subscriptionInfo),
    };
}
export const EMPTY_TOTALS = { subtotal: "", discount: "", discounts: [], fees: [], taxes: [], pricesIncludeTax: false, total: "" };
export function toCart(raw, totals, imgSrc) {
    const currency = cartCurrency(raw);
    const lines = (raw?.lineItems ?? []).map((l) => toLine(l, currency, imgSrc));
    const coupon = (raw?.coupons ?? [])[0];
    return {
        lines,
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        subtotal: totals.subtotal,
        discount: totals.discount,
        discounts: totals.discounts.filter((d) => d.scope !== "item").map(({ name, amount }) => ({ name, amount })),
        fees: totals.fees,
        taxes: totals.taxes,
        pricesIncludeTax: totals.pricesIncludeTax || raw?.taxInfo?.pricesIncludeTax === true,
        total: totals.total,
        coupon: coupon && rawId(coupon) ? { id: rawId(coupon), code: coupon.code ?? "" } : null,
        note: raw?.note ?? "",
        currency,
    };
}
export function summaryTotals(estimate, raw) {
    const s = estimate?.summary ?? {};
    const currency = cartCurrency(raw) || cartCurrency(estimate?.cart);
    const ps = s.priceSummary ?? {};
    const named = (list, key) => (list ?? [])
        .filter((x) => x && amountOf(x[key]) > 0)
        .map((x) => ({ name: translated(x.name) || translated(x.translatedName), amount: formatMoney(x[key], currency) }));
    const scopeOf = (d) => (d.scope === "LINE_ITEM" ? "item" : d.scope === "DELIVERY" ? "delivery" : "cart");
    return {
        subtotal: formatMoney(ps.subtotal, currency),
        discount: amountOf(ps.discount) > 0 ? formatMoney(ps.discount, currency) : "",
        discounts: (s.discounts ?? []).filter((d) => d && amountOf(d.total) > 0).map((d) => ({ name: translated(d.name), amount: formatMoney(d.total, currency), scope: scopeOf(d) })),
        fees: named(s.additionalFees, "price"),
        taxes: named(s.taxSummary?.taxes, "amount"),
        pricesIncludeTax: s.taxSummary?.pricesIncludeTax === true,
        total: formatMoney(ps.total, currency),
    };
}
export function addOptions({ variantId, optionChoices, modifierChoices, customTextFields, subscriptionOptionId, preorder }) {
    const o = {};
    if (variantId)
        o.variantId = variantId;
    const options = { ...(optionChoices ?? {}), ...(modifierChoices ?? {}) };
    if (Object.keys(options).length)
        o.options = options;
    if (customTextFields && Object.keys(customTextFields).length)
        o.customTextFields = customTextFields;
    if (subscriptionOptionId)
        o.subscriptionOptionId = subscriptionOptionId;
    if (preorder)
        o.preOrderRequested = true;
    return o;
}
export function errorCode(err) {
    const e = err;
    const code = e?.details?.applicationError?.code ?? e?.code;
    return typeof code === "string" ? code : undefined;
}
const CART_ERRORS = {
    ITEM_NOT_FOUND_IN_CATALOG: "This item is no longer available.",
    INSUFFICIENT_INVENTORY: "This item is now out of stock.",
    ERROR_COUPON_DOES_NOT_EXIST: "That code doesn't exist. Check it and try again.",
    ERROR_COUPON_EXPIRED: "That code has expired.",
    ERROR_COUPON_NOT_APPLICABLE: "That code doesn't apply to this cart.",
};
export function cartErrorMessage(err, fallback = "Something went wrong with your cart. Please try again.") {
    const code = errorCode(err);
    if (code && CART_ERRORS[code])
        return CART_ERRORS[code];
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
    return message || fallback;
}
export function assertAdded(cart, productId, variantId) {
    const line = (cart?.lineItems ?? []).find((l) => l.source?.catalogReference?.catalogItemId === productId && (!variantId || l.source?.catalogReference?.options?.variantId === variantId));
    if (line?.status && line.status !== "IN_STOCK") {
        throw new Error(`This item isn't available right now (${String(line.status).toLowerCase().replace(/_/g, " ")}).`);
    }
    if (!line || line.quantityInfo?.confirmedQuantity === 0) {
        throw new Error("The item couldn't be added. Make sure every required selection was made (options for a product with variants, and all mandatory customizations).");
    }
}
export function assertCheckoutable(raw) {
    const lines = raw?.lineItems ?? [];
    if (!lines.length)
        throw new Error("Your cart is empty.");
    const unavailable = lines.filter((l) => l.status && l.status !== "IN_STOCK");
    if (unavailable.length) {
        throw new Error(`Some items are no longer available: ${unavailable.map((l) => translated(l.name)).filter(Boolean).join(", ")}.`);
    }
    if (!rawId(raw))
        throw new Error("Checkout couldn't start: the cart has no id.");
}
