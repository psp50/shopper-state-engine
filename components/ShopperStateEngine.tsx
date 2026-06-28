"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Eye, Search, ShoppingCart, Tag, RotateCcw, Heart, CreditCard,
  XCircle, Repeat, Plus, Trash2, Zap, Loader2, AlertTriangle, Sparkles,
} from "lucide-react";
import {
  EVENT_DEFS, STATES, FALLBACK_ACTIONS, SAMPLE_SESSIONS, STATE_KEYS, DECAY,
  type EventType, type ShopperState,
} from "@/lib/events";
import { classify, type ClassificationResult } from "@/lib/classifier";
import type { ReasoningNote } from "@/lib/reasoning";

const ICONS: Record<EventType, typeof Eye> = {
  page_view: Eye,
  product_view: Eye,
  search: Search,
  filter_sort: Repeat,
  compare_products: Repeat,
  add_to_cart: ShoppingCart,
  remove_from_cart: Trash2,
  apply_discount: Tag,
  discount_failed: XCircle,
  wishlist_add: Heart,
  checkout_start: CreditCard,
  checkout_abandon: XCircle,
  repeat_visit: Repeat,
  past_purchase: CreditCard,
};

const INK = "#0f1110";
const PANEL = "#16191a";
const LINE = "#262b2c";
const AMBER = "#ffb454";
const MUTED = "#7d8281";

