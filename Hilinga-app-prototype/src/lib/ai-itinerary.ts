import type { ItineraryDay } from "@/lib/database";

type AiItineraryRequest = {
  answers: Record<string, string | string[] | undefined>;
  localBusinesses: Array<{
    name: string;
    category: string;
    location: string;
    hours: string;
    about: string;
  }>;
};

function isItinerary(value: unknown): value is ItineraryDay[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) return false;
  return value.every((day) => {
    if (!day || typeof day !== "object") return false;
    const candidate = day as Partial<ItineraryDay>;
    return Number.isInteger(candidate.day)
      && typeof candidate.title === "string"
      && Array.isArray(candidate.stops)
      && candidate.stops.length > 0
      && candidate.stops.every((stop) => stop
        && typeof stop.time === "string"
        && typeof stop.title === "string"
        && typeof stop.note === "string"
        && typeof stop.icon === "string");
  });
}

export async function generateAiItinerary(request: AiItineraryRequest): Promise<ItineraryDay[]> {
  const response = await fetch("/api/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => null) as { itinerary?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "The AI planner is unavailable.");
  if (!isItinerary(payload?.itinerary)) throw new Error("The AI planner returned an invalid itinerary.");
  const expectedDays = Math.max(1, Math.min(7, Number.parseInt(String(request.answers.days ?? "2"), 10) || 2));
  if (payload.itinerary.length !== expectedDays) throw new Error("The AI planner returned the wrong number of days.");
  return payload.itinerary;
}
