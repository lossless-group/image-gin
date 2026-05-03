import { Plugin, Notice } from 'obsidian';
// Import modal classes
import { CurrentFileModal } from './src/modals/CurrentFileModal';
import { ConvertLocalImagesForCurrentFile } from './src/modals/ConvertLocalImagesForCurrentFile';
import { BatchDirectoryConvertLocalToRemote } from './src/modals/BatchDirectoryConvertLocalToRemote';
import { MagnificModal } from './src/modals/MagnificModal';
import type { ImageGinSettings} from './src/settings/settings';
import { ImageGinSettingTab, DEFAULT_SETTINGS } from './src/settings/settings';
import { logger } from './src/utils/logger';

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
        this.settings = { ...DEFAULT_SETTINGS, ...loadedSettings };
        await this.saveSettings();
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    async onload(): Promise<void> {
        await this.loadSettings();

        // Wire up the file logger so console.* calls in services/modals
        // also persist to .obsidian/plugins/image-gin-plugin/log.json.
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
    }
}