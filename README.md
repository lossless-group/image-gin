![Image Gin Plugin for Obsidian by The Lossless Group](https://i.imgur.com/jp2ME1E.png)
# Image Gin for Obsidian

A powerful Obsidian plugin that brings AI-powered image generation directly to your Obsidian workflow. Seamlessly create and manage images using advanced AI models, starting with Recraft's API.

## ✨ Features

- **AI-Powered Image Generation**: Create stunning visuals directly from your notes using Recraft's AI models
- **Stock Image Selection**: Seamlessly generate images using Freepik's API
- **Seamless Integration**: Works natively within Obsidian's interface
- **Flexible Image Types**: Generate both banner and portrait images with custom dimensions
- **Smart Frontmatter Management**: Automatically updates your note's frontmatter with generated image URLs
- **Customizable Prompts**: Fine-tune image generation with custom styles and parameters

### Modals

1. Generate images from an image prompt in your YAML frontmatter.
![Image Gin Demo Gif: Image Generation from Image Prompt Demo](https://i.imgur.com/12WhBJg.gif)

2. Convert local images in a file to a remote image service url (only supports ImageKit).
![Image Gin Demo GIF: Convert Locally Stored Images to a Remote Image Delivery Service URL with ImageKit](https://i.imgur.com/HfytkK3.gif)

3. Batch convert local images found in any file in a directory to a remote image service url (only supports ImageKit).
![Image Gin Demo GIF: Batch Convert Locally Stored Images to a Remote Image Delivery Service URL with ImageKit](https://imgur.com/sxKzo97)

4. Magnific Image Search: Search for images using Magnific's API and insert them into your notes.
![Image Gin Image Selector: Magnific Image Search](https://i.imgur.com/IvhIL2F.png)

### Settings

![Image Gin Demo GIF: Settings Page for Image Gin](https://i.imgur.com/snCuXt6.gif)

# Releases:
0.0.9: September 14, 2025 
- Batch convert local images found in any file in a directory to a remote image service url (only supports ImageKit).

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

1. Get your Recraft API key from [Recraft's website](https://recraft.ai)
2. Get your Freepik API key from [Freepik's website](https://www.freepik.com)
3. Get your ImageKit API key from [ImageKit's website](https://imagekit.io)
3. Open Obsidian and navigate to Settings > Community Plugins
4. Find "Image Gin" in the list and enable it
5. Click on the gear icon to configure your API keys and default settings

## 🖼️ Usage

1. Open a note where you want to generate an image
2. Use the command palette (`Cmd/Ctrl+P`) and search for "Generate Image"
3. Enter your image prompt and adjust settings as needed
4. Click "Generate" and watch your image come to life

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

## Packages, Dependencies, Libraries:

```json
"devDependencies": {
   "@types/node": "^24.0.12",
   "@typescript-eslint/eslint-plugin": "8.36.0",
   "@typescript-eslint/parser": "8.36.0",
   "builtin-modules": "5.0.0",
   "esbuild": "0.25.6",
   "eslint": "^9.30.1",
   "obsidian": "latest",
   "tslib": "2.8.1",
   "typescript": "5.8.3"
},
"dependencies": {
   "@modelcontextprotocol/sdk": "^1.15.0",
   "fastify": "^5.4.0",
   "zod": "^4.0.0"
}
```

## Using Symbolic Links to Test Your Plugin

If you're like us, you have a directory housing all your code projects. To use your plugin as you develop it, just create a symbolic link. Here is my example, but you will need to use your own path structure:

```bash
ln -s /Users/mpstaton/code/lossless-monorepo/obsidian-plugin-starter /Users/mpstaton/content-md/lossless/.obsidian/plugins/
```
