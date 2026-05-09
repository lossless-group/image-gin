import { Notice, requestUrl } from 'obsidian';
import type { DropGateContext, DropGateDestination } from './types';
import type { ImageGinSettings } from '../settings/settings';

const IMGUR_ENDPOINT = 'https://api.imgur.com/3/image';

interface ImgurResponse {
    data?: { link?: string; deletehash?: string };
    success?: boolean;
}

/**
 * Anonymous Imgur uploader. Use for non-sensitive imagery where a free
 * public CDN is fine and we don't need an account.
 */
export class ImgurDestination implements DropGateDestination {
    readonly id = 'imgur' as const;
    readonly label = 'Imgur (public CDN)';
    readonly description = 'Anonymous upload to imgur.com. Public. Use for non-sensitive imagery.';

    constructor(private readonly getSettings: () => ImageGinSettings) {}

    isAvailable(): boolean {
        const s = this.getSettings().imgur;
        return s.enabled && s.clientId.length > 0;
    }

    async insert(files: readonly File[], ctx: DropGateContext): Promise<void> {
        const { clientId } = this.getSettings().imgur;

        let pos = ctx.insertPos;
        for (const file of files) {
            const link = await this.upload(file, clientId);
            console.debug(`[image-gin/drop-gate] Imgur upload → ${link}`);
            const alt = file.name || 'image';
            const md = `![${alt}](${link})\n`;
            ctx.editor.replaceRange(md, pos);
            pos = { line: pos.line + 1, ch: 0 };
        }
        ctx.editor.setCursor(pos);
        ctx.editor.focus();
        new Notice(`Image Gin: uploaded ${files.length} image${files.length === 1 ? '' : 's'} to Imgur.`);
    }

    private async upload(file: File, clientId: string): Promise<string> {
        const boundary = '----image-gin-imgur-' + Math.random().toString(36).slice(2);
        const lines: string[] = [];
        lines.push(`--${boundary}`);
        lines.push(`Content-Disposition: form-data; name="image"; filename="${file.name || 'image'}"`);
        lines.push(`Content-Type: ${file.type || 'application/octet-stream'}`);
        lines.push('');

        const header = lines.join('\r\n') + '\r\n';
        const footer = `\r\n--${boundary}--\r\n`;

        const headerBytes = new TextEncoder().encode(header);
        const footerBytes = new TextEncoder().encode(footer);
        const fileBytes = new Uint8Array(await file.arrayBuffer());
        const totalLen = headerBytes.length + fileBytes.length + footerBytes.length;
        const body = new Uint8Array(totalLen);
        body.set(headerBytes, 0);
        body.set(fileBytes, headerBytes.length);
        body.set(footerBytes, headerBytes.length + fileBytes.length);

        const response = await requestUrl({
            url: IMGUR_ENDPOINT,
            method: 'POST',
            headers: {
                Authorization: `Client-ID ${clientId}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: body.buffer,
            throw: false,
        });

        if (response.status !== 200) {
            throw new Error(`Imgur upload failed (${response.status}): ${response.text}`);
        }

        const data: ImgurResponse = (typeof response.json === 'function'
            ? (await (response.json as () => Promise<unknown>)())
            : response.json) as ImgurResponse;
        const link = data.data?.link;
        if (!link) {
            throw new Error('Imgur response missing link.');
        }
        return link;
    }
}
