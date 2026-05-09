import type { Editor, EditorPosition, MarkdownFileInfo, MarkdownView } from 'obsidian';
import { MarkdownView as MarkdownViewClass, Notice } from 'obsidian';
import type { DropGateDestination, DropGateDestinationId } from '../destinations/types';
import { DropGateModal } from '../modals/DropGateModal';
import {
    isSyntheticDropEvent,
    allFilesAreImages,
    imagesIn,
} from '../utils/dropGateEvents';
import type ImageGinPlugin from '../../main';

function asMarkdownView(info: MarkdownView | MarkdownFileInfo): MarkdownView | null {
    return info instanceof MarkdownViewClass ? info : null;
}

interface SessionState {
    rememberedDestination: DropGateDestinationId | null;
}

export class DropGateHandlers {
    private session: SessionState = { rememberedDestination: null };

    constructor(
        private readonly plugin: ImageGinPlugin,
        private readonly destinations: readonly DropGateDestination[],
    ) {}

    /** Reset the per-session "remember choice" — wired to active-leaf-change. */
    resetSession(): void {
        this.session.rememberedDestination = null;
    }

    onDrop = (e: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo): void => {
        // Re-entry guard. The synthetic copy our own VaultDestination
        // dispatches would otherwise loop back through here.
        if (isSyntheticDropEvent(e)) return;

        const view = asMarkdownView(info);
        if (!view) return; // Canvas etc.: out of scope.

        const settings = this.plugin.settings.dropGate;
        if (!settings.enabled) return;

        // Pull files out of the DataTransfer. obsidian.d.ts re-exports
        // the DOM DragEvent so dataTransfer is typed as the platform's
        // DataTransfer | null; cast through unknown if needed.
        const dt = e.dataTransfer;
        const files: File[] = dt && dt.files ? Array.from(dt.files) : [];
        if (!allFilesAreImages(files)) return;

        // Synchronous preventDefault — must come before any await.
        e.preventDefault();

        // Capture cursor NOW. After awaiting the modal, the cursor reported
        // by editor.getCursor() may be stale or somewhere else entirely
        // (the user could have clicked, the editor could have lost focus).
        const insertPos = editor.getCursor();

        if (settings.policyMode === 'external-only' && !this.anyExternalAvailable()) {
            this.dispatchVault(e, files, editor, view, insertPos);
            return;
        }

        // Floating promise on purpose — the handler must return synchronously.
        void this.gate(e, files, editor, view, insertPos);
    };

    onPaste = (e: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo): void => {
        if (isSyntheticDropEvent(e)) return;

        const view = asMarkdownView(info);
        if (!view) return;

        const settings = this.plugin.settings.dropGate;
        if (!settings.enabled) return;

        const clipboardFiles: FileList | undefined = e.clipboardData?.files;
        const files: File[] = clipboardFiles ? Array.from(clipboardFiles) : [];
        if (!allFilesAreImages(files)) return;

        e.preventDefault();

        const insertPos = editor.getCursor();

        if (settings.policyMode === 'external-only' && !this.anyExternalAvailable()) {
            this.dispatchVault(e, files, editor, view, insertPos);
            return;
        }

        void this.gate(e, files, editor, view, insertPos);
    };

    private async gate(
        originalEvent: DragEvent | ClipboardEvent,
        files: File[],
        editor: Editor,
        view: MarkdownView,
        insertPos: EditorPosition,
    ): Promise<void> {
        const images = imagesIn(files);
        const settings = this.plugin.settings.dropGate;

        const remembered = this.session.rememberedDestination;
        if (remembered) {
            const dest = this.destinations.find((d) => d.id === remembered);
            if (dest && dest.isAvailable()) {
                await this.runDestination(dest, images, originalEvent, editor, view, insertPos);
                return;
            }
            this.session.rememberedDestination = null;
        }

        const available = this.destinations.filter((d) => d.isAvailable());
        const defaultId = available.find((d) => d.id === settings.defaultDestination)
            ? settings.defaultDestination
            : (available[0]?.id ?? 'vault');

        // Show every destination in the modal — disabled ones included — so
        // users see what's possible and don't get a separate plugin's modal
        // for an option that "should have been here." Per-destination hint
        // tells them why a row is greyed out.
        const imgurEnabled = this.plugin.settings.imgur.enabled;
        const imageKitEnabled = this.plugin.settings.imageKit.enabled;
        const unavailableHints = {
            imagekit: !imageKitEnabled
                ? 'Enable ImageKit and add a private key in settings.'
                : 'Missing private key or upload endpoint in settings.',
            imgur: !imgurEnabled
                ? 'Enable Imgur and add a client ID in settings.'
                : 'Missing Imgur client ID in settings.',
        };

        const modal = new DropGateModal(this.plugin.app, {
            files: images,
            destinations: this.destinations,
            unavailableHints,
            defaultDestinationId: defaultId,
            showRememberToggle: settings.rememberSessionChoice,
        });

        const choice = await modal.ask();
        if (choice.kind === 'cancel') return;
        if (!choice.destinationId) return;

        const dest = this.destinations.find((d) => d.id === choice.destinationId);
        if (!dest || !dest.isAvailable()) return;

        if (choice.rememberForSession) {
            this.session.rememberedDestination = dest.id;
        }

        await this.runDestination(dest, images, originalEvent, editor, view, insertPos);
    }

    private async runDestination(
        dest: DropGateDestination,
        files: File[],
        originalEvent: DragEvent | ClipboardEvent,
        editor: Editor,
        view: MarkdownView,
        insertPos: EditorPosition,
    ): Promise<void> {
        try {
            await dest.insert(files, { editor, view, originalEvent, insertPos });
        } catch (err) {
            console.error(`[image-gin/drop-gate] ${dest.id} destination failed`, err);
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Image Gin (${dest.label}): ${msg}`);
            // Do NOT silently fall back to vault — the user picked this
            // destination deliberately. Surface the error and stop.
        }
    }

    private dispatchVault(
        originalEvent: DragEvent | ClipboardEvent,
        files: File[],
        editor: Editor,
        view: MarkdownView,
        insertPos: EditorPosition,
    ): void {
        const vault = this.destinations.find((d) => d.id === 'vault');
        if (!vault) return;
        void vault.insert(files, { editor, view, originalEvent, insertPos });
    }

    private anyExternalAvailable(): boolean {
        return this.destinations.some((d) => d.id !== 'vault' && d.isAvailable());
    }
}
