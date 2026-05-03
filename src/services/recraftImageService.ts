import { requestUrl, TFile, Vault } from 'obsidian';
import { ImageGinSettings } from '../settings/settings';

export interface GeneratedImage {
    base64: string;
    width: number;
    height: number;
    prompt: string;
    timestamp: number;
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
        styleParams: any
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
            console.log('=== Recraft API Request ===');
            console.log('URL:', this.settings.recraftBaseUrl);
            console.log('Model:', this.settings.recraftModelChoice);
            console.log('Dimensions:', `${width}x${height}`);
            console.log('Style Params:', styleParams);

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

            console.log('Sending request to Recraft API:', {
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.recraftApiKey ? '[REDACTED]' : 'MISSING'}`,
                    'Content-Type': 'application/json',
                },
                body: requestData,
            });

            console.log('Sending request to:', url);
            console.log('Request headers:', {
                'Authorization': 'Bearer ***',
                'Content-Type': 'application/json'
            });
            console.log('Request body:', JSON.stringify({
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
            console.log(`Received API response in ${responseTime}ms`);
            console.log('Response status:', response.status);
            
            // Log response headers (redacting sensitive info)
            const responseHeaders = { ...response.headers };
            if (responseHeaders['authorization']) responseHeaders['authorization'] = '***';
            console.log('Response headers:', responseHeaders);

            // Get response text for logging before parsing
            const responseText = typeof response.text === 'string' ? response.text : '';
            
            // Check if the response is an error
            if (response.status !== 200) {
                console.error('API Error Response:', {
                    status: response.status,
                    headers: responseHeaders,
                    body: responseText.length > 500 ? responseText.substring(0, 500) + '...' : responseText
                });

                let errorDetails;
                try {
                    errorDetails = JSON.parse(responseText);
                } catch (e) {
                    errorDetails = { raw: responseText };
                }
                
                throw new Error(
                    `API request failed with status ${response.status}\n` +
                    `Details: ${JSON.stringify(errorDetails, null, 2)}`
                );
            }

            // Parse successful response
            let data: any;
            try {
                data = typeof response.json === 'function' 
                    ? await response.json() 
                    : response.json;
            } catch (e) {
                console.error('Failed to parse JSON response:', e);
                throw new Error('Failed to parse API response');
            }
            console.log('API response data:', data);
            
            // Handle the response based on the API's actual structure
            const imageUrl = data.data?.[0]?.url;
            if (!imageUrl) {
                console.error('No image URL in response. Full response:', data);
                throw new Error('No image URL in response');
            }

            // Download the image from the URL
            console.log('Downloading image from:', imageUrl);
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
            console.error('Error generating image:', error);
            throw error;
        }
    }

    async saveImage(image: GeneratedImage, filePath: string): Promise<TFile> {
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
                const fs = require('fs');
                const path = require('path');
                
                console.log('Saving to absolute path:', filePath);
                
                // Create directory if it doesn't exist
                const folderPath = path.dirname(filePath);
                console.log('Creating directory if needed:', folderPath);
                
                if (!fs.existsSync(folderPath)) {
                    console.log('Directory does not exist, creating:', folderPath);
                    fs.mkdirSync(folderPath, { recursive: true });
                } else {
                    console.log('Directory already exists:', folderPath);
                }
                
                // Write file directly to absolute path (from system root)
                console.log('Writing file to:', filePath);
                fs.writeFileSync(filePath, bytes);
                console.log('File saved successfully to:', filePath);
                
                // Return a mock TFile since we can't create a real one outside the vault
                // The caller should handle this case appropriately
                return null as any;
            } else {
                // Use Obsidian vault methods for relative paths
                const folderPath = filePath.split('/').slice(0, -1).join('/');
                if (folderPath && !await this.vault.adapter.exists(folderPath)) {
                    await this.vault.createFolder(folderPath);
                }
                
                const file = await this.vault.createBinary(filePath, bytes.buffer as ArrayBuffer);
                return file;
            }
        } catch (error) {
            console.error('Error saving image:', error);
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
