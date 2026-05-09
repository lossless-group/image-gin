import type { Editor, EditorPosition, MarkdownView } from 'obsidian';

export type DropGateDestinationId = 'vault' | 'imagekit' | 'imgur';

export interface DropGateContext {
    editor: Editor;
    view: MarkdownView;
    /**
     * The original event. Vault destination uses this to re-dispatch a
     * synthetic copy into Obsidian's internal clipboardManager. Hosted
     * destinations don't need it.
     */
    originalEvent: DragEvent | ClipboardEvent;
    /**
     * Cursor position captured synchronously when the drop/paste fired.
     * Hosted destinations insert their markdown link at this position via
     * editor.replaceRange — using replaceSelection instead would insert at
     * whatever the cursor became while the modal was open, which is rarely
     * where the user dropped the image.
     */
    insertPos: EditorPosition;
}

export interface DropGateDestination {
    id: DropGateDestinationId;
    label: string;
    description: string;
    /**
     * True if this destination is configured and usable. Disabled destinations
     * are hidden from the modal.
     */
    isAvailable(): boolean;
    /**
     * Process and insert the supplied images into the active document. Throw
     * on failure; the handler will surface a Notice.
     */
    insert(files: readonly File[], ctx: DropGateContext): Promise<void>;
}
