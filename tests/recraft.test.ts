// Contract tests for RecraftImageService against Recraft's API docs
// (https://www.recraft.ai/docs/api-reference, read 2026-10-06).
// Network is stubbed via tests/stubs/obsidian.ts; no credits are spent.
//
// Sections marked [docs requirement] encode behavior Recraft's docs call
// for that the service did not yet implement when these were written.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Vault } from 'obsidian';
import {
    RecraftImageService,
    parseHexColors,
    toRecraftSize,
} from '../src/services/recraftImageService';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import type { ImageGinSettings } from '../src/settings/settings';
import type { StubRequest, StubResponse } from './stubs/obsidian';

const GENERATIONS_URL = 'https://external.api.recraft.ai/v1/images/generations';
const IMAGE_URL = 'https://img.recraft.ai/test-image';

// --- fixtures ---------------------------------------------------------------

function makeSettings(overrides: Partial<ImageGinSettings> = {}): ImageGinSettings {
    const s = structuredClone(DEFAULT_SETTINGS);
    s.recraftApiKey = 'test-key';
    return { ...s, ...overrides };
}

const WEBP_BYTES = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4,
]).buffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]).buffer;

function json(status: number, body: unknown): StubResponse {
    const text = JSON.stringify(body);
    return { status, headers: { 'content-type': 'application/json' }, text, json: body, arrayBuffer: new ArrayBuffer(0) };
}

function image(bytes: ArrayBuffer, contentType: string): StubResponse {
    const headers: Record<string, string> = contentType ? { 'content-type': contentType } : {};
    return { status: 200, headers, text: '', json: null, arrayBuffer: bytes };
}

let requests: StubRequest[] = [];

/** Install a requestUrl handler; records every request. */
function serve(handler: (req: StubRequest) => StubResponse): void {
    (globalThis as { __requestUrl?: unknown }).__requestUrl = (req: StubRequest) => {
        requests.push(req);
        return handler(req);
    };
}

/** Happy-path Recraft: generation returns a URL, the URL returns WebP. */
function serveHappy(extra: Record<string, unknown> = {}, bytes = WEBP_BYTES, contentType = 'image/webp'): void {
    serve(req => req.url === IMAGE_URL
        ? image(bytes, contentType)
        : json(200, { created: 1, credits: 35, data: [{ image_id: 'x', url: IMAGE_URL }], ...extra }));
}

function generationBody(): Record<string, unknown> {
    const req = requests.find(r => r.url === GENERATIONS_URL);
    assert.ok(req, 'expected a generation request');
    return JSON.parse(String(req.body)) as Record<string, unknown>;
}

function makeVault(): { vault: Vault; written: Map<string, ArrayBuffer> } {
    const written = new Map<string, ArrayBuffer>();
    const vault = {
        adapter: { exists: () => Promise.resolve(true) },
        createFolder: () => Promise.resolve(),
        createBinary: (p: string, data: ArrayBuffer) => {
            written.set(p, data);
            return Promise.resolve({ path: p });
        },
    } as unknown as Vault;
    return { vault, written };
}

async function generate(settings: ImageGinSettings, w = 2048, h = 1024, prompt = 'two race cars on a track') {
    const svc = new RecraftImageService(settings, makeVault().vault);
    return svc.generateImage(prompt, w, h, svc.buildStyleParams());
}

beforeEach(() => {
    requests = [];
    delete (globalThis as { __requestUrl?: unknown }).__requestUrl;
});

// --- sizes ------------------------------------------------------------------

describe('toRecraftSize', () => {
    test('snaps the default presets to supported ratios', () => {
        assert.equal(toRecraftSize(2048, 1024), '2:1');
        assert.equal(toRecraftSize(1024, 1820), '9:16');
        assert.equal(toRecraftSize(1024, 1024), '1:1');
        assert.equal(toRecraftSize(2048, 1536), '4:3');
        assert.equal(toRecraftSize(1344, 768), '16:9');
    });

    test('always returns one of the 14 documented ratios', () => {
        const allowed = new Set(['1:1', '2:1', '1:2', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '6:10', '14:10', '10:14', '16:9', '9:16']);
        for (const [w, h] of [[1000, 333], [333, 1000], [1234, 987], [5000, 100]] as const) {
            assert.ok(allowed.has(toRecraftSize(w, h)), `${w}x${h}`);
        }
    });
});

