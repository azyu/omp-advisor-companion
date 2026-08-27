import {
  Image,
  type ImageBudget,
  type Component,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@oh-my-pi/pi-tui";
import type { AdvisorNote, AdvisorSeverity } from "./advisor-events";

const RESET = "\x1b[0m";
const BORDER_COLORS: Record<AdvisorSeverity | "muted", string> = {
  nit: "\x1b[34m",
  concern: "\x1b[33m",
  blocker: "\x1b[31m",
  muted: "\x1b[2m",
};

function skipControlSequence(text: string, index: number, kind: "csi" | "string"): number {
  let cursor = index;
  if (kind === "csi") {
    while (cursor < text.length) {
      const code = text.charCodeAt(cursor++);
      if (code >= 0x40 && code <= 0x7e) break;
    }
    return cursor;
  }
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor++);
    if (code === 0x07) break;
    if (code === 0x1b && text.charCodeAt(cursor) === 0x5c) return cursor + 1;
  }
  return cursor;
}

/** Remove ANSI/OSC/DCS controls and non-printing control characters. */
export function sanitizeBubbleText(text: string): string {
  let output = "";
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 0x1b) {
      const next = text.charCodeAt(++index);
      if (next === 0x5b) index = skipControlSequence(text, index + 1, "csi") - 1;
      else if (next === 0x5d || next === 0x50 || next === 0x5e || next === 0x5f) {
        index = skipControlSequence(text, index + 1, "string") - 1;
      }
      continue;
    }
    if (code === 0x9b) {
      index = skipControlSequence(text, index + 1, "csi") - 1;
      continue;
    }
    if (code === 0x9d || code === 0x90 || code === 0x98 || code === 0x9e || code === 0x9f) {
      index = skipControlSequence(text, index + 1, "string") - 1;
      continue;
    }
    if (code === 0x09) {
      output += "    ";
      continue;
    }
    if (code === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) continue;
      output += "\n";
      continue;
    }
    if (code === 0x0a) {
      output += "\n";
      continue;
    }
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    output += text[index];
  }
  return output;
}

/** Wrap plain bubble text using OMP's ANSI-aware width implementation. */
export function wrapBubbleText(text: string, width: number): string[] {
  const maxWidth = Math.max(0, Math.trunc(width));
  if (maxWidth === 0) return [];
  const safeText = sanitizeBubbleText(text);
  const lines: string[] = [];
  for (const paragraph of safeText.split("\n")) {
    const wrapped = wrapTextWithAnsi(paragraph, maxWidth);
    if (wrapped.length === 0) {
      lines.push("");
      continue;
    }
    for (const line of wrapped) {
      lines.push(visibleWidth(line) <= maxWidth ? line : truncateToWidth(line, maxWidth, null, false));
    }
  }
  return lines;
}

export function bubbleHeader(note: AdvisorNote): string {
  return note.severity ? `<${note.severity}>` : "";
}

function paintBorder(segment: string, severity: AdvisorSeverity | undefined): string {
  const color = BORDER_COLORS[severity ?? "muted"];
  return `${color}${segment}${RESET}`;
}

function paintBubbleLine(
  leftBorder: string,
  content: string,
  rightBorder: string,
  severity: AdvisorSeverity | undefined,
): string {
  return `${paintBorder(leftBorder, severity)}${content}${paintBorder(rightBorder, severity)}`;
}


