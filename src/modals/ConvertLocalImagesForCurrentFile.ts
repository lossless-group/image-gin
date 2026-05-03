import { logger } from '../utils/logger';
import type { App, TFile } from 'obsidian';
import { Modal, Setting, Notice, FileSystemAdapter } from 'obsidian';
import type ImageGinPlugin from '../../main';
import { extractFrontmatter, formatFrontmatter } from '../utils/yamlFrontmatter';
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
            const content = await this.app.vault.read(this.currentFile);
            const frontmatter = extractFrontmatter(content);
            
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
            contentEl.createEl('h3', { 
                text: 'Frontmatter Images',
                cls: 'image-gin-section-header'
            });
            this.renderImagePropertiesList(contentEl);
        }

        // Markdown content images list
        if (this.markdownImagePaths.length > 0) {
            contentEl.createEl('h3', { 
                text: 'Markdown Content Images',
                cls: 'image-gin-section-header'
            });
            this.renderMarkdownImagesList(contentEl);
        }

        // Progress section (initially hidden)
        this.renderProgressSection(contentEl);

        // Convert button
        this.renderConvertButton(contentEl);
    }

    private renderImagePropertiesList(containerEl: HTMLElement): void {
        const listContainer = containerEl.createDiv('image-gin-properties-list');

        this.imageProperties.forEach((prop) => {
            const itemEl = listContainer.createDiv('image-gin-property-item');
            
            const isAlreadyImageKit = !prop.isLocalFile;
            const statusClass = isAlreadyImageKit ? 'already-imagekit' : 'local-file';
            itemEl.addClass(statusClass);

            new Setting(itemEl)
                .setName(prop.key)
                .setDesc(`${prop.value} ${isAlreadyImageKit ? '(Already ImageKit URL)' : '(Local file)'}`)
                .addToggle(toggle => {
                    toggle.setValue(prop.isLocalFile && this.selectedProperties.has(prop.key));
                    toggle.setDisabled(isAlreadyImageKit);
                    toggle.onChange((value) => {
                        if (value) {
                            this.selectedProperties.add(prop.key);
                        } else {
                            this.selectedProperties.delete(prop.key);
                        }
                        this.updateConvertButtonState();
                    });
                });
        });
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
        const listContainer = containerEl.createDiv('image-gin-markdown-images-list');

        this.markdownImagePaths.forEach((image, index) => {
            const itemEl = listContainer.createDiv('image-gin-markdown-item');
            
            new Setting(itemEl)
                .setName(`Image ${index + 1}: ${image.path}`)
                .setDesc(`Found in markdown content`)
                .addToggle(toggle => {
                    toggle.setValue(this.selectedMarkdownImages.has(image.path));
                    toggle.onChange((value) => {
                        if (value) {
                            this.selectedMarkdownImages.add(image.path);
                        } else {
                            this.selectedMarkdownImages.delete(image.path);
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

        try {
            const imagekitService = new ImageKitService(this.plugin.settings);
            
            // Get current content
            let content = await this.app.vault.read(this.currentFile);
            const frontmatter = extractFrontmatter(content) || {};
            let markdownContent = content.replace(/^---[\s\S]*?---/g, ''); // Remove frontmatter

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
                    const tags = imagekitService.extractTagsFromFrontmatter(frontmatter);
                    
                    // Generate filename
                    const fileName = this.generateFileName(property.key, localPath);
                    
                    // Upload to ImageKit
                    const uploadResult = await imagekitService.uploadFile(
                        fileBuffer.buffer,
                        fileName,
                        undefined, // Use default folder from settings
                        tags
                    );

                    // Update frontmatter with ImageKit URL
                    frontmatter[property.key] = uploadResult.url;
                    
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
                        [this.currentFile.basename, 'markdown'] // Basic tags
                    );
                    
                    // Replace the markdown image with the new URL
                    markdownContent = markdownContent.replace(
                        new RegExp(this.escapeRegExp(imageInfo.match), 'g'),
                        `![](${uploadResult.url})`
                    );
                    
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

            // Update file with converted content
            if (successCount > 0) {
                let newContent = '';
                
                // Reconstruct the file with updated frontmatter and content
                if (Object.keys(frontmatter).length > 0) {
                    const formattedFrontmatter = formatFrontmatter(frontmatter);
                    newContent = `---\n${formattedFrontmatter}---\n\n${markdownContent}`;
                } else {
                    newContent = markdownContent;
                }
                
                await this.app.vault.modify(this.currentFile, newContent);
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