function SignalTrace({ trace, topState }: { trace: Record<ShopperState, number>[]; topState: ShopperState | null }) {
  const W = 640, H = 132, PAD = 6;
  const n = trace.length;
  const x = (i: number) => (n <= 1 ? PAD : PAD + (i / (n - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - v * (H - PAD * 2);

  const paths = STATE_KEYS.map((key) => {
    const pts = trace.map((s, i) => `${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`);
    return { key, d: "M" + pts.join(" L") };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={W} y1={H - PAD - f * (H - PAD * 2)} y2={H - PAD - f * (H - PAD * 2)} stroke={LINE} strokeWidth={1} />
      ))}
      {paths.map(({ key, d }) => (
        <path key={key} d={d} fill="none" stroke={STATES[key].color}
          strokeWidth={key === topState ? 2.6 : 1.3} opacity={key === topState ? 1 : 0.32}
          strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {n > 0 && STATE_KEYS.map((key) => (
        <circle key={key} cx={x(n - 1)} cy={y(trace[n - 1][key])} r={key === topState ? 4 : 2}
          fill={STATES[key].color} opacity={key === topState ? 1 : 0.45} />
      ))}
    </svg>
  );
}

export default function ShopperStateEngine() {
  const [events, setEvents] = useState<EventType[]>(SAMPLE_SESSIONS["Stalled checkout"]);
  const [activeSession, setActiveSession] = useState("Stalled checkout");
  const [llmNote, setLlmNote] = useState<ReasoningNote | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const result: ClassificationResult = useMemo(() => classify(events), [events]);

  useEffect(() => {
    setLlmNote(null);
    setLlmError(false);
    if (events.length === 0) return;

    setLlmLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
        });
        const data = await res.json();
        if (data.note) setLlmNote(data.note);
        else setLlmError(true);
      } catch {
        setLlmError(true);
      } finally {
        setLlmLoading(false);
      }
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [events]);

  const addEvent = (type: EventType) => setEvents((p) => [...p, type]);
  const removeLast = () => setEvents((p) => p.slice(0, -1));
  const clearAll = () => setEvents([]);
  const loadSample = (name: string) => { setActiveSession(name); setEvents(SAMPLE_SESSIONS[name]); };

  const topState = result.topState;
  const topMeta = topState ? STATES[topState] : null;
  const fallback = topState ? FALLBACK_ACTIONS[topState] : null;
  const lowConfidence = events.length > 0 && result.confidence < 0.3;

  return (
    <div style={{ background: INK, color: "#e9e6dc", minHeight: "100vh", padding: "30px 30px 24px", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 2.5, color: AMBER, marginBottom: 7, fontFamily: "monospace" }}>
            SIGNAL · DECAY-WEIGHTED CLASSIFICATION
          </div>
          <h1 style={{ fontSize: 27, fontWeight: 700, margin: 0, color: "#f7f5ec", letterSpacing: -0.3 }}>
            Shopper State Engine
          </h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4, maxWidth: 480 }}>
            Each event lands, then fades — the trace below is the actual score history, not a snapshot.
          </div>
        </div>
        <div style={{ fontSize: 11, color: MUTED, textAlign: "right", fontFamily: "monospace" }}>
          decay rate <span style={{ color: "#e9e6dc" }}>{DECAY}</span> / event
          <br />
          {events.length} event{events.length === 1 ? "" : "s"} in session
        </div>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px 10px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: MUTED, letterSpacing: 1, fontFamily: "monospace" }}>SCORE TRACE</span>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {STATE_KEYS.map((k) => (
              <span key={k} style={{ fontSize: 10.5, color: k === topState ? STATES[k].color : MUTED, display: "flex", alignItems: "center", gap: 5, fontFamily: "monospace" }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: STATES[k].color, opacity: k === topState ? 1 : 0.4, display: "inline-block" }} />
                {STATES[k].label}
              </span>
            ))}
          </div>
        </div>
        {events.length === 0 ? (
          <div style={{ height: 132, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4d4c", fontSize: 12, fontFamily: "monospace" }}>
            no signal — add events to begin tracing
          </div>
        ) : (
          <SignalTrace trace={result.trace} topState={topState} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16 }}>
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, letterSpacing: 1, fontFamily: "monospace" }}>SAMPLE SESSIONS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {Object.keys(SAMPLE_SESSIONS).map((name) => (
              <button key={name} onClick={() => loadSample(name)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${LINE}`, background: activeSession === name ? AMBER : "transparent",
                  color: activeSession === name ? INK : MUTED, fontWeight: activeSession === name ? 600 : 400,
                }}>
                {name}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: MUTED, letterSpacing: 1, fontFamily: "monospace" }}>ADD AN EVENT</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={removeLast} disabled={!events.length} style={btnStyle()}><RotateCcw size={12} /> Undo</button>
              <button onClick={clearAll} disabled={!events.length} style={btnStyle()}><Trash2 size={12} /> Clear</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 18 }}>
            {EVENT_DEFS.map((def) => {
              const Icon = ICONS[def.type];
              return (
                <button key={def.type} onClick={() => addEvent(def.type)} style={{ ...btnStyle(), justifyContent: "flex-start" }}>
                  <Plus size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                  <Icon size={13} style={{ color: AMBER, flexShrink: 0 }} />
                  <span>{def.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, letterSpacing: 1, fontFamily: "monospace" }}>EVENT SEQUENCE</div>
          <div style={{ background: INK, border: "1px solid #1f2222", borderRadius: 10, padding: 10, minHeight: 60, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {events.length === 0 && <span style={{ color: "#4a4d4c", fontSize: 12, fontFamily: "monospace" }}>empty — add an event above</span>}
            {events.map((type, i) => {
              const Icon = ICONS[type];
              const age = events.length - 1 - i;
              const fade = Math.max(0.4, Math.pow(DECAY, age));
              return (
                <span key={i} style={{ fontSize: 11, background: "#1c2021", border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 5, color: "#c4c2b8", opacity: fade, fontFamily: "monospace" }}>
                  <Icon size={10} style={{ color: AMBER }} />
                  {EVENT_DEFS.find((d) => d.type === type)?.label}
                </span>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: PANEL, border: `1px solid ${topMeta ? topMeta.color + "55" : LINE}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: MUTED, letterSpacing: 1, fontFamily: "monospace" }}>CLASSIFICATION</span>
              {result.contested && (
                <span style={{ fontSize: 10.5, color: "#e0b24a", display: "flex", gap: 4, alignItems: "center", fontFamily: "monospace" }}>
                  <AlertTriangle size={11} /> CONTESTED
                </span>
              )}
            </div>
            {!topMeta ? (
              <div style={{ color: "#4a4d4c", fontSize: 13, marginTop: 8 }}>No events yet.</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 23, fontWeight: 700, color: topMeta.color }}>{topMeta.label}</span>
                  <span style={{ fontSize: 12.5, color: MUTED, fontFamily: "monospace" }}>{(result.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14 }}>{topMeta.desc}</div>
                {result.sorted.map(([state, score]) => (
                  <div key={state} style={{ marginBottom: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: state === topState ? "#e9e6dc" : "#5e6160" }}>{STATES[state].label}</span>
                      <span style={{ color: "#5e6160", fontFamily: "monospace" }}>{(score * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ background: "#1d2021", borderRadius: 4, overflow: "hidden", height: 7 }}>
                      <div style={{ height: "100%", borderRadius: 4, width: `${score * 100}%`, background: STATES[state].color, transition: "width .45s ease" }} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {topState && fallback && (
            <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 10, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
                <Zap size={12} style={{ color: AMBER }} /> RECOMMENDED ACTION
              </div>
              {lowConfidence ? (
                <div style={{ fontSize: 13, color: "#e0b24a" }}>Signal too weak to act on — hold default experience and keep observing.</div>
              ) : (
                <>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "#f7f5ec", marginBottom: 4 }}>{llmNote?.action || fallback.action}</div>
                  {!llmNote?.action && <div style={{ fontSize: 12.5, color: MUTED }}>{fallback.nudge}</div>}
                </>
              )}
            </div>
          )}

          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: 1 }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 10, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
              <Sparkles size={12} style={{ color: AMBER }} /> REASONING NOTE
            </div>
            {!events.length && <div style={{ color: "#4a4d4c", fontSize: 13 }}>—</div>}
            {events.length > 0 && llmLoading && (
              <div style={{ color: MUTED, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
                <Loader2 size={13} /> generating explanation…
              </div>
            )}
            {events.length > 0 && !llmLoading && llmError && (
              <div style={{ fontSize: 12.5, color: MUTED }}>
                <span style={{ fontWeight: 600, color: "#c4c2b8" }}>Evidence: </span>
                {result.evidence.length ? result.evidence.join(", ") : "insufficient signal"}.
                <div style={{ marginTop: 6, color: "#5e6160" }}>(LLM explanation unavailable — showing rule-engine evidence.)</div>
              </div>
            )}
            {!llmLoading && llmNote && (
              <div style={{ fontSize: 12.5, color: "#c4c2b8", display: "flex", flexDirection: "column", gap: 8 }}>
                <div><span style={{ fontWeight: 600, color: "#e9e6dc" }}>Evidence — </span>{llmNote.evidence}</div>
                {llmNote.contested_note && <div><span style={{ fontWeight: 600, color: "#e0b24a" }}>Contested — </span>{llmNote.contested_note}</div>}
                {llmNote.confidence_note && <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>confidence read: {llmNote.confidence_note}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 10.5, color: "#4a4d4c", textAlign: "center", fontFamily: "monospace" }}>
        decay-weighted rule engine (deterministic, instant) → LLM reasoning layer (contextual, contested-aware) — hybrid by design
      </div>
    </div>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    background: PANEL, border: `1px solid ${LINE}`, color: "#cfcdc4",
    borderRadius: 7, padding: "7px 10px", fontSize: 12.5, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  };
}
