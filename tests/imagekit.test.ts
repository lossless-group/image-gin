import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFolderTokens } from '../src/services/imagekitService';

const OCT_6 = new Date(2026, 9, 6);

test('fills {YYYY}, {MM}, {DD} with the upload date, zero-padded', () => {
    assert.equal(resolveFolderTokens('/Image-Gin/{YYYY}-{MM}', OCT_6), '/Image-Gin/2026-10');
    assert.equal(resolveFolderTokens('/drops/{yyyy}/{mm}/{dd}', new Date(2026, 0, 3)), '/drops/2026/01/03');
});

test('folders without placeholders pass through unchanged', () => {
    assert.equal(resolveFolderTokens('/Image-Gin/2026-05', OCT_6), '/Image-Gin/2026-05');
    assert.equal(resolveFolderTokens('', OCT_6), '');
});
