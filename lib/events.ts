/**
 * Event vocabulary for the personalization engine.
 *
 * In a real deployment these would map 1:1 to events already flowing through
 * an analytics pipeline (Segment, GA4, Shopify's pixel, etc). The `weight`
 * map says how strongly each event type pushes toward each shopper state —
 * this is the editable "business logic" surface a real team would tune.
 */

export type EventType =
  | "page_view"
  | "product_view"
  | "search"
  | "filter_sort"
  | "compare_products"
  | "add_to_cart"
  | "remove_from_cart"
  | "apply_discount"
  | "discount_failed"
  | "wishlist_add"
  | "checkout_start"
  | "checkout_abandon"
  | "repeat_visit"
  | "past_purchase";

export type ShopperState =
  | "browser"
  | "comparer"
  | "discount_seeker"
  | "cart_abandoner"
  | "loyal";

export interface EventDef {
  type: EventType;
  label: string;
  weight: Partial<Record<ShopperState, number>>;
}

export const EVENT_DEFS: EventDef[] = [
  { type: "page_view", label: "Page view", weight: { browser: 1 } },
  { type: "product_view", label: "Product view", weight: { browser: 1, comparer: 1 } },
  { type: "search", label: "Search query", weight: { comparer: 2 } },
  { type: "filter_sort", label: "Filter / sort used", weight: { comparer: 2 } },
  { type: "compare_products", label: "Compared products", weight: { comparer: 4 } },
  { type: "add_to_cart", label: "Add to cart", weight: { cart_abandoner: 2, comparer: 1 } },
  { type: "remove_from_cart", label: "Remove from cart", weight: { discount_seeker: 1, cart_abandoner: 1 } },
  { type: "apply_discount", label: "Entered discount code", weight: { discount_seeker: 5 } },
  { type: "discount_failed", label: "Discount code failed", weight: { discount_seeker: 4 } },
  { type: "wishlist_add", label: "Wishlist add", weight: { comparer: 2, browser: 1 } },
  { type: "checkout_start", label: "Checkout started", weight: { cart_abandoner: 2 } },
  { type: "checkout_abandon", label: "Checkout abandoned", weight: { cart_abandoner: 5 } },
  { type: "repeat_visit", label: "Returning visit", weight: { loyal: 3 } },
  { type: "past_purchase", label: "Past purchase on file", weight: { loyal: 5 } },
];

export const STATES: Record<ShopperState, { label: string; color: string; desc: string }> = {
  browser: { label: "Browser", color: "#6e9bd6", desc: "Early-funnel exploration, no strong intent signal yet" },
  comparer: { label: "Comparer", color: "#7fc8a9", desc: "Evaluating options across products or sessions" },
  discount_seeker: { label: "Discount seeker", color: "#d97a8c", desc: "Price-sensitive, actively hunting for a deal" },
  cart_abandoner: { label: "Cart abandoner", color: "#a48ae0", desc: "High intent but stalled before completing purchase" },
  loyal: { label: "Loyal customer", color: "#ffb454", desc: "Established purchase history, repeat behavior" },
};

export const FALLBACK_ACTIONS: Record<ShopperState, { action: string; nudge: string }> = {
  browser: { action: "Surface a low-friction value prop banner", nudge: "Free-shipping threshold + bestseller rail" },
  comparer: { action: "Add a comparison aid", nudge: "Spec/feature comparison table or reviews module" },
  discount_seeker: { action: "Offer a time-boxed incentive", nudge: "10% first-order code or bundle discount" },
  cart_abandoner: { action: "Trigger cart-recovery nudge", nudge: "Exit-intent modal + abandoned-cart email in 1hr" },
  loyal: { action: "Reward and retain", nudge: "Show loyalty points balance or early-access drop" },
};

export const SAMPLE_SESSIONS: Record<string, EventType[]> = {
  "Window shopper": ["page_view", "page_view", "product_view", "page_view"],
  "Deal hunter": ["product_view", "add_to_cart", "apply_discount", "discount_failed", "remove_from_cart"],
  "Stalled checkout": ["product_view", "add_to_cart", "checkout_start", "checkout_abandon"],
  "Returning regular": ["repeat_visit", "past_purchase", "product_view", "add_to_cart"],
  "Heavy comparer": ["search", "filter_sort", "compare_products", "product_view", "compare_products", "wishlist_add"],
  "Contested signal": ["product_view", "add_to_cart", "remove_from_cart", "apply_discount"],
};

export const STATE_KEYS = Object.keys(STATES) as ShopperState[];

/** Decay applied per event of age — most recent events matter more than old ones. */
export const DECAY = 0.91;
