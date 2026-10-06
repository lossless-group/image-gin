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
export class Setting {}
export class PluginSettingTab {}
export class TFile {}
export function normalizePath(p: string): string {
    return p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
