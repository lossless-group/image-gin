// Minimal runtime stand-in for the `obsidian` module, which ships types
// only and cannot load under Node. scripts/run-tests.mjs aliases
// `obsidian` to this file. Tests drive network behavior by assigning
// a handler to `globalThis.__requestUrl`.

export interface StubRequest {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | ArrayBuffer;
    throw?: boolean;
}

export interface StubResponse {
    status: number;
    headers: Record<string, string>;
    text: string;
    json: unknown;
    arrayBuffer: ArrayBuffer;
}

type Handler = (req: StubRequest) => StubResponse | Promise<StubResponse>;

export async function requestUrl(req: StubRequest): Promise<StubResponse> {
    const handler = (globalThis as { __requestUrl?: Handler }).__requestUrl;
    if (!handler) throw new Error(`requestUrl called with no test handler: ${req.url}`);
    const res = await handler(req);
    if (req.throw !== false && res.status >= 400) {
        throw new Error(`Request failed, status ${res.status}`);
    }
    return res;
}

export class Notice {
    constructor(public message?: string) {}
}

export class Modal {}
export class Setting {
    constructor(_containerEl: unknown) {
        const names = (globalThis as { __settingNames?: string[] }).__settingNames;
        return chain((prop, args) => {
            if (prop === 'setName' && names) names.push(String(args[0]));
        }) as Setting;
    }
}
export class PluginSettingTab {
    containerEl: unknown = chain();
    /** Count of update() calls, so tests can assert a rebuild was requested. */
    updates = 0;
    constructor(public app: unknown, public plugin: unknown) {}
    getSettingDefinitions(): unknown[] { return []; }
    update(): void { this.updates++; }
    refreshDomState(): void {}
    getControlValue(key: string): unknown {
        return (this.plugin as { settings: Record<string, unknown> }).settings[key];
    }
    setControlValue(key: string, value: unknown): void | Promise<void> {
        (this.plugin as { settings: Record<string, unknown> }).settings[key] = value;
    }
}
export class TFile {}
export function normalizePath(p: string): string {
    return p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

// --- Chainable UI stand-ins for rendering the settings tab under Node ----
// Every method returns the same proxy; callbacks handed to addText/addToggle
// etc. are invoked with a component proxy. Setting names are recorded in
// globalThis.__settingNames so tests can assert which rows rendered.

function chain(onCall?: (prop: string, args: unknown[]) => void): unknown {
    const target = function () { /* callable */ };
    const proxy: unknown = new Proxy(target, {
        get(_t, prop) {
            if (prop === 'then') return undefined;
            if (prop === 'inputEl' || prop === 'settingEl' || prop === 'controlEl' || prop === 'buttonEl') return chain();
            return (...args: unknown[]) => {
                onCall?.(String(prop), args);
                for (const a of args) if (typeof a === 'function' && !String(prop).startsWith('on') && prop !== 'addEventListener') (a as (c: unknown) => void)(chain());
                return proxy;
            };
        },
        set() { return true; },
    });
    return proxy;
}

export function makeStubElement(): unknown {
    return chain();
}

export class PluginSettingTabStub {}

export const SettingNames: string[] = [];
(globalThis as { __settingNames?: string[] }).__settingNames = SettingNames;
