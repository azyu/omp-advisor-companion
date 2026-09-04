import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { AdvisorPanelView } from "./panel-view";
import { extractAdvisorNotes, parseAdvisorCommand, type AdvisorNote } from "./advisor-events";

const WIDGET_KEY = "omp-advisor-companion";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BUNDLED_IMAGE_PATH = fileURLToPath(new URL("../assets/advisor.png", import.meta.url));

const DEFAULT_SETTINGS: AdvisorResourceSettings = {
  imagePath: "",
  imageMaxWidth: 20,
  imageMaxHeight: 14,
  alwaysVisible: false,
  displayDurationSeconds: 30,
};
const SETTING_BOUNDS = {
  imageMaxWidth: { min: 8, max: 40 },
  imageMaxHeight: { min: 6, max: 30 },
  bubbleMaxWidth: { min: 20, max: 120 },
  displayDurationSeconds: { min: 0, max: 3600 },
} as const;

type Environment = Readonly<Record<string, string | undefined>>;
type AdvisorImageLoader = (resolvedPath: string) => Promise<string>;
export type AdvisorTimerHandle = number | Timer;
export type AdvisorSetTimeout = (callback: () => void, delayMs: number) => AdvisorTimerHandle;
export type AdvisorClearTimeout = (timer: AdvisorTimerHandle) => void;

interface AdvisorResourceSettings {
  imagePath: string;
  imageMaxWidth: number;
  imageMaxHeight: number;
  bubbleMaxWidth?: number;
  alwaysVisible: boolean;
  displayDurationSeconds: number;
}

interface AdvisorHideTimer {
  version: number;
  remainingSeconds: number;
  tickVersion: number;
  handle?: AdvisorTimerHandle;
}

export interface AdvisorControllerDependencies {
  getPluginSettings?: (pluginName: string, cwd: string) => Promise<Record<string, unknown>>;
  loadImage?: AdvisorImageLoader;
  env?: Environment;
  setTimeout?: AdvisorSetTimeout;
  clearTimeout?: AdvisorClearTimeout;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const candidate =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(candidate)));
}

function normalizeOptionalInteger(value: unknown, min: number, max: number): number | undefined {
  const candidate =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(candidate)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(candidate)));
}

function normalizeSettings(settings: Record<string, unknown>): AdvisorResourceSettings {
  const imagePath = typeof settings.imagePath === "string" ? settings.imagePath.trim() : "";
  return {
    imagePath,
    imageMaxWidth: normalizeInteger(
      settings.imageMaxWidth,
      DEFAULT_SETTINGS.imageMaxWidth,
      SETTING_BOUNDS.imageMaxWidth.min,
      SETTING_BOUNDS.imageMaxWidth.max,
    ),
    imageMaxHeight: normalizeInteger(
      settings.imageMaxHeight,
      DEFAULT_SETTINGS.imageMaxHeight,
      SETTING_BOUNDS.imageMaxHeight.min,
      SETTING_BOUNDS.imageMaxHeight.max,
    ),
    bubbleMaxWidth: normalizeOptionalInteger(
      settings.bubbleMaxWidth,
      SETTING_BOUNDS.bubbleMaxWidth.min,
      SETTING_BOUNDS.bubbleMaxWidth.max,
    ),
    alwaysVisible: settings.alwaysVisible === true,
    displayDurationSeconds: normalizeInteger(
      settings.displayDurationSeconds,
      DEFAULT_SETTINGS.displayDurationSeconds,
      SETTING_BOUNDS.displayDurationSeconds.min,
      SETTING_BOUNDS.displayDurationSeconds.max,
    ),
  };
}

function isUnsafePathReference(path: string): boolean {
  if (path.includes("\0") || path.includes("*") || path.includes("?") || path.includes("{") || path.includes("}")) {
    return true;
  }
  // A URI scheme (including OMP's internal URI schemes) is not a local path.
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path);
}

function resolveImagePath(path: string, cwd: string): string {
  const candidate = path.trim();
  if (candidate.length === 0 || isUnsafePathReference(candidate)) {
    throw new Error("imagePath must be a local PNG path");
  }
  if (candidate.startsWith("~/")) return resolve(homedir(), candidate.slice(2));
  return isAbsolute(candidate) ? resolve(candidate) : resolve(cwd, candidate);
}

