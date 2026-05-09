import { logger } from '../utils/logger';
import type { TFile, Vault } from 'obsidian';
import { requestUrl } from 'obsidian';
import type {
    ImageGinSettings,
    IdeogramMagicPrompt,
    IdeogramRenderingSpeed,
    IdeogramStyleType,
} from '../settings/settings';
import { isRecord } from '../utils/coerce';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Raw-bytes image type — avoids the base64 round-trip Recraft does, which
// triples in-flight memory for multi-MB Ideogram outputs and was a
// suspected renderer-crash trigger.
export interface IdeogramImage {
    /** Raw image bytes. ArrayBuffer (not Uint8Array) so it can be handed
     *  directly to Obsidian's vault.createBinary without a buffer-type
     *  reshuffle (newer @types/node produces ArrayBufferLike for views
     *  over existing buffers, which doesn't satisfy ArrayBuffer). */
    buffer: ArrayBuffer;
    width: number;
    height: number;
    prompt: string;
    timestamp: number;
}

export type IdeogramAspectRatio =
    | '1x3' | '3x1' | '1x2' | '2x1'
    | '9x16' | '16x9' | '10x16' | '16x10'
    | '2x3' | '3x2' | '3x4' | '4x3'
    | '4x5' | '5x4' | '1x1';

const ASPECT_RATIOS: Array<{ ratio: IdeogramAspectRatio; value: number }> = [
    { ratio: '1x3', value: 1 / 3 },
    { ratio: '3x1', value: 3 },
    { ratio: '1x2', value: 1 / 2 },
    { ratio: '2x1', value: 2 },
    { ratio: '9x16', value: 9 / 16 },
    { ratio: '16x9', value: 16 / 9 },
    { ratio: '10x16', value: 10 / 16 },
    { ratio: '16x10', value: 16 / 10 },
    { ratio: '2x3', value: 2 / 3 },
    { ratio: '3x2', value: 3 / 2 },
    { ratio: '3x4', value: 3 / 4 },
    { ratio: '4x3', value: 4 / 3 },
    { ratio: '4x5', value: 4 / 5 },
    { ratio: '5x4', value: 5 / 4 },
    { ratio: '1x1', value: 1 },
];

// Maps the user's pixel-size preset to the closest Ideogram aspect ratio.
// Ideogram does not accept arbitrary pixel sizes; the modal should display
// the resolved ratio so the user understands what's being requested.
export function pickAspectRatio(width: number, height: number): IdeogramAspectRatio {
    if (width <= 0 || height <= 0) return '1x1';
    const target = width / height;
    let best = ASPECT_RATIOS[0]!;
    let bestDiff = Math.abs(best.value - target);
    for (let i = 1; i < ASPECT_RATIOS.length; i++) {
        const candidate = ASPECT_RATIOS[i]!;
        const diff = Math.abs(candidate.value - target);
        if (diff < bestDiff) {
            best = candidate;
            bestDiff = diff;
        }
    }
    return best.ratio;
}

export interface IdeogramGenerateOptions {
    prompt: string;
    aspectRatio: IdeogramAspectRatio;
    renderingSpeed: IdeogramRenderingSpeed;
    styleType: IdeogramStyleType;
    magicPrompt: IdeogramMagicPrompt;
    negativePrompt?: string;
    seed?: number;
    width: number;
    height: number;
}

export interface IdeogramLayerizeOptions {
    seed?: number;
    prompt?: string;
}

const BASE_URL = 'https://api.ideogram.ai';
const GENERATE_ENDPOINT = `${BASE_URL}/v1/ideogram-v3/generate`;
const LAYERIZE_ENDPOINT = `${BASE_URL}/v1/ideogram-v3/layerize-text`;

interface MultipartTextField {
    kind: 'text';
    name: string;
    value: string;
}

interface MultipartFileField {
    kind: 'file';
    name: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
}

type MultipartField = MultipartTextField | MultipartFileField;

