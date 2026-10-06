![Image Gin Plugin for Obsidian by The Lossless Group](https://i.imgur.com/jp2ME1E.png)
# Image Gin for Obsidian

**Write an `image_prompt` in your note's frontmatter and get a matched set of banner, portrait, and square images in your own house style. Then decide, image by image, where every picture in your vault lives: on your disk, on your own CDN, or on a public host.**

Image Gin brings AI image generation (Recraft and Ideogram), stock-image search, and CDN hosting into Obsidian, and puts a checkpoint in front of every image you drag or paste into a note.

> **New in 0.3.0:** Recraft V4.1, house styles you build from images already in your vault, a fully searchable settings tab, and ImageKit folders that roll over by month. Requires Obsidian 1.13 or later. [Release notes →](changelog/releases/0.3.0.md)

- [Why Image Gin?](#why-image-gin)
- [Features](#-features)
- [Install](#-install)
- [Configuration](#️-configuration)
- [Usage](#️-usage)
- [Releases](#releases)
- [Development](#-development)

## Why Image Gin?

If you publish from Obsidian, every note wants share images: an OpenGraph banner, a tall card for iMessage and WhatsApp, a square for social. Generating them is easy now. Generating them so a whole site looks like **one** illustrator drew it is not, and neither is keeping track of where all those images end up.

Image Gin handles both halves:

- **Make images that belong together.** One prompt, every size you need, all in a style you define once.
- **Control where images go.** Client screenshots stay on your disk. Images that need a URL go to your own private CDN. Only what you choose goes anywhere public.

## ✨ Features

### Generate images from your notes

- **Two providers.**
  - **Recraft**, including V4.1, Pro (2K), Flash ($0.007 an image), Vector (editable SVG), V4 Styles, and V3, for illustration in a consistent house style.
  - **Ideogram v3**, for per-call style controls and accurate in-image text, with optional Layerize-Text cleanup.
- **Every size at once.** Banner, portrait, square, plus any custom size you add (for example a tall `banner_image_taller` for messaging apps). Paths are written back to frontmatter, one key per size.
- **Prompts live in frontmatter** (`image_prompt`), so they travel with the note and can be revised and rerun.

### Keep every image in one house style

- **Recraft styles from your own images.** Point Image Gin at 2–10 images you like (files in your vault work; no hosting needed), click **Create style**, and every later image follows that style's technique, colors, and texture.
- **Brand colors and background color** keep the palette steady.
- **One shared seed per run**, so a banner, portrait, and square from the same prompt come out as a family.
- **Ideogram brand template.** A brand-wide prefix, suffix, and negative prompt wrap every prompt, with a `{prompt}` token for mid-sentence insertion.

### Decide where every image goes (Drop Gate)

- **Every image you drag or paste into a note asks first.** It can be saved as a **vault attachment** (private, on your disk), uploaded to your own **ImageKit** CDN, or sent to anonymous **Imgur** for genuinely shareable images.
- Confirm every image, or only while an external destination (ImageKit or Imgur) is enabled; with neither enabled, images save to the vault as Obsidian normally does. Optionally remember your choice for the rest of the session.

### Host and convert

- **Convert a note's local images to ImageKit URLs** in one command: frontmatter images, including custom sizes, plus `![[embeds]]` in the body. Or batch-convert a whole folder.
- **Dated upload folders.** `/images/{YYYY}-{MM}` files each upload under its own month.
- Optional WebP conversion and local-file cleanup after upload.

### Search stock images

- **Magnific** (formerly Freepik) search, inserting results straight into your note.
- A local **image cache** for external images: works around Obsidian's content security policy, enables offline viewing, and cleans itself up.

### Commands

1. **Generate images for current file** (Recraft): from the note's `image_prompt`, in your configured style, for the sizes you pick.
![Image Gin Demo Gif: Image Generation from Image Prompt Demo](https://i.imgur.com/12WhBJg.gif)

2. **Generate images (Ideogram)**: brand-template wrapping, per-call style, speed, and magic-prompt overrides, a live preview of the exact prompt sent, and optional Layerize-Text.

3. **Convert local images to remote images**: upload the active note's local images to ImageKit and rewrite the links.
![Image Gin Demo GIF: Convert Locally Stored Images to a Remote Image Delivery Service URL with ImageKit](https://i.imgur.com/HfytkK3.gif)

4. **Batch convert directory images to remote**: the same, for every note in the active note's folder (body embeds).
![Image Gin Demo GIF: Batch Convert Locally Stored Images to a Remote Image Delivery Service URL with ImageKit](https://imgur.com/sxKzo97)

5. **Search Magnific images**: search stock photos and insert them at the cursor.
![Image Gin Image Selector: Magnific Image Search](https://i.imgur.com/IvhIL2F.png)

6. **Drop gate: reset session-remembered destination**: forget the destination you chose to remember for this session.

## 🚀 Install

**Requires Obsidian 1.13 or later** (desktop only).

In Obsidian: **Settings → Community plugins → Browse → search "Image Gin" → Install → Enable.**

Prefer to install by hand? Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/lossless-group/image-gin/releases/latest) into `<your vault>/.obsidian/plugins/image-gin/`. Every release asset is cryptographically attested to the commit and workflow that built it. Verify before enabling:

```bash
gh attestation verify main.js --repo lossless-group/image-gin
```

## 🛠️ Configuration

Each integration is optional and independent. Enable only what you use. Every setting is searchable from Obsidian's settings search box.

| Integration | What you need | What it unlocks |
|---|---|---|
| **Recraft** | API key from [recraft.ai](https://www.recraft.ai/docs/api-reference/getting-started) | Image generation and house styles |
| **Ideogram** | API key from [ideogram.ai](https://ideogram.ai) | Image generation with brand templates and Layerize-Text |
| **ImageKit** | Public/private key pair from [imagekit.io](https://imagekit.io) | CDN upload, conversion commands, dated folders, WebP |
| **Magnific** | API key from the [Magnific developer dashboard](https://www.magnific.com/developers/dashboard/api-key) | Stock-image search |
| **Imgur** | Client ID from [api.imgur.com](https://api.imgur.com/oauth2/addclient) | Public-host destination in the Drop Gate |

The ImageKit upload folder accepts `{YYYY}`, `{MM}`, and `{DD}`, filled in with the upload date. For example, `/images/{YYYY}-{MM}`.

![Image Gin Demo GIF: Settings Page for Image Gin](https://i.imgur.com/snCuXt6.gif)
*Settings as of 0.2.x. In 0.3.0 the same settings are grouped into searchable sections.*

## 🖼️ Usage

Open the command palette (`Cmd/Ctrl+P`) and type **Image Gin**. Generation commands read the active note's `image_prompt`; if the key doesn't exist yet, Image Gin creates it so you can see where it goes.

### Keeping every image in one house style (Recraft)

Recraft calls a reusable look a **style**. It's built from 1–10 example images, stored in your Recraft account, and referenced by ID. You never have to upload anything on Recraft's website.

1. **Pick your examples.** Choose 2–10 images that have the look you want: your own past illustrations, brand art, or images from any other generator. They can be **files already in your vault**.
2. In **Settings → Image Gin**, set **Model** to **V4 Styles** (or any V4.1 model).
3. List the images in **Style reference URLs**, one per line. Use a vault path (`Visuals/old-banner.jpg`), a pasted embed (`![[old-banner.jpg]]`), or a public URL.
4. Click **Create style** (costs $0.005, once). Image Gin fills in **Custom style ID** for you.
5. Generate as usual. Every image now follows the style.

Good to know:

- **A style only works with the model it was created for.** If you switch models, create the style again, or switch back.
- **Already have a style ID?** Paste it into **Custom style ID** and pick the model it was made with. Recraft V3 styles keep working on **V3 (legacy)**.
- **Keep your example images.** If you lose the style ID, they're the recipe for rebuilding it.
- **No examples yet?** Leave the style empty, add **Brand colors** (hex codes), and keep **Share one seed across sizes** on. Then save your favorite results as the examples for a style.
- Recraft's website doesn't list styles created through the API. They still exist on your account.

### Frontmatter contract

Image Gin reads from and writes to a small set of keys in your note's frontmatter:

| Key | Read by | Written by | Effect |
|---|---|---|---|
| `image_prompt` | Recraft + Ideogram | Recraft + Ideogram (when "Write to frontmatter" is on) | Subject-matter prompt; auto-created as `""` on modal open if missing |
| `image_negative_prompt` | Ideogram only | never | Appended to the brand-wide base negative prompt |
| `image_style_type` | Ideogram only | never | Overrides the default `style_type` for this file |
| `image_seed` | Ideogram only | never | Pins the seed for reproducibility |
| `<size key>` (e.g. `banner_image`) | Convert to remote | Recraft + Ideogram | Path to the generated image for each selected size. Custom sizes use their own key (e.g. `banner_image_taller`); "Convert local images to remote" uploads those too and writes the CDN URL back to the same key |

# Releases

**0.3.0** — 2026-10-06 · requires Obsidian 1.13
- Recraft V4.1 and the full current model lineup, including V4 Styles.
- House styles: build a Recraft style from images in your vault with one click. Brand colors, background color, and one shared seed per run keep a set consistent.
- Settings rebuilt on Obsidian's declarative API. Every setting is searchable, and this fixes the Obsidian 1.14 bug that hid half the settings tab.
- ImageKit upload folders accept `{YYYY}`, `{MM}`, `{DD}`.
- Fixed:
  - Recraft generation freezing Obsidian
  - custom size keys (e.g. `banner_image_taller`) skipped by "Convert local images to remote"
  - every image saved as `.png`
- Full notes: [`changelog/releases/0.3.0.md`](changelog/releases/0.3.0.md).

**0.2.3** — 2026-05-18
- Every release asset (`main.js`, `manifest.json`, `styles.css`) is cryptographically attested to the commit and workflow run that built it. [Notes](changelog/releases/0.2.3.md)

**0.2.2** — 2026-05-17
- Every image asks where it goes. A fresh build of the Drop Gate release with the marketplace-lint fixes. [Notes](changelog/releases/0.2.2.md)

**0.2.1** — 2026-05-10
- Obsidian review-bot lint cleanup for the community directory submission.

**0.2.0** — 2026-05-09
- **Drop Gate:** a confirmation modal for every image dragged or pasted into a note, with vault, ImageKit, and Imgur destinations.

**0.1.1** — 2026-05-03
- Ideogram v3 as a second AI generation provider.
- Brand Template prompt wrapping (prefix / suffix / base negative prompt) with bookend and `{prompt}`-slot-insertion modes.
- Master "All" toggle on the image-size selector, synced both ways with the individual toggles.
- Last-session UI state persistence across modal opens.
- `image_prompt` frontmatter key auto-created on modal open.
- Live resolved-prompt preview in the Ideogram modal.

**0.1.0** — 2026-05-03
- Marketplace-readiness pass:
  - ESLint flat config wired into the build
  - no `any`
  - Obsidian DOM API instead of `innerHTML`
  - a persistent `FileLogger`
  - Obsidian's `metadataCache` + `processFrontMatter` instead of a hand-rolled YAML parser

**0.0.9** — 2025-09-14
- Batch convert local images across a folder to ImageKit URLs.

## 🧑‍💻 Development

Requires Node.js 22 and pnpm.

```bash
git clone https://github.com/lossless-group/image-gin.git
cd image-gin
pnpm install
pnpm dev      # esbuild watch: rebuilds main.js and styles.css on change
pnpm test     # 54 tests via Node's built-in runner; no API calls, no credits spent
pnpm build    # ESLint (Obsidian's review-bot rules) + tsc + production bundle
```

To use your working copy in a vault, symlink it into the vault's plugins folder. The folder name must be the plugin id, `image-gin`:

```bash
ln -s /path/to/image-gin /path/to/your-vault/.obsidian/plugins/image-gin
```

Then run `pnpm dev`. Reload the plugin to pick up new builds: toggle it off and on in Community plugins, or quit and reopen Obsidian.

**Releasing.** Bump `manifest.json`, `package.json`, and `versions.json` together (three-part semver), write `changelog/releases/<version>.md`, and push a tag with no `v` prefix (for example `0.3.0`). `.github/workflows/release.yml` then builds, attests, and publishes the release with those notes.

Image Gin is part of [The Lossless Group](https://lossless.group)'s plugin family, with [Cite Wide](https://community.obsidian.md/plugins/cite-wide), [Perplexed](https://community.obsidian.md/plugins/perplexed), and [Metafetch](https://community.obsidian.md/plugins/metafetch). Each one installs and works on its own.

## 📝 License

Open source under [The Unlicense](https://unlicense.org). If Image Gin saves you time, [buy us a coffee](https://buymeacoffee.com/losslessgroup).
