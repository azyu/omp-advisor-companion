import { describe, expect, it } from "bun:test";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AdvisorController, type AdvisorTimerHandle } from "../src/index";
import { AdvisorPanelView } from "../src/panel-view";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type WidgetCall = {
  key: string;
  content: unknown;
  options?: unknown;
};

function testContext(mode: ExtensionContext["mode"] = "tui", hasUI = true): {
  context: ExtensionContext;
  calls: WidgetCall[];
  warnings: string[];
} {
  const calls: WidgetCall[] = [];
  const warnings: string[] = [];

  const context = {
    mode,
    hasUI,
    cwd: "/project",
    ui: {
      setWidget(key: string, content: unknown, options?: unknown) {
        calls.push({ key, content, options });
      },
      notify(message: string) {
        warnings.push(message);
      },
    },
  } as unknown as ExtensionContext;
  return { context, calls, warnings };
}

type WidgetTui = {
  imageBudget?: never;
  requestRender: () => void;
};

function widgetFactories(calls: WidgetCall[]): Array<(tui: WidgetTui) => AdvisorPanelView> {
  return calls
    .filter(call => typeof call.content === "function")
    .map(call => call.content as (tui: WidgetTui) => AdvisorPanelView);
}

function componentFrom(
  factory: (tui: WidgetTui) => AdvisorPanelView,
  requestRender: () => void = () => {},
): AdvisorPanelView {
  return factory({ requestRender });
}
type TimerHandle = AdvisorTimerHandle;

type FakeTimer = {
  handle: TimerHandle;
  delayMs: number;
  callback: () => void;
  cleared: boolean;
};

function fakeTimers() {
  const timers: FakeTimer[] = [];
  let nextHandle = 0;
  const schedule = ((callback: () => void, delayMs: number) => {
    const timer = {
      handle: ({ id: ++nextHandle } as unknown) as TimerHandle,
      delayMs,
      callback,
      cleared: false,
    };
    timers.push(timer);
    return timer.handle;
  }) as (callback: () => void, delayMs: number) => TimerHandle;
  const cancel = ((handle: TimerHandle) => {
    const timer = timers.find(candidate => candidate.handle === handle);
    if (timer) timer.cleared = true;
  }) as (handle: TimerHandle) => void;

  return {
    timers,
    setTimeout: schedule,
    clearTimeout: cancel,
    async fire(handle: TimerHandle): Promise<void> {
      const timer = timers.find(candidate => candidate.handle === handle);
      if (!timer) throw new Error("unknown fake timer");
      timer.callback();
      await Promise.resolve();
    },
  };
}