// --- request shape per model family -------------------------------------------

describe('generation request body', () => {
    test('V4.1 default: model, ratio size, url response, no curated style', async () => {
        serveHappy();
        await generate(makeSettings());
        const body = generationBody();
        assert.equal(body.model, 'recraftv4_1');
        assert.equal(body.size, '2:1');
        assert.equal(body.response_format, 'url');
        assert.equal(body.n, 1);
        assert.ok(!('style' in body), 'V4.1 rejects curated style');
        assert.ok(!('substyle' in body), 'V4.1 rejects substyle');
    });

    test('sends a bearer token', async () => {
        serveHappy();
        await generate(makeSettings());
        const req = requests.find(r => r.url === GENERATIONS_URL);
        assert.equal(req?.headers?.Authorization, 'Bearer test-key');
    });

    test('V3 keeps curated style + substyle', async () => {
        serveHappy();
        await generate(makeSettings({ recraftModelChoice: 'recraftv3' }));
        const body = generationBody();
        assert.equal(body.style, 'digital_illustration');
        assert.equal(body.substyle, 'graphic_intensity');
    });

    test('V4.1 Flash sends no style even when one is configured', async () => {
        const s = makeSettings({ recraftModelChoice: 'recraftv4_1_flash' });
        s.style.useCustomStyle = true;
        s.style.customStyleId = 'abc';
        serveHappy();
        await generate(s);
        const body = generationBody();
        assert.ok(!('style_id' in body));
        assert.ok(!('style_reference_urls' in body));
    });

    test('style_id wins over reference URLs (Recraft rejects both together)', async () => {
        const s = makeSettings({ recraftStyleReferenceUrls: 'https://a.png\nhttps://b.png' });
        s.style.useCustomStyle = true;
        s.style.customStyleId = 'style-123';
        serveHappy();
        await generate(s);
        const body = generationBody();
        assert.equal(body.style_id, 'style-123');
        assert.ok(!('style_reference_urls' in body));
    });

    test('reference URLs are trimmed, blank lines dropped, capped at 10', async () => {
        const urls = Array.from({ length: 12 }, (_, i) => `  https://ref/${i}.png  `).join('\n\n');
        serveHappy();
        await generate(makeSettings({ recraftStyleReferenceUrls: urls, recraftStyleMatch: 'precise' }));
        const body = generationBody();
        const refs = body.style_reference_urls as string[];
        assert.equal(refs.length, 10);
        assert.equal(refs[0], 'https://ref/0.png');
        assert.equal(body.style_match, 'precise');
    });

    test('V4 Styles with no style fails before any request (no credits spent)', () => {
        serveHappy();
        const svc = new RecraftImageService(makeSettings({ recraftModelChoice: 'recraftv4_styles' }), makeVault().vault);
        assert.throws(() => svc.buildStyleParams(), /requires a style/);
        assert.equal(requests.length, 0);
    });
});

// --- responses, errors, saving ------------------------------------------------

describe('responses and saving', () => {
    test("non-2xx surfaces Recraft's error body", async () => {
        serve(() => json(400, { code: 'invalid_size', message: 'size 2048x1024 is not supported' }));
        await assert.rejects(generate(makeSettings()), /HTTP 400.*not supported/s);
    });

    test('missing API key fails before any request', async () => {
        serveHappy();
        await assert.rejects(generate(makeSettings({ recraftApiKey: '' })), /API key/);
        assert.equal(requests.length, 0);
    });

    test('extension follows content-type: webp and svg', async () => {
        serveHappy();
        assert.equal((await generate(makeSettings())).extension, 'webp');
        requests = [];
        serveHappy({}, new TextEncoder().encode('<svg/>').buffer, 'image/svg+xml');
        assert.equal((await generate(makeSettings({ recraftModelChoice: 'recraftv4_1_vector' }))).extension, 'svg');
    });

    test('extension falls back to magic bytes when content-type is absent', async () => {
        serveHappy({}, PNG_BYTES, '');
        assert.equal((await generate(makeSettings())).extension, 'png');
    });

    test('returned style_id is surfaced for reuse', async () => {
        serveHappy({ style_id: '229b2a75-05e4-4580-85f9-b47ee521a00d' });
        const img = await generate(makeSettings({ recraftStyleReferenceUrls: 'https://ref/1.png' }));
        assert.equal(img.styleId, '229b2a75-05e4-4580-85f9-b47ee521a00d');
    });

    test('saveImage writes the downloaded bytes unchanged, with the right extension', async () => {
        serveHappy();
        const { vault, written } = makeVault();
        const svc = new RecraftImageService(makeSettings({ imageOutputFolder: 'Visuals/ImageGin' }), vault);
        const img = await svc.generateImage('p', 2048, 1024, svc.buildStyleParams());
        const p = svc.getImagePath(img, 'generated-image');
        assert.match(p, /^Visuals\/ImageGin\/generated-image_2048x1024_\d+\.webp$/);
        await svc.saveImage(img, p);
        assert.deepEqual(new Uint8Array(written.get(p)!), new Uint8Array(WEBP_BYTES));
    });
});

