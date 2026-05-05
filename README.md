![Image Gin Plugin for Obsidian by The Lossless Group](https://i.imgur.com/jp2ME1E.png)
# Image Gin for Obsidian

A powerful Obsidian plugin that brings AI image generation, stock-image search, and CDN upload directly into your Obsidian workflow. Generate visuals from a per-file `image_prompt`, search stock photos, and rewrite local image references to a CDN — all from inside your notes.

## ✨ Features

- **AI Image Generation — two providers**:
  - **Recraft** for custom-trained brand styles via server-side `style_id`.
  - **Ideogram v3** for per-call style controls (`style_type`, `rendering_speed`, `magic_prompt`) plus optional Layerize-Text post-processing that strips incidental text from generated images.
- **Brand Template prompt wrapping (Ideogram)**: configure a brand-wide prefix, suffix, and base negative prompt in settings; every per-file prompt gets wrapped automatically. Use the `{prompt}` token for slot insertion when the per-file content needs to land mid-sentence.
- **Stock Image Search**: Search and insert stock images via Magnific's API (formerly Freepik).
- **CDN Upload (ImageKit)**: Convert local image references in a single note or across an entire vault folder to ImageKit URLs. Optional WebP conversion and local-file cleanup.
- **Smart Frontmatter Management**: Reads `image_prompt` (and Ideogram-only overrides `image_negative_prompt`, `image_style_type`, `image_seed`) from each note's frontmatter; auto-creates the `image_prompt` key on modal open so the convention is visible to first-time users; writes generated image paths back under per-size keys (`banner_image`, `portrait_image`, `square_image`).
- **Modal UX polish**: master "All" toggle on the size selector, two-way sync with individual size toggles, and last-session persistence so your selected sizes and per-call overrides restore on the next open.
- **Image Cache**: Local cache for external images to bypass Obsidian's CSP restrictions and enable offline viewing. Configurable cap, auto-cleanup, and a Clear Cache button.

### Modals

1. **Generate Images for Current File (Recraft)** — generate from an `image_prompt` in the file's frontmatter, with style / substyle settings and per-size selection.
![Image Gin Demo Gif: Image Generation from Image Prompt Demo](https://i.imgur.com/12WhBJg.gif)

2. **Generate Images (Ideogram)** — generate via Ideogram v3 with brand-template prompt wrapping, per-call style/speed/magic-prompt overrides, a live Resolved Prompt Preview, and optional Layerize-Text post-processing.

3. **Convert Local Images to Remote Images** — upload local image references in the active note to ImageKit and rewrite the links.
![Image Gin Demo GIF: Convert Locally Stored Images to a Remote Image Delivery Service URL with ImageKit](https://i.imgur.com/HfytkK3.gif)

4. **Batch Convert Directory Images to Remote** — same as above but scans every file in the active note's directory.
![Image Gin Demo GIF: Batch Convert Locally Stored Images to a Remote Image Delivery Service URL with ImageKit](https://imgur.com/sxKzo97)

5. **Search Magnific Images** — search Magnific's stock-image API and insert results into your notes.
![Image Gin Image Selector: Magnific Image Search](https://i.imgur.com/IvhIL2F.png)

### Settings

![Image Gin Demo GIF: Settings Page for Image Gin](https://i.imgur.com/snCuXt6.gif)

# Releases

**0.1.1** — 2026-05-03
- Added Ideogram v3 as a second AI generation provider.
- Brand Template prompt wrapping (prefix / suffix / base negative prompt) with bookend and `{prompt}`-slot-insertion modes.
- Master "All" toggle on the Image Sizes selector with two-way sync to individual toggles (both modals).
- Last-session UI state persistence across modal opens.
- Auto-creation of `image_prompt` frontmatter key on modal open.
- Live Resolved Prompt Preview in the Ideogram modal showing the fully assembled prompt before generate.

**0.1.0** — 2026-05-03
- Marketplace-readiness pass: ESLint flat config wired into the build, eliminated all `any` usage, replaced `innerHTML` with Obsidian DOM API, routed all `console.*` calls through a persistent `FileLogger`, replaced the hand-rolled YAML parser with Obsidian's `metadataCache` + `processFrontMatter` APIs.

**0.0.9** — 2025-09-14
- Batch convert local images found in any file in a directory to a remote image service URL (ImageKit).

# 🚀 Getting Started

### Prerequisites
- [Obsidian](https://obsidian.md) (v1.8.10 or later)
- Node.js (v18 or later)
- pnpm (recommended) or npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/lossless-group/image-gin-plugin.git
   cd image-gin-plugin
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the plugin:
   ```bash
   pnpm build
   ```

4. For development with hot-reloading:
   ```bash
   pnpm dev
   ```

## 🛠️ Configuration

Each integration is independently toggleable. Enable only the ones you need.

1. (Optional) Recraft — get an API key at [recraft.ai](https://recraft.ai) for AI image generation with custom-trained brand styles.
2. (Optional) Ideogram — get an API key at [ideogram.ai](https://ideogram.ai) for AI image generation with per-call style controls and Layerize-Text post-processing.
3. (Optional) Magnific — get an API key from the [Magnific developer dashboard](https://www.magnific.com/developers/dashboard/api-key) for stock-image search.
4. (Optional) ImageKit — get a public/private key pair from the [ImageKit dashboard](https://imagekit.io) for CDN upload and WebP conversion.
5. Open Obsidian, go to Settings → Community Plugins, find "Image Gin" in the list, and enable it.
6. Click the gear icon to configure your API keys, output folder, image-size presets, and (for Ideogram) your Brand Template prefix/suffix/base-negative-prompt.

## 🖼️ Usage

Open the command palette (`Cmd/Ctrl+P`) and search for any of:

- **Image Gin: Generate Images for Current File** — generates AI images via **Recraft** from an `image_prompt` field in the active note's frontmatter, using the style configured in settings.
- **Image Gin: Generate Images (Ideogram)** — generates AI images via **Ideogram v3**, wrapping the per-file prompt with your configured Brand Template. Per-call dropdowns for style type, rendering speed, and magic-prompt mode; optional Layerize-Text post-processing to strip incidental text.
- **Image Gin: Search Magnific Images** — opens a stock-image search modal; clicking a result inserts the image as markdown at the cursor.
- **Image Gin: Convert Local Images to Remote Images** — uploads local image references in the active note to ImageKit and rewrites the links.
- **Image Gin: Batch Convert Directory Images to Remote** — same as above but scans every file in the active note's directory.

### Frontmatter contract

Image Gin reads from and writes to a small set of keys in your note's frontmatter:

| Key | Read by | Written by | Effect |
|---|---|---|---|
| `image_prompt` | Recraft + Ideogram | Recraft + Ideogram (when "Write to frontmatter" is on) | Subject-matter prompt; auto-created as `""` on modal open if missing |
| `image_negative_prompt` | Ideogram only | never | Appended to the brand-wide base negative prompt |
| `image_style_type` | Ideogram only | never | Overrides the default `style_type` for this file |
| `image_seed` | Ideogram only | never | Pins the seed for reproducibility |
| `<sizeId>_image` (e.g. `banner_image`) | — | both | Path to the generated image for each selected size |

## 📝 License

This project is open source and available under the [The Unlicense](https://unlicense.org).

## Getting Started

If you want to use the `setup-plugin.mjs` script, fill out `plugin-config.yaml` and then make it an executable file. 

```bash
chmod +x setup-plugin.mjs
```

When run, it will create the basic metadata and fill in the template variables.  If you don't need it, just delete it and happy hacking.

Run the script with 

```bash
node setup-plugin.mjs
```


```
pnpm install
pnpm add -D esbuild @types/node builtin-modules
pnpm build
pnpm dev
```

## Using Symbolic Links to Test Your Plugin

If you're like us, you have a directory housing all your code projects. To use your plugin as you develop it, create a symbolic link from your dev checkout into your vault's `.obsidian/plugins/` directory. The destination folder name must match the plugin id from `manifest.json` (`image-gin`):

```bash
ln -s /Users/mpstaton/code/lossless-monorepo/image-gin /Users/mpstaton/content-md/lossless/.obsidian/plugins/image-gin
```

Adjust both paths for your own filesystem. After linking, run `pnpm dev` in the dev checkout — esbuild will watch for changes; reload the plugin in Obsidian (toggle off/on in Community Plugins) to pick up new builds.
