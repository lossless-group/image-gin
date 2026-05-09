import { logger } from '../utils/logger';
import type { App } from 'obsidian';
import { Modal, Setting, Notice, TFile } from 'obsidian';
import type ImageGinPlugin from '../../main';
import { ImageKitService } from '../services/imagekitService';
import { dirname, basename } from 'path';

interface LocalImageReference {
    filePath: string;
    fileName: string;
    imagePath: string;
    imageName: string;
    fullMatch: string;
    lineNumber: number;
    selected: boolean;
}

export class BatchDirectoryConvertLocalToRemote extends Modal {
    private plugin: ImageGinPlugin;
    private currentDirectory: string = '';
    private localImages: LocalImageReference[] = [];
    private isScanning: boolean = false;
    private isConverting: boolean = false;
    private progressEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;

    private selectAllCheckbox: HTMLInputElement | null = null;

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app);
        this.plugin = plugin;
        this.initializeCurrentDirectory();
    }

    private initializeCurrentDirectory(): void {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            // Get the directory of the current file
            const filePath = activeFile.path;
            const fileDir = dirname(filePath);
            this.currentDirectory = fileDir === '.' ? '' : fileDir;
        } else {
            this.currentDirectory = '';
        }
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('batch-directory-modal');

        // Check if ImageKit is enabled
        if (!this.plugin.settings.imageKit.enabled) {
            this.renderImageKitDisabledMessage(contentEl);
            return;
        }

        this.renderModalContent(contentEl);
    }

    private renderImageKitDisabledMessage(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('modal-section');
        section.createEl('h3', { text: 'ImageKit not enabled' });
        
        const content = section.createDiv();
        content.createEl('p', { 
            text: 'Please enable ImageKit CDN in the plugin settings before using this feature.' 
        });
    }

    private renderModalContent(containerEl: HTMLElement): void {
        // Header
        const headerEl = containerEl.createDiv('image-gin-header');
        headerEl.createEl('h2', { 
            text: 'Batch convert local images to remote', 
            cls: 'image-gin-title' 
        });

        // Directory Selection Section
        this.renderDirectorySection(containerEl);

        // Search Section
        this.renderSearchSection(containerEl);

        // Results Section
        this.renderResultsSection(containerEl);

        // Progress Section
        this.renderProgressSection(containerEl);

        // Convert Button Section
        this.renderConvertSection(containerEl);
    }

    private renderDirectorySection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('modal-section');
        section.createEl('h3', { text: 'Directory selection' });

        const content = section.createDiv();
        
        new Setting(content)
            .setName('Directory path')
            .setDesc('Current directory to scan for markdown files with local images')
            .addText(text => {
                text.setValue(this.currentDirectory)
                    .setPlaceholder('Enter directory path or leave empty for vault root')
                    .onChange((value) => {
                        this.currentDirectory = value;
                    });
            });
    }

    private renderSearchSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('modal-section');
        section.createEl('h3', { text: 'Search for local images' });

        const content = section.createDiv();
        
        const searchBtn = content.createEl('button', {
            text: 'Search for local images',
            cls: 'image-gin-button'
        });

        searchBtn.addEventListener('click', () => {
            void this.handleSearch();
        });
    }

    private renderResultsSection(containerEl: HTMLElement): void {
        this.resultsEl = containerEl.createDiv('modal-section');
        this.resultsEl.addClass('image-gin-hidden');
        
        // Create header with justified layout
        const headerContainer = this.resultsEl.createDiv('flex-row');
        headerContainer.addClass('image-gin-row-with-margin');
        
        headerContainer.createEl('h3', { text: 'Found local images' });
        
        // Select All checkbox in header
        const selectAllLabel = headerContainer.createEl('label', {
            cls: 'flex-row',
            attr: { style: 'display: flex; align-items: center; gap: 0.5rem; font-weight: 600;' }
        });
        
        this.selectAllCheckbox = selectAllLabel.createEl('input', {
            type: 'checkbox',
            attr: { checked: 'true' }
        });
        
        selectAllLabel.createSpan({ text: 'Select All' });
        
        this.selectAllCheckbox.addEventListener('change', () => {
            const isChecked = this.selectAllCheckbox?.checked || false;
            this.localImages.forEach(img => img.selected = isChecked);
            this.updateImageCheckboxes(isChecked);
        });
    }

    private renderProgressSection(containerEl: HTMLElement): void {
        this.progressEl = containerEl.createDiv('image-gin-progress');
        this.progressEl.addClass('image-gin-hidden');
        
        this.progressEl.createEl('p', { 
            text: 'Processing...',
            cls: 'image-gin-progress-text'
        });
    }

    private renderConvertSection(containerEl: HTMLElement): void {
        const section = containerEl.createDiv('modal-section');
        section.createEl('h3', { text: 'Convert images' });

        const content = section.createDiv();
        
        const convertBtn = content.createEl('button', {
            text: 'Convert images for directory',
            cls: 'image-gin-button'
        });

        convertBtn.addEventListener('click', () => {
            void this.handleConvert();
        });
    }

    private async handleSearch(): Promise<void> {
        if (this.isScanning) return;

        this.isScanning = true;
        this.showProgress('Scanning directory for local images...');
        this.localImages = [];

        try {
            await this.scanDirectoryForLocalImages();
            this.renderImageResults();
            
            if (this.localImages.length === 0) {
                new Notice('No local images found in the specified directory');
            } else {
                new Notice(`Found ${this.localImages.length} local image references`);
            }
        } catch (error) {
            logger.error('Error scanning directory:', error);
            new Notice(`Error scanning directory: ${this.getErrorMessage(error)}`);
        } finally {
            this.isScanning = false;
            this.hideProgress();
        }
    }

    private async scanDirectoryForLocalImages(): Promise<void> {
        const vault = this.app.vault;
        const files = vault.getMarkdownFiles();
        
        // Filter files by directory if specified
        const targetFiles = this.currentDirectory 
            ? files.filter(file => file.path.startsWith(this.currentDirectory))
            : files;

        for (const file of targetFiles) {
            try {
                const content = await vault.read(file);
                const localImageRefs = this.extractLocalImageReferences(content, file.path);
                this.localImages.push(...localImageRefs);
            } catch (error) {
                logger.error(`Error reading file ${file.path}:`, error);
            }
        }
    }

    private extractLocalImageReferences(content: string, filePath: string): LocalImageReference[] {
        const references: LocalImageReference[] = [];
        const lines = content.split('\n');
        
        // Regex to match ![[path/to/image]] syntax
        const localImageRegex = /!\[\[([^\]]+)\]\]/g;
        
        lines.forEach((line, index) => {
            let match;
            while ((match = localImageRegex.exec(line)) !== null) {
                const fullMatch = match[0];
                const imagePath = match[1];
                
                // Check if this is a local image (not a URL)
                if (!this.isRemoteUrl(imagePath ?? '')) {
                    references.push({
                        filePath: filePath,
                        fileName: basename(filePath),
                        imagePath: imagePath ?? '',
                        imageName: basename(imagePath ?? ''),
                        fullMatch: fullMatch,
                        lineNumber: index + 1,
                        selected: true // Default to selected
                    });
                }
            }
        });
        
        return references;
    }

    private isRemoteUrl(path: string): boolean {
        return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//');
    }

    private renderImageResults(): void {
        if (!this.resultsEl) return;
        
        // Clear previous results (but keep the header)
        const existingContent = this.resultsEl.querySelector('.setting-item');
        if (existingContent) {
            existingContent.remove();
        }

        if (this.localImages.length === 0) {
            this.resultsEl.addClass('image-gin-hidden');
            return;
        }

        this.resultsEl.removeClass('image-gin-hidden');
        const content = this.resultsEl.createDiv('setting-item');
        
        // Images table (Select All checkbox is now in the header)
        const table = content.createEl('table', {
            cls: 'image-results-table',
            attr: { style: 'width: 100%; border-collapse: collapse;' }
        });
        
        // Table header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Select', attr: { style: 'width: 60px; padding: 0.5rem; border: 1px solid var(--background-modifier-border); background: var(--background-secondary);' } });
        headerRow.createEl('th', { text: 'File', attr: { style: 'padding: 0.5rem; border: 1px solid var(--background-modifier-border); background: var(--background-secondary);' } });
        headerRow.createEl('th', { text: 'Image', attr: { style: 'padding: 0.5rem; border: 1px solid var(--background-modifier-border); background: var(--background-secondary);' } });
        
        // Table body
        const tbody = table.createEl('tbody');
        
        this.localImages.forEach((imageRef, index) => {
            const row = tbody.createEl('tr');
            
            // Checkbox cell
            const checkboxCell = row.createEl('td', {
                attr: { style: 'padding: 0.5rem; border: 1px solid var(--background-modifier-border); text-align: center;' }
            });
            
            const checkbox = checkboxCell.createEl('input', {
                type: 'checkbox',
                attr: { 
                    checked: imageRef.selected ? 'true' : '',
                    'data-index': index.toString()
                }
            });
            
            checkbox.addEventListener('change', () => {
                const currentImageRef = this.localImages[index];
                if (currentImageRef) {
                    currentImageRef.selected = checkbox.checked;
                    this.updateSelectAllCheckbox();
                }
            });
            
            // File cell
            row.createEl('td', { 
                text: imageRef.fileName,
                attr: { style: 'padding: 0.5rem; border: 1px solid var(--background-modifier-border);' }
            });
            
            // Image cell
            row.createEl('td', { 
                text: imageRef.imageName,
                attr: { style: 'padding: 0.5rem; border: 1px solid var(--background-modifier-border);' }
            });
        });
    }

    private updateImageCheckboxes(checked: boolean): void {
        if (!this.resultsEl) return;
        const checkboxes = this.resultsEl.querySelectorAll('input[type="checkbox"][data-index]');
        checkboxes.forEach((checkbox) => {
            (checkbox as HTMLInputElement).checked = checked;
        });
    }

    private updateSelectAllCheckbox(): void {
        if (!this.selectAllCheckbox) return;
        
        const selectedCount = this.localImages.filter(img => img.selected).length;
        const totalCount = this.localImages.length;
        
        if (selectedCount === 0) {
            this.selectAllCheckbox.checked = false;
            this.selectAllCheckbox.indeterminate = false;
        } else if (selectedCount === totalCount) {
            this.selectAllCheckbox.checked = true;
            this.selectAllCheckbox.indeterminate = false;
        } else {
            this.selectAllCheckbox.checked = false;
            this.selectAllCheckbox.indeterminate = true;
        }
    }

    private async handleConvert(): Promise<void> {
        if (this.isConverting) return;

        const selectedImages = this.localImages.filter(img => img.selected);
        if (selectedImages.length === 0) {
            new Notice('Please select at least one image to convert');
            return;
        }

        this.isConverting = true;
        this.showProgress(`Converting ${selectedImages.length} images...`);

        try {
            const imageKitService = new ImageKitService(this.plugin.settings);
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < selectedImages.length; i++) {
                const imageRef = selectedImages[i];
                
                if (!imageRef) continue;
                
                try {
                    this.updateProgress(`Converting ${i + 1}/${selectedImages.length}: ${imageRef.imageName}`);
                    
                    await this.convertSingleImage(imageRef, imageKitService);
                    successCount++;
                } catch (error) {
                    logger.error(`Error converting ${imageRef.imagePath}:`, error);
                    errorCount++;
                }
            }

            const message = `Conversion completed: ${successCount} successful, ${errorCount} failed`;
            new Notice(message);
            
            if (successCount > 0) {
                // Refresh the search results to show updated state
                await this.handleSearch();
            }

        } catch (error) {
            logger.error('Error in batch conversion:', error);
            new Notice(`Error during conversion: ${this.getErrorMessage(error)}`);
        } finally {
            this.isConverting = false;
            this.hideProgress();
        }
    }

    private async convertSingleImage(
        imageRef: LocalImageReference, 
        imageKitService: ImageKitService
    ): Promise<void> {
        // Get the file from vault
        const file = this.app.vault.getAbstractFileByPath(imageRef.filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${imageRef.filePath}`);
        }

        // Read the image file
        const imageFile = this.app.vault.getAbstractFileByPath(imageRef.imagePath);
        if (!(imageFile instanceof TFile)) {
            throw new Error(`Image file not found: ${imageRef.imagePath}`);
        }

        // Upload to ImageKit
        const imageBuffer = await this.app.vault.readBinary(imageFile);
        const uploadFolder = this.plugin.settings.imageKit.uploadFolder || '';
        const uploadResult = await imageKitService.uploadFile(
            imageBuffer,
            imageRef.imageName,
            uploadFolder
        );

        // Replace the local reference with remote URL in the markdown file
        const content = await this.app.vault.read(file);
        const newContent = content.replace(
            imageRef.fullMatch,
            `![${imageRef.imageName}](${uploadResult.url})`
        );

        await this.app.vault.modify(file, newContent);

        // Optionally remove local file if setting is enabled
        if (this.plugin.settings.imageKit.removeLocalFiles) {
            try {
                await this.app.vault.delete(imageFile);
            } catch (error) {
                logger.warn(`Could not delete local file ${imageRef.imagePath}:`, error);
            }
        }
    }

    private showProgress(message: string): void {
        if (this.progressEl) {
            this.progressEl.removeClass('image-gin-hidden');
            const textEl = this.progressEl.querySelector('.image-gin-progress-text');
            if (textEl) {
                textEl.textContent = message;
            }
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

    private hideProgress(): void {
        if (this.progressEl) {
            this.progressEl.addClass('image-gin-hidden');
        }
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    onClose(): void {
        // Clean up any ongoing operations
        this.isScanning = false;
        this.isConverting = false;
    }
}