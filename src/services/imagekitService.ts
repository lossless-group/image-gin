import { logger } from '../utils/logger';
import { requestUrl } from 'obsidian';
import type { ImageGinSettings } from '../settings/settings';
import { isRecord } from '../utils/coerce';

export interface ImageKitUploadResult {
    fileId: string;
    name: string;
    url: string;
    thumbnailUrl: string;
    height: number;
    width: number;
    size: number;
    filePath: string;
    tags: string[];
    isPrivateFile: boolean;
    customCoordinates: string | null;
    fileType: string;
}

export class ImageKitService {
    private settings: ImageGinSettings;

    constructor(settings: ImageGinSettings) {
        this.settings = settings;
    }

    /**
     * Upload a file to ImageKit using raw HTTP requests
     */
    async uploadFile(
        fileBuffer: ArrayBuffer,
        fileName: string,
        folder?: string,
        tags?: string[]
    ): Promise<ImageKitUploadResult> {
        if (!this.settings.imageKit.enabled) {
            throw new Error('ImageKit is not enabled in settings');
        }

        if (!this.settings.imageKit.privateKey) {
            throw new Error('ImageKit private key is not configured');
        }

        // Prepare filename (convert to WebP if enabled)
        let finalFileName = fileName;
        if (this.settings.imageKit.convertToWebp && !fileName.endsWith('.webp') && !fileName.endsWith('.svg')) {
            finalFileName = fileName.replace(/\.[^.]+$/, '.webp');
        }

        // Build multipart form data manually (Obsidian doesn't support FormData)
        const boundary = '----formdata-obsidian-' + Math.random().toString(36);
        const formFields: string[] = [];
        
        // Add fileName field
        formFields.push(`--${boundary}`);
        formFields.push('Content-Disposition: form-data; name="fileName"');
        formFields.push('');
        formFields.push(finalFileName);
        
        // Add folder field
        const uploadFolder = folder || this.settings.imageKit.uploadFolder;
        if (uploadFolder) {
            formFields.push(`--${boundary}`);
            formFields.push('Content-Disposition: form-data; name="folder"');
            formFields.push('');
            formFields.push(uploadFolder);
        }
        
        // Add tags field
        if (tags && tags.length > 0) {
            formFields.push(`--${boundary}`);
            formFields.push('Content-Disposition: form-data; name="tags"');
            formFields.push('');
            formFields.push(tags.join(','));
        }
        
        // Add file field
        formFields.push(`--${boundary}`);
        formFields.push(`Content-Disposition: form-data; name="file"; filename="${finalFileName}"`);
        formFields.push('Content-Type: application/octet-stream');
        formFields.push('');
        
        // Convert form fields to bytes
        const formHeader = formFields.join('\r\n') + '\r\n';
        const formFooter = `\r\n--${boundary}--\r\n`;
        
        // Combine header + file + footer
        const headerBytes = new TextEncoder().encode(formHeader);
        const footerBytes = new TextEncoder().encode(formFooter);
        const fileBytes = new Uint8Array(fileBuffer);
        
        const totalLength = headerBytes.length + fileBytes.length + footerBytes.length;
        const combinedBuffer = new Uint8Array(totalLength);
        
        combinedBuffer.set(headerBytes, 0);
        combinedBuffer.set(fileBytes, headerBytes.length);
        combinedBuffer.set(footerBytes, headerBytes.length + fileBytes.length);

        logger.info('Uploading to ImageKit:', {
            fileName: finalFileName,
            folder: uploadFolder,
            tags: tags?.join(','),
            endpoint: this.settings.imageKit.uploadEndpoint,
            contentLength: totalLength
        });

        try {
            const response = await requestUrl({
                url: this.settings.imageKit.uploadEndpoint,
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${btoa(this.settings.imageKit.privateKey + ':')}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                body: combinedBuffer.buffer
            });

            if (response.status !== 200) {
                logger.error('ImageKit upload failed:', {
                    status: response.status,
                    response: response.text
                });
                throw new Error(`ImageKit upload failed with status ${response.status}: ${response.text}`);
            }

            const result: ImageKitUploadResult = (typeof response.json === 'function'
                ? (await (response.json as () => Promise<unknown>)())
                : response.json) as ImageKitUploadResult;
            logger.info('ImageKit upload successful:', result.url);

            return result;
        } catch (error) {
            logger.error('Error uploading to ImageKit:', error);
            throw error;
        }
    }

    /**
     * Check if a URL is already an ImageKit URL
     */
    isImageKitUrl(url: string): boolean {
        if (!url) return false;
        return url.includes('ik.imagekit.io') || url.includes(this.settings.imageKit.urlEndpoint);
    }

    /**
     * Generate tags from frontmatter for ImageKit metadata.
     * Frontmatter is treated as untrusted: callers may pass anything
     * (object, array, primitive). Returns deduped non-empty string tags.
     */
    extractTagsFromFrontmatter(frontmatter: unknown): string[] {
        if (!isRecord(frontmatter)) return [];

        const rawTags = frontmatter.tags;
        const tags: string[] = [];

        if (Array.isArray(rawTags)) {
            for (const t of rawTags) {
                if (typeof t === 'string') tags.push(t);
            }
        } else if (typeof rawTags === 'string') {
            try {
                // Try parsing as JSON array first
                const parsed: unknown = JSON.parse(rawTags);
                if (Array.isArray(parsed)) {
                    for (const t of parsed) {
                        if (typeof t === 'string') tags.push(t);
                    }
                } else {
                    // Fallback: split on comma or hyphen
                    tags.push(...rawTags.split(/[,-]/).map(s => s.trim()).filter(Boolean));
                }
            } catch {
                // Not JSON, fallback: split on comma or hyphen
                tags.push(...rawTags.split(/[,-]/).map(s => s.trim()).filter(Boolean));
            }
        }

        // Remove duplicates and clean up
        return [...new Set(tags)].filter(Boolean);
    }
}