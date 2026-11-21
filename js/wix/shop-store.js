import { CATALOG_SORTS, fetchCategories, fetchFacetData, searchCatalog } from "./catalog.js";
import { expandFacetChoiceIds } from "./catalog-core.js";
export const SORTS = CATALOG_SORTS;
const URL_KEYS = { sort: "sort", min: "min", max: "max", stock: "stock", q: "q", choice: "choice", category: "category" };
const encodeChoice = (s) => `${s.kind}:${s.facetId}:${s.choiceId}`;
function decodeChoice(token) {
    const parts = token.split(":");
    if (parts.length === 3 && (parts[0] === "option" || parts[0] === "modifier") && parts[2])
        return { kind: parts[0], facetId: parts[1], choiceId: parts[2] };
    if (parts.length === 1 && parts[0])
        return { kind: "option", facetId: "", choiceId: parts[0] };
    return null;
}
function readUrlState() {
    if (typeof window === "undefined")
        return null;
    const p = new URLSearchParams(window.location.search);
    const sort = p.get(URL_KEYS.sort);
    const filters = {};
    if (p.get(URL_KEYS.min))
        filters.minPrice = p.get(URL_KEYS.min);
    if (p.get(URL_KEYS.max))
        filters.maxPrice = p.get(URL_KEYS.max);
    if (p.get(URL_KEYS.stock) === "1")
        filters.inStockOnly = true;
    if (p.get(URL_KEYS.q))
        filters.search = p.get(URL_KEYS.q);
    return {
        sort: sort && sort in CATALOG_SORTS ? sort : undefined,
        filters,
        selected: p.getAll(URL_KEYS.choice).map(decodeChoice).filter((s) => s !== null),
        categoryId: p.has(URL_KEYS.category) ? p.get(URL_KEYS.category) : undefined,
    };
}
function writeUrlState(s, initialCategoryId) {
    if (typeof window === "undefined")
        return;
    const p = new URLSearchParams(window.location.search);
    for (const k of Object.values(URL_KEYS))
        p.delete(k);
    if (s.sort !== "featured")
        p.set(URL_KEYS.sort, s.sort);
    if (s.filters.minPrice != null && s.filters.minPrice !== "")
        p.set(URL_KEYS.min, String(s.filters.minPrice));
    if (s.filters.maxPrice != null && s.filters.maxPrice !== "")
        p.set(URL_KEYS.max, String(s.filters.maxPrice));
    if (s.filters.inStockOnly)
        p.set(URL_KEYS.stock, "1");
    if (s.filters.search?.trim())
        p.set(URL_KEYS.q, s.filters.search.trim());
    for (const c of s.selected)
        p.append(URL_KEYS.choice, encodeChoice(c));
    if (s.activeCategoryId !== initialCategoryId)
        p.set(URL_KEYS.category, s.activeCategoryId ?? "");
    const qs = p.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
        window.history.replaceState(window.history.state, "", next);
}
export function createShopStore({ initialProducts, initialCategories, initialCategoryId = null, pageSize = 24, syncUrl = true } = {}) {
    let activeCategoryId = initialCategoryId;
    let sort = "featured";
    let filters = {};
    let selected = [];
    let attempt = 0;
    let categories = initialCategories ?? [];
    let facets = [];
    let priceRange = null;
    let pageKey = null;
    let products = initialProducts ?? null;
    let total = null;
    let cursor = null;
    let hasMore = false;
    let error = null;
    let loadingMore = false;
    let started = false;
    let generation = 0;
    let pendingMore = null;
    const listeners = new Set();
    function facetSelections() {
        const groups = new Map();
        for (const s of selected) {
            const key = `${s.kind}:${s.facetId}`;
            const g = groups.get(key) ?? { id: s.facetId, kind: s.kind, choiceIds: [] };
            for (const cid of expandFacetChoiceIds(facets.find((f) => f.id === s.facetId), [s.choiceId]))
                if (!g.choiceIds.includes(cid))
                    g.choiceIds.push(cid);
            groups.set(key, g);
        }
        return [...groups.values()]
            .map((g) => ({ ...g, choiceIds: [...g.choiceIds].sort() }))
            .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
    }
    const selectionKey = () => JSON.stringify([pageSize, activeCategoryId, sort, filters.minPrice ?? null, filters.maxPrice ?? null, !!filters.inStockOnly, filters.search ?? "", facetSelections(), attempt]);
    let snapshot = null;
    const emit = () => {
        snapshot = null;
        for (const fn of listeners)
            fn();
    };
    function getState() {
        if (snapshot)
            return snapshot;
        const key = selectionKey();
        const current = pageKey === key;
        const hasActiveFilters = selected.length > 0 ||
            !!filters.inStockOnly ||
            (filters.minPrice != null && filters.minPrice !== "") ||
            (filters.maxPrice != null && filters.maxPrice !== "") ||
            !!(filters.search && filters.search.trim());
        snapshot = {
            products,
            total: current ? total : null,
            categories,
            activeCategoryId,
            sort,
            filters,
            facets,
            priceRange,
            selectedChoiceIds: selected.map((s) => s.choiceId),
            hasActiveFilters,
            loading: !current || products === null,
            error: current ? error : null,
            hasMore: current && hasMore && !!cursor,
            loadingMore: current && loadingMore,
        };
        return snapshot;
    }
    let facetScope;
    function loadFacets() {
        if (facetScope === activeCategoryId)
            return;
        facetScope = activeCategoryId;
        const scope = activeCategoryId;
        fetchFacetData({ categoryId: scope }).then((d) => {
            if (!started || scope !== activeCategoryId)
                return;
            facets = d.facets;
            priceRange = d.priceRange;
            if (selectionKey() !== pageKey)
                query();
            else
                emit();
        });
    }
    function query() {
        if (!started)
            return;
        const key = selectionKey();
        const id = ++generation;
        pendingMore = null;
        pageKey = key;
        total = null;
        cursor = null;
        hasMore = false;
        error = null;
        loadingMore = false;
        emit();
        const [limit, categoryId, selectedSort, minPrice, maxPrice, inStockOnly, search, selections] = JSON.parse(key);
        searchCatalog({ limit, categoryId, sort: selectedSort, minPrice, maxPrice, inStockOnly, search, facetSelections: selections })
            .then((res) => {
            if (generation !== id || selectionKey() !== key)
                return;
            products = res.products;
            total = res.total;
            cursor = res.nextCursor;
            hasMore = res.hasMore;
            error = null;
            emit();
        })
            .catch((e) => {
            if (generation !== id || selectionKey() !== key)
                return;
            products = [];
            total = null;
            cursor = null;
            hasMore = false;
            error = e instanceof Error ? e.message : "Couldn't load products.";
            emit();
        });
    }
    function changed() {
        if (syncUrl)
            writeUrlState({ sort, filters, selected, activeCategoryId }, initialCategoryId);
        loadFacets();
        if (selectionKey() === pageKey)
            emit();
        else
            query();
    }
    return {
        getState,
        subscribe(fn) {
            const listener = () => { try {
                fn(getState());
            }
            catch (e) {
                console.error("shop-store listener failed", e);
            } };
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        start() {
            if (started)
                return;
            started = true;
            const u = syncUrl ? readUrlState() : null;
            if (u) {
                if (u.sort)
                    sort = u.sort;
                if (Object.keys(u.filters).length)
                    filters = u.filters;
                if (u.selected.length)
                    selected = u.selected;
                if (u.categoryId !== undefined && u.categoryId !== initialCategoryId)
                    activeCategoryId = u.categoryId || null;
            }
            if (!initialCategories) {
                fetchCategories().then((list) => { if (started) {
                    categories = list;
                    emit();
                } }).catch(() => { if (started) {
                    categories = [];
                    emit();
                } });
            }
            loadFacets();
            query();
        },
        stop() {
            started = false;
            generation++;
        },
        setActiveCategoryId(id) { if (id === activeCategoryId)
            return; activeCategoryId = id; changed(); },
        setSort(next) { if (next === sort)
            return; sort = next; changed(); },
        setFilters(next) { filters = next; changed(); },
        toggleChoice(choiceId) {
            const existing = selected.find((s) => s.choiceId === choiceId);
            if (existing)
                selected = selected.filter((s) => s !== existing);
            else {
                const facet = facets.find((f) => f.choices.some((c) => c.id === choiceId));
                if (!facet)
                    return;
                selected = [...selected, { kind: facet.kind, facetId: facet.id, choiceId }];
            }
            changed();
        },
        clearFilters() { filters = {}; selected = []; changed(); },
        retry() { attempt++; changed(); },
        async loadMore() {
            const key = selectionKey();
            if (pageKey !== key || !cursor || !hasMore || pendingMore)
                return;
            const request = { generation, key };
            pendingMore = request;
            const isCurrent = () => generation === request.generation && selectionKey() === key;
            loadingMore = true;
            error = null;
            emit();
            try {
                const res = await searchCatalog({ limit: pageSize, cursor });
                if (isCurrent()) {
                    const seen = new Set((products ?? []).map((p) => p.id));
                    products = [...(products ?? []), ...res.products.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))];
                    cursor = res.nextCursor;
                    hasMore = res.hasMore;
                }
            }
            catch (e) {
                if (isCurrent())
                    error = e instanceof Error ? e.message : "Couldn't load more products.";
            }
            finally {
                if (pendingMore === request)
                    pendingMore = null;
                if (isCurrent()) {
                    loadingMore = false;
                    emit();
                }
            }
        },
    };
}
