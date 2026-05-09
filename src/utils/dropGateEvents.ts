/**
 * Re-entry guards and helpers for the drag-drop / paste interception flow.
 *
 * The two synthetic event subclasses are how we re-dispatch a drop or paste
 * into Obsidian's internal clipboardManager without our own handler picking
 * it up again — `instanceof` check at the top of each handler bails out
 * early, breaking the would-be loop.
 */

/**
 * Sentinel property used to identify our re-dispatched synthetic events at
 * the top of the drop/paste handler. We use a tagged property rather than
 * `instanceof` because the obsidianmd lint rule rejects `instanceof` for
 * cross-window safety, and for a one-off plain-tag check this is simpler
 * than introducing Obsidian's `.instanceOf()` API.
 */
export const SYNTHETIC_EVENT_TAG = '__imageGinDropGateSynthetic';

interface SyntheticTag {
    [SYNTHETIC_EVENT_TAG]?: true;
}

export function isSyntheticDropEvent(e: DragEvent | ClipboardEvent): boolean {
    return (e as SyntheticTag)[SYNTHETIC_EVENT_TAG] === true;
}

export function makeSyntheticDragEvent(original: DragEvent, files: readonly File[]): DragEvent {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    const copy = new DragEvent(original.type, {
        dataTransfer: dt,
        clientX: original.clientX,
        clientY: original.clientY,
        bubbles: true,
        cancelable: true,
    });
    (copy as SyntheticTag)[SYNTHETIC_EVENT_TAG] = true;
    return copy;
}

export function makeSyntheticPasteEvent(original: ClipboardEvent, files: readonly File[]): ClipboardEvent {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    const copy = new ClipboardEvent(original.type, {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
    });
    (copy as SyntheticTag)[SYNTHETIC_EVENT_TAG] = true;
    return copy;
}

export function allFilesAreImages(files: readonly File[]): boolean {
    if (files.length === 0) return false;
    return files.every((f) => f.type.startsWith('image/'));
}

export function imagesIn(files: readonly File[]): File[] {
    return files.filter((f) => f.type.startsWith('image/'));
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const MIME_TO_EXT: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/heic': 'heic',
    'image/avif': 'avif',
};

export function fileNameFor(file: File, fallbackBase = 'image'): string {
    if (file.name && file.name.trim() !== '' && file.name !== 'image.png') {
        return file.name;
    }
    const ext = MIME_TO_EXT[file.type.toLowerCase()] ?? 'png';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${fallbackBase}-${ts}.${ext}`;
}
