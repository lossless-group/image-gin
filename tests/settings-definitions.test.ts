// Acceptance tests for the 0.3.0 settings tab, which moves to Obsidian
// 1.13's declarative getSettingDefinitions() API. See
// context-v/plans/2026-10-06_Migrate-Settings-Tab-to-Obsidian-1-13-Declarative-API.md
//
// These walk the definition tree Obsidian will render and index for search,
// so a missing or mistyped setting fails here instead of silently vanishing
// from the screen (the 0.2.x failure mode).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ImageGinSettingTab, DEFAULT_SETTINGS } from '../src/settings/settings';
import type { ImageGinSettings } from '../src/settings/settings';
import type ImageGinPlugin from '../main';
import type { App } from 'obsidian';

// Loose structural view of the definition tree; the real types come from
// obsidian 1.13 but tests stay decoupled from them.
interface Def {
    type?: string;
    name?: string;
    heading?: string;
    desc?: unknown;
    control?: { type: string; key: string; options?: Record<string, string> };
    render?: unknown;
    action?: unknown;
    items?: Def[];
    visible?: boolean | (() => boolean);
    addItem?: { name: string; action: (el: unknown) => void };
    onDelete?: (index: number) => void;
}

type Tab = {
    getSettingDefinitions(): Def[];
    getControlValue(key: string): unknown;
    setControlValue(key: string, value: unknown): void | Promise<void>;
};

function makeTab(overrides: Partial<ImageGinSettings> = {}) {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), ...overrides } as ImageGinSettings;
    let saves = 0;
    const plugin = {
        settings,
        saveSettings: () => { saves++; return Promise.resolve(); },
    } as unknown as ImageGinPlugin;
    const app = { vault: {} } as unknown as App;
    const tab = new ImageGinSettingTab(app, plugin) as unknown as Tab;
    return { tab, settings, saves: () => saves };
}

/** Depth-first walk over groups, lists, and pages. */
function walk(defs: Def[], out: Def[] = []): Def[] {
    for (const d of defs) {
        out.push(d);
        if (d.items) walk(d.items, out);
    }
    return out;
}

