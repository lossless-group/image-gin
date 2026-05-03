# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Image Gin is an Obsidian plugin (TypeScript, `isDesktopOnly: true`) that generates AI images via Recraft, searches stock images via Freepik, and uploads/converts local images to ImageKit CDN — all driven from modals invoked by Obsidian commands.

## Commands

Package manager: **pnpm** (required — see `.npmrc`).

- `pnpm dev` — esbuild watch mode; rebuilds `main.js` + `styles.css` on change.
- `pnpm build` — type-check (`tsc -noEmit -skipLibCheck`) then production esbuild. Type errors fail the build.
- `pnpm setup` — runs `setup-plugin.mjs` to scaffold a new plugin from `plugin-config.yaml` (only relevant when forking this as a starter).
- `pnpm version` — bumps `manifest.json`/`versions.json` via `version-bump.mjs`.

There are **no tests** and **no lint script** in `package.json`, even though ESLint is configured (`.eslintrc`). Invoke ESLint directly (`pnpm exec eslint .`) if you need to lint.

To live-test in an Obsidian vault, symlink the repo into `<vault>/.obsidian/plugins/` (see README).

## Architecture

### Entry point lives at the repo root, not in `src/`

`main.ts` (root) is the Obsidian `Plugin` subclass. It only does three things in `onload()`: load settings, register the `ImageGinSettingTab`, and register four commands. Each command's callback simply opens one of the modals from `src/modals/`. **All real logic lives in modals and services** — `main.ts` should stay thin.

esbuild's entry point is `main.ts` at root; `tsconfig.json` is `noEmit` (esbuild produces the bundle, `tsc` only type-checks).

### Layered structure

```
main.ts                     Plugin shell, command registration
src/modals/                 UI — one Modal per command
src/services/               External API wrappers (Recraft, ImageKit, Freepik) + ImageCacheService
src/settings/settings.ts    All settings types + DEFAULT_SETTINGS + SettingTab UI (large, ~660 lines)
src/utils/                  yamlFrontmatter (regex-based), logger (singleton FileLogger)
src/types/                  Shared types + Obsidian module augmentation
src/styles/                 CSS (bundled separately into styles.css)
```

Modals receive `(app, plugin)` and reach into `plugin.settings` directly; services are constructed per-modal-action with the current settings snapshot.

### Settings shape

All settings are one flat object `ImageGinSettings` (see `src/settings/settings.ts`) with nested sub-objects per integration: `imageKit`, `freepik`, `imageCache`, `style`. `DEFAULT_SETTINGS` is the source of truth — `loadSettings()` merges loaded data on top. When adding a new field, update both the interface and `DEFAULT_SETTINGS`.

The Settings tab also re-imports `ImageCacheService` lazily (dynamic `import()`) for the "Clear Cache" button — keep that pattern if adding similar admin actions to avoid eager-loading services into the settings UI.

## Conventions specific to this codebase

- **HTTP: use Obsidian's `requestUrl`, not `fetch`.** All services do this. Obsidian's environment lacks browser `fetch` semantics for CORS/CSP, and `FormData` is unavailable — `imagekitService.ts` builds multipart bodies manually with a hand-rolled boundary. Follow that pattern for any new uploads.
- **YAML frontmatter is parsed by hand with regex** in `src/utils/yamlFrontmatter.ts` — no `js-yaml` or similar dependency. Do not add a YAML library; extend the existing parser if needed.
- **Build externals**: `esbuild.config.mjs` externalizes `obsidian`, `electron`, all `@codemirror/*`, all `@lezer/*`, and Node builtins. Anything you import from those will resolve at runtime in Obsidian — do not try to bundle them.
- **CSS is built separately**: `src/styles/current-file-modal.css` is the CSS entry point; esbuild emits `styles.css` at the repo root (which Obsidian loads). New stylesheets must be `@import`ed from there to ship.
- **TypeScript is very strict**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables` are all on. Prefer `null` over `undefined` for optional state (see `StyleSettings.customStyleId`). The build will fail on unused locals/params.
- **Obsidian module augmentation** lives in `src/types/obsidian.d.ts` — extend it there rather than casting to `any` when Obsidian's public types are missing something.

## Working with this repo (from `.windsurfrules.md`)

The previous AI-collaboration rules emphasize:
- Don't introduce new dependencies — propose them in chat first.
- Don't create config files or rename things on your own initiative; this project has established locations and naming. Search before creating.
- Make incremental, targeted changes; do not "rewrite from scratch" or do broad refactors without explicit approval.
- Use the exact library versions pinned in `package.json`.
