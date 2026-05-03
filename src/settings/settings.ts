import { logger } from '../utils/logger';
import type { ImageSize } from '../types';
import type { App} from 'obsidian';
import { PluginSettingTab, Setting, Notice } from 'obsidian';
import type ImageGinPlugin from '../../main';

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

export interface IdeogramSettings {
    enabled: boolean;
    apiKey: string;
    brandTemplate: IdeogramBrandTemplate;
    defaults: IdeogramDefaults;
    layerizeText: boolean;
}

export interface ImageCacheSettings {
    enabled: boolean;
    cacheFolder: string;
    maxCacheSize: number; // in MB
    autoCleanup: boolean;
    cleanupDays: number;
}

export interface ImageGinSettings {
    recraftApiKey: string;
    recraftBaseUrl: string;
    recraftModelChoice: string;
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
    magnific: MagnificSettings;
    ideogram: IdeogramSettings;
    imageCache: ImageCacheSettings;
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

// Legacy default styles (kept for backward compatibility)
export const DEFAULT_IMAGE_STYLES_JSON = JSON.stringify([
    {
        "creation_time": "2025-04-15T02:24:01.574783871Z",
        "credits": 40,
        "id": "<your_style_id>",
        "is_private": true,
        "style": "digital_illustration"
    }
], null, 2);

export const DEFAULT_SETTINGS: ImageGinSettings = {
    recraftApiKey: '',
    recraftBaseUrl: 'https://external.api.recraft.ai/v1/images/generations',
    recraftModelChoice: 'recraftv3',
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
    },
    imageCache: {
        enabled: true,
        cacheFolder: '.obsidian/plugins/image-gin/cache',
        maxCacheSize: 100, // 100 MB
        autoCleanup: true,
        cleanupDays: 30,
    },
};

