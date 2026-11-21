const id = (raw) => raw?._id ?? raw?.id ?? "";
export const LIST_FIELDS = ["CURRENCY", "MEDIA_ITEMS_INFO", "MIN_PRICE_VARIANT", "DISCOUNT_INFO"];
export const DETAIL_FIELDS = [
    ...LIST_FIELDS,
    "PLAIN_DESCRIPTION",
    "VARIANT_OPTION_CHOICE_NAMES",
    "INFO_SECTION",
    "INFO_SECTION_PLAIN_DESCRIPTION",
    "SUBSCRIPTION_PRICES_INFO",
    "BREADCRUMBS_INFO",
    "DIRECT_CATEGORIES_INFO",
    "PRODUCT_CHOICES_MEDIA_REFERENCES",
];
export const STORES_TREE = { appNamespace: "@wix/stores", treeKey: null };
export const CATALOG_SORTS = {
    featured: { label: "Default order" },
    priceAsc: { label: "Price: low to high" },
    priceHigh: { label: "Price: high to low" },
    name: { label: "Name: A–Z" },
    nameDesc: { label: "Name: Z–A" },
    newest: { label: "Newest" },
};
export const SORT_FIELDS = {
    priceAsc: [{ fieldName: "actualPriceRange.minValue.amount", order: "ASC" }, { fieldName: "name", order: "ASC" }],
    priceHigh: [{ fieldName: "actualPriceRange.minValue.amount", order: "DESC" }, { fieldName: "name", order: "ASC" }],
    name: [{ fieldName: "name", order: "ASC" }],
    nameDesc: [{ fieldName: "name", order: "DESC" }],
    newest: [{ fieldName: "createdDate", order: "DESC" }, { fieldName: "name", order: "ASC" }],
};
export const OPTION_CHOICE_FIELD = "options.choicesSettings.choices.choiceId";
export const MODIFIER_CHOICE_FIELD = "modifiers.choicesSettings.choices.choiceId";
export function priceBound(value, name) {
    if (value == null || value === "")
        return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
        throw new Error(`${name} must be a non-negative number.`);
    return n;
}
export function catalogFilter({ categoryId, minPrice, maxPrice, inStockOnly = false, facetSelections = [] } = {}) {
    const min = priceBound(minPrice, "minPrice"), max = priceBound(maxPrice, "maxPrice");
    if (min !== undefined && max !== undefined && min > max)
        throw new Error("minPrice must not exceed maxPrice.");
    const and = [{ visible: true }];
    if (categoryId)
        and.push({ "allCategoriesInfo.categories": { $matchItems: [{ id: categoryId }] } });
    if (min !== undefined)
        and.push({ "actualPriceRange.minValue.amount": { $gte: String(min) } });
    if (max !== undefined)
        and.push({ "actualPriceRange.maxValue.amount": { $lte: String(max) } });
    if (inStockOnly)
        and.push({ "inventory.availabilityStatus": { $eq: "IN_STOCK" } });
    for (const f of facetSelections) {
        if (!f.choiceIds.length)
            continue;
        and.push({ [f.kind === "modifier" ? MODIFIER_CHOICE_FIELD : OPTION_CHOICE_FIELD]: { $hasSome: f.choiceIds } });
    }
    return { $and: and };
}
export function searchQuery(o) {
    const { limit = 24, cursor, sort = "featured", search = "" } = o;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error("limit must be between 1 and 100.");
    const paging = { cursorPaging: { limit, ...(cursor ? { cursor } : {}) } };
    if (cursor)
        return paging;
    if (!(sort in CATALOG_SORTS))
        throw new Error("Unsupported catalog sort.");
    if (search.trim().length > 100)
        throw new Error("Search must be at most 100 characters.");
    return {
        ...paging,
        filter: catalogFilter(o),
        ...(SORT_FIELDS[sort] ? { sort: SORT_FIELDS[sort] } : {}),
        ...(search.trim() ? { search: { expression: search.trim(), fields: ["name"] } } : {}),
    };
}
export function pageInfo(res) {
    const nextCursor = res?.pagingMetadata?.cursors?.next ?? null;
    const hasNext = res?.pagingMetadata?.hasNext;
    return { nextCursor, hasMore: typeof hasNext === "boolean" ? hasNext && !!nextCursor : !!nextCursor };
}
export const FACET_AGGREGATIONS = [
    { name: "min_price", type: "SCALAR", fieldPath: "actualPriceRange.minValue.amount", scalar: { type: "MIN" } },
    { name: "max_price", type: "SCALAR", fieldPath: "actualPriceRange.maxValue.amount", scalar: { type: "MAX" } },
    { name: "options", type: "VALUE", fieldPath: "options.id", value: { limit: 1000, sortType: "COUNT", sortDirection: "DESC" } },
    { name: "options_with_choice", type: "VALUE", fieldPath: OPTION_CHOICE_FIELD, value: { limit: 20000, sortType: "COUNT", sortDirection: "DESC" } },
    { name: "modifiers", type: "VALUE", fieldPath: "modifiers.id", value: { limit: 1000, sortType: "COUNT", sortDirection: "DESC" } },
    { name: "modifiers_with_choice", type: "VALUE", fieldPath: MODIFIER_CHOICE_FIELD, value: { limit: 20000, sortType: "COUNT", sortDirection: "DESC" } },
];
export function facetSearchBody(categoryId) {
    return { filter: catalogFilter({ categoryId }), cursorPaging: { limit: 0 }, aggregations: FACET_AGGREGATIONS };
}
export function readFacetAggregates(res) {
    const byName = new Map();
    for (const r of (res?.aggregationData?.results ?? []))
        if (r?.name)
            byName.set(r.name, r);
    const ids = (name) => (byName.get(name)?.values?.results ?? []).map((b) => b?.value).filter((v) => typeof v === "string" && v.length > 0);
    const counts = {};
    for (const name of ["options_with_choice", "modifiers_with_choice"]) {
        for (const b of (byName.get(name)?.values?.results ?? []))
            if (typeof b?.value === "string" && typeof b?.count === "number")
                counts[b.value] = b.count;
    }
    const scalar = (name) => {
        const v = byName.get(name)?.scalar?.value;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    return { minPrice: scalar("min_price"), maxPrice: scalar("max_price"), optionIds: ids("options"), modifierIds: ids("modifiers"), choiceCounts: counts };
}
export function facetCustomizationIds(agg) {
    return [...new Set([...agg.optionIds, ...agg.modifierIds])];
}
const numeric = (s) => {
    const t = s.trim();
    if (!t)
        return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
};
const byNameNumericFirst = (items, name) => [...items].sort((a, b) => {
    const na = numeric(name(a)), nb = numeric(name(b));
    if (na !== null && nb !== null)
        return na - nb;
    if (na !== null)
        return -1;
    if (nb !== null)
        return 1;
    return name(a).toLowerCase().localeCompare(name(b).toLowerCase());
});
export function toFacet(customization, kind, choiceCounts) {
    const all = customization.choicesSettings?.choices ?? [];
    const parentOf = new Map();
    for (const c of all)
        if (Array.isArray(c.primaryChoiceIds) && c.primaryChoiceIds.length)
            parentOf.set(id(c), c.primaryChoiceIds);
    const choices = new Map();
    const choiceOf = (c) => ({ id: id(c), name: c.name ?? "", colorCode: c.colorCode ?? null, count: 0, childIds: [] });
    for (const c of all) {
        const count = choiceCounts[id(c)] ?? 0;
        const primaries = parentOf.get(id(c));
        if (primaries) {
            if (!count)
                continue;
            for (const pid of primaries) {
                const primary = all.find((p) => id(p) === pid);
                if (!primary)
                    continue;
                const entry = choices.get(pid) ?? choiceOf(primary);
                entry.count += count;
                entry.childIds.push(id(c));
                choices.set(pid, entry);
            }
            continue;
        }
        if (!count && !choices.has(id(c)))
            continue;
        const entry = choices.get(id(c)) ?? choiceOf(c);
        entry.count += count;
        choices.set(id(c), entry);
    }
    let list = [...choices.values()].filter((c) => c.id && c.count > 0);
    const isColor = customization.customizationRenderType === "SWATCH_CHOICES";
    const order = customization.choicesSettings?.sortOrder ?? "DEFAULT";
    if (order === "BY_NAME" || (order === "DEFAULT" && !isColor))
        list = byNameNumericFirst(list, (c) => c.name);
    else if (order === "BY_PRODUCT_COUNT" || (order === "DEFAULT" && parentOf.size > 0))
        list = [...list].sort((a, b) => b.count - a.count);
    else if (order === "MANUAL") {
        const pos = new Map(all.map((c, i) => [id(c), i]));
        list = [...list].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    }
    return { id: id(customization), name: customization.name ?? "", kind, isColor, choices: list };
}
export function toFacetData(agg, customizations) {
    const byId = new Map(customizations.map((c) => [id(c), c]));
    const build = (ids, kind) => ids.flatMap((cid) => {
        const c = byId.get(cid);
        if (!c || c.customizationRenderType === "FREE_TEXT")
            return [];
        const f = toFacet(c, kind, agg.choiceCounts);
        return f.choices.length > 1 ? [f] : [];
    });
    const facets = [...build(agg.optionIds, "option"), ...build(agg.modifierIds, "modifier")];
    const swatches = byNameNumericFirst(facets.filter((f) => f.isColor), (f) => f.name);
    const texts = byNameNumericFirst(facets.filter((f) => !f.isColor), (f) => f.name);
    const lo = agg.minPrice, hi = agg.maxPrice;
    return {
        facets: [...swatches, ...texts],
        priceRange: lo !== null && hi !== null && hi > lo ? { min: Math.floor(lo), max: Math.ceil(hi) } : null,
    };
}
export function expandFacetChoiceIds(facet, choiceIds) {
    const out = new Set();
    for (const cid of choiceIds) {
        out.add(cid);
        for (const child of facet?.choices.find((c) => c.id === cid)?.childIds ?? [])
            out.add(child);
    }
    return [...out];
}
export function sellingPrice(price) {
    if (price?.priceAfterDiscount !== undefined)
        return { current: price.priceAfterDiscount, original: price.actualPrice };
    return { current: price?.actualPrice, original: price?.compareAtPrice };
}
export function strike(original, current) {
    const o = Number(original?.amount), c = Number(current?.amount);
    return original?.formattedAmount && Number.isFinite(o) && Number.isFinite(c) && o > c ? original.formattedAmount : null;
}
export function ribbonsOf(raw) {
    return [raw.ribbon?.name, ...(raw.additionalRibbons ?? []).map((r) => r?.name)]
        .filter((n, i, all) => typeof n === "string" && n.length > 0 && all.indexOf(n) === i);
}
export function toAvailability(raw) {
    const s = raw.inventory?.availabilityStatus;
    return s === "OUT_OF_STOCK" || s === "PARTIALLY_OUT_OF_STOCK" ? s : "IN_STOCK";
}
export function isPreorderProduct(raw) {
    const availability = toAvailability(raw);
    const pa = raw.inventory?.preorderAvailability;
    if (pa)
        return pa === "ALL_VARIANTS" || (pa === "SOME_VARIANTS" && availability === "OUT_OF_STOCK");
    return raw.inventory?.preorderStatus === "ENABLED" && availability === "OUT_OF_STOCK";
}
export function mediaEntries(raw, mediaKey) {
    const out = [];
    const seen = new Set();
    for (const m of [raw.media?.main, ...(raw.media?.itemsInfo?.items ?? [])]) {
        const v = m?.image ?? m;
        const k = mediaKey(v);
        if (!k || seen.has(k))
            continue;
        seen.add(k);
        out.push(v);
    }
    return out;
}
const visibleSubscriptions = (raw) => (raw.subscriptionDetails?.subscriptions ?? []).filter((s) => s.visible !== false);
export function toSummary(raw, imgSrc, mediaKey) {
    const options = raw.options ?? [];
    const media = mediaEntries(raw, mediaKey);
    const mainUrl = imgSrc(media[0], 800, 800);
    const hover = media.slice(1).map((m) => imgSrc(m, 800, 800)).filter(Boolean);
    const availability = toAvailability(raw);
    const min = raw.actualPriceRange?.minValue, max = raw.actualPriceRange?.maxValue;
    const isRange = !!(min?.amount && max?.amount && min.amount !== max.amount);
    const minVariant = raw.variantSummary?.minPriceVariant;
    const { current, original } = sellingPrice(minVariant?.price);
    const discounted = minVariant?.price?.priceAfterDiscount !== undefined;
    const price = current?.formattedAmount ?? min?.formattedAmount ?? "";
    const fromPrice = isRange && discounted;
    const ribbons = ribbonsOf(raw);
    const hasSubscriptions = visibleSubscriptions(raw).length > 0;
    return {
        id: id(raw),
        slug: raw.slug ?? "",
        name: raw.name ?? "",
        price,
        maxPrice: fromPrice ? price : max?.formattedAmount ?? "",
        fromPrice,
        compareAtPrice: isRange ? null : strike(original ?? raw.compareAtPriceRange?.minValue, current ?? min),
        discountNames: (raw.discountInfo?.discountRuleNames ?? []).filter((n) => typeof n === "string" && n.length > 0),
        pricePerUnit: minVariant?.physicalProperties?.pricePerUnit?.description ?? raw.physicalProperties?.pricePerUnitRange?.minValue?.description ?? null,
        ribbon: ribbons[0] ?? null,
        ribbons,
        minPriceVariantId: minVariant ? id(minVariant) || minVariant.variantId || null : null,
        availability,
        preorder: isPreorderProduct(raw),
        hasSubscriptions,
        imageUrl: mainUrl,
        hoverImageUrl: hover[0] ?? "",
        optionsSummary: options
            .map((o) => {
            const n = (o.choicesSettings?.choices ?? []).filter((c) => c.visible !== false).length;
            return `${n} ${String(o.name ?? "").toLowerCase()}${n === 1 ? "" : "s"}`;
        })
            .join(" · "),
        swatches: options
            .filter((o) => o.optionRenderType === "SWATCH_CHOICES" || o.optionRenderType === "COLOR_CHOICES")
            .flatMap((o) => (o.choicesSettings?.choices ?? []))
            .filter((c) => c.visible !== false && c.colorCode)
            .map((c) => String(c.colorCode)),
        quickAddable: options.length === 0 && availability === "IN_STOCK" && !hasSubscriptions,
    };
}
function choiceImage(c, gallery, imgSrc) {
    if (!imgSrc)
        return null;
    const ref = (c.media?.items ?? [])[0]?.mediaId;
    const linked = (c.linkedMedia ?? [])[0];
    const m = ref ? gallery.get(String(ref)) : linked ? (linked.image ?? linked) : null;
    return m ? imgSrc(m, 1200, 1200) || null : null;
}
export function toOptions(raw, imgSrc) {
    const gallery = new Map();
    for (const m of [raw.media?.main, ...(raw.media?.itemsInfo?.items ?? [])]) {
        const key = m?._id ?? m?.id;
        if (key)
            gallery.set(String(key), m.image ?? m);
    }
    return (raw.options ?? []).map((o) => ({
        id: id(o) || o.name || "",
        key: o.key ?? o.name ?? "",
        name: o.name ?? "",
        isColor: o.optionRenderType === "SWATCH_CHOICES" || o.optionRenderType === "COLOR_CHOICES",
        choices: (o.choicesSettings?.choices ?? [])
            .filter((c) => c.visible !== false)
            .map((c) => ({
            choiceId: c.choiceId ?? "",
            key: c.key ?? c.name ?? "",
            name: c.name ?? "",
            colorCode: c.colorCode ?? null,
            inStock: c.inStock !== false,
            imageUrl: choiceImage(c, gallery, imgSrc),
        })),
    }));
}
export function toModifiers(raw) {
    return (raw.modifiers ?? []).map((m) => {
        const isText = m.modifierRenderType === "FREE_TEXT";
        const ft = m.freeTextSettings ?? {};
        const charCount = (v) => (typeof v === "number" && v > 0 ? v : null);
        return {
            id: id(m) || m.key || m.name || "",
            key: isText ? ft.key ?? m.key ?? m.name ?? "" : m.key ?? m.name ?? "",
            name: m.name ?? "",
            mandatory: m.mandatory !== false,
            type: isText ? "text" : "choices",
            title: (isText ? ft.title : undefined) || m.name || "",
            maxChars: isText ? charCount(ft.maxCharCount) : null,
            minChars: isText ? charCount(ft.minCharCount) : null,
            choices: (m.choicesSettings?.choices ?? []).map((c) => ({ choiceId: c.choiceId ?? "", key: c.key ?? c.name ?? "", name: c.name ?? "" })),
        };
    });
}
const FREQUENCY_WORD = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };
export function planTerms(frequency, interval, billingCycles) {
    const parts = [];
    const u = FREQUENCY_WORD[String(frequency ?? "")];
    if (u)
        parts.push(`every ${interval > 1 ? `${interval} ${u}s` : u}`);
    parts.push(billingCycles ? `${billingCycles} payments` : "until cancelled");
    return parts.join(" · ");
}
export function toSubscriptionPlans(raw) {
    return visibleSubscriptions(raw).map((s) => {
        const frequency = ["DAY", "WEEK", "MONTH", "YEAR"].find((f) => f === s.frequency) ?? null;
        const interval = typeof s.interval === "number" && s.interval > 0 ? s.interval : 1;
        const billingCycles = s.autoRenewal === true ? null : typeof s.billingCycles === "number" && s.billingCycles > 0 ? s.billingCycles : null;
        return { id: id(s), name: s.title ?? "", description: s.description ?? "", frequency, interval, billingCycles, terms: planTerms(frequency, interval, billingCycles) };
    });
}
export function toVariants(raw, imgSrc) {
    return (raw.variantsInfo?.variants ?? [])
        .filter((v) => v.visible !== false)
        .map((v) => {
        const choices = {};
        const choiceIds = {};
        for (const c of (v.choices ?? [])) {
            const on = c.optionChoiceNames?.optionName, cn = c.optionChoiceNames?.choiceName;
            if (on && cn)
                choices[on] = cn;
            const oi = c.optionChoiceIds?.optionId, ci = c.optionChoiceIds?.choiceId;
            if (oi && ci)
                choiceIds[oi] = ci;
        }
        const { current, original } = sellingPrice(v.price);
        const vm = v.media ? (v.media.image ?? v.media) : null;
        const subscriptionPrices = {};
        for (const sp of (v.subscriptionPricesInfo?.subscriptionPrices ?? [])) {
            const formatted = sp.priceAfterDiscount?.formattedAmount ?? sp.price?.formattedAmount;
            if (sp.subscriptionId && formatted)
                subscriptionPrices[sp.subscriptionId] = formatted;
        }
        const amount = Number(current?.amount);
        return {
            variantId: id(v),
            choiceIds,
            choices,
            price: current?.formattedAmount ?? "",
            priceAmount: Number.isFinite(amount) ? amount : 0,
            compareAtPrice: strike(original, current),
            pricePerUnit: v.physicalProperties?.pricePerUnit?.description ?? null,
            sku: v.sku ?? null,
            subscriptionPrices,
            inStock: v.inventoryStatus?.inStock !== false,
            preorderEnabled: v.inventoryStatus?.preorderEnabled === true,
            quantity: null,
            preorderMessage: null,
            imageUrl: vm ? imgSrc(vm, 1200, 1200) || null : null,
        };
    });
}
export function toBreadcrumbs(info) {
    return (info?.breadcrumbs ?? [])
        .filter((b) => b.categoryId)
        .map((b) => ({ id: b.categoryId, name: b.categoryName ?? "", slug: b.categorySlug ?? "" }));
}
export function toDetail(raw, imgSrc, mediaKey) {
    const summary = toSummary(raw, imgSrc, mediaKey);
    const variants = toVariants(raw, imgSrc);
    let price = summary.price, maxPrice = summary.maxPrice, compareAtPrice = summary.compareAtPrice;
    if (variants.length) {
        const lo = variants.reduce((a, v) => (v.priceAmount < a.priceAmount ? v : a));
        const hi = variants.reduce((a, v) => (v.priceAmount > a.priceAmount ? v : a));
        price = lo.price || price;
        maxPrice = hi.price || maxPrice;
        compareAtPrice = price !== maxPrice ? null : lo.compareAtPrice;
    }
    return {
        ...summary,
        price,
        maxPrice,
        fromPrice: false,
        compareAtPrice,
        descriptionHtml: raw.plainDescription ?? "",
        infoSections: (raw.infoSections ?? [])
            .map((s) => ({ title: s.title ?? "", html: s.plainDescription ?? "" }))
            .filter((s) => s.title || s.html),
        gallery: mediaEntries(raw, mediaKey).map((m) => imgSrc(m, 1200, 1200)).filter(Boolean),
        breadcrumbs: toBreadcrumbs(raw.breadcrumbsInfo),
        categoryIds: (raw.directCategoriesInfo?.categories ?? []).map((c) => id(c)).filter(Boolean),
        options: toOptions(raw, imgSrc),
        modifiers: toModifiers(raw),
        variants,
        subscriptions: toSubscriptionPlans(raw),
        allowOneTimePurchase: raw.subscriptionDetails?.allowOneTimePurchases === true,
    };
}
export function toCategory(raw, imgSrc) {
    const parent = raw.parentCategory;
    return {
        id: id(raw),
        slug: raw.slug ?? "",
        name: raw.name ?? "",
        description: raw.description ?? "",
        imageUrl: imgSrc(raw.image, 1200, 1200),
        parentId: parent ? id(parent) || null : null,
        index: typeof parent?.index === "number" ? parent.index : 0,
        productCount: typeof raw.itemCounter === "number" ? raw.itemCounter : null,
        breadcrumbs: toBreadcrumbs(raw.breadcrumbsInfo),
    };
}
export function toInventory(items) {
    const out = {};
    for (const it of items) {
        if (!it?.variantId)
            continue;
        const status = it.availabilityStatus === "IN_STOCK" || it.availabilityStatus === "PREORDER" ? it.availabilityStatus : "OUT_OF_STOCK";
        const tracked = it.trackQuantity === true;
        out[it.variantId] = {
            status,
            quantity: tracked && typeof it.quantity === "number" ? Math.max(0, it.quantity) : null,
            preorderQuantity: tracked && typeof it.preorderInfo?.quantity === "number" ? Math.max(0, it.preorderInfo.quantity) : null,
            preorderMessage: it.preorderInfo?.message || null,
        };
    }
    return out;
}
export function mergeInventory(variants, inventory) {
    return variants.map((v) => {
        const inv = inventory[v.variantId];
        if (!inv)
            return v;
        const preorder = inv.status === "PREORDER";
        return {
            ...v,
            inStock: inv.status === "IN_STOCK",
            preorderEnabled: preorder,
            quantity: preorder ? inv.preorderQuantity : inv.quantity,
            preorderMessage: preorder ? inv.preorderMessage : null,
        };
    });
}
export function resolveVariant(detail, selections) {
    if (detail.options.length === 0)
        return detail.variants[0] ?? null;
    if (!detail.options.every((o) => selections[o.id]))
        return null;
    return detail.variants.find((v) => detail.options.every((o) => v.choiceIds[o.id] === selections[o.id])) ?? null;
}
export function choiceAvailability(detail, selections) {
    const picked = Object.entries(selections).filter(([oid, cid]) => oid && cid);
    const out = {};
    for (const o of detail.options) {
        out[o.id] = {};
        for (const c of o.choices) {
            if (!picked.length) {
                out[o.id][c.choiceId] = { inStock: c.inStock, exists: true };
                continue;
            }
            const candidate = [...picked.filter(([oid]) => oid !== o.id), [o.id, c.choiceId]];
            let exists = false, inStock = false;
            for (const v of detail.variants) {
                if (!candidate.every(([oid, cid]) => v.choiceIds[oid] === cid))
                    continue;
                exists = true;
                if (v.inStock || v.preorderEnabled) {
                    inStock = true;
                    break;
                }
            }
            out[o.id][c.choiceId] = { inStock, exists };
        }
    }
    return out;
}
export const MAX_QUANTITY = 99999;
export function maxPurchasable(variant) {
    return variant?.quantity || MAX_QUANTITY;
}