describe("Advisor companion controller", () => {
  it("defers the configured widget until an Advisor message", async () => {
    const { context, calls } = testContext();
    const settingsCalls: Array<[string, string]> = [];
    let imageReads = 0;
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async (pluginName, cwd) => {
        settingsCalls.push([pluginName, cwd]);
        return { imagePath: "./character.png", imageMaxWidth: 32, imageMaxHeight: 22, bubbleMaxWidth: 72 };
      },
      loadImage: async () => {
        imageReads++;
        return PNG;
      },
      env: {},
    });

    await controller.handleInput("/advisor on", context);

    expect(widgetFactories(calls)).toHaveLength(0);
    expect(settingsCalls).toEqual([["omp-advisor-companion", "/project"]]);
    expect(imageReads).toBe(0);

    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "show me" }] } },
      context,
    );

    const factories = widgetFactories(calls);
    expect(factories).toHaveLength(1);
    const view = componentFrom(factories[0]);
    expect(view.note).toEqual({ note: "show me" });
    expect(view.imageMaxWidth).toBe(32);
    expect(view.imageMaxHeight).toBe(22);
    expect(view.bubbleMaxWidth).toBe(72);
    expect(settingsCalls).toEqual([["omp-advisor-companion", "/project"]]);
    expect(imageReads).toBe(1);
  });

  it("keeps repeated activation idempotent without rendering idle state", async () => {
    const { context, calls } = testContext();
    let settingsReads = 0;
    let imageReads = 0;
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => {
        settingsReads++;

        return {};
      },
      loadImage: async () => {
        imageReads++;
        return PNG;
      },
      env: {},
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleInput("/advisor on", context);

    expect(widgetFactories(calls)).toHaveLength(0);
    expect(settingsReads).toBe(1);
    expect(imageReads).toBe(0);
  });

  it("shows an idle group from session start and keeps notes visible when configured", async () => {
    const { context, calls } = testContext();
    const timers = fakeTimers();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ alwaysVisible: true, displayDurationSeconds: 1 }),
      loadImage: async () => PNG,
      env: {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    await controller.handleSessionStart(context);

    const idleView = componentFrom(widgetFactories(calls).at(-1)!);
    expect(idleView.note).toEqual({ note: "" });
    expect(idleView.render(80).length).toBeGreaterThan(0);

    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "always here" }] } },
      context,
    );

    const noteView = componentFrom(widgetFactories(calls).at(-1)!);
    expect(noteView.note).toEqual({ note: "always here" });
    expect(noteView.render(80).join("\n")).not.toContain("[ hides in ");
    expect(timers.timers).toHaveLength(0);

    await controller.handleInput("/advisor off", context);
    await controller.handleInput("/advisor on", context);
    expect(componentFrom(widgetFactories(calls).at(-1)!).note).toEqual({ note: "" });
  });

  it("replaces the widget with the final note from a valid batched Advisor message", async () => {
    const { context, calls } = testContext();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ imageMaxWidth: 24, imageMaxHeight: 18, bubbleMaxWidth: 64 }),
      loadImage: async () => PNG,
      env: {},
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      {
        role: "custom",
        customType: "advisor",
        details: { notes: [{ note: "first", severity: "nit" }, { note: "final", severity: "blocker" }] },
      },
      context,
    );
    const factories = widgetFactories(calls);

    expect(factories).toHaveLength(1);
    expect(componentFrom(factories[0]).note).toEqual({ note: "final", severity: "blocker" });
  });

  it("shows a live countdown in the widget and hides it after the configured display duration", async () => {
    const { context, calls } = testContext();
    const timers = fakeTimers();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ displayDurationSeconds: 2 }),
      loadImage: async () => PNG,
      env: {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "temporary" }] } },
      context,
    );

    const factory = widgetFactories(calls).at(-1)!;
    let redraws = 0;
    const view = componentFrom(factory, () => {
      redraws++;
    });
    expect(view.render(80).at(-1)).toContain("[ hides in 2s ]");
    expect(timers.timers).toHaveLength(1);
    expect(timers.timers[0].delayMs).toBe(1000);

    await timers.fire(timers.timers[0].handle);
    expect(redraws).toBe(1);
    expect(view.render(80).at(-1)).toContain("[ hides in 1s ]");
    expect(timers.timers).toHaveLength(2);
    expect(timers.timers[1].delayMs).toBe(1000);

    await timers.fire(timers.timers[1].handle);
    expect(calls.at(-1)?.content).toBeUndefined();
  });

  it("keeps the widget visible without a countdown when display duration is zero", async () => {
    const { context, calls } = testContext();
    const timers = fakeTimers();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ displayDurationSeconds: 0 }),
      loadImage: async () => PNG,
      env: {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "persistent" }] } },
      context,
    );

    const factory = widgetFactories(calls).at(-1)!;
    expect(componentFrom(factory).render(80).join("\n")).not.toContain("[ hides in ");
    expect(timers.timers).toHaveLength(0);
  });

  it("resets the countdown when a newer note replaces the widget and ignores stale ticks", async () => {
    const { context, calls } = testContext();
    const timers = fakeTimers();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ displayDurationSeconds: 5 }),
      loadImage: async () => PNG,
      env: {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "first" }] } },
      context,
    );
    const firstTimer = timers.timers[0];
    let firstRedraws = 0;
    const firstView = componentFrom(widgetFactories(calls).at(-1)!, () => {
      firstRedraws++;
    });
    expect(firstView.render(80).at(-1)).toContain("[ hides in 5s ]");

    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "newer" }] } },
      context,
    );
    const secondTimer = timers.timers[1];
    let secondRedraws = 0;
    const latestFactory = widgetFactories(calls).at(-1)!;
    const secondView = componentFrom(latestFactory, () => {
      secondRedraws++;
    });

    expect(firstTimer.cleared).toBe(true);
    expect(secondTimer.delayMs).toBe(1000);
    expect(secondView.note).toEqual({ note: "newer" });
    expect(secondView.render(80).at(-1)).toContain("[ hides in 5s ]");

    await timers.fire(firstTimer.handle);
    expect(firstRedraws).toBe(0);
    expect(secondRedraws).toBe(0);
    expect(secondView.render(80).at(-1)).toContain("[ hides in 5s ]");

    await timers.fire(secondTimer.handle);
    expect(secondRedraws).toBe(1);
    expect(secondView.render(80).at(-1)).toContain("[ hides in 4s ]");
  });

  it("cancels the pending countdown when mirroring is turned off", async () => {
    const { context, calls } = testContext();
    const timers = fakeTimers();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ displayDurationSeconds: 5 }),
      loadImage: async () => PNG,
      env: {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "turn me off" }] } },
      context,
    );
    const timer = timers.timers[0];

    await controller.handleInput("/advisor off", context);
    expect(timer.cleared).toBe(true);
    expect(calls.filter(call => call.content === undefined)).toHaveLength(1);

    await timers.fire(timer.handle);
    expect(calls.filter(call => call.content === undefined)).toHaveLength(1);
  });

  it("cancels the pending countdown during session cleanup", async () => {
    const { context, calls } = testContext();
    const timers = fakeTimers();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({ displayDurationSeconds: 5 }),
      loadImage: async () => PNG,
      env: {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "session note" }] } },
      context,
    );
    const timer = timers.timers[0];

    await controller.handleSessionEnd(context);
    expect(timer.cleared).toBe(true);
    expect(controller.mirrorState).toBeUndefined();
    expect(calls.filter(call => call.content === undefined)).toHaveLength(1);

    await timers.fire(timer.handle);
    expect(calls.filter(call => call.content === undefined)).toHaveLength(1);
  });

  it("suppresses the host transcript card before it is rendered", () => {
    const { context } = testContext();
    const controller = new AdvisorController({} as never);
    const message = {
      role: "custom",
      customType: "advisor",
      display: true,
      details: { notes: [{ note: "keep this in the widget" }] },
    };

    controller.handleMessageStart(message, context);

    expect(message.display).toBe(false);
  });

  it("clears the widget and discards the note on deactivation", async () => {
    const { context, calls } = testContext();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({}),
      loadImage: async () => PNG,
      env: {},
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "discard me" }] } },
      context,
    );
    await controller.handleInput("/advisor off", context);

    expect(controller.mirrorState).toBe(false);
    expect(calls.at(-1)?.content).toBeUndefined();

    await controller.handleInput("/advisor on", context);
    expect(widgetFactories(calls)).toHaveLength(1);
  });

  it("ignores delayed Advisor messages after explicit deactivation", async () => {
    const { context, calls } = testContext();
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({}),
      loadImage: async () => PNG,
      env: {},
    });

    await controller.handleInput("/advisor off", context);
    const message = {
      role: "custom",
      customType: "advisor",
      display: true,
      details: { notes: [{ note: "ignored after off" }] },
    };

    controller.handleMessageStart(message, context);
    await controller.handleMessage(message, context);

    expect(message.display).toBe(true);
    expect(widgetFactories(calls)).toHaveLength(0);
  });
  it("does not recreate a widget after a stale image completion", async () => {
    const { context, calls } = testContext();
    let resolveImage!: (image: string) => void;
    let imageStarted!: () => void;
    const started = new Promise<void>(resolve => {
      imageStarted = resolve;
    });
    const pendingImage = new Promise<string>(resolve => {
      resolveImage = resolve;
    });
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => ({}),
      loadImage: async () => {
        imageStarted();
        return pendingImage;
      },
      env: {},
    });

    const activating = controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "stale" }] } },
      context,
    );
    await started;
    await controller.handleInput("/advisor off", context);
    resolveImage(PNG);
    await activating;

    expect(widgetFactories(calls)).toHaveLength(0);
    expect(calls.at(-1)?.content).toBeUndefined();
  });

  it("is a silent no-op outside the TUI", async () => {
    const { context, calls } = testContext("rpc", false);
    let settingsReads = 0;
    const controller = new AdvisorController({} as never, {
      getPluginSettings: async () => {
        settingsReads++;
        return {};
      },
      loadImage: async () => PNG,
      env: {},
    });

    await controller.handleInput("/advisor on", context);
    await controller.handleMessage(
      { role: "custom", customType: "advisor", details: { notes: [{ note: "ignored" }] } },
      context,
    );

    expect(calls).toHaveLength(0);
    expect(settingsReads).toBe(0);
  });
});
