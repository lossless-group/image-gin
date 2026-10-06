import { logger } from '../utils/logger';
import type { TFile, Vault } from 'obsidian';
import { requestUrl } from 'obsidian';
import type { ImageGinSettings } from '../settings/settings';
import { isRecord } from '../utils/coerce';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GeneratedImage {
    buffer: ArrayBuffer;
    extension: 'webp' | 'png' | 'svg' | 'jpg';
    width: number;
    height: number;
    prompt: string;
    timestamp: number;
    // Returned by V4 models when style references were attached — reuse it
    // as a style_id to skip the per-request style-creation charge.
    styleId: string | null;
}

// Style parameters differ by model family:
//   - V2/V3 take curated `style` (+ optional `substyle`) or a custom `style_id`
//   - V4/V4.1 reject curated styles; they take `style_id` or
//     `style_reference_urls`, optionally with `style_match`
//   - V4.1 Flash takes no style at all
export type RecraftStyleParams =
    | Record<string, never>
    | { style_id: string; style_match?: RecraftStyleMatch }
    | { style_reference_urls: string[]; style_match?: RecraftStyleMatch }
    | { style: string; substyle?: string };

export type RecraftStyleMatch = 'flexible' | 'precise';

export interface RecraftModelOption {
    id: string;
    label: string;
}

// Source: https://www.recraft.ai/docs/api-reference/models/overview (2026-10).
// Order is the order shown in the settings dropdown.
export const RECRAFT_MODELS: RecraftModelOption[] = [
    { id: 'recraftv4_1', label: 'V4.1 — default, 1K ($0.035)' },
    { id: 'recraftv4_1_pro', label: 'V4.1 Pro — 2K ($0.21)' },
    { id: 'recraftv4_1_utility', label: 'V4.1 Utility — flat, predictable, 1K' },
    { id: 'recraftv4_1_utility_pro', label: 'V4.1 Utility Pro — 2K' },
    { id: 'recraftv4_1_flash', label: 'V4.1 Flash — fast, no styles ($0.007)' },
    { id: 'recraftv4_1_vector', label: 'V4.1 Vector — SVG' },
    { id: 'recraftv4_1_pro_vector', label: 'V4.1 Pro Vector — SVG' },
    { id: 'recraftv4_styles', label: 'V4 Styles — requires a style, 1K' },
    { id: 'recraftv4_styles_pro', label: 'V4 Styles Pro — requires a style, 2K' },
    { id: 'recraftv4_styles_vector', label: 'V4 Styles Vector — requires a style, SVG' },
    { id: 'recraftv3', label: 'V3 (legacy) — curated styles + substyles' },
    { id: 'recraftv2', label: 'V2 (legacy)' },
];

/** V2/V3 are the only models that accept curated `style`/`substyle`. */
export function isLegacyRecraftModel(model: string): boolean {
    return model === 'recraftv3' || model === 'recraftv2'
        || model.startsWith('recraftv3_') || model.startsWith('recraftv2_');
}

export function isVectorRecraftModel(model: string): boolean {
    return model.includes('vector');
}

/** Prompt length limit per model family (appendix#prompt-length). */
export function recraftPromptLimit(model: string): number {
    return isLegacyRecraftModel(model) ? 1_000 : 10_000;
}

export function isStylesOnlyRecraftModel(model: string): boolean {
    return model.startsWith('recraftv4_styles');
}

// The 14 aspect ratios every Recraft model accepts as `size: "w:h"`.
// Sending a ratio instead of exact pixels keeps one set of size presets
// valid across 1K, 2K (Pro), V3, and vector models, each of which has
// its own exact-pixel table. See /docs/api-reference/appendix#image-sizes.
const RECRAFT_RATIOS: Array<[number, number]> = [
    [1, 1], [2, 1], [1, 2], [3, 2], [2, 3], [4, 3], [3, 4],
    [5, 4], [4, 5], [6, 10], [14, 10], [10, 14], [16, 9], [9, 16],
];

/** Snap a preset's pixel dimensions to the nearest Recraft aspect ratio. */
export function toRecraftSize(width: number, height: number): string {
    const target = width / height;
    let best: [number, number] = [1, 1];
    let bestDiff = Infinity;
    for (const [w, h] of RECRAFT_RATIOS) {
        const diff = Math.abs(Math.log(target / (w / h)));
        if (diff < bestDiff) {
            bestDiff = diff;
            best = [w, h];
        }
    }
    if (bestDiff > 0.03) {
        logger.warn(`Recraft: ${width}x${height} has no matching ratio; using ${best[0]}:${best[1]}`);
    }
    return `${best[0]}:${best[1]}`;
}

export interface RecraftColor {
    rgb: [number, number, number];
}

