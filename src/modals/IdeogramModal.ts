import { logger } from '../utils/logger';
import type { App, TFile } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import type { ToggleComponent } from 'obsidian';
import type ImageGinPlugin from '../../main';
import { IdeogramService, pickAspectRatio } from '../services/ideogramService';
import type { IdeogramGenerateOptions } from '../services/ideogramService';
import {
    IDEOGRAM_MAGIC_PROMPTS,
    IDEOGRAM_RENDERING_SPEEDS,
    IDEOGRAM_STYLE_TYPES,
} from '../settings/settings';
import type {
    IdeogramMagicPrompt,
    IdeogramRenderingSpeed,
    IdeogramStyleType,
} from '../settings/settings';
import type { ImageSize } from '../types';
import { asNumber, asString } from '../utils/coerce';

export class IdeogramModal extends Modal {
    private plugin: ImageGinPlugin;
    private currentFile: TFile | null = null;

    private imagePrompt: string = '';
    private selectedSizes: Set<string> = new Set();
    private writeToFrontmatter: boolean;

    private styleType: IdeogramStyleType;
    private renderingSpeed: IdeogramRenderingSpeed;
    private magicPrompt: IdeogramMagicPrompt;
    private negativePrompt: string;
    private layerizeText: boolean;
    private seed: number | undefined;

    private isGenerating: boolean = false;
    private progressEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;