/** Render one note as a terminal-width-bounded Unicode speech bubble. */
export function renderBubble(note: AdvisorNote, width: number, maxWidth?: number, footerText?: string): string[] {
  const availableWidth = Math.max(0, Math.trunc(width));
  const configuredWidth =
    maxWidth === undefined || !Number.isFinite(maxWidth) ? availableWidth : Math.max(0, Math.trunc(maxWidth));
  const renderWidth = Math.min(configuredWidth, availableWidth);
  if (renderWidth === 0) return [];
  if (renderWidth === 1) return [paintBorder("│", note.severity)];
  if (renderWidth === 2) return [paintBorder("┌┐", note.severity), paintBorder("││", note.severity), paintBorder("└┘", note.severity)];
  if (renderWidth === 3) {
    return [
      paintBorder("┌─┐", note.severity),
      paintBubbleLine("│", truncateToWidth(sanitizeBubbleText(note.note), 1, null, false), "│", note.severity),
      paintBorder("└─┘", note.severity),
    ];
  }
  const contentWidth = renderWidth - 4;
  const title = truncateToWidth(bubbleHeader(note), Math.max(0, renderWidth - 3), null, false);
  const titleWidth = visibleWidth(title);
  const top = paintBubbleLine(
    "┌─",
    title,
    `${"─".repeat(Math.max(0, renderWidth - 3 - titleWidth))}┐`,
    note.severity,
  );
  const content = wrapBubbleText(note.note, contentWidth);
  const body = (content.length > 0 ? content : [""]).map(line => {
    const fitted = visibleWidth(line) > contentWidth ? truncateToWidth(line, contentWidth, null, false) : line;
    return paintBubbleLine(
      "│",
      ` ${fitted}${" ".repeat(Math.max(0, contentWidth - visibleWidth(fitted)))} `,
      "│",
      note.severity,
    );
  });
  const bottomContentWidth = renderWidth - 2;
  const safeFooter = footerText === undefined ? "" : sanitizeBubbleText(footerText);
  const fittedFooter = safeFooter.length > 0
    ? truncateToWidth(safeFooter, bottomContentWidth, null, false)
    : "";
  const footerWidth = visibleWidth(fittedFooter);
  const trailingBorderWidth = fittedFooter.length > 0 && footerWidth < bottomContentWidth ? 1 : 0;
  const leadingBorderWidth = Math.max(0, bottomContentWidth - footerWidth - trailingBorderWidth);
  const bottom = paintBorder(
    `└${"─".repeat(leadingBorderWidth)}${fittedFooter}${"─".repeat(trailingBorderWidth)}┘`,
    note.severity,
  );
  return [top, ...body, bottom];
}

export interface AdvisorPanelViewOptions {
  initialNote?: AdvisorNote;
  imageBudget?: ImageBudget;
  imageMaxWidth?: number;
  imageMaxHeight?: number;
  bubbleMaxWidth?: number;
  countdownText?: () => string | undefined;
  onError?: (error: unknown) => void;
}

