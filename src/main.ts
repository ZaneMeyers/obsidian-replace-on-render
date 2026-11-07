import { Extension } from '@codemirror/state';
import { MarkdownView, Plugin, debounce } from 'obsidian';
import { substitutionExtension } from './editor';
import { processElement } from './reading';
import { CompiledRule, compileRules } from './rules';
import { PluginSettings, SettingsTab, normalizeSettings } from './settings';

export default class ReplaceOnRenderPlugin extends Plugin {
	settings!: PluginSettings;
	private compiled: CompiledRule[] = [];
	/** Mutated in place, then applied with workspace.updateOptions(). */
	private editorExtensions: Extension[] = [];

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.compiled = compileRules(this.settings.rules);

		this.registerMarkdownPostProcessor((el) => {
			processElement(el, this.compiled, this.settings.readingView);
		});

		this.updateEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);

		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload(): void {
		this.rerenderReadingViews();
	}

	async saveAndRefresh(): Promise<void> {
		await this.saveData(this.settings);
		this.compiled = compileRules(this.settings.rules);
		this.updateEditorExtensions();
		this.app.workspace.updateOptions();
		this.rerenderReadingViews();
	}

	/** For text inputs: avoids re-rendering every open note on each keystroke. */
	saveAndRefreshDebounced = debounce(() => void this.saveAndRefresh(), 500, true);

	private updateEditorExtensions(): void {
		this.editorExtensions.length = 0;
		this.editorExtensions.push(
			substitutionExtension(this.compiled, {
				replace: this.settings.livePreview,
				excludeComments: this.settings.excludeComments,
			}),
		);
	}

	private rerenderReadingViews(): void {
		this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
			if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
		});
	}
}
