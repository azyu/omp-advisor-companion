# Agent Instructions

## Definition of Done and commits

- Treat a task as complete only when every requested behavior and acceptance criterion is implemented.
- Before declaring the task done, run the applicable focused tests, type checks, builds, and smoke checks. Report checks that cannot run and why.
- Create a commit after the Definition of Done is satisfied and all applicable checks pass.
- Do not commit incomplete work, failing checks, unrelated user changes, or generated artifacts.
- Keep the commit focused on the completed task and use a concise imperative commit message.

## Project-specific non-obvious invariants

- OMP 18.0.7 extension widgets support only `aboveEditor` and `belowEditor`; do not describe an above-editor right-aligned group as a true dock or reserve editor width. Passive UI must not use `custom` overlays because overlays take focus.
- `pi-tui` direct Kitty image output is a self-contained contiguous block: preserve every placement row byte-for-byte and never prefix alignment spaces. Layout order may place the untouched block after the bubble.
- Advisor TUI smoke checks must inject a note after startup and verify the companion bubble plus image, not merely the built-in Advisor note/HUD output.
