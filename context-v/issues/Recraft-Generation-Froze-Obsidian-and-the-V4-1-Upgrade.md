---
title: "Issue: Recraft Generation Froze Obsidian, and the V4.1 Upgrade"
lede: "Recraft billed 40 credits and returned an image, then Obsidian locked up before saving it. The fix also moves Image Gin onto Recraft V4.1."
summary: "Debugging log and fix record for the 2026-10-06 freeze in the Recraft 'Generate images for current file' command. The API call succeeded and the freeze came after the download. The fix aligns the Recraft service with the Ideogram service's raw-buffer save path and upgrades request building to Recraft's V4.1 / V4 Styles API (ratio sizes, no curated styles, style_id or reference URLs). It closes with a proposal for vault-defined provider recipes in zz-cf-lib/."
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
site_uuid: 3b632f65-be9e-4de4-8d54-57b670ac8df0
hex_code: ojnlk5
tags:
  - Issue
  - Issue-Resolution
  - Recraft
  - Image-Generation
  - Obsidian-Plugin
status: Implementing
---

# Issue: Recraft Generation Froze Obsidian, and the V4.1 Upgrade

## Why Care?

Image Gin's default command, **Generate images for current file**, calls Recraft. On 2026-10-06 it froze Obsidian hard enough that the app had to be force-quit. The first guess was an unpaid API balance. It wasn't: Recraft accepted the request, charged for it, and returned an image. The failure was entirely on our side, after the network call, so every attempt was spending money and saving nothing.

While investigating, we found the plugin was still pinned to Recraft V3. Recraft had since shipped V4.1 (May 2026, now the API default) and a dedicated V4 Styles line (August 2026), and both reject the parameters we were sending. So this issue covers the freeze and the upgrade together.

## Symptom

- The command ran with all four size presets selected (Banner 2048×1024, Portrait 1024×1820, Square, a custom 2048×1536).
- Obsidian became unresponsive and had to be closed.
- No image appeared in `Visuals/ImageGin/` and no frontmatter keys were written.

## What the log showed

`.obsidian/plugins/image-gin/log.json` in the `lossless` vault:

```
20:31:00.003  Sending request … model recraftv3, size 2048x1024, style digital_illustration / graphic_intensity
20:31:06.607  Received API response in 6604ms
20:31:06.608  Response status: 200
20:31:06.608  API response data: {"created": …, "credits": 40, "data": [{"image_id": "…", "url": "https://img.recraft.ai/…"}]}
20:31:06.608  Downloading image from: "https://img.recraft.ai/…"
              ← nothing after this
```

So:

1. **Billing was not the problem.** HTTP 200, 40 credits charged.
2. The freeze happened **after** the API call, during download or save of the first of four images.
3. The image URL was healthy. Re-fetched with curl: `200 image/webp`, 2,577,558 bytes, 0.49 s.

## Hypothesis log

### H1: Unpaid or empty API balance (ruled out)

The response was a 200 with a `credits` charge. Recraft does reject generation when the balance is empty, but it does so with an error status, not a hang.

### H2: Slow image CDN or hung download (unlikely)

curl pulled the same URL in half a second. `requestUrl` is async and would not block the UI even if it were slow.

### H3: The save path's byte handling (fixed, likely contributor)

The old `recraftImageService.ts` converted the downloaded `ArrayBuffer` to a base64 string with `Buffer`, returned that, then decoded it back with `atob()` and a per-character `charCodeAt` loop into a `Uint8Array` on the renderer's main thread before calling `vault.createBinary`. For a 2.5 MB WebP that is a ~3.4 MB string walked one character at a time, repeated per selected size. The Ideogram service, which works, skips all of this and writes `response.arrayBuffer` straight to the vault.

### H4: Wrong file type (fixed, correctness bug)

Recraft returns **WebP** by default, and V4 vector variants return **SVG**. The old code always named the file `.png`. Obsidian indexing a `.png` whose bytes are WebP is at best wrong and at worst slow to choke on.

### H5: Error branch was dead code (fixed)

`requestUrl` throws on any non-2xx status by default, so the `if (response.status !== 200)` branch that formats Recraft's error body never ran. A 4xx from an invalid size or style surfaced as a generic Obsidian request error, not Recraft's explanation. Now uses `throw: false`, matching the Ideogram and Magnific services.

> **Not yet confirmed:** the exact line that froze. If it recurs, open devtools (Cmd+Opt+I) *before* running, then press pause in the Sources tab during the freeze to capture the stack, and append it here as H6.

## The Recraft V4.1 / V4 Styles API changes that matter

