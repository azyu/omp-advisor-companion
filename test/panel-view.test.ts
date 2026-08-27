import { describe, expect, it } from "bun:test";
import {
  getKittyGraphics,
  Image,
  ImageBudget,
  ImageProtocol,
  setKittyGraphics,
  setTerminalImageProtocol,
  TERMINAL,
  visibleWidth,
} from "@oh-my-pi/pi-tui";
import { AdvisorPanelView, bubbleHeader, renderBubble, sanitizeBubbleText, wrapBubbleText } from "../src/panel-view";

describe("Advisor bubble view", () => {
  it("removes ANSI and control input while replacing tabs", () => {
    expect(sanitizeBubbleText("\x1b[31mhello\x1b[0m\tworld\u0000")).toBe("hello    world");
  });

  it("renders only the severity tag in the header", () => {
    const lines = renderBubble({ note: "Use the newer API", severity: "concern", advisor: "reviewer" }, 32);
    const header = "<concern>";
    expect(bubbleHeader({ note: "x", severity: "concern", advisor: "reviewer" })).toBe(header);
    expect(lines.map(line => line.replace(/\x1b\[[0-9;]*m/g, "")).join("\n")).toContain(header);
    expect(lines.map(line => line.replace(/\x1b\[[0-9;]*m/g, "")).join("\n")).not.toContain("Advisor");
    expect(lines.some(line => line.includes("╱") || line.includes("╲"))).toBe(false);
    expect(lines[0]).toContain(`\x1b[33m┌─\x1b[0m${header}\x1b[33m`);

    const contentLine = lines.find(line => line.replace(/\x1b\[[0-9;]*m/g, "").includes("Use the newer API"));
    expect(contentLine).toBeDefined();
    expect(contentLine?.startsWith("\x1b[33m│\x1b[0m Use the newer API")).toBe(true);
    expect(contentLine?.endsWith(" \x1b[33m│\x1b[0m")).toBe(true);
  });

  it("renders deterministically at narrow widths without overflowing", () => {
    const w4 = renderBubble({ note: "A", severity: "concern" }, 4);
    expect(w4.some(line => line.includes("╱") || line.includes("╲"))).toBe(false);
    expect(w4.every(line => visibleWidth(line) <= 4)).toBe(true);

    const w5 = renderBubble({ note: "A", severity: "concern" }, 5);
    expect(w5.some(line => line.includes("╱") || line.includes("╲"))).toBe(false);
    expect(w5.every(line => visibleWidth(line) <= 5)).toBe(true);
  });

  it("wraps narrow text and keeps every line within the render width", () => {
    const width = 12;
    expect(wrapBubbleText("a long note with enough words to wrap", 8).every(line => visibleWidth(line) <= 8)).toBe(true);
    expect(renderBubble({ note: "a long note with enough words to wrap", severity: "blocker" }, width).every(line => visibleWidth(line) <= width)).toBe(true);
  });
  it("uses the available host width when no bubble cap is configured", () => {
    const natural = renderBubble({ note: "A note that can use the host width", severity: "concern" }, 80);
    expect(natural[natural.length - 1]).toBe(`\x1b[33m└${"─".repeat(78)}┘\x1b[0m`);
    expect(natural.every(line => visibleWidth(line) <= 80)).toBe(true);

    const view = new AdvisorPanelView(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    );
    expect(view.bubbleMaxWidth).toBeUndefined();
  });
  it("applies a configured bubble cap and cell bounds", () => {
    const note = { note: "A long note that should wrap inside the configured cap", severity: "nit" as const };
    const capped = renderBubble(note, 100, 24);
    expect(capped[capped.length - 1]).toBe(`\x1b[34m└${"─".repeat(22)}┘\x1b[0m`);
    expect(capped.every(line => visibleWidth(line) <= 24)).toBe(true);

    const view = new AdvisorPanelView(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      { imageMaxWidth: 32, imageMaxHeight: 22, bubbleMaxWidth: 72 },
    );
    expect(view.imageMaxWidth).toBe(32);
    expect(view.imageMaxHeight).toBe(22);
    expect(view.bubbleMaxWidth).toBe(72);
    const configuredBubbleMaxWidth = view.bubbleMaxWidth;
    view.setNote({ note: "bounded", severity: "nit" });
    const rendered = view.render(200);
    expect(rendered.every(line => visibleWidth(line) <= 200)).toBe(true);
    expect(rendered.every(line => visibleWidth(line.trimStart()) <= configuredBubbleMaxWidth!)).toBe(true);
  });

  it("renders nothing until a note is available", () => {
    const image = new AdvisorPanelView("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
    expect(image.render(40)).toEqual([]);

    image.setNote({ note: "latest advice", severity: "nit" });
    const imageWithNote = image.render(40);
    expect(imageWithNote.length).toBeGreaterThan(0);
    expect(imageWithNote.join("\n")).toContain("latest advice");
    expect(imageWithNote.every(line => visibleWidth(line) <= 40)).toBe(true);
  });
  it("renders the live countdown inside the bubble bottom border", () => {
    let countdown: string | undefined = "[ hides in 5s ]";
    const view = new AdvisorPanelView(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      { countdownText: () => countdown },
    );
    view.setNote({ note: "latest advice", severity: "nit" });

    const withCountdown = view.render(80);
    const countdownLine = withCountdown.find(line => line.includes("[ hides in 5s ]"));
    expect(countdownLine).toBeDefined();
    expect(countdownLine?.replace(/\x1b\[[0-9;]*m/g, "").endsWith("┘")).toBe(true);
    expect(countdownLine).toContain("[ hides in 5s ]");
    expect(withCountdown.filter(line => line.includes("[ hides in 5s ]"))).toHaveLength(1);
    expect(withCountdown.length).toBeGreaterThan(1);

    countdown = undefined;
    view.invalidate();
    const withoutCountdown = view.render(80);
    expect(withoutCountdown.length).toBe(withCountdown.length);
    expect(withoutCountdown.join("\n")).not.toContain("[ hides in ");
  });


  it("places the latest note beside the image when the host is wide enough", () => {
    const previousProtocol = TERMINAL.imageProtocol;
    const previousGraphics = getKittyGraphics();
    try {
      setTerminalImageProtocol(null);
      setKittyGraphics({ unicodePlaceholders: false });

      const view = new AdvisorPanelView(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      );
      view.setNote({ note: "latest advice", severity: "nit" });

      const lines = view.render(80);
      const contentLine = lines.find(line => line.includes("latest advice"));

      expect(contentLine).toBeDefined();
      expect(contentLine?.startsWith(`${" ".repeat(21)}\x1b[34m│\x1b[0m`)).toBe(true);
      expect(lines.some(line => line === "")).toBe(false);
      expect(lines.every(line => visibleWidth(line) <= 80)).toBe(true);
    } finally {
      setTerminalImageProtocol(previousProtocol);
      setKittyGraphics(previousGraphics);
    }
  });

  it("keeps direct Kitty placements byte-identical before the bubble", () => {
    const previousProtocol = TERMINAL.imageProtocol;
    const previousGraphics = getKittyGraphics();
    try {
      setTerminalImageProtocol(ImageProtocol.Kitty);
      setKittyGraphics({ unicodePlaceholders: false });

      const base64Png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const imageBudget = new ImageBudget(8);
      const expectedImage = new Image(
        base64Png,
        "image/png",
        { fallbackColor: text => text },
        {
          maxWidthCells: 20,
          maxHeightCells: 14,
          imageKey: "advisor-character",
          budget: imageBudget,
        },
      ).render(22);
      const view = new AdvisorPanelView(base64Png, { imageBudget });
      view.setNote({ note: "latest advice", severity: "nit" });
      const lines = view.render(80);
      const contentIndex = lines.findIndex(line => line.includes("latest advice"));

      expect(contentIndex).toBeGreaterThan(expectedImage.length);
      expect(expectedImage.length).toBeGreaterThan(0);
      expect(lines.slice(0, expectedImage.length)).toEqual([...expectedImage]);
      expect(lines[expectedImage.length]).toBe("");
      expect(lines.every(line => visibleWidth(line) <= 80)).toBe(true);
    } finally {
      setTerminalImageProtocol(previousProtocol);
      setKittyGraphics(previousGraphics);
    }
  });

  it("places Kitty placeholder images beside the bubble", () => {
    const previousProtocol = TERMINAL.imageProtocol;
    const previousGraphics = getKittyGraphics();
    try {
      setTerminalImageProtocol(ImageProtocol.Kitty);
      setKittyGraphics({ unicodePlaceholders: true });

      const view = new AdvisorPanelView(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        { imageBudget: new ImageBudget(8) },
      );
      view.setNote({ note: "latest advice", severity: "nit" });

      const lines = view.render(80);
      const contentIndex = lines.findIndex(line => line.includes("latest advice"));
      const placeholderIndex = lines.findIndex(line =>
        [...line].some(character => (character.codePointAt(0) ?? 0) > 0xffff),
      );

      expect(contentIndex).toBeGreaterThanOrEqual(0);
      expect(contentIndex).toBeLessThan(4);
      expect(placeholderIndex).toBeGreaterThanOrEqual(0);
      expect(placeholderIndex).toBeLessThan(contentIndex);
      expect(lines.some(line => line === "")).toBe(false);
      expect(lines.every(line => visibleWidth(line) <= 80)).toBe(true);
    } finally {
      setTerminalImageProtocol(previousProtocol);
      setKittyGraphics(previousGraphics);
    }
  });

});
