import { WixApiError, wixRequest } from "./client.js";
import { imgSrc, mediaKey } from "./media.js";
import { CATALOG_SORTS, DETAIL_FIELDS, LIST_FIELDS, STORES_TREE, choiceAvailability, facetCustomizationIds, facetSearchBody, pageInfo, readFacetAggregates, resolveVariant, searchQuery, sellingPrice, toCategory, toDetail, toFacetData, toInventory, toSummary } from "./catalog-core.js";
import { WIX_STORES_APP_ID } from "./cart-core.js";
export { CATALOG_SORTS, choiceAvailability, resolveVariant, sellingPrice };
const notFound = (e) => e instanceof WixApiError && e.status === 404;
export async function searchCatalog(o = {}) {
    const search = searchQuery(o);
    const [res, count] = await Promise.all([
        wixRequest("/stores/v3/products/search", { body: { fields: LIST_FIELDS, search } }),
        !o.cursor ? wixRequest("/stores/v3/products/count", { body: { filter: search.filter } }).catch(() => null) : Promise.resolve(null),
    ]);
    return {
        products: (res?.products ?? []).map((p) => toSummary(p, imgSrc, mediaKey)),
        ...pageInfo(res),
        total: typeof count?.count === "number" ? count.count : null,
    };
}
export async function fetchFacets(scope = {}) {
    return (await fetchFacetData(scope)).facets;
}
export async function fetchFacetData({ categoryId } = {}) {
    try {
        const res = await wixRequest("/stores/v3/products/search", { body: { search: facetSearchBody(categoryId) } });
        const agg = readFacetAggregates(res);
        return toFacetData(agg, await fetchCustomizations(facetCustomizationIds(agg)));
    }
    catch {
        return { facets: [], priceRange: null };
    }
}
async function fetchCustomizations(ids) {
    if (!ids.length)
        return [];
    const batches = [];
    for (let i = 0; i < ids.length; i += 100)
        batches.push(ids.slice(i, i + 100));
    const pages = await Promise.all(batches.map((batch) => wixRequest("/stores/v3/customizations/query", {
        body: { query: { filter: { id: { $in: batch }, customizationRenderType: { $ne: "FREE_TEXT" } }, cursorPaging: { limit: 100 } } },
    })));
    return pages.flatMap((p) => (p?.customizations ?? []));
}
export async function fetchProducts({ limit = 24 } = {}) {
    return (await searchCatalog({ limit })).products;
}
export async function fetchProductsByCategory(categoryId, { limit = 24 } = {}) {
    return (await searchCatalog({ limit, categoryId })).products;
}
export async function fetchProductBySlug(slug) {
    try {
        const res = await wixRequest(`/stores/v3/products/slug/${encodeURIComponent(decodeSlug(slug))}`, { method: "GET", query: { fields: DETAIL_FIELDS } });
        return res?.product ? toDetail(res.product, imgSrc, mediaKey) : null;
    }
    catch (e) {
        if (notFound(e))
            return null;
        throw e;
    }
}
function decodeSlug(slug) {
    try {
        return decodeURIComponent(slug);
    }
    catch {
        return slug;
    }
}
export async function fetchAllProductsCategoryId() {
    try {
        const res = await wixRequest("/stores/v3/all-products-category", { method: "GET" });
        return res?.categoryId ?? null;
    }
    catch {
        return null;
    }
}
export async function fetchCategories() {
    try {
        const [allProductsId, items] = await Promise.all([fetchAllProductsCategoryId(), readCategoryPages()]);
        return items
            .filter((c) => c.visible !== false)
            .map((c) => toCategory(c, imgSrc))
            .filter((c) => (allProductsId ? c.id !== allProductsId : c.slug !== "all-products"));
    }
    catch {
        return [];
    }
}
async function readCategoryPages() {
    const out = [];
    let cursor = null;
    for (let i = 0; i < 20; i++) {
        const res = await wixRequest("/categories/v1/categories/query", {
            body: {
                treeReference: STORES_TREE,
                fields: ["DESCRIPTION"],
                query: cursor ? { cursorPaging: { limit: 100, cursor } } : { filter: { visible: true }, cursorPaging: { limit: 100 } },
            },
        });
        out.push(...(res?.categories ?? []));
        cursor = res?.pagingMetadata?.hasNext ? res?.pagingMetadata?.cursors?.next ?? null : null;
        if (!cursor)
            break;
    }
    return out;
}
export async function fetchCategoryBySlug(slug) {
    try {
        const res = await wixRequest(`/categories/v1/categories/slug/${encodeURIComponent(decodeSlug(slug))}`, {
            method: "GET",
            query: { "treeReference.appNamespace": "@wix/stores", fields: ["BREADCRUMBS_INFO", "DESCRIPTION"] },
        });
        const raw = res?.category;
        return raw && raw.visible !== false ? toCategory(raw, imgSrc) : null;
    }
    catch (e) {
        if (notFound(e))
            return null;
        throw e;
    }
}
let defaultLocation = null;
export function fetchDefaultLocationId() {
    defaultLocation ??= wixRequest("/stores/v3/locations/query", { body: { query: { filter: { defaultLocation: true } } } })
        .then((r) => (r?.storesLocations ?? [])[0]?.id ?? null)
        .catch(() => null);
    return defaultLocation;
}
export async function fetchInventory(productId) {
    try {
        const locationId = await fetchDefaultLocationId();
        const items = [];
        let cursor = null;
        for (let i = 0; i < 10; i++) {
            const res = await wixRequest("/stores/v3/inventory-items/query", {
                body: { query: cursor ? { cursorPaging: { limit: 100, cursor } } : { filter: { productId, ...(locationId ? { locationId } : {}) }, cursorPaging: { limit: 100 } } },
            });
            items.push(...(res?.inventoryItems ?? []));
            cursor = res?.pagingMetadata?.hasNext ? res?.pagingMetadata?.cursors?.next ?? null : null;
            if (!cursor)
                break;
        }
        return toInventory(items);
    }
    catch {
        return {};
    }
}
const BACK_IN_STOCK = "/back-in-stock-service/v1/back-in-stock-notification-requests";
let backInStockEnabled = null;
export function fetchBackInStockEnabled() {
    backInStockEnabled ??= wixRequest(`${BACK_IN_STOCK}/settings`, { method: "PUT", body: {} })
        .then((r) => (r?.settings?.collectionStates ?? []).some((s) => s.appId === WIX_STORES_APP_ID && s.collectingRequests === true))
        .catch(() => false);
    return backInStockEnabled;
}
export async function requestBackInStock(productId, variantId, email, item) {
    try {
        await wixRequest(BACK_IN_STOCK, {
            body: {
                request: { catalogReference: { catalogItemId: productId, appId: WIX_STORES_APP_ID, ...(variantId ? { options: { variantId } } : {}) }, email },
                itemDetails: { name: item.name, price: item.price, ...(item.imageUrl ? { image: item.imageUrl } : {}) },
            },
        });
        return "created";
    }
    catch (e) {
        if (e instanceof WixApiError && e.code === "BACK_IN_STOCK_NOTIFICATION_REQUEST_ALREADY_EXISTS")
            return "already-subscribed";
        throw e;
    }
}