From [Recraft's API reference](https://www.recraft.ai/docs/api-reference/getting-started), read 2026-10-06:

| | V2 / V3 (what we sent) | V4.1 / V4 Styles |
|---|---|---|
| Default model | `recraftv3` | `recraftv4_1` (the API default when `model` is omitted) |
| Curated `style` + `substyle` | Supported | **Rejected.** "Not supported by V4.1: `negative_prompt`, `style` (curated styles), `text_layout`" |
| Custom style | `style_id` | `style_id` **or** `style_reference_urls` (1–10 images), plus `style_match: flexible \| precise` |
| Style binding | | A style only works with the model it was created for |
| `size` | Exact pixels from the V3 table | Aspect ratio `w:h` (works on every model, Recraft says prefer it) or exact pixels from **that model's** table, "any other value is rejected" |
| Output | | WebP default, `image_format: png` optional; `_vector` variants return SVG |
| Prompt cap | 1,000 chars | 10,000 chars |
| Price | | $0.035 standard, $0.21 Pro (2K), $0.007 Flash |

Our presets would break on V4.1 as exact pixels: `2048x1024` is a V3 size; V4.1's 1K equivalent for 2:1 is `1536x768`, and Pro's is `3072x1536`.

## The fix (shipped to `development`, pending in-vault verification)

**`src/services/recraftImageService.ts`**

- `RECRAFT_MODELS`: the current lineup (V4.1, Pro, Utility, Flash, Vector, V4 Styles variants, V3/V2 as legacy).
- `toRecraftSize(width, height)`: snaps every size preset to the nearest of Recraft's 14 supported ratios and sends `size: "w:h"`. One set of presets now works across 1K, 2K, V3, and vector models.
- `buildStyleParams()`: model-aware.
  - V2/V3: curated `style`/`substyle` or `style_id` (unchanged behavior).
  - V4/V4.1: `style_id` if set, else `style_reference_urls`, else no style.
  - Flash: no style.
  - V4 Styles: throws a clear error **before any credits are spent** when no style is configured.
- Downloads bytes as an `ArrayBuffer` and writes them directly (the Ideogram pattern). No base64 round trip.
- File extension comes from the response `content-type`, falling back to magic bytes.
- Captures the `style_id` Recraft returns when references are attached, so it can be reused without the $0.005 style-creation charge.
- Logs credits charged and download size/time, so the next failure points at its step.

**`src/settings/settings.ts`**

- Default model is now `recraftv4_1`. Existing vaults keep their saved choice (the `lossless` vault is on `recraftv3`) until it's changed in settings.
- New settings: **Custom style ID** (there was previously no UI for it), **Style reference URLs**, and **Style match**.

**`src/modals/CurrentFileModal.ts`**

- Shows the active model and which style source it will use.
- Delegates style resolution to the service. Removes the old fallback that read the first `id` out of `imageStylesJSON`.

## Verification checklist

- [ ] In settings, switch the model to **V4.1** and select only **Banner**. Run. Expect a `.webp` in `Visuals/ImageGin/` and a `banner_image` frontmatter key.
- [ ] Try **V4.1 Flash** ($0.007) for cheap iteration.
- [ ] Confirm the log shows `Recraft responded HTTP 200`, `credits`, `Downloaded … bytes`, and `Saved Recraft image`.
- [ ] Pick **V4 Styles** with no style set. Expect an immediate notice and no charge.

## Follow-on: provider recipes in the vault (`zz-cf-lib/`)

Recraft and Ideogram are two of a fast-growing field of image providers. Hard-coding a service class per provider means every API revision, like this one, becomes a plugin release.

Perplexed already set the precedent of a vault-side library folder. `zz-cf-lib/` holds `templates/`, `partials/`, and `preambles/` that the plugin reads at runtime, with bundled fallbacks when a file is missing. Image Gin could follow suit with `zz-cf-lib/image-providers/<provider>.md`, each file a short doc with a fenced YAML recipe:

```yaml
provider: recraft
endpoint: https://external.api.recraft.ai/v1/images/generations
auth: { header: Authorization, format: "Bearer {{key}}", key_setting: recraft }
body:
  prompt: "{{prompt}}"
  model: recraftv4_1
  size: "{{ratio}}"           # or "{{width}}x{{height}}"
response:
  image_url: data[0].url      # or image_b64: data[0].b64_json
  credits: credits
```

The plugin would supply a generic request runner (`requestUrl`, `throw: false`, token substitution, a JSON-path pick, and the raw-buffer save path above). API keys would stay in plugin settings, keyed by name, never in the vault. A new or revised provider would become a markdown edit instead of a release.

Prefer `zz-cf-lib/` over `z_utils/`. `z_utils/` holds Templater scripts and templates. `zz-cf-lib/` is already the content-farm plugins' runtime library. This belongs in its own `explorations/` doc before any code.

## Related

- [[Chore-to-Update-All-Dependencies]]
- `src/services/ideogramService.ts`: the reference save path
- Perplexed's `zz-cf-lib/preambles/README.md`: the vault-library precedent
