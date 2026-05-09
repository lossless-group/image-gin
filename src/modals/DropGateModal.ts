import type { App } from 'obsidian';
import { Modal } from 'obsidian';
import type { DropGateDestination, DropGateDestinationId } from '../destinations/types';
import { formatFileSize } from '../utils/dropGateEvents';

export interface DropGateChoice {
    kind: 'destination' | 'cancel';
    destinationId?: DropGateDestinationId;
    rememberForSession: boolean;
}

interface DialogOptions {
    files: readonly File[];
    /** All destinations in display order. Each carries its own isAvailable(). */
    destinations: readonly DropGateDestination[];
    /** Per-destination message shown under the label when isAvailable() is false. */
    unavailableHints: Partial<Record<DropGateDestinationId, string>>;
    defaultDestinationId: DropGateDestinationId;
    showRememberToggle: boolean;
}

export class DropGateModal extends Modal {
    private readonly opts: DialogOptions;
    private resolveChoice: ((c: DropGateChoice) => void) | null = null;
    private selectedId: DropGateDestinationId;
    private rememberForSession = false;

    constructor(app: App, opts: DialogOptions) {
        super(app);
        this.opts = opts;
        this.selectedId = opts.defaultDestinationId;
    }

    ask(): Promise<DropGateChoice> {
        return new Promise((resolve) => {
            this.resolveChoice = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        // Attach the styling class to modalEl so width rules apply to the
        // OUTER popup. See perplexed widening reminder.
        modalEl.addClass('image-gin-drop-gate-modal');
        contentEl.empty();

        const header = contentEl.createDiv('idg-header');
        const title = this.opts.files.length === 1
            ? 'Image dropped'
            : `${this.opts.files.length} images dropped`;
        header.createEl('h2', { text: title, cls: 'idg-title' });
        header.createEl('p', { text: 'Where should this go?', cls: 'idg-subtitle' });

        const fileList = contentEl.createDiv('idg-file-list');
        for (const f of this.opts.files) {
            const row = fileList.createDiv('idg-file-row');
            row.createSpan({ text: f.name || 'image', cls: 'idg-file-name' });
            const meta: string[] = [];
            if (f.size > 0) meta.push(formatFileSize(f.size));
            const t = f.type.replace(/^image\//, '');
            if (t) meta.push(t);
            row.createSpan({ text: meta.join(' · '), cls: 'idg-file-meta' });
        }

        const destList = contentEl.createDiv('idg-destinations');
        for (const dest of this.opts.destinations) {
            const available = dest.isAvailable();
            const row = destList.createEl('label', {
                cls: `idg-destination${available ? '' : ' idg-destination-disabled'}`,
            });
            const radio = row.createEl('input', {
                type: 'radio',
                attr: { name: 'idg-destination', value: dest.id },
            });
            radio.checked = available && dest.id === this.selectedId;
            radio.disabled = !available;
            radio.addEventListener('change', () => {
                if (radio.checked) this.selectedId = dest.id;
            });

            const text = row.createDiv('idg-destination-text');
            text.createDiv({ text: dest.label, cls: 'idg-destination-label' });
            text.createDiv({ text: dest.description, cls: 'idg-destination-desc' });
            if (!available) {
                const hint = this.opts.unavailableHints[dest.id]
                    ?? 'Not configured. Enable and configure in image-gin settings.';
                text.createDiv({ text: hint, cls: 'idg-destination-hint' });
            }
        }

        if (this.opts.showRememberToggle) {
            const rememberRow = contentEl.createEl('label', { cls: 'idg-remember' });
            const cb = rememberRow.createEl('input', { type: 'checkbox' });
            cb.addEventListener('change', () => {
                this.rememberForSession = cb.checked;
            });
            rememberRow.createSpan({ text: 'Remember choice for this session' });
        }

        const footer = contentEl.createDiv('idg-footer');
        const cancelBtn = footer.createEl('button', { text: 'Cancel', cls: 'idg-cancel' });
        cancelBtn.addEventListener('click', () => this.finish({ kind: 'cancel', rememberForSession: false }));

        const insertBtn = footer.createEl('button', { text: 'Insert', cls: 'mod-cta idg-insert' });
        insertBtn.addEventListener('click', () => this.finish({
            kind: 'destination',
            destinationId: this.selectedId,
            rememberForSession: this.rememberForSession,
        }));

        activeWindow.setTimeout(() => insertBtn.focus(), 0);
    }

    onClose(): void {
        const { contentEl, modalEl } = this;
        modalEl.removeClass('image-gin-drop-gate-modal');
        contentEl.empty();
        if (this.resolveChoice) {
            const r = this.resolveChoice;
            this.resolveChoice = null;
            r({ kind: 'cancel', rememberForSession: false });
        }
    }

    private finish(choice: DropGateChoice): void {
        const r = this.resolveChoice;
        this.resolveChoice = null;
        this.close();
        if (r) r(choice);
    }
}
