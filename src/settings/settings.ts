import { logger } from '../utils/logger';
import type { ImageSize } from '../types';
import type { App, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { PluginSettingTab, Notice } from 'obsidian';
import type ImageGinPlugin from '../../main';
import { RECRAFT_MODELS, RecraftImageService } from '../services/recraftImageService';
import type { RecraftStyleMatch } from '../services/recraftImageService';

export type BaseStyle = 'realistic_image' | 'digital_illustration' | 'vector_illustration' | 'icon';

export interface StyleOption {
    id: string;
    label: string;
}

export interface StyleGroup {
    label: string;
    substyles: StyleOption[];
}

export const STYLE_OPTIONS: Record<string, StyleGroup> = {
    realistic_image: {
        label: 'Realistic Image',
        substyles: [
            { id: 'b_and_w', label: 'Black & White' },
            { id: 'enterprise', label: 'Enterprise' },
            { id: 'natural_light', label: 'Natural Light' },
            { id: 'studio_portrait', label: 'Studio Portrait' }
        ]
    },
    digital_illustration: {
        label: 'Digital Illustration',
        substyles: [
            { id: '2d_art_poster', label: '2D Art Poster' },
            { id: 'graphic_intensity', label: 'Graphic Intensity' },
            { id: 'hand_drawn', label: 'Hand Drawn' },
            { id: 'pixel_art', label: 'Pixel Art' }
        ]
    },
    vector_illustration: {
        label: 'Vector Illustration',
        substyles: [
            { id: 'line_art', label: 'Line Art' },
            { id: 'flat', label: 'Flat Design' },
            { id: 'isometric', label: 'Isometric' }
        ]
    },
    icon: {
        label: 'Icon',
        substyles: [
            { id: 'outline', label: 'Outline' },
            { id: 'filled', label: 'Filled' },
            { id: 'color', label: 'Color' }
        ]
    }
};

export const DEFAULT_IMAGE_SIZES: ImageSize[] = [
    { id: 'banner', yamlKey: 'banner_image', width: 2048, height: 1024, label: 'Banner' },
    { id: 'portrait', yamlKey: 'portrait_image', width: 1024, height: 1820, label: 'Portrait' },
    { id: 'square', yamlKey: 'square_image', width: 1024, height: 1024, label: 'Square' }
];

export interface PresetStyleConfig {
    base: BaseStyle;
    substyle?: string;
}

export interface StyleSettings {
    useCustomStyle: boolean;
    presetStyle: PresetStyleConfig;
    customStyleId: string | null;  // Using null instead of undefined for better type safety
}

export interface ImageKitSettings {
    enabled: boolean;
    publicKey: string;
    privateKey: string;
    urlEndpoint: string;
    uploadEndpoint: string;
    uploadFolder: string;
    removeLocalFiles: boolean;
    convertToWebp: boolean;
}

// Captures the Recraft modal's last-used UI choices so the next open
// restores them. Recraft has no per-call style overrides (style is
// configured in settings), so this is intentionally smaller than
// IdeogramSessionState.
export interface RecraftSessionState {
    selectedSizes: string[];
    writeToFrontmatter: boolean;
}

export interface MagnificSettings {
    enabled: boolean;
    apiKey: string;
    defaultLicense: 'freemium' | 'premium';
    defaultImageCount: number;
}

export type IdeogramRenderingSpeed = 'FLASH' | 'TURBO' | 'DEFAULT' | 'QUALITY';
export type IdeogramStyleType = 'AUTO' | 'GENERAL' | 'REALISTIC' | 'DESIGN' | 'FICTION';
export type IdeogramMagicPrompt = 'AUTO' | 'ON' | 'OFF';

export const IDEOGRAM_RENDERING_SPEEDS: IdeogramRenderingSpeed[] = ['FLASH', 'TURBO', 'DEFAULT', 'QUALITY'];
export const IDEOGRAM_STYLE_TYPES: IdeogramStyleType[] = ['AUTO', 'GENERAL', 'REALISTIC', 'DESIGN', 'FICTION'];
export const IDEOGRAM_MAGIC_PROMPTS: IdeogramMagicPrompt[] = ['AUTO', 'ON', 'OFF'];

export interface IdeogramBrandTemplate {
    prefix: string;
    suffix: string;
    baseNegativePrompt: string;
}

export interface IdeogramDefaults {
    renderingSpeed: IdeogramRenderingSpeed;
    styleType: IdeogramStyleType;
    magicPrompt: IdeogramMagicPrompt;
}

// Captures the modal's last-used choices so the next open feels like
// "where I left off." Stored alongside settings via Obsidian's saveData
// (no separate persistence layer). Per-file content (image_prompt,
// negative_prompt) is intentionally NOT saved here — those live in
// frontmatter and would mislead across files.
export interface IdeogramSessionState {
    selectedSizes: string[];
    styleType: IdeogramStyleType;
    renderingSpeed: IdeogramRenderingSpeed;
    magicPrompt: IdeogramMagicPrompt;
    layerizeText: boolean;
    writeToFrontmatter: boolean;
}

export interface IdeogramSettings {
    enabled: boolean;
    apiKey: string;
    brandTemplate: IdeogramBrandTemplate;
    defaults: IdeogramDefaults;
    layerizeText: boolean;
    lastSession: IdeogramSessionState;
}

export interface ImageCacheSettings {
    enabled: boolean;
    cacheFolder: string;
    maxCacheSize: number; // in MB
    autoCleanup: boolean;
    cleanupDays: number;
}

export interface ImgurSettings {
    enabled: boolean;
    clientId: string;
}

export type DropGatePolicyMode = 'always-confirm' | 'external-only';

export interface DropGateSettings {
    enabled: boolean;
    policyMode: DropGatePolicyMode;
    defaultDestination: 'vault' | 'imagekit' | 'imgur';
    rememberSessionChoice: boolean;
    /**
     * Override folder for drop-gate uploads to ImageKit. When empty, falls
     * back to the main imageKit.uploadFolder. Lets the user route ad-hoc
     * dropped images somewhere different from generated images.
     */
    imageKitFolder: string;
}

export interface ImageGinSettings {
    recraftApiKey: string;
    recraftBaseUrl: string;
    recraftModelChoice: string;
    // V4+ styles: newline-separated reference image URLs (1–10). Ignored
    // when a custom style ID is set, and by V2/V3 and V4.1 Flash.
    recraftStyleReferenceUrls: string;
    // '' leaves the style's stored match value in effect.
    recraftStyleMatch: '' | RecraftStyleMatch;
    // Raster output format. Ignored (and not sent) for vector models.
    recraftImageFormat: 'webp' | 'png';
    // Brand palette sent as controls.colors, e.g. "#fbbf24, #f97316".
    recraftBrandColors: string;
    // Optional single hex sent as controls.background_color.
    recraftBackgroundColor: string;
    // One random_seed shared by every size in a run, so a set stays coherent.
    recraftShareSeedAcrossSizes: boolean;
    imagePromptKey: string;
    imageSizes: ImageSize[];
    defaultBannerSize: string;
    defaultPortraitSize: string;
    retries: number;
    rateLimit: number;
    style: StyleSettings;
    imageStylesJSON: string;
    imageOutputFolder: string;
    imageKit: ImageKitSettings;
    imgur: ImgurSettings;
    magnific: MagnificSettings;
    ideogram: IdeogramSettings;
    imageCache: ImageCacheSettings;
    dropGate: DropGateSettings;
    recraftLastSession: RecraftSessionState;
}

// Default style configuration
export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
    useCustomStyle: false,
    presetStyle: {
        base: 'digital_illustration',
        substyle: 'graphic_intensity'
    },
    customStyleId: null  // Using null instead of undefined
};