export class ImageGinSettingTab extends PluginSettingTab {
    plugin: ImageGinPlugin;

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private renderImageSizeSettings(containerEl: HTMLElement): void {
        const sizesContainer = containerEl.createDiv('image-sizes-container');
        sizesContainer.createEl('h3', { text: 'Image Size Presets' });
        
        this.plugin.settings.imageSizes.forEach((size, index) => {
            const setting = new Setting(sizesContainer)
                .setClass('image-size-setting');

            // Label
            setting.addText(text => text
                .setPlaceholder('Label')
                .setValue(size.label)
                .onChange(async (value) => {
                    size.label = value;
                    await this.plugin.saveSettings();
                }));

            // YAML Key
            setting.addText(text => text
                .setPlaceholder('yaml_key')
                .setValue(size.yamlKey)
                .onChange(async (value) => {
                    size.yamlKey = value;
                    await this.plugin.saveSettings();
                }));

            // Width
            setting.addText(text => {
                const input = text.inputEl;
                input.title = 'Valid widths: 1024, 1280, 1365, 1434, 1536, 1707, 1820, 2048';
                return text
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

            // Height
            setting.addText(text => {
                const input = text.inputEl;
                input.title = 'Valid heights: 1024, 1280, 1365, 1434, 1536, 1707, 1820, 2048';
                return text
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

            // Delete button
            setting.addExtraButton(button => {
                button
                    .setIcon('trash')
                    .setTooltip('Delete this size')
                    .onClick(async () => {
                        this.plugin.settings.imageSizes.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display(); // Refresh the settings UI
                    });
            });
        });

        // Add button to create new size preset
        new Setting(sizesContainer)
            .addButton(button => {
                button
                    .setButtonText('Add New Size')
                    .setCta()
                    .onClick(async () => {
                        this.plugin.settings.imageSizes.push({
                            id: `custom-${Date.now()}`,
                            yamlKey: 'custom_image',
                            width: 800,
                            height: 600,
                            label: 'New Size'
                        });
                        await this.plugin.saveSettings();
                        this.display(); // Refresh the settings UI
                    });
            });

        // Styles Configuration Section
        containerEl.createEl('h3', { text: 'Style Configurations' });
        containerEl.createEl('p', {
            text: 'Configure style presets for image generation',
            cls: 'setting-item-description'
        });

        const stylesSetting = new Setting(containerEl)
            .setName('Style Presets')
            .setDesc('JSON array of style configurations');

        const stylesTextArea = document.createElement('textarea');
        stylesTextArea.rows = 10;
        stylesTextArea.style.width = '100%';
        stylesTextArea.style.minHeight = '200px';
        stylesTextArea.style.fontFamily = 'monospace';
        stylesTextArea.placeholder = 'Enter style configurations as JSON...';
        
        // Format the JSON for display
        try {
            const stylesJson = JSON.parse(this.plugin.settings.imageStylesJSON);
            stylesTextArea.value = JSON.stringify(stylesJson, null, 2);
        } catch {
            // If not valid JSON, display as is
            stylesTextArea.value = this.plugin.settings.imageStylesJSON;
        }
        
        // Add input event listener
        stylesTextArea.addEventListener('input', async () => {
            try {
                // Try to parse to validate JSON
                JSON.parse(stylesTextArea.value);
                this.plugin.settings.imageStylesJSON = stylesTextArea.value;
                await this.plugin.saveSettings();
                // Update the textarea with formatted JSON
                stylesTextArea.value = JSON.stringify(JSON.parse(stylesTextArea.value), null, 2);
            } catch {
                // If invalid JSON, still save but don't format
                this.plugin.settings.imageStylesJSON = stylesTextArea.value;
                await this.plugin.saveSettings();
            }
        });
        
        // Add the textarea to the setting
        stylesSetting.settingEl.appendChild(stylesTextArea);
        
        // Add a reset button in a new setting row
        new Setting(containerEl)
            .setName('')
            .setDesc('')
            .addButton(button => {
                button
                    .setButtonText('Reset to Default')
                    .onClick(async () => {
                        this.plugin.settings.imageStylesJSON = DEFAULT_IMAGE_STYLES_JSON;
                        await this.plugin.saveSettings();
                        stylesTextArea.value = JSON.stringify(JSON.parse(DEFAULT_IMAGE_STYLES_JSON), null, 2);
                        new Notice('Styles reset to default');
                    });
            });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Image Gin Settings' });

        // === RECRAFT IMAGE GENERATION SETTINGS ===
        containerEl.createEl('h2', { text: '🎨 Recraft Image Generation' });
        
        // API Key
        new Setting(containerEl)
            .setName('Recraft API Key')
            .setDesc('Your Recraft.ai API key for image generation')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.recraftApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.recraftApiKey = value;
                    await this.plugin.saveSettings();
                }));
                
        // Model Choice
        new Setting(containerEl)
            .setName('Model')
            .setDesc('Select the Recraft model to use for image generation')
            .addDropdown(dropdown => dropdown
                .addOption('recraftv3', 'Recraft v3')
                .addOption('recraftv2', 'Recraft v2')
                .addOption('recraftv1', 'Recraft v1')
                .setValue(this.plugin.settings.recraftModelChoice)
                .onChange(async (value) => {
                    this.plugin.settings.recraftModelChoice = value;
                    await this.plugin.saveSettings();
                }));

        // Base URL setting
        new Setting(containerEl)
            .setName('ReCraft API Base URL')
            .setDesc('ReCraft API base URL (change only if using custom endpoint)')
            .addText(text => text
                .setPlaceholder('https://external.api.recraft.ai/v1/images/generations')
                .setValue(this.plugin.settings.recraftBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.recraftBaseUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Image Output Folder setting
        new Setting(containerEl)
            .setName('Image Output Folder')
            .setDesc('Folder path where generated images will be saved. Use absolute path (e.g., /Users/username/path) or relative to vault root')
            .addText(text => text
                .setPlaceholder('assets/ImageGin')
                .setValue(this.plugin.settings.imageOutputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.imageOutputFolder = value;
                    await this.plugin.saveSettings();
                }));

        // Recraft-specific settings: Image size presets and style configurations
        this.renderImageSizeSettings(containerEl);

        // === IMAGEKIT CDN SETTINGS ===
        containerEl.createEl('h2', { text: '☁️ ImageKit CDN Upload & Hosting' });
        
        // ImageKit Enable Toggle
        new Setting(containerEl)
            .setName('Enable ImageKit CDN')
            .setDesc('Upload generated images to ImageKit CDN for optimized delivery')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.imageKit.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.enabled = value;
                    await this.plugin.saveSettings();
                }));