// --- [docs requirement] not yet implemented -----------------------------------

describe('[docs requirement] prompt length limits', () => {
    // appendix#prompt-length: V4+ allow 10,000 chars; V2/V3 allow 1,000.
    test('V4.1 rejects prompts over 10,000 chars before any request', async () => {
        serveHappy();
        await assert.rejects(generate(makeSettings(), 2048, 1024, 'x'.repeat(10_001)), /10,?000/);
        assert.equal(requests.length, 0);
    });

    test('V4.1 accepts exactly 10,000 chars', async () => {
        serveHappy();
        await generate(makeSettings(), 2048, 1024, 'x'.repeat(10_000));
        assert.equal(generationBody().model, 'recraftv4_1');
    });

    test('V3 rejects prompts over 1,000 chars before any request', async () => {
        serveHappy();
        await assert.rejects(
            generate(makeSettings({ recraftModelChoice: 'recraftv3' }), 2048, 1024, 'x'.repeat(1_001)),
            /1,?000/,
        );
        assert.equal(requests.length, 0);
    });
});

describe('[docs requirement] image_format', () => {
    // models/recraft-v4-1#parameters: image_format webp (default) | png;
    // ignored for vector output, which is always SVG.
    test('defaults to webp and is sent for raster models', async () => {
        serveHappy();
        await generate(makeSettings());
        assert.equal(generationBody().image_format, 'webp');
    });

    test('png setting is sent', async () => {
        serveHappy({}, PNG_BYTES, 'image/png');
        await generate(makeSettings({ recraftImageFormat: 'png' } as Partial<ImageGinSettings>));
        assert.equal(generationBody().image_format, 'png');
    });

    test('omitted for vector models', async () => {
        serveHappy({}, new TextEncoder().encode('<svg/>').buffer, 'image/svg+xml');
        await generate(makeSettings({ recraftModelChoice: 'recraftv4_1_pro_vector', recraftImageFormat: 'png' } as Partial<ImageGinSettings>));
        assert.ok(!('image_format' in generationBody()));
    });

    test('DEFAULT_SETTINGS declares recraftImageFormat = webp', () => {
        assert.equal((DEFAULT_SETTINGS as unknown as Record<string, unknown>).recraftImageFormat, 'webp');
    });
});