export const DEFAULT_SETTINGS: ImageGinSettings = {
    recraftApiKey: '',
    recraftBaseUrl: 'https://external.api.recraft.ai/v1/images/generations',
    recraftModelChoice: 'recraftv4_1',
    recraftStyleReferenceUrls: '',
    recraftStyleMatch: '',
    recraftImageFormat: 'webp',
    recraftBrandColors: '',
    recraftBackgroundColor: '',
    recraftShareSeedAcrossSizes: true,
    imagePromptKey: 'image_prompt',
    imageSizes: [...DEFAULT_IMAGE_SIZES],
    defaultBannerSize: 'banner',
    defaultPortraitSize: 'portrait',
    retries: 3,
    rateLimit: 5, // requests per minute
    style: DEFAULT_STYLE_SETTINGS,
    imageStylesJSON: JSON.stringify(STYLE_OPTIONS, null, 2),
    imageOutputFolder: 'assets/ImageGin',
    imageKit: {
        enabled: false,
        publicKey: '',
        privateKey: '',
        urlEndpoint: 'https://ik.imagekit.io/your-imagekit-id',
        uploadEndpoint: 'https://upload.imagekit.io/api/v1/files/upload',
        uploadFolder: '/uploads/lossless/images',
        removeLocalFiles: false,
        convertToWebp: true,
    },
    magnific: {
        enabled: false,
        apiKey: '',
        defaultLicense: 'freemium',
        defaultImageCount: 10,
    },
    ideogram: {
        enabled: false,
        apiKey: '',
        brandTemplate: {
            prefix: '',
            suffix: '',
            baseNegativePrompt: 'no text, no watermarks, no signatures, no captions',
        },
        defaults: {
            renderingSpeed: 'DEFAULT',
            styleType: 'GENERAL',
            magicPrompt: 'AUTO',
        },
        layerizeText: false,
        lastSession: {
            selectedSizes: [],
            styleType: 'GENERAL',
            renderingSpeed: 'DEFAULT',
            magicPrompt: 'AUTO',
            layerizeText: false,
            writeToFrontmatter: true,
        },
    },
    imageCache: {
        enabled: true,
        // Empty default — resolved at runtime to `${vault.configDir}/plugins/image-gin/cache`.
        // Hardcoding `.obsidian/...` is rejected by the marketplace lint
        // because users can rename their config dir.
        cacheFolder: '',
        maxCacheSize: 100, // 100 MB
        autoCleanup: true,
        cleanupDays: 30,
    },
    imgur: {
        enabled: false,
        clientId: '',
    },
    dropGate: {
        enabled: false,
        policyMode: 'always-confirm',
        defaultDestination: 'vault',
        rememberSessionChoice: true,
        imageKitFolder: '',
    },
    recraftLastSession: {
        selectedSizes: [],
        writeToFrontmatter: true,
    },
};


