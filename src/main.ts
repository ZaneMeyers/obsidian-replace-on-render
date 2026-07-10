import { Plugin } from 'obsidian';
import { SettingsTab } from './settings';
import { ReplacementPostProcessor } from './markdownPostProcessors/replacement-post-processor';
import { replaceViewPlugin } from './editorExtensions/replace-view-plugin';
import { PluginSettings } from './interfaces/plugin-settings';

const DEFAULT_SETTINGS: PluginSettings = {
	rules: [
		{
			match: '---',
			replacement: '—',
		},
		{
			match: '\\.\\.\\.',
			replacement: '…',
		},
	],
	enable: true,
};

export default class ReplaceOnRenderPlugin extends Plugin {
	settings!: PluginSettings;

	async loadSettings() {
		const savedSettings = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(savedSettings ?? {}),
			rules: Array.isArray(savedSettings?.rules) ? savedSettings.rules : DEFAULT_SETTINGS.rules,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	addMarkdownPostProcessor() {
		this.registerMarkdownPostProcessor(new ReplacementPostProcessor(this.settings).process);
	}

	async onload() {
		await this.loadSettings();
		console.log('Loading Replace on Render Plugin');

		this.addMarkdownPostProcessor();
		// Register the editor extension for Live Preview (CodeMirror)
		try {
			this.registerEditorExtension(replaceViewPlugin(this.settings.rules));
		} catch (e) {
			console.warn('Failed to initialize Replace on Render plugin:', e);
		}
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {
		console.log('Unloading Replace on Render Plugin...');
	}
}
