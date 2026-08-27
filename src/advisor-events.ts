export type AdvisorSeverity = "nit" | "concern" | "blocker";

export interface AdvisorNote {
  note: string;
  severity?: AdvisorSeverity;
  advisor?: string;
}

export type AdvisorCommand = "on" | "off" | "toggle" | "status";

const validSeverities = new Set<AdvisorSeverity>(["nit", "concern", "blocker"]);

/** Recognize only the built-in Advisor's exact, trimmed command spellings. */
export function parseAdvisorCommand(text: string): AdvisorCommand | undefined {
  switch (text.trim()) {
    case "/advisor on":
      return "on";
    case "/advisor off":
      return "off";
    case "/advisor":
      return "toggle";
    case "/advisor status":
      return "status";
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdvisorSeverity(value: unknown): value is AdvisorSeverity {
  return typeof value === "string" && validSeverities.has(value as AdvisorSeverity);
}

/**
 * Extract well-formed notes from the runtime custom Advisor message shape.
 * Malformed messages and individual malformed entries are intentionally ignored.
 */
export function extractAdvisorNotes(message: unknown): AdvisorNote[] {
  if (!isRecord(message) || message.role !== "custom" || message.customType !== "advisor") return [];
  const details = message.details;
  if (!isRecord(details) || !Array.isArray(details.notes)) return [];

  const notes: AdvisorNote[] = [];
  for (const candidate of details.notes) {
    if (!isRecord(candidate) || typeof candidate.note !== "string" || candidate.note.trim().length === 0) {
      continue;
    }
    if (candidate.severity !== undefined && !isAdvisorSeverity(candidate.severity)) continue;
    if (candidate.advisor !== undefined && typeof candidate.advisor !== "string") continue;
    notes.push({
      note: candidate.note,
      ...(candidate.severity === undefined ? {} : { severity: candidate.severity }),
      ...(candidate.advisor === undefined ? {} : { advisor: candidate.advisor }),
    });
  }
  return notes;
}
