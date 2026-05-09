/**
 * Re-entry guards and helpers for the drag-drop / paste interception flow.
 *
 * The two synthetic event subclasses are how we re-dispatch a drop or paste
 * into Obsidian's internal clipboardManager without our own handler picking
 * it up again — `instanceof` check at the top of each handler bails out
 * early, breaking the would-be loop.
 */

export class DragEventCopy extends DragEvent {
    static create(original: DragEvent, files: readonly File[]): DragEventCopy {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        return new DragEventCopy(original.type, {
            dataTransfer: dt,
            clientX: original.clientX,
            clientY: original.clientY,
            bubbles: true,
            cancelable: true,
        });
    }
}

export class PasteEventCopy extends ClipboardEvent {
    static create(original: ClipboardEvent, files: readonly File[]): PasteEventCopy {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        return new PasteEventCopy(original.type, {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
        });
    }
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
