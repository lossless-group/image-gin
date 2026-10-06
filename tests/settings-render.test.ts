// Renders the whole settings tab under Node with chainable UI stubs. A
// throw anywhere in display() silently truncates every section after it
// inside Obsidian, so this guards that every section heading renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ImageGinSettingTab, DEFAULT_SETTINGS } from '../src/settings/settings';
import type { ImageGinSettings } from '../src/settings/settings';
import type ImageGinPlugin from '../main';
import type { App } from 'obsidian';
import { makeStubElement } from './stubs/obsidian';

(globalThis as { activeDocument?: unknown }).activeDocument = makeStubElement();

function render(settings: ImageGinSettings): string[] {
    const names = (globalThis as { __settingNames?: string[] }).__settingNames!;
    names.length = 0;
    const plugin = { settings, saveSettings: () => Promise.resolve() } as unknown as ImageGinPlugin;
    const app = { vault: {} } as unknown as App;
    new ImageGinSettingTab(app, plugin).display();
    return [...names];
}

const SECTIONS = ['🎨 Recraft image generation', '☁️ ImageKit CDN upload & hosting', 'ImageKit upload folder', '🖼️ Ideogram image generation'];

test('default settings render every section', () => {
    const names = render(structuredClone(DEFAULT_SETTINGS));
    for (const s of SECTIONS) assert.ok(names.includes(s), `missing: ${s}`);
});

// Optional: reproduce with a real vault's settings when present locally.
const LOCAL = process.env.IMAGE_GIN_DATA_JSON;
test('local vault settings render every section', { skip: !LOCAL || !existsSync(LOCAL) }, () => {
    const loaded = JSON.parse(readFileSync(LOCAL!, 'utf8')) as Partial<ImageGinSettings>;
    const names = render({ ...structuredClone(DEFAULT_SETTINGS), ...loaded } as ImageGinSettings);
    for (const s of SECTIONS) assert.ok(names.includes(s), `missing: ${s}`);
});
