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
import { DropGateHandlers } from './src/handlers/DropGateHandlers';
import type { DropGateDestination } from './src/destinations/types';
import { VaultDestination } from './src/destinations/VaultDestination';
import { ImageKitDestination } from './src/destinations/ImageKitDestination';
import { ImgurDestination } from './src/destinations/ImgurDestination';

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
    private dropGateHandlers: DropGateHandlers | null = null;

    async loadSettings(): Promise<void> {
        const raw: unknown = (await this.loadData()) ?? {};
        const loadedSettings: Record<string, unknown> = (typeof raw === 'object' && raw !== null)
            ? (raw as Record<string, unknown>)
            : {};
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
            name: 'Generate images for current file',
            callback: () => {
                new CurrentFileModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'convert-local-images-to-remote',
            name: 'Convert local images to remote images',
            callback: () => {
                new ConvertLocalImagesForCurrentFile(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'batch-convert-directory-images',
            name: 'Batch convert directory images to remote',
            callback: () => {
                new BatchDirectoryConvertLocalToRemote(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'search-magnific-images',
            name: 'Search Magnific images',
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
            name: 'Generate images (Ideogram)',
            callback: () => {
                if (this.settings.ideogram.enabled) {
                    new IdeogramModal(this.app, this).open();
                } else {
                    new Notice('Ideogram integration is not enabled. Please enable it in settings.');
                }
            }
        });

        // ─── Drop / paste confirmation gate ────────────────────────
        // Intercepts every image dropped or pasted into a markdown view and
        // pops a destination-picker modal before anything reaches disk or
        // the network. See src/handlers/DropGateHandlers.ts.
        const destinations: DropGateDestination[] = [
            new VaultDestination(this.app),
            new ImageKitDestination(() => this.settings),
            new ImgurDestination(() => this.settings),
        ];
        this.dropGateHandlers = new DropGateHandlers(this, destinations);

        this.registerEvent(this.app.workspace.on('editor-drop', this.dropGateHandlers.onDrop));
        this.registerEvent(this.app.workspace.on('editor-paste', this.dropGateHandlers.onPaste));
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.dropGateHandlers?.resetSession())
        );

        // Detect a conflicting third-party imgur plugin. Both plugins register
        // editor-drop handlers and Obsidian fires every registered handler in
        // turn — preventDefault() only blocks the browser default, not other
        // plugins. So if obsidian-imgur-plugin is enabled, the user gets two
        // modals: ours, then theirs. Warn once.
        if (this.settings.dropGate.enabled) {
            this.warnAboutConflictingImgurPlugin();
        }

        this.addCommand({
            id: 'reset-drop-gate-session',
            name: 'Drop gate: reset session-remembered destination',
            callback: () => {
                this.dropGateHandlers?.resetSession();
                new Notice('Image gin: drop-gate session reset.');
            }
        });
    }

    /**
     * If obsidian-imgur-plugin is enabled, both plugins will fire on every
     * image drop and the user gets two modals back-to-back. Surface a one-
     * time, persistent Notice telling them to disable the other.
     */
    private warnAboutConflictingImgurPlugin(): void {
        const pluginsApi = (this.app as unknown as {
            plugins?: { enabledPlugins?: Set<string>; manifests?: Record<string, unknown> };
        }).plugins;

        const enabled = pluginsApi?.enabledPlugins;
        if (!enabled) return;
        if (!enabled.has('obsidian-imgur-plugin')) return;

        new Notice(
            'Image Gin Drop Gate: the "Imgur" community plugin is also enabled. ' +
            'Both plugins handle image drops, so you will see two modals. ' +
            'Disable the Imgur community plugin in Settings → Community Plugins, ' +
            'then enable Image Gin\'s Imgur destination if you want Imgur uploads from inside the gate.',
            0
        );
        console.warn('[image-gin/drop-gate] obsidian-imgur-plugin is enabled — drop events will fire twice.');
    }
}