    // Refs for the master "select all sizes" toggle and per-size toggles,
    // so the master and individuals stay in sync when either is clicked.
    private masterSizeToggle: ToggleComponent | null = null;
    private sizeToggles: Map<string, ToggleComponent> = new Map();

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app);
        this.plugin = plugin;
        this.currentFile = this.app.workspace.getActiveFile();

        const session = this.plugin.settings.ideogram.lastSession;
        const validSizeIds = new Set(this.plugin.settings.imageSizes.map(s => s.id));
        for (const id of session.selectedSizes) {
            if (validSizeIds.has(id)) this.selectedSizes.add(id);
        }
        this.styleType = session.styleType;
        this.renderingSpeed = session.renderingSpeed;
        this.magicPrompt = session.magicPrompt;
        this.layerizeText = session.layerizeText;
        this.writeToFrontmatter = session.writeToFrontmatter;

        this.negativePrompt = this.plugin.settings.ideogram.brandTemplate.baseNegativePrompt;
        this.seed = undefined;
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('image-gin-modal');

        await this.applyFrontmatterOverrides();
        this.renderModalContent();
    }

    private async applyFrontmatterOverrides(): Promise<void> {
        if (!this.currentFile) return;
        const file = this.currentFile;
        const key = this.plugin.settings.imagePromptKey;

        const frontmatter: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const rawPrompt = frontmatter?.[key];

        if (rawPrompt === undefined) {
            // Key absent. Create it with an empty value so the form is
            // editing a real frontmatter property — first-time users see
            // the plugin's convention surface in their file immediately
            // rather than discovering it post-generate.
            try {
                await this.app.fileManager.processFrontMatter(file, (m: Record<string, unknown>) => {
                    if (m[key] === undefined) m[key] = '';
                });
            } catch (error) {
                logger.error('Error initializing image_prompt frontmatter:', error);
            }
        } else {
            const existing = asString(rawPrompt);
            if (existing) this.imagePrompt = existing;
        }

        if (!frontmatter) return;

        const fmStyleType = asString(frontmatter['image_style_type']);
        if (fmStyleType) {
            const upper = fmStyleType.toUpperCase();
            if ((IDEOGRAM_STYLE_TYPES as string[]).includes(upper)) {
                this.styleType = upper as IdeogramStyleType;
            } else {
                new Notice(`image_style_type "${fmStyleType}" is invalid; using default ${this.styleType}`);
            }
        }

        const fmNegative = asString(frontmatter['image_negative_prompt']);
        const baseNegative = this.plugin.settings.ideogram.brandTemplate.baseNegativePrompt;
        if (fmNegative) {
            this.negativePrompt = baseNegative ? `${baseNegative}, ${fmNegative}` : fmNegative;
        }

        const fmSeed = asNumber(frontmatter['image_seed']);
        if (fmSeed !== undefined) this.seed = fmSeed;
    }

    private renderModalContent(): void {
        const { contentEl } = this;

        const headerEl = contentEl.createDiv('image-gin-header');
        headerEl.createEl('h2', { text: 'Generate images (Ideogram)', cls: 'image-gin-title' });

        this.renderPromptSection(contentEl);
        this.renderResolvedPromptSection(contentEl);
        this.renderSizeSection(contentEl);
        this.renderOverridesSection(contentEl);
        this.renderFrontmatterSection(contentEl);
        this.renderProgressSection(contentEl);
        this.renderGenerateButton(contentEl);
    }

    private renderPromptSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createSpan({ text: 'Image Prompt — Subject Matter' });

        const content = section.createDiv('image-gin-section-content');
        const helpText = content.createEl('p', {
            cls: 'setting-item-description',
        });
        helpText.appendText('Describe ONLY what is in the scene — characters, setting, action. Don\'t describe style or brand colors here; that\'s handled by Settings → Brand Template (prefix = Style Notes, suffix = Brand Alignment). The Resolved Prompt Preview below shows the final assembled prompt.');

        const textarea = content.createEl('textarea', {
            cls: 'image-gin-textarea',
            attr: {
                placeholder: 'E.g. A series of robots representing AI agents wearing construction work vests with "agent" on the back, reviewing checklists at an industrial production line where code snippets and function names roll off instead of physical products',
                rows: '4',
            },
        });
        textarea.value = this.imagePrompt;
        textarea.addEventListener('input', () => {
            this.imagePrompt = textarea.value;
            this.refreshPreview();
        });
    }

    private renderResolvedPromptSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createSpan({ text: 'Resolved Prompt Preview' });

        const content = section.createDiv('image-gin-section-content');

        const desc = content.createEl('p', { cls: 'setting-item-description' });
        const { prefix, suffix } = this.plugin.settings.ideogram.brandTemplate;
        if (!prefix && !suffix) {
            desc.appendText('No brand template configured — your prompt is sent to Ideogram exactly as typed. Set a prefix/suffix in plugin settings to wrap it automatically.');
        } else if (prefix.includes('{prompt}')) {
            desc.appendText('Slot-insertion mode: your prompt is substituted into the prefix at the {prompt} token; suffix is ignored.');
        } else {
            desc.appendText('Bookend mode: prefix prepended, suffix appended (separated by spaces).');
        }

        this.previewEl = content.createEl('pre', { cls: 'image-gin-preview' });
        this.previewEl.addClass('image-gin-preview');

        this.refreshPreview();
    }

    private refreshPreview(): void {
        if (this.previewEl) {
            this.previewEl.textContent = this.assemblePrompt() || '(empty — type a prompt above)';
        }
    }

    private assemblePrompt(): string {
        const { prefix, suffix } = this.plugin.settings.ideogram.brandTemplate;
        const subject = this.imagePrompt.trim();
        if (prefix.includes('{prompt}')) {
            return prefix.replace('{prompt}', subject);
        }
        return [prefix, subject, suffix].filter(s => s && s.length > 0).join(' ');
    }

    private renderSizeSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.addClass('image-gin-row');
        header.createSpan({ text: 'Image Sizes' });

        const masterWrap = header.createDiv();
        masterWrap.addClass('image-gin-row-tight');
        masterWrap.createSpan({
            text: 'All',
            attr: { style: 'font-size: 0.85em; opacity: 0.75;' },
        });
        new Setting(masterWrap)
            .setClass('image-gin-master-toggle')
            .addToggle(toggle => {
                this.masterSizeToggle = toggle;
                toggle.setValue(this.areAllSizesSelected());
                toggle.setTooltip('Toggle all image sizes on/off');
                toggle.onChange((value) => {
                    if (value) {
                        for (const s of this.plugin.settings.imageSizes) this.selectedSizes.add(s.id);
                    } else {
                        this.selectedSizes.clear();
                    }
                    for (const [id, t] of this.sizeToggles) {
                        t.setValue(this.selectedSizes.has(id));
                    }
                    logger.info(`[Ideogram] master toggle -> ${value}; selected:`, Array.from(this.selectedSizes));
                });
            });
        // Strip the Setting component's left padding so the toggle hugs the header right edge
        masterWrap.querySelectorAll('.setting-item-info').forEach(el => el.remove());

        const content = section.createDiv('image-gin-section-content');
        const toggleGroup = content.createDiv('image-gin-toggle-group');

        for (const size of this.plugin.settings.imageSizes) {
            const ratio = pickAspectRatio(size.width, size.height);
            const toggleItem = toggleGroup.createDiv('image-gin-toggle-item');
            new Setting(toggleItem)
                .setName(size.label)
                .setDesc(`${size.width} × ${size.height} → Ideogram ${ratio}`)
                .addToggle(toggle => {
                    this.sizeToggles.set(size.id, toggle);
                    toggle.setValue(this.selectedSizes.has(size.id));
                    toggle.onChange((value) => {
                        if (value) this.selectedSizes.add(size.id);
                        else this.selectedSizes.delete(size.id);
                        if (this.masterSizeToggle) {
                            this.masterSizeToggle.setValue(this.areAllSizesSelected());
                        }
                        logger.info(`[Ideogram] toggle ${size.id} -> ${value}; selected:`, Array.from(this.selectedSizes));
                    });
                });
        }
    }

    private areAllSizesSelected(): boolean {
        const sizes = this.plugin.settings.imageSizes;
        if (sizes.length === 0) return false;
        return sizes.every(s => this.selectedSizes.has(s.id));
    }

    private renderOverridesSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createSpan({ text: 'Per-call Overrides' });

        const content = section.createDiv('image-gin-section-content');

        new Setting(content)
            .setName('Style type')
            .addDropdown(dropdown => {
                for (const v of IDEOGRAM_STYLE_TYPES) dropdown.addOption(v, v);
                dropdown.setValue(this.styleType).onChange((value) => {
                    this.styleType = value as IdeogramStyleType;
                });
            });

        new Setting(content)
            .setName('Rendering speed')
            .addDropdown(dropdown => {
                for (const v of IDEOGRAM_RENDERING_SPEEDS) dropdown.addOption(v, v);
                dropdown.setValue(this.renderingSpeed).onChange((value) => {
                    this.renderingSpeed = value as IdeogramRenderingSpeed;
                });
            });

        new Setting(content)
            .setName('Magic prompt')
            .addDropdown(dropdown => {
                for (const v of IDEOGRAM_MAGIC_PROMPTS) dropdown.addOption(v, v);
                dropdown.setValue(this.magicPrompt).onChange((value) => {
                    this.magicPrompt = value as IdeogramMagicPrompt;
                });
            });

        const negativeWrap = content.createDiv();
        negativeWrap.createEl('label', { text: 'Negative prompt — what to exclude from this image' });
        const negativeArea = negativeWrap.createEl('textarea', {
            attr: {
                rows: '2',
                placeholder: 'E.g. No text, no watermarks, no signatures (already merged from settings + frontmatter; edit to add more for this run)',
            },
        });
        negativeArea.addClass('image-gin-text-area-md');
        negativeArea.value = this.negativePrompt;
        negativeArea.addEventListener('input', () => {
            this.negativePrompt = negativeArea.value;
        });

        new Setting(content)
            .setName('Layerize text after generate')
            .setDesc('Strip incidental text from the generated image')
            .addToggle(toggle => {
                toggle.setValue(this.layerizeText).onChange((value) => {
                    this.layerizeText = value;
                });
            });
    }

    private renderFrontmatterSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createSpan({ text: 'Frontmatter Options' });

        const content = section.createDiv('image-gin-section-content');
        new Setting(content)
            .setName('Write prompt to frontmatter')
            .setDesc('Save the subject-matter prompt back to the file')
            .addToggle(toggle => {
                toggle.setValue(this.writeToFrontmatter);
                toggle.onChange((value) => {
                    this.writeToFrontmatter = value;
                });
            });
    }

    private renderProgressSection(containerEl: HTMLElement): void {
        this.progressEl = containerEl.createDiv('image-gin-progress');
        this.progressEl.addClass('image-gin-hidden');
        this.progressEl.createEl('p', {
            text: 'Generating images...',
            cls: 'image-gin-progress-text',
        });
    }

    private renderGenerateButton(containerEl: HTMLElement): void {
        const wrap = containerEl.createDiv();
        const btn = wrap.createEl('button', {
            text: 'Generate images',
            cls: 'image-gin-button',
        });
        btn.addEventListener('click', () => { void this.handleGenerate(); });
    }

    private async handleGenerate(): Promise<void> {
        if (this.isGenerating) return;

        if (!this.imagePrompt.trim()) {
            new Notice('Please enter an image prompt');
            return;
        }
        if (this.selectedSizes.size === 0) {
            new Notice('Please select at least one image size');
            return;
        }
        if (!this.currentFile) {
            new Notice('No active file found');
            return;
        }

        this.isGenerating = true;
        this.showProgress();

        // Persist current modal state so the next open restores it.
        // Save BEFORE generating — even if the API fails, the user's
        // configured preferences are remembered.
        this.plugin.settings.ideogram.lastSession = {
            selectedSizes: Array.from(this.selectedSizes),
            styleType: this.styleType,
            renderingSpeed: this.renderingSpeed,
            magicPrompt: this.magicPrompt,
            layerizeText: this.layerizeText,
            writeToFrontmatter: this.writeToFrontmatter,
        };
        await this.plugin.saveSettings();

        try {
            if (this.writeToFrontmatter) {
                await this.updateFrontmatter(this.plugin.settings.imagePromptKey, this.imagePrompt);
            }

            const service = new IdeogramService(this.plugin.settings, this.app.vault);
            const sizes: ImageSize[] = this.plugin.settings.imageSizes.filter(s => this.selectedSizes.has(s.id));
            const finalPrompt = this.assemblePrompt();

            logger.info('[Ideogram] handleGenerate: selectedSizes =', Array.from(this.selectedSizes));
            logger.info('[Ideogram] handleGenerate: sizes to generate =', sizes.map(s => s.id));

            for (const size of sizes) {
                try {
                    this.updateProgress(`Generating ${size.label}...`);

                    const opts: IdeogramGenerateOptions = {
                        prompt: finalPrompt,
                        aspectRatio: pickAspectRatio(size.width, size.height),
                        renderingSpeed: this.renderingSpeed,
                        styleType: this.styleType,
                        magicPrompt: this.magicPrompt,
                        width: size.width,
                        height: size.height,
                    };
                    if (this.negativePrompt.trim()) opts.negativePrompt = this.negativePrompt;
                    if (this.seed !== undefined) opts.seed = this.seed;

                    const generated = this.layerizeText
                        ? await service.generateAndLayerize(opts)
                        : await service.generateImage(opts);

                    const imagePath = service.getImagePath(
                        'ideogram-image',
                        size.width,
                        size.height,
                        generated.timestamp
                    );
                    await service.saveImage(generated, imagePath);
                    await this.updateFrontmatter(size.yamlKey, imagePath);

                    new Notice(`${size.label} image generated`);
                } catch (error) {
                    logger.error(`Error generating ${size.label} image:`, error);
                    new Notice(`Failed to generate ${size.label}: ${this.errorMessage(error)}`);
                }
            }

            new Notice('Ideogram generation complete');
            this.close();
        } catch (error) {
            logger.error('Error in Ideogram generation:', error);
            new Notice(`Error: ${this.errorMessage(error)}`);
        } finally {
            this.isGenerating = false;
            this.hideProgress();
        }
    }

    private async updateFrontmatter(key: string, value: string): Promise<void> {
        if (!this.currentFile) return;
        const file = this.currentFile;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                fm[key] = value;
            });
        } catch (error) {
            logger.error('Error updating frontmatter:', error);
        }
    }

    private showProgress(): void {
        if (this.progressEl) this.progressEl.removeClass('image-gin-hidden');
    }

    private hideProgress(): void {
        if (this.progressEl) this.progressEl.addClass('image-gin-hidden');
    }

    private updateProgress(message: string): void {
        if (this.progressEl) {
            const textEl = this.progressEl.querySelector('.image-gin-progress-text');
            if (textEl) textEl.textContent = message;
        }
    }

    private errorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        return 'Unknown error';
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
