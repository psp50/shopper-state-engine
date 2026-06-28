import { NextRequest, NextResponse } from "next/server";
import { classify } from "@/lib/classifier";
import { getReasoningNote } from "@/lib/reasoning";
import type { EventType } from "@/lib/events";

export async function POST(req: NextRequest) {
  let body: { events?: EventType[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  const result = classify(events);

  if (events.length === 0) {
    return NextResponse.json({ result, note: null });
  }

  try {
    const note = await getReasoningNote(events, result);
    return NextResponse.json({ result, note });
  } catch (err) {
    // The rule engine result is always returned even if the LLM call fails —
    // the client falls back to rule-engine evidence rather than blocking.
    return NextResponse.json({
      result,
      note: null,
      noteError: err instanceof Error ? err.message : "LLM reasoning unavailable",
    });
  }
}
