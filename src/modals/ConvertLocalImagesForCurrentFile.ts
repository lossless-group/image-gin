import { logger } from '../utils/logger';
import type { App, TFile } from 'obsidian';
import { Modal, Setting, Notice, FileSystemAdapter } from 'obsidian';
import type { ToggleComponent } from 'obsidian';
import type ImageGinPlugin from '../../main';
import { ImageKitService } from '../services/imagekitService';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ImageProperty {
    key: string;
    value: string;
    isLocalFile: boolean;
}

export class ConvertLocalImagesForCurrentFile extends Modal {
    private plugin: ImageGinPlugin;
    private currentFile: TFile | null = null;
    private imageProperties: ImageProperty[] = [];
    private markdownImagePaths: { path: string; match: string }[] = [];
    private isConverting: boolean = false;
    private progressEl: HTMLElement | null = null;
    private selectedProperties: Set<string> = new Set();
    private selectedMarkdownImages: Set<string> = new Set();

    // Refs for header "All" master toggles and the per-row toggles they
    // command, mirroring the IdeogramModal pattern so master and rows
    // stay in sync when either is clicked.
    private fmMasterToggle: ToggleComponent | null = null;
    private fmRowToggles: Map<string, ToggleComponent> = new Map();
    private mdMasterToggle: ToggleComponent | null = null;
    private mdRowToggles: Map<string, ToggleComponent> = new Map();

