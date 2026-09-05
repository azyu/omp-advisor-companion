<p align="center">
  <img src="assets/advisor.png" width="320" alt="OMP Advisor Companion">
</p>

<p align="center">
  <strong>A bounded in-process Advisor companion widget for OMP.</strong>
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi"><img src="https://img.shields.io/badge/OMP-18%2B-7AA2F7?style=flat&colorA=222222" alt="OMP 18+"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/plugin%20install-Bun%201.3.14%2B-f472b6?style=flat&colorA=222222" alt="Bun 1.3.14+ for plugin installation"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&colorA=222222&logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

<p align="center">
  Built for <a href="https://github.com/can1357/oh-my-pi">Oh My Pi</a>'s existing Advisor runtime.
</p>

<p align="center">
  <a href="#english">English</a> · <a href="README.ko.md">한국어</a>
</p>

<a id="english"></a>

`omp-advisor-companion` displays a static character image and the latest Advisor note in an OMP widget above the editor. By default, the widget appears only when an Advisor message arrives; `alwaysVisible` can keep an idle image and empty bubble on screen before the first note. On wider hosts, the image sits beside the bubble; on narrower hosts, it stacks above the bubble. The widget is non-modal, never takes focus, and hides OMP's built-in Advisor transcript card so each note appears only once.

It does not run a separate reviewer model. Instead, it observes OMP's built-in Advisor messages and updates a single widget under the stable `omp-advisor-companion` key.

The bubble header contains only the severity tag, such as `<concern>`.

<p align="center">
  <img src="assets/screen-shot.png" width="100%" alt="OMP Advisor Companion screenshot">
</p>

## Requirements