describe('[docs requirement] createStyle', () => {
    // endpoints#create-style: POST /v1/styles {model, image_urls} -> {id, ...}
    // A style only works with the model it was created for.
    const STYLES_URL = 'https://external.api.recraft.ai/v1/styles';

    type WithCreateStyle = { createStyle(imageUrls: string[]): Promise<string> };

    test('POSTs model + image_urls to /v1/styles derived from the base URL, returns id', async () => {
        serve(req => req.url === STYLES_URL
            ? json(200, { id: 'new-style-id', style: 'any', is_private: true, credits: 5 })
            : json(404, {}));
        const svc = new RecraftImageService(makeSettings({ recraftModelChoice: 'recraftv4_styles' }), makeVault().vault) as unknown as WithCreateStyle;
        const id = await svc.createStyle(['https://ref/1.png', 'https://ref/2.png']);
        assert.equal(id, 'new-style-id');
        const req = requests[0]!;
        assert.equal(req.url, STYLES_URL);
        assert.equal(req.method, 'POST');
        assert.equal(req.headers?.Authorization, 'Bearer test-key');
        const body = JSON.parse(String(req.body)) as Record<string, unknown>;
        assert.equal(body.model, 'recraftv4_styles');
        assert.deepEqual(body.image_urls, ['https://ref/1.png', 'https://ref/2.png']);
    });

    test('rejects 0 or more than 10 references before any request', async () => {
        serve(() => json(200, { id: 'x' }));
        const svc = new RecraftImageService(makeSettings(), makeVault().vault) as unknown as WithCreateStyle;
        await assert.rejects(svc.createStyle([]));
        await assert.rejects(svc.createStyle(Array.from({ length: 11 }, (_, i) => `https://r/${i}.png`)));
        assert.equal(requests.length, 0);
    });

    test("surfaces Recraft's error body on failure", async () => {
        serve(() => json(422, { message: 'unsupported image format' }));
        const svc = new RecraftImageService(makeSettings(), makeVault().vault) as unknown as WithCreateStyle;
        await assert.rejects(svc.createStyle(['https://r/1.gif']), /422.*unsupported image format/s);
    });

    // endpoints#create-style: `image_urls` is accepted on "All models";
    // `model` is "All models except V4.1 Flash".
    test('refuses V4.1 Flash before any request', async () => {
        serve(() => json(200, { id: 'x' }));
        const svc = new RecraftImageService(makeSettings({ recraftModelChoice: 'recraftv4_1_flash' }), makeVault().vault) as unknown as WithCreateStyle;
        await assert.rejects(svc.createStyle(['https://r/1.png']), /flash/i);
        assert.equal(requests.length, 0);
    });

    test('allows legacy V3 and sends its model id', async () => {
        serve(() => json(200, { id: 'v3-style' }));
        const svc = new RecraftImageService(makeSettings({ recraftModelChoice: 'recraftv3' }), makeVault().vault) as unknown as WithCreateStyle;
        assert.equal(await svc.createStyle(['https://r/1.png']), 'v3-style');
        assert.equal((JSON.parse(String(requests[0]!.body)) as Record<string, unknown>).model, 'recraftv3');
    });
});

describe('palette and seed consistency', () => {
    // endpoints#controls and #generate-image: random_seed, controls.colors,
    // and controls.background_color are supported on all models.
    test('parseHexColors reads #rrggbb and #rgb, ignores labels and bare words', () => {
        assert.deepEqual(parseHexColors('amber #fbbf24, ink #0a0c10\n#fff bad face'), [
            { rgb: [251, 191, 36] },
            { rgb: [10, 12, 16] },
            { rgb: [255, 255, 255] },
        ]);
        assert.deepEqual(parseHexColors(''), []);
        assert.deepEqual(parseHexColors('#12345g #1234567'), []);
    });

    test('brand colors and background go out as controls on V3', async () => {
        serveHappy();
        await generate(makeSettings({
            recraftModelChoice: 'recraftv3',
            recraftBrandColors: '#fbbf24, #f97316',
            recraftBackgroundColor: '#f6f1e4',
        }));
        assert.deepEqual(generationBody().controls, {
            colors: [{ rgb: [251, 191, 36] }, { rgb: [249, 115, 22] }],
            background_color: { rgb: [246, 241, 228] },
        });
    });

    test('brand colors go out as controls on V4.1', async () => {
        serveHappy();
        await generate(makeSettings({ recraftBrandColors: '#a3e635' }));
        assert.deepEqual(generationBody().controls, { colors: [{ rgb: [163, 230, 53] }] });
    });

    test('no palette configured means no controls key', async () => {
        serveHappy();
        await generate(makeSettings());
        assert.ok(!('controls' in generationBody()));
    });

    test('a shared seed is sent as random_seed on every size', async () => {
        serveHappy();
        const svc = new RecraftImageService(makeSettings(), makeVault().vault);
        await svc.generateImage('p', 2048, 1024, svc.buildStyleParams(), 1948);
        await svc.generateImage('p', 1024, 1024, svc.buildStyleParams(), 1948);
        const seeds = requests
            .filter(r => r.url === GENERATIONS_URL)
            .map(r => (JSON.parse(String(r.body)) as Record<string, unknown>).random_seed);
        assert.deepEqual(seeds, [1948, 1948]);
    });

    test('no seed means no random_seed key', async () => {
        serveHappy();
        await generate(makeSettings());
        assert.ok(!('random_seed' in generationBody()));
    });
});
