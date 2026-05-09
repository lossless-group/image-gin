import { logger } from '../utils/logger';
import type { TFile, Vault } from 'obsidian';
import { requestUrl } from 'obsidian';
import type { ImageGinSettings } from '../settings/settings';
import { isRecord } from '../utils/coerce';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GeneratedImage {
    base64: string;
    width: number;
    height: number;
    prompt: string;
    timestamp: number;
}

// Two shapes the Recraft API accepts for style parameters: either a custom
// style ID, or a built-in style (with optional substyle). Built as a union
// so callers can produce one or the other without conditional spread tricks.
export type RecraftStyleParams =
    | { style_id: string }
    | { style: string; substyle?: string };

interface RecraftGenerationResponse {
    data?: Array<{ url?: string }>;
    created?: number;
}

export class RecraftImageService {
    private settings: ImageGinSettings;
    private vault: Vault;

    constructor(settings: ImageGinSettings, vault: Vault) {
        this.settings = settings;
        this.vault = vault;
    }

    async generateImage(
        prompt: string,
        width: number,
        height: number,
        styleParams: RecraftStyleParams
    ): Promise<GeneratedImage> {
        try {
            // Validate API key
            if (!this.settings.recraftApiKey) {
                throw new Error('Recraft API key is not set. Please configure it in the plugin settings.');
            }

            // Validate base URL
            if (!this.settings.recraftBaseUrl) {
                throw new Error('Recraft API base URL is not configured.');
            }

            // Log the request details (without exposing the API key)
            logger.info('=== Recraft API Request ===');
            logger.info('URL:', this.settings.recraftBaseUrl);
            logger.info('Model:', this.settings.recraftModelChoice);
            logger.info('Dimensions:', `${width}x${height}`);
            logger.info('Style Params:', styleParams);

            // Use the URL directly from settings (it already includes the full path)
            const url = this.settings.recraftBaseUrl;

            const requestData = {
                prompt,
                size: `${width}x${height}`, // Recraft API expects size as string like "2048x1024"
                model: this.settings.recraftModelChoice,
                n: 1, // Number of images to generate
                response_format: 'url', // Using URL instead of b64_json
                ...styleParams,
            };

            logger.info('Sending request to Recraft API:', {
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.recraftApiKey ? '[REDACTED]' : 'MISSING'}`,
                    'Content-Type': 'application/json',
                },
                body: requestData,
            });

            logger.info('Sending request to:', url);
            logger.info('Request headers:', {
                'Authorization': 'Bearer ***',
                'Content-Type': 'application/json'
            });
            logger.info('Request body:', JSON.stringify({
                ...requestData,
                prompt: requestData.prompt.length > 50 
                    ? `${requestData.prompt.substring(0, 47)}...` 
                    : requestData.prompt
            }, null, 2));

            const startTime = Date.now();
            const response = await requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.recraftApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });

            const responseTime = Date.now() - startTime;
            logger.info(`Received API response in ${responseTime}ms`);
            logger.info('Response status:', response.status);
            
            // Log response headers (redacting sensitive info)
            const responseHeaders = { ...response.headers };
            if (responseHeaders['authorization']) responseHeaders['authorization'] = '***';
            logger.info('Response headers:', responseHeaders);

            // Get response text for logging before parsing
            const responseText = typeof response.text === 'string' ? response.text : '';
            
            // Check if the response is an error
            if (response.status !== 200) {
                logger.error('API Error Response:', {
                    status: response.status,
                    headers: responseHeaders,
                    body: responseText.length > 500 ? responseText.substring(0, 500) + '...' : responseText
                });

                let errorDetails: unknown;
                try {
                    errorDetails = JSON.parse(responseText);
                } catch {
                    errorDetails = { raw: responseText };
                }
                
                throw new Error(
                    `API request failed with status ${response.status}\n` +
                    `Details: ${JSON.stringify(errorDetails, null, 2)}`
                );
            }

            // Parse successful response. Obsidian's requestUrl already parses
            // .json into a value; isRecord narrows from unknown into something
            // we can hand to the typed RecraftGenerationResponse view.
            const json: unknown = response.json;
            if (!isRecord(json)) {
                logger.error('Recraft API response was not a JSON object:', json);
                throw new Error('Failed to parse Recraft API response');
            }
            const data = json as RecraftGenerationResponse;
            logger.info('API response data:', data);

            // Handle the response based on the API's actual structure
            const imageUrl = data.data?.[0]?.url;
            if (!imageUrl) {
                logger.error('No image URL in response. Full response:', data);
                throw new Error('No image URL in response');
            }

            // Download the image from the URL
            logger.info('Downloading image from:', imageUrl);
            const imageResponse = await requestUrl({
                url: imageUrl,
                method: 'GET'
            });

            if (imageResponse.status !== 200) {
                throw new Error(`Failed to download image: HTTP ${imageResponse.status}`);
            }

            // Convert the response to base64
            const arrayBuffer = imageResponse.arrayBuffer;
            const buffer = Buffer.from(arrayBuffer);
            const base64Image = buffer.toString('base64');

            // Return the generated image data
            return {
                base64: base64Image,
                width,
                height,
                prompt,
                timestamp: data.created || Date.now()
            };
        } catch (error) {
            logger.error('Error generating image:', error);
            throw error;
        }
    }

    /**
     * Saves the image to disk. Returns the created TFile when written into
     * the vault, or null when written to an absolute path outside the vault
     * (Obsidian's TFile cannot represent paths outside the vault).
     */
    async saveImage(image: GeneratedImage, filePath: string): Promise<TFile | null> {
        try {
            // Convert base64 to binary
            const binaryString = atob(image.base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Check if this is an absolute path
            if (filePath.startsWith('/')) {
                // Use Node.js fs operations for absolute paths
                
                logger.info('Saving to absolute path:', filePath);
                
                // Create directory if it doesn't exist
                const folderPath = path.dirname(filePath);
                logger.info('Creating directory if needed:', folderPath);
                
                if (!fs.existsSync(folderPath)) {
                    logger.info('Directory does not exist, creating:', folderPath);
                    fs.mkdirSync(folderPath, { recursive: true });
                } else {
                    logger.info('Directory already exists:', folderPath);
                }
                
                // Write file directly to absolute path (from system root)
                logger.info('Writing file to:', filePath);
                fs.writeFileSync(filePath, bytes);
                logger.info('File saved successfully to:', filePath);
                
                // No TFile to return — file lives outside the vault.
                return null;
            } else {
                // Use Obsidian vault methods for relative paths
                const folderPath = filePath.split('/').slice(0, -1).join('/');
                if (folderPath && !await this.vault.adapter.exists(folderPath)) {
                    await this.vault.createFolder(folderPath);
                }
                
                const file = await this.vault.createBinary(filePath, bytes.buffer);
                return file;
            }
        } catch (error) {
            logger.error('Error saving image:', error);
            throw error;
        }
    }

    getImagePath(baseName: string, width: number, height: number, timestamp: number): string {
        const fileName = `${baseName}_${width}x${height}_${timestamp}.png`;
        
        // If the path starts with '/', treat it as an absolute path
        if (this.settings.imageOutputFolder.startsWith('/')) {
            return `${this.settings.imageOutputFolder}/${fileName}`.replace(/\/\//g, '/');
        } else {
            // Relative path - let Obsidian handle it relative to vault root
            return `${this.settings.imageOutputFolder}/${fileName}`.replace(/\/\//g, '/');
        }
    }
}