// Hand-built multipart body. Obsidian's runtime does not provide FormData,
// so each field is concatenated with a hand-rolled boundary string. Same
// pattern as imagekitService.ts.
function buildMultipart(fields: MultipartField[]): { body: ArrayBuffer; contentType: string } {
    const boundary = '----formdata-image-gin-' + Math.random().toString(36).slice(2);
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];

    for (const field of fields) {
        if (field.kind === 'text') {
            const header =
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${field.name}"\r\n\r\n` +
                `${field.value}\r\n`;
            parts.push(encoder.encode(header));
        } else {
            const header =
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n` +
                `Content-Type: ${field.contentType}\r\n\r\n`;
            parts.push(encoder.encode(header));
            parts.push(field.bytes);
            parts.push(encoder.encode('\r\n'));
        }
    }
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const p of parts) {
        combined.set(p, offset);
        offset += p.length;
    }

    return {
        body: combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}

export class IdeogramService {
    private settings: ImageGinSettings;
    private vault: Vault;

    constructor(settings: ImageGinSettings, vault: Vault) {
        this.settings = settings;
        this.vault = vault;
    }

    async generateImage(opts: IdeogramGenerateOptions): Promise<IdeogramImage> {
        const apiKey = this.settings.ideogram.apiKey;
        if (!apiKey) {
            throw new Error('Ideogram API key is not set. Configure it in plugin settings.');
        }

        const fields: MultipartField[] = [
            { kind: 'text', name: 'prompt', value: opts.prompt },
            { kind: 'text', name: 'aspect_ratio', value: opts.aspectRatio },
            { kind: 'text', name: 'rendering_speed', value: opts.renderingSpeed },
            { kind: 'text', name: 'style_type', value: opts.styleType },
            { kind: 'text', name: 'magic_prompt', value: opts.magicPrompt },
            { kind: 'text', name: 'num_images', value: '1' },
        ];
        if (opts.negativePrompt && opts.negativePrompt.trim()) {
            fields.push({ kind: 'text', name: 'negative_prompt', value: opts.negativePrompt });
        }
        if (opts.seed !== undefined) {
            fields.push({ kind: 'text', name: 'seed', value: String(opts.seed) });
        }

        const { body, contentType } = buildMultipart(fields);

        logger.info('=== Ideogram Generate Request ===');
        logger.info('Aspect ratio:', opts.aspectRatio);
        logger.info('Rendering speed:', opts.renderingSpeed);
        logger.info('Style type:', opts.styleType);
        logger.info('Magic prompt:', opts.magicPrompt);
        logger.info('Has negative prompt:', !!opts.negativePrompt);
        logger.info('Prompt preview:', opts.prompt.length > 80 ? opts.prompt.slice(0, 77) + '...' : opts.prompt);

        const response = await requestUrl({
            url: GENERATE_ENDPOINT,
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'Content-Type': contentType,
            },
            body,
            throw: false,
        });

        if (response.status < 200 || response.status >= 300) {
            const bodyText = typeof response.text === 'string' ? response.text : '';
            logger.error('Ideogram generate failed:', { status: response.status, body: bodyText.slice(0, 500) });
            throw new Error(`Ideogram generate failed (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json: unknown = response.json;
        if (!isRecord(json)) {
            throw new Error('Ideogram generate: response was not a JSON object');
        }
        const data: unknown = json.data;
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error(`Ideogram generate: empty data array — ${JSON.stringify(json).slice(0, 300)}`);
        }
        const first: unknown = data[0];
        if (!isRecord(first) || typeof first.url !== 'string') {
            throw new Error('Ideogram generate: first result missing url');
        }

        const imageUrl = first.url;
        logger.info('Downloading Ideogram image from ephemeral URL');
        const imageBuffer = await this.downloadImage(imageUrl);
        logger.info('Downloaded image bytes:', imageBuffer.byteLength);

        return {
            buffer: imageBuffer,
            width: opts.width,
            height: opts.height,
            prompt: typeof first.prompt === 'string' ? first.prompt : opts.prompt,
            timestamp: Date.now(),
        };
    }

    async layerizeText(image: IdeogramImage, opts: IdeogramLayerizeOptions = {}): Promise<IdeogramImage> {
        const apiKey = this.settings.ideogram.apiKey;
        if (!apiKey) {
            throw new Error('Ideogram API key is not set. Configure it in plugin settings.');
        }

        const fields: MultipartField[] = [
            {
                kind: 'file',
                name: 'image',
                filename: 'input.png',
                contentType: 'image/png',
                bytes: new Uint8Array(image.buffer),
            },
        ];
        if (opts.prompt) {
            fields.push({ kind: 'text', name: 'prompt', value: opts.prompt });
        }
        if (opts.seed !== undefined) {
            fields.push({ kind: 'text', name: 'seed', value: String(opts.seed) });
        }

        const { body, contentType } = buildMultipart(fields);

        const response = await requestUrl({
            url: LAYERIZE_ENDPOINT,
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'Content-Type': contentType,
            },
            body,
            throw: false,
        });

        if (response.status < 200 || response.status >= 300) {
            const bodyText = typeof response.text === 'string' ? response.text : '';
            logger.error('Ideogram layerize failed:', { status: response.status, body: bodyText.slice(0, 500) });
            throw new Error(`Ideogram layerize failed (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json: unknown = response.json;
        if (!isRecord(json) || typeof json.base_image_url !== 'string') {
            throw new Error('Ideogram layerize: missing base_image_url in response');
        }

        const cleanedBuffer = await this.downloadImage(json.base_image_url);

        return {
            buffer: cleanedBuffer,
            width: image.width,
            height: image.height,
            prompt: image.prompt,
            timestamp: Date.now(),
        };
    }

    async generateAndLayerize(opts: IdeogramGenerateOptions): Promise<IdeogramImage> {
        const generated = await this.generateImage(opts);
        return this.layerizeText(generated);
    }

    private async downloadImage(url: string): Promise<ArrayBuffer> {
        const response = await requestUrl({ url, method: 'GET' });
        if (response.status !== 200) {
            throw new Error(`Failed to download Ideogram image: HTTP ${response.status}`);
        }
        return response.arrayBuffer;
    }

    async saveImage(image: IdeogramImage, filePath: string): Promise<TFile | null> {
        try {
            if (filePath.startsWith('/')) {
                const folderPath = path.dirname(filePath);
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }
                fs.writeFileSync(filePath, new Uint8Array(image.buffer));
                return null;
            } else {
                const folderPath = filePath.split('/').slice(0, -1).join('/');
                if (folderPath && !await this.vault.adapter.exists(folderPath)) {
                    await this.vault.createFolder(folderPath);
                }
                const file = await this.vault.createBinary(filePath, image.buffer);
                return file;
            }
        } catch (error) {
            logger.error('Error saving Ideogram image:', error);
            throw error;
        }
    }

    getImagePath(baseName: string, width: number, height: number, timestamp: number): string {
        const fileName = `${baseName}_${width}x${height}_${timestamp}.png`;
        return `${this.settings.imageOutputFolder}/${fileName}`.replace(/\/\//g, '/');
    }
}
