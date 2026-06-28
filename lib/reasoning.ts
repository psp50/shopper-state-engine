import { EVENT_DEFS, STATES, type EventType } from "./events";
import type { ClassificationResult } from "./classifier";

export interface ReasoningNote {
  evidence: string;
  contested_note: string;
  action: string;
  confidence_note: string;
}

function buildPrompt(events: EventType[], result: ClassificationResult): string {
  const eventLabels = events.map((t) => EVENT_DEFS.find((d) => d.type === t)?.label ?? t);
  const scoreSummary = result.sorted
    .map(([s, v]) => `${STATES[s].label} ${(v * 100).toFixed(0)}%`)
    .join(", ");

  return `You are the reasoning layer of an ecommerce personalization engine. A deterministic rule engine has already scored this session — your job is to explain it precisely and recommend ONE concrete action, not to re-score it.

Session (chronological, oldest to newest): ${eventLabels.join(" -> ") || "(empty)"}

Rule engine output:
- Leading state: ${result.topState ? STATES[result.topState].label : "none"} (confidence ${(result.confidence * 100).toFixed(0)}%)
- Runner-up: ${result.runnerUp ? STATES[result.runnerUp].label : "none"}
- Margin between leader and runner-up: ${(result.margin * 100).toFixed(0)} points
- Full breakdown: ${scoreSummary}
- Contested classification (margin under 10pts): ${result.contested ? "yes" : "no"}

Respond with JSON only, no markdown fences, no text outside the object:
{"evidence": "1-2 sentences citing specific events in order that justify the leading state", "contested_note": "if contested is true, 1 sentence on what would resolve the ambiguity; if false, empty string", "action": "1 sentence, a specific site action or nudge for this exact sequence, not generic advice", "confidence_note": "1 short phrase calibrating the confidence number in plain language, e.g. 'reliable' or 'directional only, watch next event'"}`;
}

/**
 * Calls the Groq API server-side (OpenAI-compatible chat completions format).
 * Requires GROQ_API_KEY in the environment — never expose this call or the
 * key to the client. Groq's free tier needs no payment method.
 */
export async function getReasoningNote(
  events: EventType[],
  result: ClassificationResult
): Promise<ReasoningNote> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 350,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildPrompt(events, result) }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq API error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as ReasoningNote;
}

