# Shopper State Engine

A small ecommerce personalization rules engine: classifies a shopper session
into one of five behavioral states (browser, comparer, discount seeker, cart
abandoner, loyal customer), explains the evidence, and recommends a site
action — with a live simulator so you can add events and watch the
classification update in real time.


## Why hybrid, not LLM-only or rules-only

The classification itself is a **deterministic rule engine**, not an LLM
call. Personalization decisions run on every session, need to be instant,
auditable, and cheap, and a rule engine gives you all three — you can read
exactly why a session was scored the way it was, with no hallucination risk
and no latency. An LLM-only classifier would be slower, harder to debug when
it's wrong, and would invent confidence rather than calculate it.

The **LLM sits one layer up**, as a reasoning/explanation layer: given the
rule engine's output (scores, margin, contested flag), it writes the
human-readable evidence sentence, names what would resolve an ambiguous case,
and proposes a specific (not generic) next action. This is the right division
of labor — deterministic logic for the decision, language model for the
explanation a human or downstream system actually reads.

## How scoring works

Each event type carries weights toward one or more states (see
`lib/events.ts`). Naively summing those weights over a session has an
obvious flaw: a shopper who compared products 20 actions ago and has since
abandoned checkout would still show heavy "comparer" signal from stale
behavior. So scoring is **decay-weighted** — every event's contribution
shrinks by `0.91^age` as the session continues, meaning recent intent
dominates over historical browsing. The signal trace at the top of the UI
plots this directly: you can watch one state rise as another fades within
a single session, not just see a final snapshot.

A few **deterministic overrides** layer on top of the weighted sum — e.g.
`checkout_abandon` and `past_purchase` get an extra push, because in a real
store these are strong enough signals that they shouldn't be diluted by a
long tail of earlier pageviews. They're still subject to the same decay,
so they're strong-but-not-permanent, not hardcoded labels.

## Confidence and contested classification

Confidence isn't just "how big is the top score" — it's calibrated by the
**margin** between the leading state and the runner-up
(`topScore * (0.7 + margin)`), so a narrow win between two close states
never reads as highly confident. When the margin is under 10 points, the
session is flagged **contested** in the UI rather than reported as a
confident classification, and the LLM reasoning layer is explicitly asked
what additional event would resolve the ambiguity.

Below 30% confidence, the UI doesn't surface a recommended action at all —
it says to hold the default experience and keep observing. Acting on noise
is worse than not acting; a personalization engine that fires nudges on a
single ambiguous pageview will erode trust in the system fast.

## Architecture

```
lib/events.ts       — event vocabulary, state definitions, sample sessions (pure data)
lib/classifier.ts   — pure, synchronous rule engine (fully unit-testable, no I/O)
lib/classifier.test.ts — tests for decay, overrides, contested detection, confidence ordering
lib/reasoning.ts    — server-only LLM prompt + Anthropic API call
app/api/classify/route.ts — API route: runs classify(), then reasoning, with graceful fallback
components/ShopperStateEngine.tsx — client UI: simulator, trace chart, classification panel
app/page.tsx         — entry point
```

The classifier has zero dependencies on React or the network, by design —
it's the part of this system you'd actually trust in production, so it's
the part with tests. The LLM call lives only in `lib/reasoning.ts` and the
API route; the client never holds an API key.

## Running it

```bash
npm install
cp .env.example .env.local   # add your GROQ_API_KEY (free, no card needed: console.groq.com/keys)
npm run dev
```

```bash
npm test    # runs the rule-engine unit tests (no API key needed)
```

## What's mocked vs. real

- **Events** are hand-authored sample sessions (`lib/events.ts`), standing in
  for a real analytics stream (Segment/GA4/Shopify pixel). The event shape
  was kept close to what those tools actually emit, so swapping in a real
  feed is a data-mapping exercise, not a redesign.
- **The rule engine is real logic**, not a stub — it's the thing this
  assignment asked for, and it's tested.
- **The LLM call is real** (Groq's `llama-3.3-70b-versatile`, OpenAI-compatible
  chat completions API), not mocked. Swapping providers is a one-file change —
  `lib/reasoning.ts` is the only place that knows which LLM vendor is in use;
  the rule engine, API route contract, and UI are all vendor-agnostic.

## What I'd do next with more time

- Replace the in-memory event array with a real session store (Redis or
  Postgres) keyed by session/visitor ID, so state persists across page loads
  instead of living only in component state.
- Add a "loyal customer decay" path: a loyal shopper with no purchase in N
  months should drift back toward browser rather than staying loyal forever
  — currently loyal status only grows, never fades on its own timescale.
- A/B test the recommended nudges against a control, since "recommend an
  action" is a hypothesis, not a guaranteed lift — the experiment-brief
  pattern from Option A's brief would fit naturally here.
- Swap hand-tuned event weights for weights learned from actual conversion
  data, with the current rule engine staying as the interpretable baseline
  to evaluate any learned model against.

## Known limitations

- Single-session scope — no cross-session or cross-device identity
  resolution.
- Weights in `lib/events.ts` are reasoned defaults, not fit to real
  conversion data.
- The LLM reasoning layer can fail or be slow; the UI falls back to
  rule-engine evidence strings rather than blocking, but there's no retry
  yet.
