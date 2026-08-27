import { describe, expect, it } from "bun:test";
import { extractAdvisorNotes, parseAdvisorCommand } from "../src/advisor-events";

describe("Advisor event helpers", () => {
  it("recognizes only exact trimmed commands", () => {
    expect(parseAdvisorCommand(" /advisor on ")).toBe("on");
    expect(parseAdvisorCommand("/advisor off")).toBe("off");
    expect(parseAdvisorCommand("/advisor")).toBe("toggle");
    expect(parseAdvisorCommand("/advisor status")).toBe("status");
    expect(parseAdvisorCommand("/advisor on now")).toBeUndefined();
    expect(parseAdvisorCommand("advisor on")).toBeUndefined();
  });

  it("extracts valid notes and ignores malformed entries", () => {
    const message = {
      role: "custom",
      customType: "advisor",
      details: {
        notes: [
          { note: "keep this", severity: "nit", advisor: "reviewer" },
          { note: "concern", severity: "concern" },
          { note: "" },
          { note: "   " },
          { note: "bad severity", severity: "warning" },
          { note: "bad advisor", advisor: 12 },
          null,
        ],
      },
    };
    expect(extractAdvisorNotes(message)).toEqual([
      { note: "keep this", severity: "nit", advisor: "reviewer" },
      { note: "concern", severity: "concern" },
    ]);
    expect(extractAdvisorNotes({ role: "assistant", customType: "advisor", details: { notes: [] } })).toEqual([]);
    expect(extractAdvisorNotes({ role: "custom", customType: "advisor", details: { notes: "nope" } })).toEqual([]);
  });
});
