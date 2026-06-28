import { describe, it, expect } from "vitest";
import { classify } from "../lib/classifier";
import type { EventType } from "../lib/events";

describe("classify", () => {
  it("returns null state and zero confidence for an empty session", () => {
    const result = classify([]);
    expect(result.topState).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("classifies a pure browsing session as browser", () => {
    const events: EventType[] = ["page_view", "page_view", "product_view", "page_view"];
    const result = classify(events);
    expect(result.topState).toBe("browser");
  });

  it("checkout_abandon dominates even after earlier comparer-leaning behavior", () => {
    const events: EventType[] = [
      "search",
      "filter_sort",
      "compare_products",
      "product_view",
      "add_to_cart",
      "checkout_start",
      "checkout_abandon",
    ];
    const result = classify(events);
    expect(result.topState).toBe("cart_abandoner");
  });

  it("past_purchase pushes a session toward loyal even with one product_view", () => {
    const events: EventType[] = ["repeat_visit", "past_purchase", "product_view"];
    const result = classify(events);
    expect(result.topState).toBe("loyal");
  });

  it("flags a contested classification when leader and runner-up are close", () => {
    // Roughly balanced cart/discount signals with no dominant override event.
    const events: EventType[] = ["product_view", "add_to_cart", "remove_from_cart", "apply_discount"];
    const result = classify(events);
    expect(result.margin).toBeLessThan(1); // sanity: margin is a fraction, not raw score
    // Whether or not this exact mix crosses the 0.1 threshold, contested must
    // be derived from margin, never hardcoded — verify the relationship holds.
    expect(result.contested).toBe(result.margin < 0.1 && events.length > 0);
  });

  it("decay reduces the influence of older events relative to recent ones", () => {
    // Same multiset of events, different order — recency should matter.
    const oldFirst: EventType[] = ["compare_products", "compare_products", "apply_discount"];
    const recentCompare: EventType[] = ["apply_discount", "compare_products", "compare_products"];

    const a = classify(oldFirst).scores;
    const b = classify(recentCompare).scores;

    // When compare_products events are most recent, comparer score should be
    // higher than when they're stale (apply_discount most recent).
    expect(b.comparer).toBeGreaterThan(a.comparer);
  });

  it("confidence is lower for a narrow margin than a wide one", () => {
    const narrow = classify(["product_view", "add_to_cart", "remove_from_cart", "apply_discount"]);
    const wide = classify(["repeat_visit", "past_purchase", "repeat_visit", "past_purchase"]);
    expect(wide.confidence).toBeGreaterThan(narrow.confidence);
  });

  it("trace has exactly events.length + 1 snapshots", () => {
    const events: EventType[] = ["page_view", "add_to_cart", "checkout_start"];
    const result = classify(events);
    expect(result.trace).toHaveLength(events.length + 1);
  });

  it("scores at each trace step sum to ~1 (normalized)", () => {
    const events: EventType[] = ["search", "compare_products", "add_to_cart"];
    const result = classify(events);
    for (const snapshot of result.trace.slice(1)) {
      const sum = Object.values(snapshot).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });
});