/**
 * Parse "#rrggbb" / "#rgb" colors from free text into Recraft color
 * objects. The "#" is required so words like "bad" or "face" in a label
 * ("amber #fbbf24, ink #0a0c10") are never read as colors.
 */
export function parseHexColors(input: string): RecraftColor[] {
    const colors: RecraftColor[] = [];
    for (const m of input.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi)) {
        let hex = m[1]!;
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const n = parseInt(hex, 16);
        colors.push({ rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255] });
    }
    return colors;
}

/** A seed in Recraft's accepted integer range, shared across one run's sizes. */
export function newRecraftSeed(): number {
    return Math.floor(Math.random() * 2_147_483_647);
}

function extensionFor(contentType: string, bytes: ArrayBuffer): GeneratedImage['extension'] {
    const ct = contentType.toLowerCase();
    if (ct.includes('svg')) return 'svg';
    if (ct.includes('webp')) return 'webp';
    if (ct.includes('png')) return 'png';
    if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
    // Fall back to magic bytes when the CDN omits or generalizes the type.
    const head = new Uint8Array(bytes.slice(0, 12));
    if (head[0] === 0x89 && head[1] === 0x50) return 'png';
    if (head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57 && head[9] === 0x45) return 'webp';
    if (head[0] === 0xff && head[1] === 0xd8) return 'jpg';
    return 'webp';
}

export class RecraftImageService {
    private settings: ImageGinSettings;
    private vault: Vault;

    constructor(settings: ImageGinSettings, vault: Vault) {
        this.settings = settings;
        this.vault = vault;
    }

