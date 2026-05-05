import { Plugin, Notice } from 'obsidian';
// Import modal classes
import { CurrentFileModal } from './src/modals/CurrentFileModal';
import { ConvertLocalImagesForCurrentFile } from './src/modals/ConvertLocalImagesForCurrentFile';
import { BatchDirectoryConvertLocalToRemote } from './src/modals/BatchDirectoryConvertLocalToRemote';
import { MagnificModal } from './src/modals/MagnificModal';
import { IdeogramModal } from './src/modals/IdeogramModal';
import type { ImageGinSettings} from './src/settings/settings';
import { ImageGinSettingTab, DEFAULT_SETTINGS } from './src/settings/settings';
import { logger } from './src/utils/logger';

// Deep-merge `loaded` over `base` for plain objects only. Arrays are
// replaced wholesale (so user-edited `imageSizes` overrides defaults
// rather than being elementwise-merged). Required so partial nested
// provider blocks in data.json (e.g. `ideogram: { enabled, apiKey }`)
// don't drop the rest of the provider's defaults.
function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMergeSettings<T>(base: T, loaded: unknown): T {
    if (!isPlainObject(loaded) || !isPlainObject(base)) {
        return (loaded === undefined ? base : loaded) as T;
    }
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(loaded)) {
        const baseVal = (base as Record<string, unknown>)[key];
        const loadedVal = loaded[key];
        if (isPlainObject(baseVal) && isPlainObject(loadedVal)) {
            out[key] = deepMergeSettings(baseVal, loadedVal);
        } else {
            out[key] = loadedVal;
        }
    }
    return out as T;
}

export default class ImageGinPlugin extends Plugin {
    settings: ImageGinSettings = { ...DEFAULT_SETTINGS };

    async loadSettings(): Promise<void> {
        const loadedSettings = (await this.loadData()) ?? {};
        // One-shot migration: Freepik rebranded to Magnific. Move legacy
        // `freepik` config into `magnific` so the user's saved key/enabled
        // flag survive the schema rename. Persists via saveSettings below.
        if (loadedSettings.freepik && !loadedSettings.magnific) {
            loadedSettings.magnific = loadedSettings.freepik;
            delete loadedSettings.freepik;
        }
        this.settings = deepMergeSettings(DEFAULT_SETTINGS, loadedSettings);
        await this.saveSettings();
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    async onload(): Promise<void> {
        await this.loadSettings();

        // Wire up the file logger so console.* calls in services/modals
        // also persist to .obsidian/plugins/image-gin/log.json.
        logger.initialize(this.app.vault);

        this.addSettingTab(new ImageGinSettingTab(this.app, this));
        
        // Register commands directly in onload
        this.addCommand({
            id: 'generate-images-for-current-file',
            name: 'Generate Images for Current File',
            callback: () => {
                new CurrentFileModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'convert-local-images-to-remote',
            name: 'Convert Local Images to Remote Images',
            callback: () => {
                new ConvertLocalImagesForCurrentFile(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'batch-convert-directory-images',
            name: 'Batch Convert Directory Images to Remote',
            callback: () => {
                new BatchDirectoryConvertLocalToRemote(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'search-magnific-images',
            name: 'Search Magnific Images',
            callback: () => {
                if (this.settings.magnific.enabled) {
                    new MagnificModal(this.app, this).open();
                } else {
                    new Notice('Magnific integration is not enabled. Please enable it in settings.');
                }
            }
        });

        this.addCommand({
            id: 'generate-images-ideogram',
            name: 'Generate Images (Ideogram)',
            callback: () => {
                if (this.settings.ideogram.enabled) {
                    new IdeogramModal(this.app, this).open();
                } else {
                    new Notice('Ideogram integration is not enabled. Please enable it in settings.');
                }
            }
        });
    }
}