import { Notice } from 'obsidian';
import type { DropGateContext, DropGateDestination } from './types';
import type { ImageGinSettings } from '../settings/settings';
import { ImageKitService } from '../services/imagekitService';
import { fileNameFor } from '../utils/dropGateEvents';

/**
 * Wraps the existing ImageKitService — the same multipart-upload pipeline
 * image-gin already uses for its "Convert Local Images to Remote" command.
 *
 * Folder resolution: drop-gate-specific folder override
 * (settings.dropGate.imageKitFolder) takes precedence; falls back to the
 * main settings.imageKit.uploadFolder when blank. Both come straight from
 * the user's settings — never hardcoded.
 */
export class ImageKitDestination implements DropGateDestination {
    readonly id = 'imagekit' as const;
    readonly label = 'ImageKit (private CDN)';

    constructor(private readonly getSettings: () => ImageGinSettings) {}

    get description(): string {
        const folder = this.resolveFolder();
        return folder
            ? `Upload to ImageKit folder "${folder}". Private host.`
            : 'Upload to ImageKit. Private host.';
    }

    isAvailable(): boolean {
        const s = this.getSettings().imageKit;
        return s.enabled && s.privateKey.length > 0 && s.uploadEndpoint.length > 0;
    }

    async insert(files: readonly File[], ctx: DropGateContext): Promise<void> {
        const settings = this.getSettings();
        const service = new ImageKitService(settings);
        const folder = this.resolveFolder();

        let pos = ctx.insertPos;
        for (const file of files) {
            const buffer = await file.arrayBuffer();
            const result = await service.uploadFile(buffer, fileNameFor(file), folder);

            if (!result.url) {
                console.error('[image-gin/drop-gate] ImageKit upload returned no url', result);
                throw new Error('ImageKit returned an empty URL — check console for the raw response.');
            }
            console.debug(`[image-gin/drop-gate] ImageKit upload → ${result.url}`);

            const alt = file.name || 'image';
            const md = `![${alt}](${result.url})\n`;
            ctx.editor.replaceRange(md, pos);
            // Advance position past what we just inserted so multi-file
            // batches stack instead of overwriting each other.
            pos = { line: pos.line + 1, ch: 0 };
        }
        // Move cursor to after the last inserted line and focus the editor.
        ctx.editor.setCursor(pos);
        ctx.editor.focus();

        new Notice(
            `Image Gin: uploaded ${files.length} image${files.length === 1 ? '' : 's'} to ImageKit${folder ? ` (${folder})` : ''}.`
        );
    }

    private resolveFolder(): string {
        const s = this.getSettings();
        const override = s.dropGate.imageKitFolder.trim();
        if (override) return override;
        return s.imageKit.uploadFolder.trim();
    }
}