        // ImageKit Public Key
        new Setting(containerEl)
            .setName('ImageKit Public Key')
            .setDesc('Your ImageKit public key (found in ImageKit dashboard)')
            .addText(text => text
                .setPlaceholder('public_key_here')
                .setValue(this.plugin.settings.imageKit.publicKey)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.publicKey = value;
                    await this.plugin.saveSettings();
                }));

        // ImageKit Private Key
        new Setting(containerEl)
            .setName('ImageKit Private Key')
            .setDesc('Your ImageKit private key (keep this secure!)')
            .addText(text => text
                .setPlaceholder('private_key_here')
                .setValue(this.plugin.settings.imageKit.privateKey)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.privateKey = value;
                    await this.plugin.saveSettings();
                }));

        // ImageKit URL Endpoint
        new Setting(containerEl)
            .setName('ImageKit URL Endpoint')
            .setDesc('Your ImageKit CDN URL endpoint for serving images')
            .addText(text => text
                .setPlaceholder('https://ik.imagekit.io/your-imagekit-id')
                .setValue(this.plugin.settings.imageKit.urlEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.urlEndpoint = value;
                    await this.plugin.saveSettings();
                }));

        // ImageKit Upload Endpoint
        new Setting(containerEl)
            .setName('ImageKit Upload Endpoint')
            .setDesc('ImageKit API endpoint for uploading files')
            .addText(text => text
                .setPlaceholder('https://upload.imagekit.io/api/v1/files/upload')
                .setValue(this.plugin.settings.imageKit.uploadEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.uploadEndpoint = value;
                    await this.plugin.saveSettings();
                }));

        // ImageKit Upload Folder
        new Setting(containerEl)
            .setName('ImageKit Upload Folder')
            .setDesc('Folder path in ImageKit where images will be uploaded')
            .addText(text => text
                .setPlaceholder('/uploads/lossless/images')
                .setValue(this.plugin.settings.imageKit.uploadFolder)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.uploadFolder = value;
                    await this.plugin.saveSettings();
                }));

        // Remove Local Files Toggle
        new Setting(containerEl)
            .setName('Remove Local Files After Upload')
            .setDesc('Delete local image files after successful upload to ImageKit')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.imageKit.removeLocalFiles)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.removeLocalFiles = value;
                    await this.plugin.saveSettings();
                }));

        // Convert to WebP Toggle
        new Setting(containerEl)
            .setName('Convert to WebP')
            .setDesc('Convert uploaded images to WebP format for better optimization')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.imageKit.convertToWebp)
                .onChange(async (value) => {
                    this.plugin.settings.imageKit.convertToWebp = value;
                    await this.plugin.saveSettings();
                }));

        // Magnific Settings Section
        containerEl.createEl('h3', { text: 'Magnific Image Search' });

        // Magnific Enable Toggle
        new Setting(containerEl)
            .setName('Enable Magnific Integration')
            .setDesc('Enable Magnific image search functionality')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.magnific.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.magnific.enabled = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide dependent settings
                }));

        if (this.plugin.settings.magnific.enabled) {
            // Magnific API Key
            new Setting(containerEl)
                .setName('Magnific API Key')
                .setDesc('Your Magnific API key for accessing the image search service')
                .addText(text => text
                    .setPlaceholder('Enter your Magnific API key')
                    .setValue(this.plugin.settings.magnific.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.magnific.apiKey = value;
                        await this.plugin.saveSettings();
                    }));

            // Default License Type
            new Setting(containerEl)
                .setName('Default License Type')
                .setDesc('Default license type for Magnific image searches')
                .addDropdown(dropdown => dropdown
                    .addOption('freemium', 'Freemium')
                    .addOption('premium', 'Premium')
                    .setValue(this.plugin.settings.magnific.defaultLicense)
                    .onChange(async (value) => {
                        this.plugin.settings.magnific.defaultLicense = value as 'freemium' | 'premium';
                        await this.plugin.saveSettings();
                    }));

            // Default Image Count
            new Setting(containerEl)
                .setName('Default Image Count')
                .setDesc('Default number of images to fetch in search results (1-50)')
                .addSlider(slider => slider
                    .setLimits(1, 50, 1)
                    .setValue(this.plugin.settings.magnific.defaultImageCount)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.magnific.defaultImageCount = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // === IDEOGRAM IMAGE GENERATION SETTINGS ===
        containerEl.createEl('h2', { text: '🖼️ Ideogram Image Generation' });

        new Setting(containerEl)
            .setName('Enable Ideogram Integration')
            .setDesc('Generate images via Ideogram v3 with brand-template prompt wrapping')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ideogram.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.ideogram.enabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.ideogram.enabled) {
            new Setting(containerEl)
                .setName('Ideogram API Key')
                .setDesc('Your Ideogram API key (sent as the Api-Key header)')
                .addText(text => text
                    .setPlaceholder('Enter your Ideogram API key')
                    .setValue(this.plugin.settings.ideogram.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.ideogram.apiKey = value;
                        await this.plugin.saveSettings();
                    }));

            containerEl.createEl('h3', { text: 'Brand Template' });
            containerEl.createEl('p', {
                text: 'Wraps every per-file prompt with brand voice. Use {prompt} in the prefix to control where the per-file prompt is inserted; otherwise the prefix is prepended and the suffix appended.',
                cls: 'setting-item-description'
            });

            const renderTextarea = (
                name: string,
                desc: string,
                placeholder: string,
                getValue: () => string,
                setValue: (value: string) => Promise<void>
            ): void => {
                const setting = new Setting(containerEl).setName(name).setDesc(desc);
                const textarea = document.createElement('textarea');
                textarea.rows = 3;
                textarea.style.width = '100%';
                textarea.style.fontFamily = 'monospace';
                textarea.placeholder = placeholder;
                textarea.value = getValue();
                textarea.addEventListener('input', async () => {
                    await setValue(textarea.value);
                });
                setting.settingEl.appendChild(textarea);
            };

            renderTextarea(
                'Prompt prefix',
                'Inserted before the per-file prompt (or in place of {prompt} if used)',
                'Editorial illustration in our house style: {prompt}, on a soft pastel background',
                () => this.plugin.settings.ideogram.brandTemplate.prefix,
                async (value) => {
                    this.plugin.settings.ideogram.brandTemplate.prefix = value;
                    await this.plugin.saveSettings();
                }
            );

            renderTextarea(
                'Prompt suffix',
                'Appended after the per-file prompt (ignored if prefix contains {prompt})',
                'viewed from above, soft natural lighting',
                () => this.plugin.settings.ideogram.brandTemplate.suffix,
                async (value) => {
                    this.plugin.settings.ideogram.brandTemplate.suffix = value;
                    await this.plugin.saveSettings();
                }
            );

            renderTextarea(
                'Base negative prompt',
                'Always-applied exclusions; per-file image_negative_prompt is appended',
                'no text, no watermarks, no signatures, no captions',
                () => this.plugin.settings.ideogram.brandTemplate.baseNegativePrompt,
                async (value) => {
                    this.plugin.settings.ideogram.brandTemplate.baseNegativePrompt = value;
                    await this.plugin.saveSettings();
                }
            );

            containerEl.createEl('h3', { text: 'Defaults' });

            new Setting(containerEl)
                .setName('Rendering speed')
                .setDesc('Cost/quality tradeoff. QUALITY costs the most.')
                .addDropdown(dropdown => {
                    for (const v of IDEOGRAM_RENDERING_SPEEDS) dropdown.addOption(v, v);
                    dropdown
                        .setValue(this.plugin.settings.ideogram.defaults.renderingSpeed)
                        .onChange(async (value) => {
                            this.plugin.settings.ideogram.defaults.renderingSpeed = value as IdeogramRenderingSpeed;
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Style type')
                .setDesc('Coarse style category. Per-file image_style_type frontmatter overrides this.')
                .addDropdown(dropdown => {
                    for (const v of IDEOGRAM_STYLE_TYPES) dropdown.addOption(v, v);
                    dropdown
                        .setValue(this.plugin.settings.ideogram.defaults.styleType)
                        .onChange(async (value) => {
                            this.plugin.settings.ideogram.defaults.styleType = value as IdeogramStyleType;
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Magic prompt')
                .setDesc('Whether Ideogram is allowed to rewrite your prompt. OFF preserves brand voice exactly.')
                .addDropdown(dropdown => {
                    for (const v of IDEOGRAM_MAGIC_PROMPTS) dropdown.addOption(v, v);
                    dropdown
                        .setValue(this.plugin.settings.ideogram.defaults.magicPrompt)
                        .onChange(async (value) => {
                            this.plugin.settings.ideogram.defaults.magicPrompt = value as IdeogramMagicPrompt;
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Layerize text after generate')
                .setDesc('Run the Layerize Text endpoint to strip incidental text. Modal can override per-call.')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.ideogram.layerizeText)
                    .onChange(async (value) => {
                        this.plugin.settings.ideogram.layerizeText = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // === IMAGE CACHE SETTINGS ===
        containerEl.createEl('h2', { text: '🗂️ Image Cache Settings' });
        
        // Image Cache Enable Toggle
        new Setting(containerEl)
            .setName('Enable Image Caching')
            .setDesc('Cache external images locally to bypass CSP restrictions and enable offline viewing')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.imageCache.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.imageCache.enabled = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide dependent settings
                }));

        if (this.plugin.settings.imageCache.enabled) {
            // Cache Folder
            new Setting(containerEl)
                .setName('Cache Folder')
                .setDesc('Folder path where cached images will be stored (relative to vault root)')
                .addText(text => text
                    .setPlaceholder('.obsidian/plugins/image-gin/cache')
                    .setValue(this.plugin.settings.imageCache.cacheFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.imageCache.cacheFolder = value;
                        await this.plugin.saveSettings();
                    }));

            // Max Cache Size
            new Setting(containerEl)
                .setName('Max Cache Size (MB)')
                .setDesc('Maximum size of the image cache in megabytes')
                .addText(text => text
                    .setPlaceholder('100')
                    .setValue(this.plugin.settings.imageCache.maxCacheSize.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value, 10);
                        if (!isNaN(num) && num > 0) {
                            this.plugin.settings.imageCache.maxCacheSize = num;
                            await this.plugin.saveSettings();
                        }
                    }));

            // Auto Cleanup
            new Setting(containerEl)
                .setName('Auto Cleanup')
                .setDesc('Automatically clean up old cached images')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.imageCache.autoCleanup)
                    .onChange(async (value) => {
                        this.plugin.settings.imageCache.autoCleanup = value;
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show/hide cleanup days setting
                    }));

            if (this.plugin.settings.imageCache.autoCleanup) {
                // Cleanup Days
                new Setting(containerEl)
                    .setName('Cleanup Days')
                    .setDesc('Remove cached images older than this many days')
                    .addText(text => text
                        .setPlaceholder('30')
                        .setValue(this.plugin.settings.imageCache.cleanupDays.toString())
                        .onChange(async (value) => {
                            const num = parseInt(value, 10);
                            if (!isNaN(num) && num > 0) {
                                this.plugin.settings.imageCache.cleanupDays = num;
                                await this.plugin.saveSettings();
                            }
                        }));
            }

            // Clear Cache Button
            new Setting(containerEl)
                .setName('Clear Cache')
                .setDesc('Remove all cached images to free up space')
                .addButton(button => button
                    .setButtonText('Clear Cache')
                    .setWarning()
                    .onClick(async () => {
                        try {
                            // Import and use the ImageCacheService
                            const { ImageCacheService } = await import('../services/imageCacheService');
                            const cacheService = new ImageCacheService(this.app, this.plugin.settings);
                            await cacheService.clearCache();
                            new Notice('Image cache cleared successfully');
                        } catch (error) {
                            logger.error('Failed to clear cache:', error);
                            new Notice('Failed to clear image cache');
                        }
                    }));

            // Cache Stats
            const statsDiv = containerEl.createDiv('cache-stats');
            statsDiv.style.marginTop = '10px';
            statsDiv.style.padding = '10px';
            statsDiv.style.backgroundColor = 'var(--background-secondary)';
            statsDiv.style.borderRadius = '5px';
            
            // Load and display cache stats
            void this.loadCacheStats(statsDiv);
        }
    }

    private async loadCacheStats(container: HTMLElement) {
        container.empty();
        try {
            const { ImageCacheService } = await import('../services/imageCacheService');
            const cacheService = new ImageCacheService(this.app, this.plugin.settings);
            const stats = cacheService.getCacheStats();

            const title = container.createDiv();
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '5px';
            title.setText('Cache Statistics');
            container.createDiv({ text: `Files: ${stats.totalImages}` });
            container.createDiv({ text: `Size: ${stats.cacheSize}` });
        } catch (error) {
            logger.error('Failed to load cache stats:', error);
            const errEl = container.createDiv({ text: 'Failed to load cache statistics' });
            errEl.style.color = 'var(--text-error)';
        }
    }
}