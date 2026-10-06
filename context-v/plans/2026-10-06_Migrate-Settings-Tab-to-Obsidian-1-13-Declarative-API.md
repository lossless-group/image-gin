---
title: "Plan — Migrate Image Gin's Settings Tab to Obsidian 1.13's Declarative Settings API"
lede: "Half of Image Gin's settings silently vanished in Obsidian 1.14, and none were searchable. Rebuilding the tab on Obsidian's declarative API fixes both."
summary: "Execution plan for 0.3.0: replace the imperative display() settings tab with getSettingDefinitions(), raise minAppVersion to 1.13.0, bump the plugin to 0.3.0 across manifest/package/versions.json, drop the dead imageStylesJSON editor that crashed rendering, and guard it all with a settings-definition test suite. Written before implementation; status moves to Shipped when 0.3.0 is committed."
publish: true
date_created: 2026-10-06
date_modified: 2026-10-06
date_authored_initial_draft: 2026-10-06
date_authored_current_draft: 2026-10-06
date_authored_final_draft:
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5.5
at_semantic_version: 0.0.0.1
site_uuid: ffea67be-36cb-44cc-a656-9d1be9e79efb
hex_code: d8286t
status: Implementing
tags:
  - Plan
  - Obsidian-Plugin
  - Settings
  - Obsidian-1-13
  - Release-0-3-0
---

# Plan — Migrate Image Gin's Settings Tab to Obsidian 1.13's Declarative Settings API

## Why Care?

On Obsidian 1.14, Image Gin's settings tab drew the Recraft section and the size presets, then stopped at "Style presets". Everything after that point was gone: ImageKit, Magnific, Ideogram, the image cache, the drop gate, and Imgur. Nobody could change the ImageKit upload folder, because the setting wasn't on screen.

Separately, Obsidian 1.13 introduced settings search that only indexes plugins using its new **declarative settings API**. Image Gin's tab predates it, so none of its settings show up in search. For a marketplace plugin with roughly sixty settings, that matters.

Both problems share a root cause: a 1,100-line hand-written `display()` that draws the tab one element at a time. If any one line throws, every section after it disappears without a message.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Settings API | `getSettingDefinitions()` (Obsidian ≥ 1.13), no `display()` override | Obsidian renders and indexes the tab. One bad row can no longer take down the rest. |
| `minAppVersion` | `1.8.10` → **`1.13.0`** | Keeping a parallel imperative tab for pre-1.13 users doubles the surface for little benefit. Obsidian moved to 1.13+ months ago. |
| Plugin version | `0.2.3` → **`0.3.0`** | A minor bump: raising the minimum app version is a compatibility break. Obsidian requires strict 3-part semver, kept identical in `manifest.json`, `package.json`, and `versions.json`. |
| `obsidian` dev dependency | `latest` (locked at 1.12.3) → **`1.13.1`**, pinned | The 1.12 types don't declare the API. Pinned so the lockfile can't drift silently. |
| "Style presets" JSON editor (`imageStylesJSON`) | **Removed from the UI.** The key stays in settings so old `data.json` files still load. | Generation stopped reading it in the V4.1 work, and it is the row that crashed the tab. |
| V3 curated style | New dropdowns for `style.presetStyle.base` / `.substyle` | It is what V3 sends but never had any UI. |
| Nested keys (`imageKit.uploadFolder`) | Override `getControlValue` / `setControlValue` with dot-path get/set, then `saveSettings()` | The defaults only read top-level keys of `plugin.settings`. |
| Size presets | `type: 'list'` with `addItem` / `onDelete` | The framework's built-in add/remove affordance for mutable collections. |
| Buttons (Create style, Clear cache) | `render` rows | Imperative escape hatch for anything that isn't a bound control. |

## Shape of the new tab

Groups, in order, each with a heading:

1. **Recraft image generation**: API key, model, custom style ID, style reference URLs, Create style (render), style match, V3 preset style + substyle, brand colors, background color, share seed, image format, base URL, image output folder (`folder` control)
2. **Image size presets** (`list`): label, YAML key, width, height per preset; add/delete
3. **ImageKit CDN upload & hosting**: enable, then the remaining rows `visible` only when enabled; upload folder documents `{YYYY}/{MM}/{DD}`
4. **Magnific image search**
5. **Ideogram image generation**: enable, API key, brand template prefix/suffix/negative prompt, defaults, layerize
6. **Image cache**: including Clear cache (render)
7. **Drag-drop / paste confirmation gate**
8. **Imgur (public CDN)**

## Verification

`tests/settings-definitions.test.ts` (written before the implementation):

- Every setting name in today's tab appears in the definitions, except the deliberately removed "Style presets" JSON editor.
- Every `control.key` resolves through `getControlValue` to the same value as the dot-path into `plugin.settings`.
- `setControlValue('imageKit.uploadFolder', …)` writes the nested value and calls `saveSettings()`.
- Every item has a non-empty `name` (search needs it), and no group is empty.
- `ImageGinSettingTab` does not override `display()`.

Plus `pnpm test`, `tsc`, ESLint with **0 errors and 0 warnings** (the `prefer-setting-definitions` warning is the one this plan exists to clear), and the production bundle.

**Human walk-through after restart:** search "ImageKit" in Settings, confirm the upload folder row appears, and set it to `/Image-Gin/{YYYY}-{MM}`.

## Sequence

1. Pin `obsidian@1.13.1`; confirm the existing build still passes.
2. Write the definitions test suite (red).
3. Rewrite `ImageGinSettingTab` to make it green (subagent, reviewed).
4. Bump to 0.3.0 with `minAppVersion` 1.13.0; README minimum-version note.
5. Changelog entry and `changelog/releases/0.3.0.md`.
6. Commit per step.

## Related

- [[Recraft-Generation-Froze-Obsidian-and-the-V4-1-Upgrade]]: the session that surfaced this
- [[2026-05-10_Final-ObsidianReviewBot-Cleanup-Round]]: the marketplace lint rules that still apply
