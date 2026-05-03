import { logger } from '../utils/logger';
import type { App, TFile } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
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
    private writeToFrontmatter: boolean = true;

    private styleType: IdeogramStyleType;
    private renderingSpeed: IdeogramRenderingSpeed;
    private magicPrompt: IdeogramMagicPrompt;
    private negativePrompt: string;
    private layerizeText: boolean;
    private seed: number | undefined;

    private isGenerating: boolean = false;
    private progressEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app);
        this.plugin = plugin;
        this.currentFile = this.app.workspace.getActiveFile();

        const defaults = this.plugin.settings.ideogram.defaults;
        this.styleType = defaults.styleType;
        this.renderingSpeed = defaults.renderingSpeed;
        this.magicPrompt = defaults.magicPrompt;
        this.negativePrompt = this.plugin.settings.ideogram.brandTemplate.baseNegativePrompt;
        this.layerizeText = this.plugin.settings.ideogram.layerizeText;
        this.seed = undefined;
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('image-gin-modal');

        this.applyFrontmatterOverrides();
        this.renderModalContent();
    }

    private applyFrontmatterOverrides(): void {
        if (!this.currentFile) return;
        const frontmatter = this.app.metadataCache.getFileCache(this.currentFile)?.frontmatter;
        if (!frontmatter) return;

        const existingPrompt = asString(frontmatter[this.plugin.settings.imagePromptKey]);
        if (existingPrompt) this.imagePrompt = existingPrompt;

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
        headerEl.createEl('h2', { text: 'Generate Images (Ideogram)', cls: 'image-gin-title' });

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
        header.createEl('span', { text: 'Image Prompt (subject matter)' });

        const content = section.createDiv('image-gin-section-content');
        const textarea = content.createEl('textarea', {
            cls: 'image-gin-textarea',
            attr: {
                placeholder: 'Enter the subject matter; brand template wraps it automatically',
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
        header.createEl('span', { text: 'Resolved Prompt Preview' });

        const content = section.createDiv('image-gin-section-content');
        this.previewEl = content.createEl('pre', { cls: 'image-gin-preview' });
        this.previewEl.style.whiteSpace = 'pre-wrap';
        this.previewEl.style.padding = '8px';
        this.previewEl.style.backgroundColor = 'var(--background-secondary)';
        this.previewEl.style.borderRadius = '4px';
        this.previewEl.style.fontSize = '0.85em';

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
        header.createEl('span', { text: 'Image Sizes' });

        const content = section.createDiv('image-gin-section-content');
        const toggleGroup = content.createDiv('image-gin-toggle-group');

        for (const size of this.plugin.settings.imageSizes) {
            const ratio = pickAspectRatio(size.width, size.height);
            const toggleItem = toggleGroup.createDiv('image-gin-toggle-item');
            new Setting(toggleItem)
                .setName(size.label)
                .setDesc(`${size.width} × ${size.height} → Ideogram ${ratio}`)
                .addToggle(toggle => {
                    toggle.setValue(this.selectedSizes.has(size.id));
                    toggle.onChange((value) => {
                        if (value) this.selectedSizes.add(size.id);
                        else this.selectedSizes.delete(size.id);
                    });
                });
        }
    }

    private renderOverridesSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createEl('span', { text: 'Per-call Overrides' });

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
        negativeWrap.createEl('label', { text: 'Negative prompt (base + frontmatter merged; edit to append more)' });
        const negativeArea = negativeWrap.createEl('textarea', { attr: { rows: '2' } });
        negativeArea.style.width = '100%';
        negativeArea.style.fontFamily = 'monospace';
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
        header.createEl('span', { text: 'Frontmatter Options' });

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
        this.progressEl.style.display = 'none';
        this.progressEl.createEl('p', {
            text: 'Generating images...',
            cls: 'image-gin-progress-text',
        });
    }

    private renderGenerateButton(containerEl: HTMLElement): void {
        const wrap = containerEl.createDiv();
        const btn = wrap.createEl('button', {
            text: 'Generate Images',
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

        try {
            if (this.writeToFrontmatter) {
                await this.updateFrontmatter(this.plugin.settings.imagePromptKey, this.imagePrompt);
            }

            const service = new IdeogramService(this.plugin.settings, this.app.vault);
            const sizes: ImageSize[] = this.plugin.settings.imageSizes.filter(s => this.selectedSizes.has(s.id));
            const finalPrompt = this.assemblePrompt();

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
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm[key] = value;
            });
        } catch (error) {
            logger.error('Error updating frontmatter:', error);
        }
    }

    private showProgress(): void {
        if (this.progressEl) this.progressEl.style.display = 'block';
    }

    private hideProgress(): void {
        if (this.progressEl) this.progressEl.style.display = 'none';
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
