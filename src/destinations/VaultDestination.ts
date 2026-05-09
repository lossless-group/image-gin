import type { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import type { DropGateContext, DropGateDestination } from './types';
import { makeSyntheticDragEvent, makeSyntheticPasteEvent, fileNameFor } from '../utils/dropGateEvents';

/**
 * Internal-clipboard-manager surface — undocumented in obsidian.d.ts but
 * stable in practice. If `clipboardManager` is missing at runtime we fall
 * back to the explicit Vault.createBinary + FileManager.generateMarkdownLink
 * path.
 */
interface InternalClipboardManager {
    handleDrop(e: DragEvent): void;
    handlePaste(e: ClipboardEvent): void;
}

interface ViewModeWithClipboard {
    clipboardManager?: InternalClipboardManager;
}

export class VaultDestination implements DropGateDestination {
    readonly id = 'vault' as const;
    readonly label = 'Vault attachments';
    readonly description = 'Save into the vault. Default Obsidian behavior. Private.';

    constructor(private readonly app: App) {}

    isAvailable(): boolean {
        return true;
    }

    async insert(files: readonly File[], ctx: DropGateContext): Promise<void> {
        const view = ctx.view;
        const mode = view.currentMode as unknown as ViewModeWithClipboard;
        const clip = mode.clipboardManager;

        if (clip) {
            try {
                if (ctx.originalEvent instanceof DragEvent) {
                    clip.handleDrop(makeSyntheticDragEvent(ctx.originalEvent, files));
                } else {
                    clip.handlePaste(makeSyntheticPasteEvent(ctx.originalEvent, files));
                }
                return;
            } catch (err) {
                console.error('[image-gin/drop-gate] clipboardManager re-dispatch failed; falling back', err);
                // fall through to explicit-API path
            }
        }

        await this.fallbackInsert(files, ctx);
    }

    /**
     * Explicit-API fallback if Obsidian's internal clipboardManager surface
     * disappears. Slower (no built-in attachment-folder polish) but type-safe.
     */
    private async fallbackInsert(files: readonly File[], ctx: DropGateContext): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('Image gin: no active file for vault drop.');
            return;
        }

        const attachmentDir = this.attachmentDirFor(activeFile);
        await this.ensureDir(attachmentDir);

        let pos = ctx.insertPos;
        for (const file of files) {
            const safeName = await this.uniqueFileName(attachmentDir, fileNameFor(file));
            const buffer = await file.arrayBuffer();
            const path = attachmentDir ? `${attachmentDir}/${safeName}` : safeName;
            const written = await this.app.vault.createBinary(path, buffer);
            const link = this.app.fileManager.generateMarkdownLink(written, activeFile.path);
            const md = (link.startsWith('!') ? link : `!${link}`) + '\n';
            ctx.editor.replaceRange(md, pos);
            pos = { line: pos.line + 1, ch: 0 };
        }
        ctx.editor.setCursor(pos);
        ctx.editor.focus();
    }

    private attachmentDirFor(_file: TFile): string {
        const cfgRecord = (this.app.vault as unknown as { config?: { attachmentFolderPath?: string } }).config;
        const cfg = cfgRecord?.attachmentFolderPath;
        if (cfg && cfg !== '/' && cfg !== '') return cfg.replace(/^\/+|\/+$/g, '');
        return '';
    }

    private async ensureDir(dir: string): Promise<void> {
        if (!dir) return;
        const exists = this.app.vault.getAbstractFileByPath(dir);
        if (exists) return;
        await this.app.vault.createFolder(dir);
    }

    private async uniqueFileName(dir: string, name: string): Promise<string> {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.substring(0, dot) : name;
        const ext = dot > 0 ? name.substring(dot) : '';
        let candidate = name;
        let counter = 1;
        const prefix = dir ? `${dir}/` : '';
        while (this.app.vault.getAbstractFileByPath(`${prefix}${candidate}`)) {
            candidate = `${base}-${counter}${ext}`;
            counter++;
        }
        return candidate;
    }
}
