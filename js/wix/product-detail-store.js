import { fetchBackInStockEnabled, fetchInventory, fetchProductBySlug, requestBackInStock, resolveVariant } from "./catalog.js";
import { choiceAvailability, maxPurchasable, mergeInventory } from "./catalog-core.js";
import { addLine } from "./cart-store.js";
export const ONE_TIME_PLAN = "one-time";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function createProductDetailStore({ initial, slug }) {
    let product = initial ?? null;
    let notFound = false;
    let selections = {};
    let lastPicked = null;
    let modifierValues = {};
    let subscriptionPlanId = null;
    let quantity = 1;
    let adding = false;
    let error = null;
    let notifyEnabled = false;
    let notifying = false;
    let notifyResult = null;
    let notifyError = null;
    let started = false;
    let enriched = null;
    const listeners = new Set();
    let snapshot = null;
    const emit = () => { snapshot = null; for (const fn of listeners)
        fn(); };
    function getState() {
        if (snapshot)
            return snapshot;
        const variant = product ? resolveVariant(product, selections) : null;
        const availability = product ? choiceAvailability(product, selections) : {};
        const optionGroups = (product?.options ?? []).map((o) => ({
            ...o,
            choices: o.choices.map((c) => {
                const a = availability[o.id]?.[c.choiceId];
                return { ...c, selected: selections[o.id] === c.choiceId, inStock: a ? a.inStock : c.inStock, exists: a ? a.exists : true };
            }),
        }));
        const pickedImage = (optionId) => {
            const o = product?.options.find((x) => x.id === optionId);
            return o?.choices.find((c) => c.choiceId === selections[optionId])?.imageUrl ?? null;
        };
        const pickedImages = (product?.options ?? []).map((o) => pickedImage(o.id)).filter((u) => !!u);
        const imageUrl = (lastPicked ? pickedImage(lastPicked) : null) ?? pickedImages[pickedImages.length - 1] ?? variant?.imageUrl ?? null;
        const missingOptions = (product?.options ?? []).filter((o) => !selections[o.id]).map((o) => o.name);
        const selectionComplete = missingOptions.length === 0;
        const missingModifier = (product?.modifiers ?? []).find((m) => m.mandatory && (modifierValues[m.key] ?? "").trim().length === 0);
        const shortText = (product?.modifiers ?? []).find((m) => m.type === "text" && m.minChars && (modifierValues[m.key] ?? "").length > 0 && (modifierValues[m.key] ?? "").length < m.minChars);
        const plans = product?.subscriptions ?? [];
        const plan = subscriptionPlanId && subscriptionPlanId !== ONE_TIME_PLAN ? plans.find((p) => p.id === subscriptionPlanId) ?? null : null;
        const planMissing = plans.length > 0 && (!subscriptionPlanId || (subscriptionPlanId === ONE_TIME_PLAN && !product?.allowOneTimePurchase) || (subscriptionPlanId !== ONE_TIME_PLAN && !plan));
        const isPreorder = !!variant && !variant.inStock && variant.preorderEnabled;
        const available = !!variant && (variant.inStock || variant.preorderEnabled);
        const canAdd = !!product && available && !missingModifier && !shortText && !planMissing;
        const blockedReason = !product
            ? null
            : !selectionComplete ? `Choose ${missingOptions.join(" and ")}`
                : !variant ? "This combination isn't available"
                    : !available ? "Out of stock"
                        : missingModifier ? `Add ${missingModifier.title || missingModifier.name}`
                            : shortText ? `${shortText.title || shortText.name} needs at least ${shortText.minChars} characters`
                                : planMissing ? "Choose a plan"
                                    : null;
        const isRange = !!product && product.price !== product.maxPrice && !!product.maxPrice;
        const rangeDisplay = product ? (product.fromPrice ? `From ${product.price}` : isRange ? `${product.price} – ${product.maxPrice}` : product.price) : "";
        const planPrice = plan && variant ? variant.subscriptionPrices[plan.id] ?? "" : "";
        snapshot = {
            product, notFound, optionGroups, modifierValues, variant, imageUrl,
            price: planPrice || variant?.price || rangeDisplay,
            compareAtPrice: plan ? null : variant ? variant.compareAtPrice : isRange ? null : (product?.compareAtPrice ?? null),
            pricePerUnit: variant?.pricePerUnit ?? product?.pricePerUnit ?? null,
            plans: plans.map((p) => ({ ...p, price: variant?.subscriptionPrices[p.id] ?? "", selected: subscriptionPlanId === p.id })),
            subscriptionPlanId,
            isPreorder,
            preorderMessage: isPreorder ? variant?.preorderMessage ?? null : null,
            remaining: variant?.quantity ?? null,
            maxQuantity: maxPurchasable(variant),
            canAdd, blockedReason, quantity, adding, error,
            canNotify: !!product && !!variant && !available && notifyEnabled,
            notifying, notifyResult, notifyError,
        };
        return snapshot;
    }
    function enrich() {
        if (!product || enriched === product.id)
            return;
        const id = enriched = product.id;
        fetchInventory(id).then((inv) => {
            if (!started || !product || product.id !== id || !Object.keys(inv).length)
                return;
            product = { ...product, variants: mergeInventory(product.variants, inv) };
            emit();
        });
        if (product.variants.some((v) => !v.inStock && !v.preorderEnabled) || product.availability !== "IN_STOCK") {
            fetchBackInStockEnabled().then((on) => { if (started && on !== notifyEnabled) {
                notifyEnabled = on;
                emit();
            } });
        }
    }
    return {
        getState,
        subscribe(fn) {
            const listener = () => { try {
                fn(getState());
            }
            catch (e) {
                console.error("product-detail-store listener failed", e);
            } };
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        start() {
            if (started)
                return;
            started = true;
            if (product) {
                enrich();
                return;
            }
            if (!slug)
                return;
            fetchProductBySlug(slug)
                .then((p) => { if (!started)
                return; product = p; notFound = p === null; emit(); enrich(); })
                .catch(() => { if (started) {
                notFound = true;
                emit();
            } });
        },
        stop() { started = false; },
        selectOption(optionId, choiceId) {
            selections = { ...selections, [optionId]: choiceId };
            lastPicked = optionId;
            quantity = 1;
            notifyResult = null;
            notifyError = null;
            emit();
        },
        setModifier(key, value) { modifierValues = { ...modifierValues, [key]: value }; emit(); },
        setQuantity(n) {
            const max = getState().maxQuantity;
            quantity = Math.min(Math.max(1, Math.floor(Number(n) || 1)), max);
            emit();
        },
        selectPlan(planId) { subscriptionPlanId = planId; emit(); },
        async add() {
            const s = getState();
            if (!product || !s.variant)
                return;
            adding = true;
            error = null;
            emit();
            try {
                const optionChoices = {};
                for (const o of product.options) {
                    const choice = o.choices.find((c) => c.choiceId === s.variant.choiceIds[o.id]);
                    if (o.key && choice?.key)
                        optionChoices[o.key] = choice.key;
                }
                const modifierChoices = {};
                const customTextFields = {};
                for (const m of product.modifiers) {
                    const value = modifierValues[m.key];
                    if (!value)
                        continue;
                    if (m.type === "text")
                        customTextFields[m.key] = value;
                    else
                        modifierChoices[m.key] = value;
                }
                const plan = subscriptionPlanId && subscriptionPlanId !== ONE_TIME_PLAN ? subscriptionPlanId : undefined;
                await addLine(product.id, s.variant.variantId, quantity, { optionChoices, modifierChoices, customTextFields, preorder: s.isPreorder, subscriptionOptionId: plan });
            }
            catch (e) {
                error = e instanceof Error ? e.message : String(e);
                throw e;
            }
            finally {
                adding = false;
                emit();
            }
        },
        async notify(email) {
            const s = getState();
            if (!product)
                throw new Error("No product.");
            if (!EMAIL.test(email.trim())) {
                notifyError = "Enter a valid email address.";
                emit();
                throw new Error(notifyError);
            }
            notifying = true;
            notifyError = null;
            notifyResult = null;
            emit();
            try {
                const result = await requestBackInStock(product.id, s.variant?.variantId ?? null, email.trim(), {
                    name: product.name,
                    price: String(s.variant?.priceAmount ?? product.variants[0]?.priceAmount ?? 0),
                    imageUrl: product.imageUrl || undefined,
                });
                notifyResult = result;
                return result;
            }
            catch (e) {
                notifyError = e instanceof Error && e.message ? e.message : "Couldn't save your request. Please try again.";
                throw e;
            }
            finally {
                notifying = false;
                emit();
            }
        },
    };
}