function dotGet(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function dotHas(obj: unknown, path: string): boolean {
    const parts = path.split('.');
    const last = parts.pop()!;
    const parent = parts.length ? dotGet(obj, parts.join('.')) : obj;
    return !!parent && typeof parent === 'object' && last in (parent as object);
}

// Every row in the 0.2.x tab, minus the deliberately removed "Style presets"
// JSON editor (imageStylesJSON is no longer read by generation).
const REQUIRED_NAMES = [
    'Recraft API key', 'Model', 'Custom style ID', 'Style reference URLs',
    'Create style from references', 'Style match', 'Brand colors', 'Background color',
    'Share one seed across sizes', 'Image format', 'Recraft API base URL', 'Image output folder',
    'Enable ImageKit CDN', 'ImageKit public key', 'ImageKit private key', 'ImageKit URL endpoint',
    'ImageKit upload endpoint', 'ImageKit upload folder', 'Remove local files after upload', 'Convert to WebP',
    'Enable Magnific integration', 'Magnific API key', 'Default license type', 'Default image count',
    'Enable Ideogram integration', 'Ideogram API key',
    'Prompt prefix — Style Notes', 'Prompt suffix — Brand Alignment', 'Base negative prompt',
    'Rendering speed', 'Style type', 'Magic prompt', 'Layerize text after generate',
    'Enable image caching', 'Cache folder', 'Max cache size (mb)', 'Auto cleanup', 'Cleanup days', 'Clear cache',
    'Enable drop gate', 'Policy mode', 'Default destination', 'Show "remember for session" checkbox',
    'ImageKit folder for drop-gate uploads',
    'Enable Imgur destination', 'Imgur client ID',
];

const REQUIRED_HEADINGS = [
    'Recraft image generation', 'Image size presets', 'ImageKit CDN upload & hosting',
    'Magnific image search', 'Ideogram image generation', 'Image cache',
    'Drag-drop / paste confirmation gate', 'Imgur (public CDN)',
];

describe('declarative settings tab (Obsidian ≥ 1.13)', () => {
    test('uses getSettingDefinitions and does not override display()', () => {
        assert.equal(typeof ImageGinSettingTab.prototype.getSettingDefinitions, 'function');
        assert.ok(
            !Object.prototype.hasOwnProperty.call(ImageGinSettingTab.prototype, 'display'),
            'display() must not be overridden; Obsidian renders the definitions',
        );
    });

    test('every 0.2.x setting is still present (searchable by name)', () => {
        const names = new Set(walk(makeTab().tab.getSettingDefinitions()).map(d => d.name).filter(Boolean));
        const missing = REQUIRED_NAMES.filter(n => !names.has(n));
        assert.deepEqual(missing, []);
    });

    test('every section heading is present, matched loosely to allow emoji prefixes', () => {
        const headings = walk(makeTab().tab.getSettingDefinitions()).map(d => d.heading ?? '').filter(Boolean);
        for (const h of REQUIRED_HEADINGS) {
            assert.ok(headings.some(x => x.includes(h)), `missing heading: ${h}`);
        }
    });

    test('the removed Style presets JSON editor is gone', () => {
        const names = walk(makeTab().tab.getSettingDefinitions()).map(d => d.name);
        assert.ok(!names.includes('Style presets'));
    });

    test('V3 curated style gets real dropdowns bound to style.presetStyle', () => {
        const keys = walk(makeTab().tab.getSettingDefinitions()).map(d => d.control?.key);
        assert.ok(keys.includes('style.presetStyle.base'));
        assert.ok(keys.includes('style.presetStyle.substyle'));
    });

    test('ImageKit upload folder documents the date placeholders', () => {
        const row = walk(makeTab().tab.getSettingDefinitions()).find(d => d.name === 'ImageKit upload folder');
        const desc = typeof row?.desc === 'string' ? row.desc : '';
        assert.match(desc, /\{YYYY\}/);
    });

    test('every item is searchable: non-empty name; groups are not empty', () => {
        for (const d of walk(makeTab().tab.getSettingDefinitions())) {
            if (d.type === 'group' || d.type === 'list') {
                if (d.type === 'group') assert.ok((d.items?.length ?? 0) > 0, `empty group: ${d.heading}`);
                continue;
            }
            if (d.type === 'page') continue;
            assert.ok(d.name && d.name.trim(), `item without a name: ${JSON.stringify(d.control ?? d)}`);
        }
    });
});

describe('control bindings', () => {
    test('every control key exists in the settings shape', () => {
        const bad = walk(makeTab().tab.getSettingDefinitions())
            .map(d => d.control?.key)
            .filter((k): k is string => !!k && !k.startsWith('imageSizes.'))
            .filter(k => !dotHas(DEFAULT_SETTINGS, k));
        assert.deepEqual(bad, []);
    });

    test('getControlValue resolves nested keys to the stored value', () => {
        const { tab, settings } = makeTab();
        settings.imageKit.uploadFolder = '/Image-Gin/{YYYY}-{MM}';
        settings.ideogram.brandTemplate.prefix = 'House style:';
        assert.equal(tab.getControlValue('imageKit.uploadFolder'), '/Image-Gin/{YYYY}-{MM}');
        assert.equal(tab.getControlValue('ideogram.brandTemplate.prefix'), 'House style:');
        assert.equal(tab.getControlValue('recraftModelChoice'), settings.recraftModelChoice);
        for (const d of walk(tab.getSettingDefinitions())) {
            const k = d.control?.key;
            if (!k || k.startsWith('imageSizes.')) continue;
            assert.deepEqual(tab.getControlValue(k), dotGet(settings, k) ?? tab.getControlValue(k), k);
        }
    });

    test('setControlValue writes nested keys and persists', async () => {
        const { tab, settings, saves } = makeTab();
        await tab.setControlValue('imageKit.uploadFolder', '/Image-Gin/{YYYY}-{MM}');
        assert.equal(settings.imageKit.uploadFolder, '/Image-Gin/{YYYY}-{MM}');
        await tab.setControlValue('dropGate.imageKitFolder', '');
        assert.equal(settings.dropGate.imageKitFolder, '');
        assert.ok(saves() >= 2);
    });

    test('custom style ID binding keeps useCustomStyle in sync', async () => {
        const { tab, settings } = makeTab();
        const row = walk(tab.getSettingDefinitions()).find(d => d.name === 'Custom style ID');
        assert.ok(row?.control, 'Custom style ID should be a bound control');
        await tab.setControlValue(row.control.key, '73a249b2-879e-4240-9973-c6fb1715a882');
        assert.equal(settings.style.customStyleId, '73a249b2-879e-4240-9973-c6fb1715a882');
        assert.equal(settings.style.useCustomStyle, true);
        await tab.setControlValue(row.control.key, '');
        assert.equal(settings.style.customStyleId, null);
        assert.equal(settings.style.useCustomStyle, false);
    });

    test('model dropdown offers every Recraft model', () => {
        const row = walk(makeTab().tab.getSettingDefinitions()).find(d => d.name === 'Model' && d.control?.type === 'dropdown');
        const opts = Object.keys(row?.control?.options ?? {});
        for (const m of ['recraftv4_1', 'recraftv4_styles', 'recraftv3']) assert.ok(opts.includes(m), m);
    });
});

describe('image size presets list', () => {
    function sizesList(defs: Def[]): Def | undefined {
        return walk(defs).find(d => d.type === 'list' && (d.heading ?? '').includes('Image size presets'));
    }

    test('is a list with one entry per preset', () => {
        const { tab, settings } = makeTab();
        const list = sizesList(tab.getSettingDefinitions());
        assert.ok(list, 'size presets should be a type: list group');
        assert.equal(list.items?.length, settings.imageSizes.length);
    });

    test('addItem appends a preset and onDelete removes one', async () => {
        const { tab, settings } = makeTab();
        const before = settings.imageSizes.length;
        sizesList(tab.getSettingDefinitions())!.addItem!.action({});
        await new Promise(r => setTimeout(r, 0));
        assert.equal(settings.imageSizes.length, before + 1);
        sizesList(tab.getSettingDefinitions())!.onDelete!(0);
        await new Promise(r => setTimeout(r, 0));
        assert.equal(settings.imageSizes.length, before);
    });
});