- [OMP](https://github.com/can1357/oh-my-pi) 18.1.0 or newer
- A configured OMP Advisor model
- [Bun](https://bun.sh) 1.3.14 or newer on `PATH` for OMP plugin package management

The plugin itself runs inside the host OMP process and does not require a separate Bun runtime after installation. However, OMP's plugin manager launches the external `bun` executable for Git/npm plugin installation, reinstallation, and uninstallation. Users who installed OMP with Bun already satisfy this requirement; users of a prebuilt OMP binary, Homebrew, or Nix must install Bun separately before running the plugin-management commands in this README.

Kitty graphics support is optional. Without it, OMP's `Image` component provides a text fallback instead of rendering the image.

## Install

Install directly from the GitHub repository:

```sh
omp plugin install github:azyu/omp-advisor-companion
```

The full Git URL is equivalent:

```sh
omp plugin install https://github.com/azyu/omp-advisor-companion
```

Restart OMP after installation. In OMP 18 or newer, `/reload-plugins` refreshes plugin-owned skills, commands, agents, and MCP state, but does not re-import extension factories in the running process.

Confirm the installed plugin:

```sh
omp plugin list
```

## Configure Advisor

The plugin reuses OMP Advisor and does not configure the Advisor model itself. A minimal `~/.omp/agent/config.yml` configuration looks like:

```yaml
modelRoles:
  advisor: gpt-5.6-sol

advisor:
  enabled: true
```

Use any Advisor-capable model available in your OMP installation. See OMP's [Advisor documentation](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md) for model roles, `WATCHDOG.md`, and multi-advisor rosters.

## Usage

Start OMP, then use the built-in commands:

```text
/advisor on
/advisor status
/advisor off
```

Behavior:

- `/advisor on` enables mirroring but, by default, keeps the widget hidden until a valid Advisor message arrives. Repeated activation is idempotent.
- When Kitty output is used, the self-contained image block remains contiguous and byte-for-byte unchanged before the bubble; no alignment spaces are added.
- A valid Advisor message creates or replaces the image-and-bubble group with the latest valid note unless mirroring was explicitly turned off.
- With `alwaysVisible: true`, session start and `/advisor on` immediately show the image with an empty idle bubble. Advisor notes then remain visible without a countdown until replaced, `/advisor off` runs, or the session ends.
- When `alwaysVisible` is `false`, each successfully displayed note stays visible for `displayDurationSeconds` seconds (default `30`). The bubble's bottom border shows `[ hides in Ns ]` aligned toward its lower-right edge and updates once per second. When the countdown reaches `1s`, the widget hides. A newer note replaces the current widget and resets both the hide timer and countdown. A value of `0` disables automatic hiding and removes the countdown.
- `/advisor off` removes the widget, discards the current note, and leaves later Advisor messages to the host until mirroring is enabled again.
- Session switching and shutdown clear the widget and reset the mirrored state. Session start does the same, then recreates the idle widget when `alwaysVisible` is enabled.
- The bare `/advisor` command toggles only after the extension knows the state. With the default settings, an unknown state remains hidden until a real Advisor note arrives.
- Non-TUI and no-UI OMP modes are silent no-ops.

The image is loaded lazily when the widget first needs to appear: on a valid Advisor message by default, or at session start when `alwaysVisible` is enabled. Each resolved local image path has its own retryable Promise cache: successful loads are reused, while failed loads are removed so a corrected file can be loaded later. An invalid path, unreadable file, or unsupported image displays a persistent error above the editor and emits one warning for that activation.

## FAQ

### Why is the image missing in Windows WezTerm when OMP runs inside Herdr?

There are two different cases:

- OMP running directly in WezTerm: OMP uses Kitty direct placement. Do not set `PI_KITTY_PLACEHOLDERS=1`; WezTerm does not reliably render Kitty Unicode placeholders.
- OMP running inside Herdr: Herdr owns the pane grid. OMP 18.1.0 and newer intentionally disable Kitty output there unless it is explicitly enabled. With Herdr's default `kitty_graphics = false`, the `Image` component shows its text fallback. The image path is not the cause.

To render the actual image inside Herdr, enable Herdr's experimental Kitty renderer. On native Windows, Herdr reads `%APPDATA%\herdr\config.toml`; on Linux or WSL, it reads `~/.config/herdr/config.toml`:

```toml
[experimental]
kitty_graphics = true
```

Then set the Kitty protocol and placeholders only in Herdr-managed shells.

Git Bash or another POSIX shell:

```sh
if [[ "${HERDR_ENV:-}" == "1" ]]; then
  export PI_FORCE_IMAGE_PROTOCOL=kitty
  export PI_KITTY_PLACEHOLDERS=1
fi
```

PowerShell:

```powershell
if ($env:HERDR_ENV -eq "1") {
  $env:PI_FORCE_IMAGE_PROTOCOL = "kitty"
  $env:PI_KITTY_PLACEHOLDERS = "1"
}
```

Run `herdr server reload-config`, open a new Herdr pane, and restart OMP so the renderer setting and environment variables take effect. Do not export these variables globally: direct WezTerm should use its normal Kitty path, while unsupported terminals need OMP's text fallback. Native Windows and ConPTY combinations remain terminal-dependent; if the enabled Herdr path still cannot render the image, run OMP directly in WezTerm or in WSL, or remove both overrides to keep the visible fallback instead of raw placeholder glyphs.

## Resource settings

The bundled default is `assets/advisor.png`, a neutral placeholder character image. Global settings use OMP's plugin configuration commands:

```sh
omp plugin config set omp-advisor-companion imagePath /absolute/path.png
omp plugin config set omp-advisor-companion concernImagePath /absolute/concern.png
omp plugin config set omp-advisor-companion imageMaxWidth 20
omp plugin config set omp-advisor-companion imageMaxHeight 14
omp plugin config set omp-advisor-companion bubbleMaxWidth 60
omp plugin config set omp-advisor-companion alwaysVisible true
omp plugin config set omp-advisor-companion displayDurationSeconds 30
omp plugin config list omp-advisor-companion
```

`imagePath` accepts an absolute local PNG or JPEG path or a path relative to the active project's OMP `context.cwd`. Windows drive paths are supported; in PowerShell, for example: `omp plugin config set omp-advisor-companion imagePath 'G:\Working\advisor.jpg'`. A leading `~/` is expanded to the user's home directory. URLs, data URIs, globs, and OMP internal URI schemes are not interpreted as image paths.

`nitImagePath`, `concernImagePath`, and `blockerImagePath` accept the same path forms. A non-empty severity-specific path is used for that note type; an omitted or empty value falls back to `imagePath`. The idle image shown by `alwaysVisible` also uses `imagePath`.

Project-specific settings go in `.omp/plugin-overrides.json` and override the corresponding global values:

```json
{
  "settings": {
    "omp-advisor-companion": {
      "imagePath": "./assets/project-advisor.png",
      "concernImagePath": "./assets/project-advisor-concern.png",
      "imageMaxWidth": 24,
      "imageMaxHeight": 18,
      "bubbleMaxWidth": 72,
      "alwaysVisible": true,
      "displayDurationSeconds": 15
    }
  }
}
```

The effective settings precedence is:

1. The matching non-empty `nitImagePath`, `concernImagePath`, or `blockerImagePath` for a typed note;
2. A non-empty project or global `imagePath` value from the merged OMP plugin settings;
3. `OMP_ADVISOR_COMPANION_IMAGE` when `imagePath` is empty;
4. The bundled `assets/advisor.png` placeholder.

`alwaysVisible` defaults to `false`. When enabled, it overrides `displayDurationSeconds`: the idle group appears immediately and notes never auto-hide. Numeric settings are normalized to finite integers and clamped to their manifest ranges: image width `8`–`40` cells (default `20`), image height `6`–`30` cells (default `14`), bubble width `20`–`120` visible columns when configured, and display duration `0`–`3600` seconds (default `30`). When `bubbleMaxWidth` is omitted, the bubble uses the available render width. With `alwaysVisible` disabled, a display duration of `0` keeps the first displayed note visible without a countdown but does not show an idle widget before that note. The countdown disappears when the widget hides, `/advisor off` runs, or the session is cleaned up. Changes apply after `/advisor off` followed by `/advisor on`; restarting OMP also applies them.

## Widget bounds and image ratios

The widget uses `ctx.ui.setWidget("omp-advisor-companion", factory, { placement: "aboveEditor" })` and OMP's `@oh-my-pi/pi-tui` `Image` component. In OMP 18 or newer, `WidgetPlacement` provides only `aboveEditor` and `belowEditor`: this is an above-editor widget, not a true right-hand dock, and it does not reserve editor width. The extension does not use a custom overlay because the widget must remain non-modal and never take focus.

- By default, the widget is absent until a valid Advisor note is available. With `alwaysVisible` enabled, it renders the image and an empty bubble while idle.
- With enough host width, the image and bubble render side by side; narrower hosts stack the image above the bubble.
- When direct Kitty placement is used, the self-contained image block remains contiguous and byte-for-byte unchanged before the bubble; no alignment spaces are added.
- Bubble: contained within the configured visible-column cap when set, or the available render width when omitted or narrower.
- OMP `Image` preserves the source pixel aspect ratio while fitting it inside the configured cell bounds. No special case is needed for 1:1, 2:3, 3:4, landscape, or other PNG ratios.
- `imageMaxWidth` and `imageMaxHeight` are upper bounds, not forced output dimensions. The schema's `min` values only validate configuration; they do not impose a minimum rendered size.
- Omitting the settings applies the defaults (`20×14` cells). OMP may render fewer cells when the source aspect ratio or host width requires it—for example, a 1:1 PNG typically uses fewer rows than a 2:3 PNG.
- Removing both caps would let OMP fit the image to available width, but the widget renderer is not given a reliable terminal-height budget. The plugin therefore keeps explicit caps to prevent the image from consuming excessive vertical space.
- Transparent canvas margins count toward the source aspect ratio. Trim transparent margins when the visible character should fill more of the configured bounds.

## Character asset

The default character is:

```text
assets/advisor.png
```

Asset contract:

- static RGBA PNG
- `256 × 256`, 1:1 square
- transparent background
- no embedded text or speech bubble
- 2 MiB or smaller recommended

Replace the file only with an image you have the right to distribute. The extension validates configured PNG and JPEG signatures before encoding images for OMP's image component.

## Development

```sh
bun install
bun run check
bun test
bun run build
```

To work from a local checkout:

```sh
git clone https://github.com/azyu/omp-advisor-companion
cd omp-advisor-companion
bun install
omp plugin link .
```

`omp plugin link .` creates a user-global development symlink. Source changes require an OMP restart.

For project-only development, add the checkout path to the consuming project's `.omp/settings.json` instead of linking it globally:

```json
{
  "extensions": [
    "/absolute/path/to/omp-advisor-companion"
  ]
}
```

Merge this entry into an existing settings file rather than replacing unrelated settings.

The focused test suite covers:

- exact Advisor command parsing;
- valid and malformed Advisor custom-message extraction;
- controller activation, replacement, clearing, stale-image suppression, and non-TUI behavior;
- speech-bubble sanitization, wrapping, severity labels, configurable caps, and width limits.

Project layout:

```text
src/
├── index.ts           # OMP extension, settings, state, and widget lifecycle
├── advisor-events.ts  # Advisor commands, note types, and message parsing
└── panel-view.ts      # Bounded image and speech-bubble component
```

## Upgrade

To update an existing GitHub installation, run the repository install command:

```sh
omp plugin install github:azyu/omp-advisor-companion
```

On OMP 18.1.4 this completed successfully with `✔ Installed omp-advisor-companion@0.1.0` and preserved the existing plugin settings, including `imagePath`. The `omp plugin upgrade omp-advisor-companion` command is not the working upgrade path for this installation.

Restart OMP after updating. `/reload-plugins` does not re-import extension factories in the running process.

## Uninstall

```sh
omp plugin uninstall omp-advisor-companion
```

## Disclaimer

- The bundled placeholder image (`assets/advisor.png`) was generated with AI.

## Acknowledgements

- [Oh My Pi](https://github.com/can1357/oh-my-pi) provides the extension API, the Advisor runtime, and the terminal image renderer.