function normalizeViewCap(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeOptionalViewCap(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}


const IMAGE_BUBBLE_GAP = 1;
const MIN_SIDE_BY_SIDE_BUBBLE_WIDTH = 20;

function fitImageColumn(line: string, width: number): string {
  const fitted = visibleWidth(line) > width ? truncateToWidth(line, width, null, false) : line;
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}

function renderSideBySide(
  imageLines: readonly string[],
  bubbleLines: readonly string[],
  imageWidth: number,
): string[] {
  const rows = Math.max(imageLines.length, bubbleLines.length);
  return Array.from({ length: rows }, (_, index) => {
    const imageLine = fitImageColumn(imageLines[index] ?? "", imageWidth);
    const bubbleLine = bubbleLines[index] ?? "";
    return `${imageLine}${" ".repeat(IMAGE_BUBBLE_GAP)}${bubbleLine}`;
  });
}

function fitLineToWidth(line: string, width: number): string {
  return visibleWidth(line) > width ? truncateToWidth(line, width, null, false) : line;
}


/** Render the Advisor image and latest note only while a note is available. */
export class AdvisorPanelView implements Component {
  readonly #base64Png: string;
  #note: AdvisorNote | undefined;
  #image: Image | undefined;
  #cachedLines: readonly string[] | undefined;
  #cachedWidth: number | undefined;
  #cachedCountdownText: string | undefined;
  #disposed = false;
  readonly #imageBudget: ImageBudget | undefined;
  readonly #imageMaxWidth: number;
  readonly #imageMaxHeight: number;
  readonly #bubbleMaxWidth: number | undefined;
  readonly #countdownText: (() => string | undefined) | undefined;
  readonly #onError: ((error: unknown) => void) | undefined;

  constructor(base64Png: string, options: AdvisorPanelViewOptions = {}) {
    this.#base64Png = base64Png;
    this.#note = options.initialNote;
    this.#imageBudget = options.imageBudget;
    this.#imageMaxWidth = normalizeViewCap(options.imageMaxWidth, 20, 8, 40);
    this.#imageMaxHeight = normalizeViewCap(options.imageMaxHeight, 14, 6, 30);
    this.#bubbleMaxWidth = normalizeOptionalViewCap(options.bubbleMaxWidth, 20, 120);
    this.#countdownText = options.countdownText;
    this.#onError = options.onError;
  }

  get note(): AdvisorNote | undefined {
    return this.#note;
  }

  get imageMaxWidth(): number {
    return this.#imageMaxWidth;
  }

  get imageMaxHeight(): number {
    return this.#imageMaxHeight;
  }

  get bubbleMaxWidth(): number | undefined {
    return this.#bubbleMaxWidth;
  }

  setNote(note: AdvisorNote | undefined): void {
    this.#note = note;
    this.#cachedLines = undefined;
    this.#cachedWidth = undefined;
    this.#cachedCountdownText = undefined;
  }

  invalidate(): void {
    this.#cachedLines = undefined;
    this.#cachedWidth = undefined;
    this.#cachedCountdownText = undefined;
    this.#image?.invalidate();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cachedLines = undefined;
    this.#cachedWidth = undefined;
    this.#cachedCountdownText = undefined;
    this.#image?.invalidate();
    this.#image = undefined;
  }

  render(width: number): readonly string[] {
    if (this.#disposed) return [];
    const hostWidth = Math.max(0, Math.trunc(width));
    if (hostWidth === 0) return [];
    const note = this.#note;
    if (!note) {
      this.#cachedLines = [];
      this.#cachedWidth = hostWidth;
      this.#cachedCountdownText = undefined;
      return this.#cachedLines;
    }
    try {
      const countdownText = this.#countdownText?.();
      if (this.#cachedLines && this.#cachedWidth === hostWidth && this.#cachedCountdownText === countdownText) {
        return this.#cachedLines;
      }
      const sideBySideCandidate =
        hostWidth >= this.#imageMaxWidth + IMAGE_BUBBLE_GAP + MIN_SIDE_BY_SIDE_BUBBLE_WIDTH &&
        Math.min(this.#bubbleMaxWidth ?? hostWidth, hostWidth - this.#imageMaxWidth - IMAGE_BUBBLE_GAP) >=
          MIN_SIDE_BY_SIDE_BUBBLE_WIDTH;
      const imageWidth = sideBySideCandidate
        ? Math.min(this.#imageMaxWidth, hostWidth - IMAGE_BUBBLE_GAP - MIN_SIDE_BY_SIDE_BUBBLE_WIDTH)
        : hostWidth;
      if (!this.#image) {
        this.#image = new Image(
          this.#base64Png,
          "image/png",
          { fallbackColor: text => text },
          {
            maxWidthCells: this.#imageMaxWidth,
            maxHeightCells: this.#imageMaxHeight,
            imageKey: "advisor-character",
            budget: this.#imageBudget,
          },
        );
      }
      const renderedImage = this.#image.render(sideBySideCandidate ? imageWidth + 2 : hostWidth);
      const directControlRows =
        renderedImage.length > 0 && renderedImage.every(line => visibleWidth(line) === 0);
      const canSideBySide = sideBySideCandidate && !directControlRows && renderedImage.every(line => visibleWidth(line) > 0);
      const bubbleWidth = Math.min(
        this.#bubbleMaxWidth ?? Number.POSITIVE_INFINITY,
        canSideBySide ? hostWidth - imageWidth - IMAGE_BUBBLE_GAP : hostWidth,
      );
      const bubble = renderBubble(note, bubbleWidth, this.#bubbleMaxWidth, countdownText);
      const lines: string[] = directControlRows
        ? [...renderedImage, "", ...bubble]
        : canSideBySide
          ? renderSideBySide(renderedImage, bubble, imageWidth)
          : [...renderedImage, "", ...bubble];
      const fittedLines = lines.map(line => fitLineToWidth(line, hostWidth));
      this.#cachedLines = fittedLines;
      this.#cachedWidth = hostWidth;
      this.#cachedCountdownText = countdownText;
      return fittedLines;
    } catch (error) {
      this.#onError?.(error);
      this.#cachedLines = [];
      this.#cachedWidth = undefined;
      this.#cachedCountdownText = undefined;
      return this.#cachedLines;
    }
  }
}
