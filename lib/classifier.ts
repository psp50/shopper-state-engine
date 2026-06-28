import { EVENT_DEFS, STATE_KEYS, DECAY, type EventType, type ShopperState } from "./events";

export interface ClassificationResult {
  /** Score history at every step (step 0 = before any events) — used for the trace chart. */
  trace: Record<ShopperState, number>[];
  /** Final normalized scores, one per state, summing to ~1. */
  scores: Record<ShopperState, number>;
  /** States sorted descending by score. */
  sorted: [ShopperState, number][];
  topState: ShopperState | null;
  runnerUp: ShopperState | null;
  /** Score gap between leader and runner-up. */
  margin: number;
  /** True when margin is small enough that the classification shouldn't be trusted blindly. */
  contested: boolean;
  /** 0–0.97, blends top score with margin so a narrow win never reads as highly confident. */
  confidence: number;
  /** Human-readable evidence strings for the leading state (used as LLM-unavailable fallback). */
  evidence: string[];
}

function emptyScores(): Record<ShopperState, number> {
  return Object.fromEntries(STATE_KEYS.map((k) => [k, 0])) as Record<ShopperState, number>;
}

/**
 * Scores the session as it stood after `step` events have occurred, applying
 * exponential decay so older events contribute less than recent ones. This is
 * what allows a state to rise and then fade within a single session, rather
 * than being a monotonically increasing tally.
 */
function scoresAtStep(events: EventType[], step: number): Record<ShopperState, number> {
  const raw = emptyScores();

  for (let i = 0; i < step; i++) {
    const def = EVENT_DEFS.find((d) => d.type === events[i]);
    if (!def) continue;
    const age = step - 1 - i;
    const decay = Math.pow(DECAY, age);
    for (const [state, w] of Object.entries(def.weight)) {
      raw[state as ShopperState] += (w as number) * decay;
    }
  }

  // Deterministic overrides: a small number of events are strong enough
  // signals that they get an extra push beyond their base weight, still
  // subject to the same recency decay so they're not permanent overrides.
  const slice = events.slice(0, step);
  const lastAbandon = slice.lastIndexOf("checkout_abandon");
  if (lastAbandon !== -1) raw.cart_abandoner += 4 * Math.pow(DECAY, step - 1 - lastAbandon);
  const lastPurchase = slice.lastIndexOf("past_purchase");
  if (lastPurchase !== -1) raw.loyal += 3 * Math.pow(DECAY, step - 1 - lastPurchase);

  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(STATE_KEYS.map((k) => [k, raw[k] / total])) as Record<ShopperState, number>;
}

export function classify(events: EventType[]): ClassificationResult {
  const trace: Record<ShopperState, number>[] = [];
  for (let s = 0; s <= events.length; s++) trace.push(scoresAtStep(events, s));

  const current = trace[trace.length - 1];
  const sorted = (Object.entries(current) as [ShopperState, number][]).sort((a, b) => b[1] - a[1]);
  // With no events every score is 0/0 → all states tie at zero, and
  // Object.entries order would otherwise pick "browser" as an arbitrary
  // "winner". There is no winner for an empty session, so topState must be
  // explicitly null rather than a tie-break artifact.
  const [topState, topScore]: [ShopperState | null, number] =
    events.length === 0 ? [null, 0] : sorted[0] ?? [null, 0];
  const runnerUpScore = sorted[1]?.[1] ?? 0;
  const margin = topScore - runnerUpScore;
  const contested = events.length > 0 && margin < 0.1;
  const confidence = events.length === 0 ? 0 : Math.min(0.97, topScore * (0.7 + margin));

  const counts: Partial<Record<EventType, number>> = {};
  for (const e of events) counts[e] = (counts[e] ?? 0) + 1;

  const evidenceByState: Record<ShopperState, string[]> = Object.fromEntries(
    STATE_KEYS.map((k) => [k, [] as string[]])
  ) as unknown as Record<ShopperState, string[]>;

  for (const [type, n] of Object.entries(counts) as [EventType, number][]) {
    const def = EVENT_DEFS.find((d) => d.type === type);
    if (!def) continue;
    for (const state of Object.keys(def.weight) as ShopperState[]) {
      evidenceByState[state].push(n >= 2 ? `${def.label} ×${n}` : def.label);
    }
  }

  return {
    trace,
    scores: current,
    sorted,
    topState: topState ?? null,
    runnerUp: (sorted[1]?.[0] as ShopperState) ?? null,
    margin,
    contested,
    confidence,
    evidence: topState ? evidenceByState[topState] : [],
  };
}
