import { logger } from '../utils/logger';
import type { App, TFile } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import type ImageGinPlugin from '../../main';
import { RecraftImageService } from '../services/recraftImageService';
import type { RecraftStyleParams } from '../services/recraftImageService';
import { STYLE_OPTIONS } from '../settings/settings';
import type { ImageSize } from '../types';
import { asString } from '../utils/coerce';

export function openCurrentFileModal(
    app: App, 
    plugin: ImageGinPlugin
): CurrentFileModal {
    return new CurrentFileModal(app, plugin);
}

export class CurrentFileModal extends Modal {
    private plugin: ImageGinPlugin;
    private imagePrompt: string = '';
    private selectedSizes: Set<string> = new Set();
    private writeToFrontmatter: boolean = true;
    private isGenerating: boolean = false;
    private progressEl: HTMLElement | null = null;
    private currentFile: TFile | null = null;

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app);
        this.plugin = plugin;
        this.currentFile = this.app.workspace.getActiveFile();
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('image-gin-modal');

        // Extract existing image_prompt from frontmatter
        await this.loadExistingPrompt();

        // Render modal content
        this.renderModalContent();
    }

    private async loadExistingPrompt(): Promise<void> {
        if (!this.currentFile) return;

        try {
            // Use Obsidian's metadata cache instead of reading + parsing the
            // file ourselves. The cache is populated from Obsidian's own YAML
            // parser (correct on multi-line strings, URL values with colons,
            // anchors, etc.) and avoids a vault.read for a value we may not
            // even use.
            const frontmatter = this.app.metadataCache.getFileCache(this.currentFile)?.frontmatter;
            const existing = asString(frontmatter?.[this.plugin.settings.imagePromptKey]);
            if (existing) {
                this.imagePrompt = existing;
            }
        } catch (error) {
            logger.error('Error loading existing prompt:', error);
        }
    }

    private renderModalContent(): void {
        const { contentEl } = this;

        // Header
        const headerEl = contentEl.createDiv('image-gin-header');
        headerEl.createEl('h2', { text: 'Generate Images', cls: 'image-gin-title' });

        // Image Prompt Section
        this.renderPromptSection(contentEl);

        // Image Size Selection Section
        this.renderSizeSection(contentEl);

        // Style Display Section
        this.renderStyleSection(contentEl);

        // Frontmatter Option Section
        this.renderFrontmatterSection(contentEl);

        // Progress Section (initially hidden)
        this.renderProgressSection(contentEl);

        // Generate Button
        this.renderGenerateButton(contentEl);
    }

    private renderPromptSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createEl('span', { text: 'Image Prompt' });

        const content = section.createDiv('image-gin-section-content');
        
        const textarea = content.createEl('textarea', {
            cls: 'image-gin-textarea',
            attr: {
                placeholder: this.imagePrompt ? 'Edit your image prompt...' : 'Enter an image prompt...',
                rows: '4'
            }
        });
        
        textarea.value = this.imagePrompt;
        textarea.addEventListener('input', () => {
            this.imagePrompt = textarea.value;
        });
    }

    private renderSizeSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createEl('span', { text: 'Image Sizes' });

        const content = section.createDiv('image-gin-section-content');
        const toggleGroup = content.createDiv('image-gin-toggle-group');

        // Get available sizes from settings
        const availableSizes = this.plugin.settings.imageSizes || [];

        availableSizes.forEach((size: ImageSize) => {
            const toggleItem = toggleGroup.createDiv('image-gin-toggle-item');
            
            new Setting(toggleItem)
                .setName(size.label)
                .setDesc(`${size.width} × ${size.height}`)
                .addToggle(toggle => {
                    toggle.setValue(this.selectedSizes.has(size.id));
                    toggle.onChange((value) => {
                        logger.info(`Toggle changed for ${size.id}: ${value}`);
                        if (value) {
                            this.selectedSizes.add(size.id);
                            logger.info('Added to selectedSizes:', size.id);
                        } else {
                            this.selectedSizes.delete(size.id);
                            logger.info('Removed from selectedSizes:', size.id);
                        }
                        logger.info('Current selectedSizes:', Array.from(this.selectedSizes));
                    });
                });
        });
    }

    private renderStyleSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createEl('span', { text: 'Style Configuration' });

        const content = section.createDiv('image-gin-section-content');
        
        const styleSettings = this.plugin.settings.style;
        
        if (styleSettings.useCustomStyle) {
            content.createEl('p', { 
                text: `Using Custom Style: ${styleSettings.customStyleId || 'Not specified'}`,
                cls: 'style-display'
            });
        } else {
            const baseStyle = styleSettings.presetStyle.base;
            const substyle = styleSettings.presetStyle.substyle;
            const styleGroup = STYLE_OPTIONS[baseStyle];
            
            if (styleGroup) {
                const substyleLabel = substyle 
                    ? styleGroup.substyles.find(s => s.id === substyle)?.label || substyle
                    : 'Default';
                
                content.createEl('p', { 
                    text: `${styleGroup.label} - ${substyleLabel}`,
                    cls: 'style-display'
                });
            } else {
                content.createEl('p', { 
                    text: `Style: ${baseStyle}`,
                    cls: 'style-display'
                });
            }
        }
    }

    private renderFrontmatterSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');
        const header = section.createDiv('image-gin-section-header');
        header.createEl('span', { text: 'Frontmatter Options' });

        const content = section.createDiv('image-gin-section-content');
        
        new Setting(content)
            .setName('Write prompt to frontmatter')
            .setDesc('Save the image prompt to the file\'s frontmatter')
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
            cls: 'image-gin-progress-text'
        });
    }

    private renderGenerateButton(containerEl: HTMLElement): void {
        const buttonContainer = containerEl.createDiv();
        
        const generateBtn = buttonContainer.createEl('button', {
            text: 'Generate Images',
            cls: 'image-gin-button'
        });

        generateBtn.addEventListener('click', () => {
            void this.handleGenerate();
        });
    }

    private async handleGenerate(): Promise<void> {
        if (this.isGenerating) return;

        // Validation
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
            // Update frontmatter if requested
            if (this.writeToFrontmatter) {
                await this.updateFrontmatter();
            }

            // Initialize the image service
            const imageService = new RecraftImageService(this.plugin.settings, this.app.vault);

            // Get selected sizes
            const availableSizes = this.plugin.settings.imageSizes || [];
            logger.info('Available sizes:', availableSizes.map(s => s.id));
            logger.info('Selected sizes:', Array.from(this.selectedSizes));
            const sizesToGenerate = availableSizes.filter(size => this.selectedSizes.has(size.id));
            logger.info('Sizes to generate:', sizesToGenerate.map(s => s.id));

            // Prepare style parameters
            const styleParams = this.getStyleParams();

            // Generate images for each selected size
            for (const size of sizesToGenerate) {
                try {
                    this.updateProgress(`Generating ${size.label} image...`);
                    
                    const generatedImage = await imageService.generateImage(
                        this.imagePrompt,
                        size.width,
                        size.height,
                        styleParams
                    );

                    // Save the image
                    const imagePath = imageService.getImagePath(
                        'generated-image',
                        size.width,
                        size.height,
                        generatedImage.timestamp
                    );

                    await imageService.saveImage(generatedImage, imagePath);

                    // Update frontmatter with image path
                    await this.updateImagePathInFrontmatter(size.yamlKey, imagePath);

                    new Notice(`${size.label} image generated successfully`);
                } catch (error) {
                    logger.error(`Error generating ${size.label} image:`, error);
                    new Notice(`Failed to generate ${size.label} image: ${this.getErrorMessage(error)}`);
                }
            }

            new Notice('Image generation completed');
            this.close();

        } catch (error) {
            logger.error('Error in image generation process:', error);
            new Notice(`Error: ${this.getErrorMessage(error)}`);
        } finally {
            this.isGenerating = false;
            this.hideProgress();
        }
    }

    private getStyleParams(): RecraftStyleParams {
        const styleSettings = this.plugin.settings.style;

        // Try to use custom style from imageStylesJSON first
        try {
            const customStyles: unknown = JSON.parse(this.plugin.settings.imageStylesJSON);
            if (Array.isArray(customStyles) && customStyles.length > 0) {
                const firstStyle: unknown = customStyles[0];
                if (firstStyle && typeof firstStyle === 'object' && 'id' in firstStyle && typeof firstStyle.id === 'string') {
                    logger.info('Using custom style ID:', firstStyle.id);
                    return { style_id: firstStyle.id };
                }
            }
        } catch (error) {
            logger.warn('Failed to parse imageStylesJSON, falling back to preset styles:', error);
        }

        // Fallback to preset styles
        if (styleSettings.useCustomStyle && styleSettings.customStyleId) {
            return { style_id: styleSettings.customStyleId };
        }

        const params: RecraftStyleParams = { style: styleSettings.presetStyle.base };
        if (styleSettings.presetStyle.substyle) {
            params.substyle = styleSettings.presetStyle.substyle;
        }
        return params;
    }

    private async updateFrontmatter(): Promise<void> {
        if (!this.currentFile) return;
        const file = this.currentFile;
        const key = this.plugin.settings.imagePromptKey;
        const value = this.imagePrompt;

        try {
            // processFrontMatter reads, mutates, and writes atomically via
            // Obsidian's own YAML emitter — handles edge cases (URL values,
            // multi-line strings, list-of-maps) the old hand-rolled emitter
            // mishandled.
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm[key] = value;
            });
        } catch (error) {
            logger.error('Error updating frontmatter:', error);
            throw new Error('Failed to update frontmatter');
        }
    }

    private async updateImagePathInFrontmatter(yamlKey: string, imagePath: string): Promise<void> {
        if (!this.currentFile) return;
        const file = this.currentFile;

        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm[yamlKey] = imagePath;
            });
        } catch (error) {
            logger.error('Error updating image path in frontmatter:', error);
            // Don't throw here as the image was still generated successfully
        }
    }

    private showProgress(): void {
        if (this.progressEl) {
            this.progressEl.style.display = 'block';
        }
    }

    private hideProgress(): void {
        if (this.progressEl) {
            this.progressEl.style.display = 'none';
        }
    }

    private updateProgress(message: string): void {
        if (this.progressEl) {
            const textEl = this.progressEl.querySelector('.image-gin-progress-text');
            if (textEl) {
                textEl.textContent = message;
            }
        }
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'An unknown error occurred';
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}