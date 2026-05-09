import { Notice } from 'obsidian';
import type { Vault } from 'obsidian';

interface LogEntry {
    timestamp: string;
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
    details?: unknown;
    stack?: string;
}

/**
 * Singleton file logger for Image Gin.
 *
 * Writes to `.obsidian/plugins/image-gin/log.json` (the plugin's own
 * data folder, matching manifest.json id, kept hidden in the vault).
 * Also mirrors every entry to console.* so the existing devtools
 * workflow keeps working.
 *
 * `initialize(vault)` MUST be called once during plugin onload before any
 * log calls actually persist; pre-initialize calls fall through to console
 * only and the queue swallows the file write attempt.
 */
export class FileLogger {
    private static instance: FileLogger;
    // Plugin-folder path resolved at initialize() from vault.configDir
    // (the user can rename `.obsidian` → custom). Empty until init; calls
    // before init fall through to console only.
    private logFile: string = '';
    private vault: Vault | null = null;
    private logEntries: LogEntry[] = [];
    private isSaving = false;

    private constructor() {}

    static getInstance(): FileLogger {
        if (!FileLogger.instance) {
            FileLogger.instance = new FileLogger();
        }
        return FileLogger.instance;
    }

    initialize(vault: Vault): void {
        this.vault = vault;
        // Resolve config dir once at init — Obsidian lets users rename
        // `.obsidian/` to anything they want, so hardcoding is rejected
        // by the marketplace lint.
        this.logFile = `${vault.configDir}/plugins/image-gin/log.json`;
        void this.loadLogs();
    }

    /**
     * Read existing entries from the log file via the adapter API
     * (the standard `vault.getAbstractFileByPath` does not index `.obsidian/`).
     */
    private async loadLogs(): Promise<void> {
        if (!this.vault) return;
        try {
            if (!(await this.vault.adapter.exists(this.logFile))) return;
            const content = await this.vault.adapter.read(this.logFile);
            const parsed: unknown = JSON.parse(content);
            if (Array.isArray(parsed)) {
                this.logEntries = parsed.filter((e): e is LogEntry =>
                    typeof e === 'object' && e !== null && 'level' in e && 'message' in e
                );
            }
        } catch {
            // Corrupted or unreadable; start fresh.
            this.logEntries = [];
        }
    }

    private async saveLogs(): Promise<void> {
        if (!this.vault || this.isSaving) return;

        this.isSaving = true;
        try {
            // Ensure the plugin folder exists. mkdir is idempotent — Obsidian
            // throws "Folder already exists" which we tolerate.
            const folder = this.logFile.substring(0, this.logFile.lastIndexOf('/'));
            try {
                await this.vault.adapter.mkdir(folder);
            } catch (mkdirErr) {
                const msg = mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr);
                if (!/already exists/i.test(msg)) throw mkdirErr;
            }
            await this.vault.adapter.write(
                this.logFile,
                JSON.stringify(this.logEntries, null, 2)
            );
        } catch (error) {
            console.error('FileLogger: failed to write log file:', error);
            new Notice('Image gin: failed to save error log. See devtools console.');
        } finally {
            this.isSaving = false;
        }
    }

    private addEntry(level: LogEntry['level'], message: string, details?: unknown): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            details: details instanceof Error ? {
                message: details.message,
                name: details.name,
                stack: details.stack,
            } : details,
        };

        this.logEntries.push(entry);

        // Keep only the last 1000 entries
        if (this.logEntries.length > 1000) {
            this.logEntries = this.logEntries.slice(-1000);
        }

        void this.saveLogs();

        // Mirror to console — only allow warn/error/debug per Obsidian
        // marketplace rules; map info → debug, default → debug.
        const formatted = `[${entry.timestamp}] [${level.toUpperCase()}] ${message}`;
        switch (level) {
            case 'error':
                console.error(formatted, details ?? '');
                break;
            case 'warn':
                console.warn(formatted, details ?? '');
                break;
            default:
                console.debug(formatted, details ?? '');
        }
    }

    error(message: string, details?: unknown): void { this.addEntry('error', message, details); }
    warn(message: string, details?: unknown): void { this.addEntry('warn', message, details); }
    info(message: string, details?: unknown): void { this.addEntry('info', message, details); }
    debug(message: string, details?: unknown): void { this.addEntry('debug', message, details); }

    getLogs(limit: number = 100): LogEntry[] {
        return [...this.logEntries].reverse().slice(0, limit);
    }

    async clearLogs(): Promise<void> {
        this.logEntries = [];
        await this.saveLogs();
    }
}

// Export a singleton instance
export const logger = FileLogger.getInstance();