    // Common image properties to check
    private readonly IMAGE_PROPERTIES = [
        'banner_image',
        'portrait_image', 
        'square_image',
        'og_image',
        'featured_image',
        'thumbnail',
        'hero_image',
        'cover_image'
    ];

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app);
        this.plugin = plugin;
        this.currentFile = this.app.workspace.getActiveFile();
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('image-gin-modal');

        if (!this.currentFile) {
            contentEl.createEl('p', { text: 'No active file found.' });
            return;
        }

        // Check if ImageKit is enabled
        if (!this.plugin.settings.imageKit.enabled) {
            contentEl.createEl('h2', { text: 'ImageKit Not Enabled' });
            contentEl.createEl('p', { text: 'Please enable ImageKit CDN in the plugin settings first.' });
            return;
        }

        // Load and analyze current file
        await this.analyzeCurrentFile();

        // Render modal content
        this.renderModalContent();
    }

    private async analyzeCurrentFile(): Promise<void> {
        if (!this.currentFile) return;

        try {
            // Frontmatter via Obsidian's metadata cache — correct on URL
            // values, multi-line strings, etc.; doesn't require us to also
            // parse YAML by hand.
            const frontmatter = this.app.metadataCache.getFileCache(this.currentFile)?.frontmatter;

            // Body content is read separately because we still need to scan
            // it for `![[...]]` image links.
            const content = await this.app.vault.read(this.currentFile);

            // Reset properties
            this.imageProperties = [];
            this.markdownImagePaths = [];

            // 1. Analyze frontmatter
            if (frontmatter) {
                for (const property of this.IMAGE_PROPERTIES) {
                    const value = frontmatter[property];
                    if (value && typeof value === 'string') {
                        const isLocalFile = this.isLocalImagePath(value);
                        this.imageProperties.push({
                            key: property,
                            value: value,
                            isLocalFile: isLocalFile
                        });
                    }
                }
            }

            // 2. Find all markdown image links in content
            const markdownContent = content.replace(/^---[\s\S]*?---/g, ''); // Remove frontmatter
            const imageRegex = /!\[\[([^\]]+)\]\]/g;
            const matches = [...markdownContent.matchAll(imageRegex)];
            
            for (const match of matches) {
                const fullMatch = match[0];
                const imagePath = match[1];
                if (imagePath && this.isLocalImagePath(imagePath)) {
                    this.markdownImagePaths.push({
                        path: imagePath || '',
                        match: fullMatch
                    });
                }
            }

            // Pre-select every eligible row. The common flow is "convert
            // everything in this file" (banner + portrait + square, plus
            // any inline markdown images), so default-on removes the
            // three-clicks-every-time friction the user hit. Already-remote
            // frontmatter URLs stay deselected because their toggle is
            // disabled regardless.
            for (const property of this.imageProperties) {
                if (property.isLocalFile) this.selectedProperties.add(property.key);
            }
            for (const md of this.markdownImagePaths) {
                this.selectedMarkdownImages.add(md.path);
            }

            logger.info('Found image properties:', this.imageProperties);
            logger.info('Found markdown images:', this.markdownImagePaths);
        } catch (error) {
            logger.error('Error analyzing current file:', error);
            this.imageProperties = [];
            this.markdownImagePaths = [];
        }
    }

    private isLocalImagePath(path: string): boolean {
        // Check if it's already an ImageKit URL
        const imagekitService = new ImageKitService(this.plugin.settings);
        if (imagekitService.isImageKitUrl(path)) {
            return false;
        }

        // Check if it's a local file path
        return !path.startsWith('http://') && 
               !path.startsWith('https://') && 
               (path.includes('.png') || path.includes('.jpg') || path.includes('.jpeg') || 
                path.includes('.webp') || path.includes('.gif') || path.includes('.svg'));
    }

    private renderModalContent(): void {
        const { contentEl } = this;

        // Header
        const headerEl = contentEl.createDiv('image-gin-header');
        headerEl.createEl('h2', { text: 'Convert Local Images to ImageKit CDN', cls: 'image-gin-title' });

        if (this.imageProperties.length === 0 && this.markdownImagePaths.length === 0) {
            contentEl.createEl('p', { text: 'No local images found in this file.' });
            return;
        }

        // Instructions
        const instructionsEl = contentEl.createDiv('image-gin-instructions');
        instructionsEl.createEl('p', { 
            text: 'Select the local images you want to upload to ImageKit CDN:' 
        });

        // Frontmatter image properties list
        if (this.imageProperties.length > 0) {
            this.renderImagePropertiesList(contentEl);
        }

        // Markdown content images list
        if (this.markdownImagePaths.length > 0) {
            this.renderMarkdownImagesList(contentEl);
        }

        // Progress section (initially hidden)
        this.renderProgressSection(contentEl);

        // Convert button
        this.renderConvertButton(contentEl);
    }

    /**
     * Build a section header (label + right-aligned "All" master toggle)
     * matching the IdeogramModal Image Sizes section. Returns the toggle
     * component so the caller can wire it up to its row toggles.
     */
    private renderSectionHeaderWithMasterToggle(
        section: HTMLElement,
        title: string,
        initialAllSelected: boolean,
        onMasterChange: (value: boolean) => void
    ): ToggleComponent | null {
        const header = section.createDiv('image-gin-section-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.createEl('span', { text: title });

        const masterWrap = header.createDiv();
        masterWrap.style.display = 'flex';
        masterWrap.style.alignItems = 'center';
        masterWrap.style.gap = '0.5rem';
        masterWrap.createEl('span', {
            text: 'All',
            attr: { style: 'font-size: 0.85em; opacity: 0.75;' },
        });

        let captured: ToggleComponent | null = null;
        new Setting(masterWrap)
            .setClass('image-gin-master-toggle')
            .addToggle(toggle => {
                captured = toggle;
                toggle.setValue(initialAllSelected);
                toggle.setTooltip(`Toggle all ${title.toLowerCase()} on/off`);
                toggle.onChange(onMasterChange);
            });
        // Strip the Setting component's left-info column so the toggle
        // hugs the header's right edge (matches IdeogramModal).
        masterWrap.querySelectorAll('.setting-item-info').forEach(el => el.remove());

        return captured;
    }

    private renderImagePropertiesList(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');

        // Eligible = local files; already-ImageKit URLs are excluded from
        // the master toggle's universe so flipping master-on never tries
        // to "select" an already-converted entry.
        const eligible = this.imageProperties.filter(p => p.isLocalFile);

        this.fmMasterToggle = this.renderSectionHeaderWithMasterToggle(
            section,
            'Frontmatter Images',
            this.areAllFmEligibleSelected(),
            (value) => {
                if (value) {
                    for (const p of eligible) this.selectedProperties.add(p.key);
                } else {
                    for (const p of eligible) this.selectedProperties.delete(p.key);
                }
                for (const p of eligible) {
                    const t = this.fmRowToggles.get(p.key);
                    if (t) t.setValue(this.selectedProperties.has(p.key));
                }
                this.updateConvertButtonState();
            }
        );

        const content = section.createDiv('image-gin-section-content');
        const toggleGroup = content.createDiv('image-gin-toggle-group');

        this.imageProperties.forEach((prop) => {
            const itemEl = toggleGroup.createDiv('image-gin-toggle-item');

            const isAlreadyImageKit = !prop.isLocalFile;
            const statusClass = isAlreadyImageKit ? 'already-imagekit' : 'local-file';
            itemEl.addClass(statusClass);

            new Setting(itemEl)
                .setName(prop.key)
                .setDesc(`${prop.value} ${isAlreadyImageKit ? '(Already ImageKit URL)' : '(Local file)'}`)
                .addToggle(toggle => {
                    if (!isAlreadyImageKit) this.fmRowToggles.set(prop.key, toggle);
                    toggle.setValue(prop.isLocalFile && this.selectedProperties.has(prop.key));
                    toggle.setDisabled(isAlreadyImageKit);
                    toggle.onChange((value) => {
                        if (value) {
                            this.selectedProperties.add(prop.key);
                        } else {
                            this.selectedProperties.delete(prop.key);
                        }
                        if (this.fmMasterToggle) {
                            this.fmMasterToggle.setValue(this.areAllFmEligibleSelected());
                        }
                        this.updateConvertButtonState();
                    });
                });
        });
    }

    private areAllFmEligibleSelected(): boolean {
        const eligible = this.imageProperties.filter(p => p.isLocalFile);
        if (eligible.length === 0) return false;
        return eligible.every(p => this.selectedProperties.has(p.key));
    }

    private areAllMdSelected(): boolean {
        if (this.markdownImagePaths.length === 0) return false;
        return this.markdownImagePaths.every(m => this.selectedMarkdownImages.has(m.path));
    }

    private renderProgressSection(containerEl: HTMLElement): void {
        this.progressEl = containerEl.createDiv('image-gin-progress');
        this.progressEl.style.display = 'none';
        
        this.progressEl.createEl('p', { 
            text: 'Converting images...',
            cls: 'image-gin-progress-text'
        });
    }

    private renderMarkdownImagesList(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('image-gin-section');

        this.mdMasterToggle = this.renderSectionHeaderWithMasterToggle(
            section,
            'Markdown Content Images',
            this.areAllMdSelected(),
            (value) => {
                if (value) {
                    for (const m of this.markdownImagePaths) this.selectedMarkdownImages.add(m.path);
                } else {
                    this.selectedMarkdownImages.clear();
                }
                for (const [path, t] of this.mdRowToggles) {
                    t.setValue(this.selectedMarkdownImages.has(path));
                }
                this.updateConvertButtonState();
            }
        );

        const content = section.createDiv('image-gin-section-content');
        const toggleGroup = content.createDiv('image-gin-toggle-group');

        this.markdownImagePaths.forEach((image, index) => {
            const itemEl = toggleGroup.createDiv('image-gin-toggle-item');

            new Setting(itemEl)
                .setName(`Image ${index + 1}: ${image.path}`)
                .setDesc(`Found in markdown content`)
                .addToggle(toggle => {
                    this.mdRowToggles.set(image.path, toggle);
                    toggle.setValue(this.selectedMarkdownImages.has(image.path));
                    toggle.onChange((value) => {
                        if (value) {
                            this.selectedMarkdownImages.add(image.path);
                        } else {
                            this.selectedMarkdownImages.delete(image.path);
                        }
                        if (this.mdMasterToggle) {
                            this.mdMasterToggle.setValue(this.areAllMdSelected());
                        }
                        this.updateConvertButtonState();
                    });
                });
        });
    }

    private convertButton: HTMLButtonElement | null = null;

    private updateConvertButtonState(): void {
        if (!this.convertButton) return;
        
        const hasSelections = this.selectedProperties.size > 0 || this.selectedMarkdownImages.size > 0;
        if (hasSelections) {
            this.convertButton.removeAttribute('disabled');
        } else {
            this.convertButton.setAttribute('disabled', 'true');
        }
    }

    private renderConvertButton(containerEl: HTMLElement): void {
        const buttonContainer = containerEl.createDiv('image-gin-button-container');
        
        this.convertButton = buttonContainer.createEl('button', {
            text: 'Convert Selected Images',
            cls: 'image-gin-button'
        });

        // Set initial button state
        this.updateConvertButtonState();

        this.convertButton.addEventListener('click', () => {
            void this.handleConvert();
        });
    }

    private async handleConvert(): Promise<void> {
        if (this.isConverting) return;

        if (this.selectedProperties.size === 0 && this.selectedMarkdownImages.size === 0) {
            new Notice('Please select at least one image to convert');
            return;
        }

        if (!this.currentFile) {
            new Notice('No active file found');
            return;
        }

        this.isConverting = true;
        this.showProgress();

        const file = this.currentFile;

        try {
            const imagekitService = new ImageKitService(this.plugin.settings);

            // Read frontmatter via the metadata cache for tag extraction.
            // Frontmatter mutations below go through processFrontMatter
            // (atomic per-call), so we never serialize YAML by hand.
            const cachedFrontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

            // Body mutations are accumulated and flushed in a single
            // vault.read + vault.modify cycle after all uploads are done.
            // This keeps frontmatter writes (processFrontMatter) and body
            // writes (vault.modify) on separate code paths so neither
            // serializes the other's domain.
            const bodyMutations: Array<{ from: string; to: string }> = [];

            let successCount = 0;
            let errorCount = 0;

            // 1. Process frontmatter images
            for (const propertyKey of this.selectedProperties) {
                const property = this.imageProperties.find(p => p.key === propertyKey);
                if (!property || !property.isLocalFile) continue;

                try {
                    this.updateProgress(`Converting ${property.key}...`);

                    // Read the local file
                    const localPath = this.resolveLocalPath(property.value);
                    const fileBuffer = readFileSync(localPath);

                    // Extract tags from frontmatter for ImageKit
                    const tags = imagekitService.extractTagsFromFrontmatter(cachedFrontmatter);

                    // Generate filename
                    const fileName = this.generateFileName(property.key, localPath);

                    // Upload to ImageKit
                    const uploadResult = await imagekitService.uploadFile(
                        fileBuffer.buffer,
                        fileName,
                        undefined, // Use default folder from settings
                        tags
                    );

                    // Update frontmatter with ImageKit URL via Obsidian's API
                    await this.app.fileManager.processFrontMatter(file, (fm) => {
                        fm[property.key] = uploadResult.url;
                    });

                    logger.info(`Successfully converted ${property.key}: ${uploadResult.url}`);
                    successCount++;

                    // Optionally remove local file if setting is enabled
                    if (this.plugin.settings.imageKit.removeLocalFiles) {
                        try {
                            const fs = require('fs');
                            fs.unlinkSync(localPath);
                            logger.info(`Removed local file: ${localPath}`);
                        } catch (removeError) {
                            logger.warn(`Failed to remove local file ${localPath}:`, removeError);
                        }
                    }

                } catch (error) {
                    logger.error(`Error converting ${property.key}:`, error);
                    errorCount++;
                    new Notice(`Failed to convert ${property.key}: ${this.getErrorMessage(error)}`);
                }
            }

            // 2. Process markdown content images
            for (const imagePath of this.selectedMarkdownImages) {
                try {
                    this.updateProgress(`Converting markdown image: ${imagePath}...`);

                    // Find the full match for this path
                    const imageInfo = this.markdownImagePaths.find(img => img.path === imagePath);
                    if (!imageInfo) continue;

                    // Read the local file
                    const localPath = this.resolveLocalPath(imagePath);
                    const fileBuffer = readFileSync(localPath);

                    // Generate a unique filename
                    const fileName = this.generateFileName('content', localPath);

                    // Upload to ImageKit
                    const uploadResult = await imagekitService.uploadFile(
                        fileBuffer.buffer,
                        fileName,
                        undefined, // Use default folder from settings
                        [file.basename, 'markdown'] // Basic tags
                    );

                    // Queue the body replacement for the post-loop flush.
                    bodyMutations.push({
                        from: imageInfo.match,
                        to: `![](${uploadResult.url})`,
                    });

                    logger.info(`Successfully converted markdown image: ${uploadResult.url}`);
                    successCount++;

                    // Optionally remove local file if setting is enabled
                    if (this.plugin.settings.imageKit.removeLocalFiles) {
                        try {
                            const fs = require('fs');
                            fs.unlinkSync(localPath);
                            logger.info(`Removed local file: ${localPath}`);
                        } catch (removeError) {
                            logger.warn(`Failed to remove local file ${localPath}:`, removeError);
                        }
                    }

                } catch (error) {
                    logger.error(`Error converting markdown image ${imagePath}:`, error);
                    errorCount++;
                    new Notice(`Failed to convert image ${imagePath}: ${this.getErrorMessage(error)}`);
                }
            }

            // Flush body mutations in a single read/modify cycle. Frontmatter
            // is already updated above via processFrontMatter, so we re-read
            // here to pick up the latest version (including those updates).
            if (bodyMutations.length > 0) {
                const currentContent = await this.app.vault.read(file);
                let updated = currentContent;
                for (const { from, to } of bodyMutations) {
                    updated = updated.replace(new RegExp(this.escapeRegExp(from), 'g'), to);
                }
                if (updated !== currentContent) {
                    await this.app.vault.modify(file, updated);
                }
            }

            // Show results
            const message = `Conversion complete: ${successCount} successful, ${errorCount} failed`;
            new Notice(message);
            
            if (successCount > 0) {
                this.close();
            }

        } catch (error) {
            logger.error('Error in conversion process:', error);
            new Notice(`Conversion failed: ${this.getErrorMessage(error)}`);
        } finally {
            this.isConverting = false;
            this.hideProgress();
        }
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    private resolveLocalPath(imagePath: string): string {
        // Clean up the path (remove any markdown link syntax)
        let cleanPath = imagePath.trim();
        
        // If it's already an absolute path, use it
        if (cleanPath.startsWith('/')) {
            return cleanPath;
        }

        // Get the vault's filesystem base path. On desktop the adapter is
        // FileSystemAdapter (with getBasePath); on mobile it isn't, and we
        // simply have no filesystem path to anchor against.
        const adapter = this.app.vault.adapter;
        const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';

        // Handle Obsidian-style paths (relative to vault)
        if (cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
            // Resolve relative to current file
            const currentDir = this.currentFile?.parent?.path || '';
            return join(basePath, currentDir, cleanPath);
        }

        // Default: resolve relative to vault root
        return join(basePath, cleanPath);
    }

    private generateFileName(propertyKey: string, localPath: string): string {
        const timestamp = Date.now();
        const extension = localPath.split('.').pop() || 'png';
        const baseName = this.currentFile?.basename || 'image';
        
        return `${baseName}_${propertyKey}_${timestamp}.${extension}`;
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