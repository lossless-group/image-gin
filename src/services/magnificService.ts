import { logger } from '../utils/logger';
import { requestUrl } from 'obsidian';

export interface MagnificImage {
    id: number;
    title: string;
    url: string;
    image: {
        source: {
            url: string;
            size: string;
        };
    };
    author: {
        name: string;
        avatar: string;
    };
}

export interface MagnificSearchResult {
    data: MagnificImage[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

export class MagnificService {
    private apiKey: string = '';
    private static readonly API_URL = 'https://api.magnific.com/v1';

    setApiKey(apiKey: string): void {
        this.apiKey = apiKey.trim();
    }

    hasApiKey(): boolean {
        return !!this.apiKey;
    }

    async searchImages(term: string, limit: number = 10): Promise<MagnificSearchResult> {
        if (!this.apiKey) {
            throw new Error('Please configure your Magnific API key in settings');
        }

        // `limit`, not `per_page`: the API ignores per_page and returns 50
        // results, and the modal then caches every one of their thumbnails.
        const params = new URLSearchParams({
            term: term,
            limit: limit.toString(),
            page: '1',
            clean_search: 'true'
        });

        const url = `${MagnificService.API_URL}/resources?${params.toString()}`;

        try {
            const response = await requestUrl({
                url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'x-magnific-api-key': this.apiKey,
                },
                throw: false,
            });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`Magnific API returned HTTP ${response.status}: ${response.text?.slice(0, 200) ?? ''}`);
            }

            return withHttpsImages(response.json as MagnificSearchResult);
        } catch (error) {
            logger.error('Magnific API error:', error);
            throw new Error(`Failed to search images: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

/**
 * Magnific returns image URLs as plain http://, and the same files are served
 * over https. Upgrading them keeps insecure links out of notes.
 */
export function withHttpsImages(result: MagnificSearchResult): MagnificSearchResult {
    for (const item of result.data ?? []) {
        const source = item.image?.source;
        if (source && typeof source.url === 'string') {
            source.url = source.url.replace(/^http:\/\//i, 'https://');
        }
    }
    return result;
}
