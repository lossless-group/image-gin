import type { PluginSettingTab } from 'obsidian';
import type { Plugin } from 'obsidian';

export interface ImageSize {
    id: string;
    yamlKey: string;
    width: number;
    height: number;
    label: string;
}

export interface PluginSettings {
  apiKey: string;
  baseUrl: string;
  retries: number;
  backoffDelay: number;
  rateLimit: number;
  cacheDuration: number;
  imageStylesJSON: string; // JSON string of style configurations
}


export interface ImageGinPlugin extends Plugin {
  settings: PluginSettings;
}

export interface ImageGinPluginSettingsTab extends PluginSettingTab {
  plugin: ImageGinPlugin;
}