// ─── Settings tab (Obsidian ≥ 1.13 declarative API) ─────────────────────
//
// Obsidian renders and search-indexes these definitions itself, so one
// broken row can no longer take the rest of the tab down with it (the 0.2.x
// failure mode). Controls bind to dot-path keys into plugin.settings via
// getControlValue / setControlValue below.

/** Bound to the "Custom style ID" row; keeps style.useCustomStyle in sync. */
const CUSTOM_STYLE_ID_KEY = 'style.customStyleId';

/** Toggles that other rows' `visible` predicates depend on. */
const VISIBILITY_KEYS = new Set([
    'imageKit.enabled',
    'magnific.enabled',
    'ideogram.enabled',
    'imageCache.enabled',
    'imageCache.autoCleanup',
    'dropGate.enabled',
    'imgur.enabled',
]);

const VALID_DIMENSIONS = 'Valid widths and heights: 1024, 1280, 1365, 1434, 1536, 1707, 1820, 2048';

function getPath(root: unknown, path: string): unknown {
    let current: unknown = root;
    for (const part of path.split('.')) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function setPath(root: object, path: string, value: unknown): void {
    const parts = path.split('.');
    const last = parts.pop();
    if (last === undefined) return;
    let current = root as Record<string, unknown>;
    for (const part of parts) {
        const next = current[part];
        if (next === null || typeof next !== 'object') {
            const created: Record<string, unknown> = {};
            current[part] = created;
            current = created;
        } else {
            current = next as Record<string, unknown>;
        }
    }
    current[last] = value;
}

function wholeNumberAtLeastOne(value: number): string | undefined {
    return Number.isInteger(value) && value > 0 ? undefined : 'Enter a whole number greater than 0.';
}

function optionsFrom(values: readonly string[]): Record<string, string> {
    return Object.fromEntries(values.map(v => [v, v]));
}

export class ImageGinSettingTab extends PluginSettingTab {
    plugin: ImageGinPlugin;

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getControlValue(key: string): unknown {
        return getPath(this.plugin.settings, key);
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        if (key === CUSTOM_STYLE_ID_KEY) {
            const id = typeof value === 'string' ? value.trim() : '';
            this.plugin.settings.style.customStyleId = id || null;
            this.plugin.settings.style.useCustomStyle = id.length > 0;
        } else {
            setPath(this.plugin.settings, key, value);
        }
        await this.plugin.saveSettings();
        // update() re-collects the definitions and re-evaluates every
        // `visible` predicate, so dependent rows appear or disappear.
        if (VISIBILITY_KEYS.has(key)) this.update();
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const s = this.plugin.settings;
        return [
            { type: 'group', heading: '🎨 Recraft image generation', items: this.recraftItems() },
            {
                type: 'list',
                heading: 'Image size presets',
                emptyState: 'No size presets. Add one to generate images.',
                items: this.sizePresetItems(),
                addItem: {
                    name: 'Add new size',
                    action: () => {
                        s.imageSizes.push({
                            id: `custom-${Date.now()}`,
                            yamlKey: 'custom_image',
                            width: 1024,
                            height: 1024,
                            label: 'New size',
                        });
                        void this.saveAndRebuild();
                    },
                },
                onDelete: (index) => {
                    s.imageSizes.splice(index, 1);
                    void this.saveAndRebuild();
                },
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = s.imageSizes.splice(oldIndex, 1);
                    if (moved) s.imageSizes.splice(newIndex, 0, moved);
                    void this.saveAndRebuild();
                },
            },
            { type: 'group', heading: '☁️ ImageKit CDN upload & hosting', items: this.imageKitItems() },
            { type: 'group', heading: 'Magnific image search', items: this.magnificItems() },
            { type: 'group', heading: '🖼️ Ideogram image generation', items: this.ideogramItems() },
            { type: 'group', heading: 'Image cache', items: this.imageCacheItems() },
            { type: 'group', heading: 'Drag-drop / paste confirmation gate', items: this.dropGateItems() },
            { type: 'group', heading: 'Imgur (public CDN)', items: this.imgurItems() },
        ];
    }

    /** Persist, then rebuild the definitions (structural changes such as list add/delete). */
    private async saveAndRebuild(): Promise<void> {
        await this.plugin.saveSettings();
        this.update();
    }

    private recraftItems(): SettingGroupItem[] {
        const substyleOptions: Record<string, string> = { '': 'None (base style only)' };
        for (const group of Object.values(STYLE_OPTIONS)) {
            for (const sub of group.substyles) substyleOptions[sub.id] = `${group.label}: ${sub.label}`;
        }
        const baseStyleOptions: Record<string, string> = {};
        for (const [id, group] of Object.entries(STYLE_OPTIONS)) baseStyleOptions[id] = group.label;

        return [
            {
                name: 'Recraft API key',
                desc: 'Your Recraft.ai API key for image generation',
                control: { type: 'text', key: 'recraftApiKey', placeholder: 'Enter your API key' },
            },
            {
                name: 'Model',
                desc: 'Select the Recraft model to use for image generation',
                control: {
                    type: 'dropdown',
                    key: 'recraftModelChoice',
                    options: Object.fromEntries(RECRAFT_MODELS.map(m => [m.id, m.label])),
                },
            },
            // V4+ models take a custom style ID or reference images; V2/V3
            // also accept a custom style ID (created for that model).
            {
                name: 'Custom style ID',
                desc: 'A Recraft style ID, which only works with the model it was created for. Leave empty to use reference URLs or the curated preset.',
                control: { type: 'text', key: CUSTOM_STYLE_ID_KEY, placeholder: 'Paste a style ID', defaultValue: '' },
            },
            {
                name: 'Style reference URLs',
                desc: 'V4+ only. One per line (1–10): an image URL, or the path of an image in your vault. Vault images are sent inline, so nothing needs hosting. Generating with these creates a style each time (+$0.005); use the button below to create it once instead.',
                control: { type: 'textarea', key: 'recraftStyleReferenceUrls', placeholder: 'Visuals/reference-1.png', rows: 3 },
            },
            {
                name: 'Create style from references',
                desc: 'Creates a reusable style from the reference URLs above for the selected model, then sets it as the custom style ID. Not available for flash models.',
                render: (setting) => {
                    setting.addButton(button => button
                        .setButtonText('Create style')
                        .onClick(async () => {
                            const urls = this.plugin.settings.recraftStyleReferenceUrls
                                .split('\n')
                                .map(u => u.trim())
                                .filter(Boolean);
                            button.setDisabled(true);
                            try {
                                const service = new RecraftImageService(this.plugin.settings, this.app.vault);
                                const id = await service.createStyle(urls);
                                const styleSettings = this.plugin.settings.style;
                                styleSettings.customStyleId = id;
                                styleSettings.useCustomStyle = true;
                                await this.plugin.saveSettings();
                                // Rebuild so the custom style ID row shows the new value.
                                this.update();
                                new Notice(`Created Recraft style ${id}`);
                            } catch (error) {
                                logger.error('Failed to create Recraft style:', error);
                                new Notice(`Failed to create style: ${error instanceof Error ? error.message : String(error)}`);
                            } finally {
                                button.setDisabled(false);
                            }
                        }));
                },
            },
            {
                name: 'Style match',
                desc: 'V4+ only. How closely to follow the style.',
                control: {
                    type: 'dropdown',
                    key: 'recraftStyleMatch',
                    options: { '': 'Style default', flexible: 'Flexible', precise: 'Precise' },
                },
            },
            {
                name: 'Preset style',
                desc: 'V3/V2 models only. The curated Recraft style used when no custom style ID is set.',
                control: { type: 'dropdown', key: 'style.presetStyle.base', options: baseStyleOptions },
            },
            {
                name: 'Preset substyle',
                desc: 'V3/V2 models only. Pick a substyle that belongs to the preset style above, or none.',
                control: { type: 'dropdown', key: 'style.presetStyle.substyle', options: substyleOptions, defaultValue: '' },
            },
            {
                name: 'Brand colors',
                desc: 'Hex colors Recraft should prefer, separated by commas or new lines. Styles set the technique; this keeps the palette consistent across images.',
                control: { type: 'textarea', key: 'recraftBrandColors', placeholder: 'Amber #fbbf24, orange #f97316, ink #0a0c10', rows: 2 },
            },
            {
                name: 'Background color',
                desc: 'Optional hex color for the image background.',
                control: { type: 'text', key: 'recraftBackgroundColor', placeholder: 'Cream #f6f1e4' },
            },
            {
                name: 'Share one seed across sizes',
                desc: 'Every size in a run uses the same random seed, so the set looks like one family.',
                control: { type: 'toggle', key: 'recraftShareSeedAcrossSizes' },
            },
            {
                name: 'Image format',
                desc: 'Raster output format. Vector models ignore this setting.',
                control: { type: 'dropdown', key: 'recraftImageFormat', options: { webp: 'WebP', png: 'PNG' } },
            },
            {
                name: 'Recraft API base URL',
                desc: 'Recraft API base URL (change only if using custom endpoint)',
                control: { type: 'text', key: 'recraftBaseUrl', placeholder: 'https://external.api.recraft.ai/v1/images/generations' },
            },
            {
                name: 'Image output folder',
                desc: 'Folder path where generated images will be saved. Use absolute path (e.g., /users/username/path) or relative to vault root',
                control: { type: 'folder', key: 'imageOutputFolder', placeholder: 'Assets/ImageGin' },
            },
        ];
    }

    private sizePresetItems(): SettingGroupItem[] {
        return this.plugin.settings.imageSizes.map((size): SettingGroupItem => ({
            name: size.label.trim() || 'Untitled size',
            aliases: [size.yamlKey],
            render: (setting) => {
                setting.setClass('image-size-setting');
                setting.addText(text => text
                    .setPlaceholder('Label')
                    .setValue(size.label)
                    .onChange(async (value) => {
                        size.label = value;
                        await this.plugin.saveSettings();
                    }));
                setting.addText(text => text
                    .setPlaceholder('YAML_key')
                    .setValue(size.yamlKey)
                    .onChange(async (value) => {
                        size.yamlKey = value;
                        await this.plugin.saveSettings();
                    }));
                setting.addText(text => {
                    text.inputEl.title = VALID_DIMENSIONS;
                    text
                        .setPlaceholder('Width')
                        .setValue(size.width.toString())
                        .onChange(async (value) => {
                            const num = parseInt(value, 10);
                            if (!isNaN(num)) {
                                size.width = num;
                                await this.plugin.saveSettings();
                            }
                        });
                });
                setting.addText(text => {
                    text.inputEl.title = VALID_DIMENSIONS;
                    text
                        .setPlaceholder('Height')
                        .setValue(size.height.toString())
                        .onChange(async (value) => {
                            const num = parseInt(value, 10);
                            if (!isNaN(num)) {
                                size.height = num;
                                await this.plugin.saveSettings();
                            }
                        });
                });
            },
        }));
    }

    private imageKitItems(): SettingGroupItem[] {
        const enabled = () => this.plugin.settings.imageKit.enabled;
        return [
            {
                name: 'Enable ImageKit CDN',
                desc: 'Upload generated images to ImageKit CDN for optimized delivery',
                control: { type: 'toggle', key: 'imageKit.enabled' },
            },
            {
                name: 'ImageKit public key',
                desc: 'Your ImageKit public key (found in ImageKit dashboard)',
                visible: enabled,
                control: { type: 'text', key: 'imageKit.publicKey', placeholder: 'Public_key_here' },
            },
            {
                name: 'ImageKit private key',
                desc: 'Your ImageKit private key (keep this secure!)',
                visible: enabled,
                control: { type: 'text', key: 'imageKit.privateKey', placeholder: 'Private_key_here' },
            },
            {
                name: 'ImageKit URL endpoint',
                desc: 'Your ImageKit CDN URL endpoint for serving images',
                visible: enabled,
                control: { type: 'text', key: 'imageKit.urlEndpoint', placeholder: 'https://ik.imagekit.io/your-imagekit-id' },
            },
            {
                name: 'ImageKit upload endpoint',
                desc: 'ImageKit API endpoint for uploading files',
                visible: enabled,
                control: { type: 'text', key: 'imageKit.uploadEndpoint', placeholder: 'https://upload.imagekit.io/api/v1/files/upload' },
            },
            {
                name: 'ImageKit upload folder',
                desc: 'Folder path in ImageKit where images will be uploaded. {YYYY}, {MM}, and {DD} are filled in with the upload date, e.g. /images/{YYYY}-{MM}.',
                visible: enabled,
                control: { type: 'text', key: 'imageKit.uploadFolder', placeholder: '/images/{YYYY}-{MM}' },
            },
            {
                name: 'Remove local files after upload',
                desc: 'Delete local image files after successful upload to ImageKit',
                visible: enabled,
                control: { type: 'toggle', key: 'imageKit.removeLocalFiles' },
            },
            {
                name: 'Convert to WebP',
                desc: 'Convert uploaded images to WebP format for better optimization',
                visible: enabled,
                control: { type: 'toggle', key: 'imageKit.convertToWebp' },
            },
        ];
    }

    private magnificItems(): SettingGroupItem[] {
        const enabled = () => this.plugin.settings.magnific.enabled;
        return [
            {
                name: 'Enable Magnific integration',
                desc: 'Enable Magnific image search functionality',
                control: { type: 'toggle', key: 'magnific.enabled' },
            },
            {
                name: 'Magnific API key',
                desc: 'Your Magnific API key for accessing the image search service',
                visible: enabled,
                control: { type: 'text', key: 'magnific.apiKey', placeholder: 'Enter your Magnific API key' },
            },
            {
                name: 'Default license type',
                desc: 'Default license type for Magnific image searches',
                visible: enabled,
                control: { type: 'dropdown', key: 'magnific.defaultLicense', options: { freemium: 'Freemium', premium: 'Premium' } },
            },
            {
                name: 'Default image count',
                desc: 'Default number of images to fetch in search results (1-50)',
                visible: enabled,
                control: {
                    type: 'number',
                    key: 'magnific.defaultImageCount',
                    min: 1,
                    max: 50,
                    step: 1,
                    validate: (value) =>
                        Number.isInteger(value) && value >= 1 && value <= 50 ? undefined : 'Enter a whole number from 1 to 50.',
                },
            },
        ];
    }

    private ideogramItems(): SettingGroupItem[] {
        const enabled = () => this.plugin.settings.ideogram.enabled;
        return [
            {
                name: 'Enable Ideogram integration',
                desc: 'Generate images via Ideogram v3 with brand-template prompt wrapping',
                control: { type: 'toggle', key: 'ideogram.enabled' },
            },
            {
                name: 'Ideogram API key',
                desc: 'Your Ideogram API key (sent as the API-Key header)',
                visible: enabled,
                control: { type: 'text', key: 'ideogram.apiKey', placeholder: 'Enter your Ideogram API key' },
            },
            {
                name: 'Brand template',
                desc: 'Prepends/appends fixed text to every per-file prompt so all generated images share a consistent style. The per-file prompt itself is the file\'s image_prompt frontmatter (or whatever you type in the modal). There are two assembly patterns. '
                    + '1. Bookends: leave both fields as plain text. The prefix goes before the per-file prompt and the suffix goes after (prefix + per-file prompt + suffix). Good when your style guide naturally brackets the subject (e.g. prefix = "Editorial illustration of:", suffix = "in our house style, soft pastel background"). '
                    + '2. Slot insertion: include the literal token {prompt} somewhere in the prefix. The per-file prompt is substituted at that exact position and the suffix is ignored. Good when the per-file prompt needs to land mid-sentence (e.g. prefix = "Editorial illustration in our house style: {prompt}, on a soft pastel background"). '
                    + 'Use the modal\'s resolved prompt preview to see exactly what gets sent to Ideogram before generating.',
                visible: enabled,
            },
            {
                name: 'Prompt prefix — Style Notes',
                desc: 'What this is for: the visual style every image should share — illustration approach, palette mood, line/texture qualities, composition feel. Plain text → prepended. Contains {prompt} → the per-file subject is substituted at that exact position and the suffix is ignored.',
                visible: enabled,
                control: {
                    type: 'textarea',
                    key: 'ideogram.brandTemplate.prefix',
                    rows: 3,
                    placeholder: 'e.g. Style Notes: Comic-book editorial illustration in a clean modern style: {prompt}. Vibrant flat colors, slight halftone texture, confident inked outlines, dynamic composition.',
                },
            },
            {
                name: 'Prompt suffix — Brand Alignment',
                desc: 'What this is for: brand-specific constraints layered on top of the style — exact colors with hex values, recurring motifs, lighting/mood rules that should always hold. Appended after the per-file prompt. Ignored when the prefix already uses {prompt}.',
                visible: enabled,
                control: {
                    type: 'textarea',
                    key: 'ideogram.brandTemplate.suffix',
                    rows: 3,
                    placeholder: 'e.g. Brand Alignment: Include colors {list colors and hex values}, with green and blue being more background ambient colors to keep the feel aligned with brand',
                },
            },
            {
                name: 'Base negative prompt',
                desc: 'What this is for: things you never want in any generated image (text overlays, watermarks, off-brand imagery). Always sent. The per-file image_negative_prompt frontmatter, if set, is appended.',
                visible: enabled,
                control: {
                    type: 'textarea',
                    key: 'ideogram.brandTemplate.baseNegativePrompt',
                    rows: 3,
                    placeholder: 'e.g. no text, no watermarks, no signatures, no captions, no stock-photo aesthetic',
                },
            },
            {
                name: 'Rendering speed',
                desc: 'Cost/quality tradeoff. Quality costs the most.',
                visible: enabled,
                control: { type: 'dropdown', key: 'ideogram.defaults.renderingSpeed', options: optionsFrom(IDEOGRAM_RENDERING_SPEEDS) },
            },
            {
                name: 'Style type',
                desc: 'Coarse style category. Per-file image_style_type frontmatter overrides this.',
                visible: enabled,
                control: { type: 'dropdown', key: 'ideogram.defaults.styleType', options: optionsFrom(IDEOGRAM_STYLE_TYPES) },
            },
            {
                name: 'Magic prompt',
                desc: 'Whether Ideogram is allowed to rewrite your prompt. Off preserves brand voice exactly.',
                visible: enabled,
                control: { type: 'dropdown', key: 'ideogram.defaults.magicPrompt', options: optionsFrom(IDEOGRAM_MAGIC_PROMPTS) },
            },
            {
                name: 'Layerize text after generate',
                desc: 'Run the layerize text endpoint to strip incidental text. Modal can override per-call.',
                visible: enabled,
                control: { type: 'toggle', key: 'ideogram.layerizeText' },
            },
        ];
    }

    private imageCacheItems(): SettingGroupItem[] {
        const enabled = () => this.plugin.settings.imageCache.enabled;
        return [
            {
                name: 'Enable image caching',
                desc: 'Cache external images locally to bypass csp restrictions and enable offline viewing',
                control: { type: 'toggle', key: 'imageCache.enabled' },
            },
            {
                name: 'Cache folder',
                desc: 'Folder path where cached images will be stored (relative to vault root)',
                visible: enabled,
                control: { type: 'text', key: 'imageCache.cacheFolder', placeholder: '.Obsidian/plugins/image-gin/cache' },
            },
            {
                name: 'Max cache size (mb)',
                desc: 'Maximum size of the image cache in megabytes',
                visible: enabled,
                control: { type: 'number', key: 'imageCache.maxCacheSize', placeholder: '100', min: 1, step: 1, validate: wholeNumberAtLeastOne },
            },
            {
                name: 'Auto cleanup',
                desc: 'Automatically clean up old cached images',
                visible: enabled,
                control: { type: 'toggle', key: 'imageCache.autoCleanup' },
            },
            {
                name: 'Cleanup days',
                desc: 'Remove cached images older than this many days',
                visible: () => enabled() && this.plugin.settings.imageCache.autoCleanup,
                control: { type: 'number', key: 'imageCache.cleanupDays', placeholder: '30', min: 1, step: 1, validate: wholeNumberAtLeastOne },
            },
            {
                name: 'Clear cache',
                desc: 'Remove all cached images to free up space',
                visible: enabled,
                render: (setting) => {
                    setting.addButton(button => button
                        .setButtonText('Clear cache')
                        .setDestructive()
                        .onClick(async () => {
                            try {
                                // Lazy import keeps the cache service out of the settings UI's load path.
                                const { ImageCacheService } = await import('../services/imageCacheService');
                                const cacheService = new ImageCacheService(this.app, this.plugin.settings);
                                await cacheService.clearCache();
                                new Notice('Image cache cleared successfully');
                                this.update(); // refresh the statistics row
                            } catch (error) {
                                logger.error('Failed to clear cache:', error);
                                new Notice('Failed to clear image cache');
                            }
                        }));
                },
            },
            {
                name: 'Cache statistics',
                desc: 'Loading…',
                visible: enabled,
                searchable: false,
                render: (setting) => {
                    void (async () => {
                        try {
                            const { ImageCacheService } = await import('../services/imageCacheService');
                            const cacheService = new ImageCacheService(this.app, this.plugin.settings);
                            const stats = cacheService.getCacheStats();
                            setting.setDesc(`Files: ${stats.totalImages} · Size: ${stats.cacheSize}`);
                        } catch (error) {
                            logger.error('Failed to load cache stats:', error);
                            setting.setDesc('Failed to load cache statistics');
                        }
                    })();
                },
            },
        ];
    }

    private dropGateItems(): SettingGroupItem[] {
        const enabled = () => this.plugin.settings.dropGate.enabled;
        return [
            {
                name: 'Enable drop gate',
                desc: 'Intercept image drops and pastes; show the confirmation modal. When enabled, every image dropped or pasted into a note opens a confirmation modal asking where it should go: vault attachments, ImageKit, or Imgur. Built for writers who handle private client imagery and want every image destination to be a deliberate decision.',
                control: { type: 'toggle', key: 'dropGate.enabled' },
            },
            {
                name: 'Policy mode',
                desc: 'When should the gate intercept?',
                visible: enabled,
                control: {
                    type: 'dropdown',
                    key: 'dropGate.policyMode',
                    options: {
                        'always-confirm': 'Always confirm',
                        'external-only': 'Confirm only if an external destination is enabled',
                    },
                },
            },
            {
                name: 'Default destination',
                desc: 'Pre-selected when the modal opens.',
                visible: enabled,
                control: {
                    type: 'dropdown',
                    key: 'dropGate.defaultDestination',
                    options: {
                        vault: 'Vault attachments',
                        imagekit: 'ImageKit (private CDN)',
                        imgur: 'Imgur (public CDN)',
                    },
                },
            },
            {
                name: 'Show "remember for session" checkbox',
                desc: 'Lets the user skip the modal for the current note. Never persists across Obsidian restarts.',
                visible: enabled,
                control: { type: 'toggle', key: 'dropGate.rememberSessionChoice' },
            },
            {
                name: 'ImageKit folder for drop-gate uploads',
                desc: `Folder path on ImageKit where dropped/pasted images go. Supports {YYYY}, {MM}, and {DD}. Leave blank to use the main ImageKit upload folder ("${this.plugin.settings.imageKit.uploadFolder || '(unset)'}").`,
                visible: enabled,
                control: { type: 'text', key: 'dropGate.imageKitFolder', placeholder: '/uploads/lossless/drops' },
            },
        ];
    }

    private imgurItems(): SettingGroupItem[] {
        return [
            {
                name: 'Enable Imgur destination',
                desc: 'Anonymous upload via a client ID. Public — use for non-sensitive imagery only.',
                control: { type: 'toggle', key: 'imgur.enabled' },
            },
            {
                // A render row so the input stays masked, as in 0.2.x; the
                // declarative text control has no password mode.
                name: 'Imgur client ID',
                desc: 'Anonymous client ID from Imgur.com/account → applications. Not the secret.',
                visible: () => this.plugin.settings.imgur.enabled,
                render: (setting) => {
                    setting.addText(text => {
                        text.inputEl.type = 'password';
                        text.setValue(this.plugin.settings.imgur.clientId).onChange(async (value) => {
                            this.plugin.settings.imgur.clientId = value;
                            await this.plugin.saveSettings();
                        });
                    });
                },
            },
        ];
    }
}