    /**
     * Resolve style parameters for the configured model. Throws when the
     * configuration can't produce a valid request (e.g. a V4 Styles model
     * with no style), so the user hears about it before credits are spent.
     */
    buildStyleParams(): RecraftStyleParams {
        const model = this.settings.recraftModelChoice;
        const style = this.settings.style;
        const match = this.settings.recraftStyleMatch;
        const withMatch = <T extends object>(p: T): T & { style_match?: RecraftStyleMatch } =>
            match ? { ...p, style_match: match } : p;

        if (isLegacyRecraftModel(model)) {
            if (style.useCustomStyle && style.customStyleId) {
                return { style_id: style.customStyleId };
            }
            const params: { style: string; substyle?: string } = { style: style.presetStyle.base };
            if (style.presetStyle.substyle) params.substyle = style.presetStyle.substyle;
            return params;
        }

        if (model.includes('flash')) return {};

        if (style.useCustomStyle && style.customStyleId) {
            return withMatch({ style_id: style.customStyleId });
        }
        const refs = this.settings.recraftStyleReferenceUrls
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 10);
        if (refs.length > 0) {
            return withMatch({ style_reference_urls: refs });
        }
        if (isStylesOnlyRecraftModel(model)) {
            throw new Error(
                `${model} requires a style. Set a custom style ID or style reference URLs in settings.`
            );
        }
        return {};
    }

    /**
     * Brand palette → `controls` (endpoints#controls; all models). Curated
     * and custom styles fix the rendering technique, not the colors, so
     * without this each size in a run picks its own palette.
     */
    buildControlParams(): { controls?: { colors?: RecraftColor[]; background_color?: RecraftColor } } {
        const colors = parseHexColors(this.settings.recraftBrandColors);
        const background = parseHexColors(this.settings.recraftBackgroundColor)[0];
        if (colors.length === 0 && !background) return {};
        return {
            controls: {
                ...(colors.length > 0 ? { colors } : {}),
                ...(background ? { background_color: background } : {}),
            },
        };
    }

    async generateImage(
        prompt: string,
        width: number,
        height: number,
        styleParams: RecraftStyleParams,
        seed: number | null = null
    ): Promise<GeneratedImage> {
        if (!this.settings.recraftApiKey) {
            throw new Error('Recraft API key is not set. Please configure it in the plugin settings.');
        }
        if (!this.settings.recraftBaseUrl) {
            throw new Error('Recraft API base URL is not configured.');
        }

        const url = this.settings.recraftBaseUrl;
        const model = this.settings.recraftModelChoice;
        const limit = recraftPromptLimit(model);
        if (prompt.length > limit) {
            throw new Error(
                `Prompt is ${prompt.length.toLocaleString('en-US')} characters; ${model} allows at most ${limit.toLocaleString('en-US')}.`
            );
        }
        // image_format is ignored for vector output (always SVG), so omit it.
        const formatParams: { image_format?: 'webp' | 'png' } = isVectorRecraftModel(model)
            ? {}
            : { image_format: this.settings.recraftImageFormat };
        const requestData = {
            prompt,
            model,
            size: toRecraftSize(width, height),
            n: 1,
            response_format: 'url',
            ...formatParams,
            ...styleParams,
            ...this.buildControlParams(),
            ...(seed === null ? {} : { random_seed: seed }),
        };

        logger.info('=== Recraft API Request ===');
        logger.info('Request body:', {
            ...requestData,
            prompt: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
        });

        const startTime = Date.now();
        const response = await requestUrl({
            url,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.recraftApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
            throw: false,
        });
        logger.info(`Recraft responded HTTP ${response.status} in ${Date.now() - startTime}ms`);

        if (response.status < 200 || response.status >= 300) {
            const bodyText = typeof response.text === 'string' ? response.text : '';
            logger.error('Recraft generate failed:', { status: response.status, body: bodyText.slice(0, 500) });
            throw new Error(`Recraft generate failed (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json: unknown = response.json;
        if (!isRecord(json)) {
            throw new Error('Recraft generate: response was not a JSON object');
        }
        const data: unknown = json.data;
        const first: unknown = Array.isArray(data) ? data[0] : undefined;
        if (!isRecord(first) || typeof first.url !== 'string') {
            throw new Error(`Recraft generate: no image URL — ${JSON.stringify(json).slice(0, 300)}`);
        }
        logger.info('Recraft credits charged:', json.credits);
        const styleId = typeof json.style_id === 'string' ? json.style_id : null;
        if (styleId) logger.info('Recraft returned style_id (reusable):', styleId);

        const downloadStart = Date.now();
        const imageResponse = await requestUrl({ url: first.url, method: 'GET', throw: false });
        if (imageResponse.status !== 200) {
            throw new Error(`Failed to download Recraft image: HTTP ${imageResponse.status}`);
        }
        const buffer = imageResponse.arrayBuffer;
        const contentType = imageResponse.headers['content-type'] ?? '';
        const extension = extensionFor(contentType, buffer);
        logger.info(`Downloaded ${buffer.byteLength} bytes (${contentType || 'unknown type'}) in ${Date.now() - downloadStart}ms`);

        return {
            buffer,
            extension,
            width,
            height,
            prompt,
            timestamp: Date.now(),
            styleId,
        };
    }

    /**
     * Create a reusable style from 1–10 reference images for the configured
     * model (endpoints#create-style). The returned id only works with that
     * model. Every model accepts JSON image_urls except V4.1 Flash, which
     * has no styles.
     */
    async createStyle(imageUrls: string[]): Promise<string> {
        const model = this.settings.recraftModelChoice;
        if (!this.settings.recraftApiKey) {
            throw new Error('Recraft API key is not set. Please configure it in the plugin settings.');
        }
        if (imageUrls.length < 1 || imageUrls.length > 10) {
            throw new Error(`Recraft create style needs 1–10 reference image URLs; got ${imageUrls.length}.`);
        }
        if (model.includes('flash')) {
            throw new Error(`${model} does not support styles; pick another model to create one.`);
        }

        const url = this.settings.recraftBaseUrl.replace(/\/images\/generations\/?$/, '/styles');
        const response = await requestUrl({
            url,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.recraftApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, image_urls: imageUrls }),
            throw: false,
        });

        if (response.status < 200 || response.status >= 300) {
            const bodyText = typeof response.text === 'string' ? response.text : '';
            logger.error('Recraft create style failed:', { status: response.status, body: bodyText.slice(0, 500) });
            throw new Error(`Recraft create style failed (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }
        const json: unknown = response.json;
        if (!isRecord(json) || typeof json.id !== 'string') {
            throw new Error(`Recraft create style: no style id in response — ${JSON.stringify(json).slice(0, 300)}`);
        }
        logger.info('Recraft created style:', { id: json.id, model, credits: json.credits });
        return json.id;
    }

    /**
     * Saves the image to disk. Returns the created TFile when written into
     * the vault, or null when written to an absolute path outside the vault
     * (Obsidian's TFile cannot represent paths outside the vault).
     */
    async saveImage(image: GeneratedImage, filePath: string): Promise<TFile | null> {
        try {
            if (filePath.startsWith('/')) {
                const folderPath = path.dirname(filePath);
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }
                fs.writeFileSync(filePath, new Uint8Array(image.buffer));
                logger.info('Saved Recraft image to absolute path:', filePath);
                return null;
            }
            const folderPath = filePath.split('/').slice(0, -1).join('/');
            if (folderPath && !await this.vault.adapter.exists(folderPath)) {
                await this.vault.createFolder(folderPath);
            }
            const file = await this.vault.createBinary(filePath, image.buffer);
            logger.info('Saved Recraft image to vault:', filePath);
            return file;
        } catch (error) {
            logger.error('Error saving Recraft image:', error);
            throw error;
        }
    }

    getImagePath(image: GeneratedImage, baseName: string): string {
        const fileName = `${baseName}_${image.width}x${image.height}_${image.timestamp}.${image.extension}`;
        return `${this.settings.imageOutputFolder}/${fileName}`.replace(/\/\//g, '/');
    }
}