async function readAdvisorImage(resolvedPath: string): Promise<string> {
  const image = await readFile(resolvedPath);
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (image[index] !== PNG_SIGNATURE[index]) throw new Error("Advisor image is not a PNG");
  }
  return Buffer.from(image).toString("base64");
}

function canUseWidget(context: Pick<ExtensionContext, "mode" | "hasUI">): boolean {
  return context.mode === "tui" && context.hasUI;
}

function isAdvisorMessage(
  message: unknown,
): message is { role: "custom"; customType: "advisor"; display?: boolean } {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  if (!("role" in message) || !("customType" in message)) return false;
  return message.role === "custom" && message.customType === "advisor";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Mirrors Advisor state and owns one above-editor widget for the loaded extension. */
export class AdvisorController {
  #mirrorState: boolean | undefined;
  #note: AdvisorNote | undefined;
  #settings: AdvisorResourceSettings | undefined;
  #settingsPromise: Promise<AdvisorResourceSettings> | undefined;
  #widgetVersion = 0;
  #hideTimer: AdvisorHideTimer | undefined;
  #requestWidgetRender: (() => void) | undefined;
  #warningIssued = false;
  readonly #getPluginSettings: (pluginName: string, cwd: string) => Promise<Record<string, unknown>>;
  readonly #loadImage: AdvisorImageLoader;
  readonly #env: Environment;
  readonly #setTimeout: AdvisorSetTimeout;
  readonly #clearTimeout: AdvisorClearTimeout;
  readonly #imagePromises = new Map<string, Promise<string>>();

  constructor(_api: ExtensionAPI, dependencies: AdvisorControllerDependencies = {}) {
    this.#getPluginSettings = dependencies.getPluginSettings ?? getPluginSettings;
    this.#loadImage = dependencies.loadImage ?? readAdvisorImage;
    this.#env = dependencies.env ?? process.env;
    this.#setTimeout = dependencies.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimeout = dependencies.clearTimeout ?? (timer => clearTimeout(timer));
  }

  get mirrorState(): boolean | undefined {
    return this.#mirrorState;
  }

  async handleInput(text: string, context: ExtensionContext): Promise<void> {
    if (!canUseWidget(context)) return;
    const command = parseAdvisorCommand(text);
    if (command === undefined || command === "status") return;
    if (command === "off") {
      this.#mirrorState = false;
      this.#note = undefined;
      this.#warningIssued = false;
      await this.#clearWidget(context);
      return;
    }
    if (command === "toggle") {
      if (this.#mirrorState === undefined) return;
      if (this.#mirrorState) {
        this.#mirrorState = false;
        this.#note = undefined;
        this.#warningIssued = false;
        await this.#clearWidget(context);
        return;
      }
    }
    if (this.#mirrorState === true) return;
    this.#mirrorState = true;
    this.#warningIssued = false;
    await this.#activateIfAlwaysVisible(context);
  }

  /**
   * Advisor cards are emitted through message_start before OMP paints the
   * transcript. Marking that live message non-displayable keeps the host's
   * built-in card hidden while message_end still carries the note to the
   * companion widget.
   */
  handleMessageStart(message: unknown, context: ExtensionContext): void {
    if (!canUseWidget(context) || this.#mirrorState === false || !isAdvisorMessage(message)) return;
    message.display = false;
  }

  async handleMessage(message: unknown, context: ExtensionContext): Promise<void> {
    if (!canUseWidget(context) || this.#mirrorState === false) return;
    const notes = extractAdvisorNotes(message);
    if (notes.length === 0) return;
    this.#note = notes[notes.length - 1];
    await this.#activate(context);
  }

  async handleSessionStart(context: ExtensionContext): Promise<void> {
    if (!canUseWidget(context)) return;
    this.#mirrorState = undefined;
    this.#note = undefined;
    this.#warningIssued = false;
    await this.#clearWidget(context);
    await this.#activateIfAlwaysVisible(context);
  }

  async handleSessionEnd(context: ExtensionContext): Promise<void> {
    if (!canUseWidget(context)) return;
    this.#mirrorState = undefined;
    this.#note = undefined;
    this.#warningIssued = false;
    await this.#clearWidget(context);
  }

  async #readSettings(cwd: string): Promise<AdvisorResourceSettings> {
    try {
      const settings = await this.#getPluginSettings(WIDGET_KEY, cwd);
      return normalizeSettings(settings);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  #cachedImage(resolvedPath: string): Promise<string> {
    const cached = this.#imagePromises.get(resolvedPath);
    if (cached) return cached;

    let imagePromise: Promise<string>;
    imagePromise = Promise.resolve()
      .then(() => this.#loadImage(resolvedPath))
      .catch(error => {
        if (this.#imagePromises.get(resolvedPath) === imagePromise) this.#imagePromises.delete(resolvedPath);
        throw error;
      });
    this.#imagePromises.set(resolvedPath, imagePromise);
    return imagePromise;
  }

  async #loadConfiguredImage(settings: AdvisorResourceSettings, context: ExtensionContext, version: number): Promise<string | undefined> {
    const configuredPath = settings.imagePath || this.#env.OMP_ADVISOR_COMPANION_IMAGE?.trim() || "";
    const hasOverride = configuredPath.length > 0;
    let resolvedPath: string;
    try {
      resolvedPath = hasOverride ? resolveImagePath(configuredPath, context.cwd) : BUNDLED_IMAGE_PATH;
      return await this.#cachedImage(resolvedPath);
    } catch (error) {
      if (!hasOverride) {
        this.#warnOnce(context, version, "load", error);
        return undefined;
      }
      this.#warnOnce(context, version, "override load", error);
      if (version !== this.#widgetVersion || this.#mirrorState !== true) return undefined;
      try {
        return await this.#cachedImage(BUNDLED_IMAGE_PATH);
      } catch (fallbackError) {
        this.#warnOnce(context, version, "load", fallbackError);
        return undefined;
      }
    }
  }

  async #activateIfAlwaysVisible(context: ExtensionContext): Promise<void> {
    const version = this.#widgetVersion;
    if (this.#settings === undefined && this.#settingsPromise === undefined) {
      this.#settingsPromise = this.#readSettings(context.cwd);
    }
    const settings = this.#settings ?? (await (this.#settingsPromise ?? Promise.resolve({ ...DEFAULT_SETTINGS })));
    if (version !== this.#widgetVersion || this.#mirrorState === false || !settings.alwaysVisible) return;
    this.#settings = settings;
    await this.#activate(context);
  }

  async #activate(context: ExtensionContext): Promise<void> {
    const version = ++this.#widgetVersion;
    this.#mirrorState = true;
    this.#clearHideTimer();
    this.#requestWidgetRender = undefined;
    if (this.#settings === undefined && this.#settingsPromise === undefined) {
      this.#warningIssued = false;
      this.#settingsPromise = this.#readSettings(context.cwd);
    }

    const settings = this.#settings ?? (await (this.#settingsPromise ?? Promise.resolve({ ...DEFAULT_SETTINGS })));
    if (version !== this.#widgetVersion || this.#mirrorState !== true) return;
    this.#settings = settings;

    const base64Png = await this.#loadConfiguredImage(settings, context, version);
    if (base64Png === undefined || version !== this.#widgetVersion || this.#mirrorState !== true) return;
    const initialNote = this.#note ?? (settings.alwaysVisible ? { note: "" } : undefined);
    try {
      context.ui.setWidget(
        WIDGET_KEY,
        tui => {
          if (version === this.#widgetVersion && this.#mirrorState === true) {
            this.#requestWidgetRender = () => tui.requestRender();
          }
          return new AdvisorPanelView(base64Png, {
            initialNote,
            imageBudget: tui.imageBudget,
            imageMaxWidth: settings.imageMaxWidth,
            imageMaxHeight: settings.imageMaxHeight,
            bubbleMaxWidth: settings.bubbleMaxWidth,
            countdownText:
              !settings.alwaysVisible && settings.displayDurationSeconds > 0
                ? () => this.#countdownText(version)
                : undefined,
            onError: error => this.#warnOnce(context, version, "render", error),
          });
        },
        { placement: "aboveEditor" },
      );
      this.#scheduleHideTimer(context, version, settings.alwaysVisible ? 0 : settings.displayDurationSeconds);
    } catch (error) {
      this.#warnOnce(context, version, "render", error);
    }
  }
  #countdownText(version: number): string | undefined {
    const timerState = this.#hideTimer;
    if (
      timerState === undefined ||
      timerState.version !== version ||
      timerState.remainingSeconds <= 0 ||
      this.#mirrorState !== true
    ) {
      return undefined;
    }
    return `[ hides in ${timerState.remainingSeconds}s ]`;
  }

  #scheduleHideTimer(context: ExtensionContext, version: number, durationSeconds: number): void {
    this.#clearHideTimer();
    if (durationSeconds === 0) return;

    const timerState: AdvisorHideTimer = {
      version,
      remainingSeconds: durationSeconds,
      tickVersion: 0,
    };
    this.#hideTimer = timerState;
    this.#scheduleCountdownTick(context, timerState);
    if (this.#hideTimer !== timerState || timerState.version !== this.#widgetVersion || this.#mirrorState !== true) return;
    try {
      this.#requestWidgetRender?.();
    } catch (error) {
      this.#warnOnce(context, version, "render", error);
    }
  }

  #scheduleCountdownTick(context: ExtensionContext, timerState: AdvisorHideTimer): void {
    const tickVersion = ++timerState.tickVersion;
    timerState.handle = this.#setTimeout(() => {
      if (
        this.#hideTimer !== timerState ||
        timerState.version !== this.#widgetVersion ||
        timerState.tickVersion !== tickVersion ||
        this.#mirrorState !== true
      ) {
        return;
      }

      timerState.handle = undefined;
      timerState.remainingSeconds--;
      if (timerState.remainingSeconds <= 0) {
        this.#hideTimer = undefined;
        this.#note = undefined;
        this.#requestWidgetRender = undefined;
        if (timerState.version !== this.#widgetVersion || this.#mirrorState !== true) return;
        try {
          context.ui.setWidget(WIDGET_KEY, undefined);
        } catch (error) {
          this.#warnOnce(context, timerState.version, "hide", error);
        }
        return;
      }

      if (
        this.#hideTimer !== timerState ||
        timerState.version !== this.#widgetVersion ||
        this.#mirrorState !== true
      ) {
        return;
      }
      try {
        this.#requestWidgetRender?.();
      } catch (error) {
        this.#warnOnce(context, timerState.version, "render", error);
      }
      if (
        this.#hideTimer !== timerState ||
        timerState.version !== this.#widgetVersion ||
        this.#mirrorState !== true
      ) {
        return;
      }
      this.#scheduleCountdownTick(context, timerState);
    }, 1000);
    if (
      typeof timerState.handle === "object" &&
      timerState.handle !== null &&
      "unref" in timerState.handle &&
      typeof timerState.handle.unref === "function"
    ) {
      timerState.handle.unref();
    }
  }

  #clearHideTimer(): void {
    const timerState = this.#hideTimer;
    if (timerState === undefined) return;
    this.#hideTimer = undefined;
    if (timerState.handle !== undefined) this.#clearTimeout(timerState.handle);
  }

  async #clearWidget(context: ExtensionContext): Promise<void> {
    this.#clearHideTimer();
    this.#requestWidgetRender = undefined;
    this.#widgetVersion++;
    this.#note = undefined;
    this.#settings = undefined;
    this.#settingsPromise = undefined;
    context.ui.setWidget(WIDGET_KEY, undefined);
  }

  #warnOnce(context: ExtensionContext, version: number, operation: string, error: unknown): void {
    if (version !== this.#widgetVersion || this.#mirrorState !== true || this.#warningIssued) return;
    this.#warningIssued = true;
    try {
      context.ui.notify(`Advisor companion widget ${operation} failed: ${errorMessage(error)}`, "warning");
    } catch {
      // UI teardown can race an image failure; keep the extension failure contained.
    }
  }
}

export default function advisorCharacterExtension(api: ExtensionAPI): void {
  const controller = new AdvisorController(api);

  api.on("input", (event, context) => controller.handleInput(event.text, context));
  api.on("message_start", (event, context) => controller.handleMessageStart(event.message, context));
  api.on("message_end", (event, context) => controller.handleMessage(event.message, context));
  api.on("session_start", (_event, context) => controller.handleSessionStart(context));
  api.on("session_before_switch", (_event, context) => controller.handleSessionEnd(context));
  api.on("session_shutdown", (_event, context) => controller.handleSessionEnd(context));
}
