import { App, PluginSettingTab, Setting } from 'obsidian';
import type ReplaceOnRenderPlugin from './main';
import { DEFAULT_RULES, MATCH_CLASS, RAW_CLASS, REPLACED_CLASS, Rule, validatePattern } from './rules';

export interface PluginSettings {
	readingView: boolean;
	livePreview: boolean;
	excludeComments: boolean;
	rules: Rule[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
	readingView: true,
	livePreview: true,
	excludeComments: false,
	rules: DEFAULT_RULES,
};

type BooleanKey = { [K in keyof PluginSettings]: PluginSettings[K] extends boolean ? K : never }[keyof PluginSettings];

function cloneRules(rules: Rule[]): Rule[] {
	return rules.map((r) => ({ ...r }));
}

/** Loads settings, accepting the older {match, replacement} rule format. */
export function normalizeSettings(data: unknown): PluginSettings {
	const saved = (data ?? {}) as Partial<PluginSettings> & { rules?: unknown };
	const rules = Array.isArray(saved.rules)
		? (saved.rules as unknown[] as Record<string, unknown>[]).map(
				(r): Rule => ({
					pattern: typeof r.pattern === 'string' ? r.pattern : typeof r.match === 'string' ? r.match : '',
					replacement: typeof r.replacement === 'string' ? r.replacement : '',
					enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
					cssClass: typeof r.cssClass === 'string' ? r.cssClass : '',
				}),
			)
		: cloneRules(DEFAULT_SETTINGS.rules);
	const bool = (key: BooleanKey): boolean =>
		typeof saved[key] === 'boolean' ? saved[key] : DEFAULT_SETTINGS[key];
	return {
		readingView: bool('readingView'),
		livePreview: bool('livePreview'),
		excludeComments: bool('excludeComments'),
		rules,
	};
}

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ReplaceOnRenderPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable in Reading View')
			.setDesc('Show replacements in Reading View. When off, matches are still wrapped in spans but keep their original text.')
			.addToggle((t) =>
				t.setValue(settings.readingView).onChange(async (v) => {
					settings.readingView = v;
					await this.plugin.saveAndRefresh();
				}),
			);

		new Setting(containerEl)
			.setName('Enable in Live Preview')
			.setDesc(
				'Show replacements in Live Preview. Editing a match shows its original text. When off, matches are still wrapped in spans but keep their original text.',
			)
			.addToggle((t) =>
				t.setValue(settings.livePreview).onChange(async (v) => {
					settings.livePreview = v;
					await this.plugin.saveAndRefresh();
				}),
			);

		new Setting(containerEl).setName('Exclusions').setHeading();

		new Setting(containerEl)
			.setName('Skip comments')
			.setDesc(
				'Leave %% Obsidian %% and <!-- HTML --> comments untouched. Comments are hidden in Reading View, so this only affects the editor.',
			)
			.addToggle((t) =>
				t.setValue(settings.excludeComments).onChange(async (v) => {
					settings.excludeComments = v;
					await this.plugin.saveAndRefresh();
				}),
			);

		new Setting(containerEl)
			.setName('Rules')
			.setHeading()
			.setDesc(
				createFragment((f) => {
					f.appendText('Each rule is a JavaScript regular expression and its replacement. ');
					f.appendText('Use $1, $<name> or $& in the replacement to insert captured text. ');
					f.appendText('When two rules match at the same place, the higher one wins. ');
					f.appendText('Every match is wrapped in a span with the class ');
					f.createEl('code', { text: MATCH_CLASS });
					f.appendText(', plus ');
					f.createEl('code', { text: REPLACED_CLASS });
					f.appendText(' or ');
					f.createEl('code', { text: RAW_CLASS });
					f.appendText(', plus the rule’s own classes.');
				}),
			);

		settings.rules.forEach((rule, index) => this.addRuleSetting(containerEl, rule, index));

		new Setting(containerEl)
			.addButton((b) =>
				b
					.setButtonText('Add rule')
					.setCta()
					.onClick(async () => {
						settings.rules.push({ pattern: '', replacement: '', enabled: true, cssClass: '' });
						await this.plugin.saveAndRefresh();
						this.display();
					}),
			)
			.addButton((b) =>
				b.setButtonText('Restore default rules').onClick(async () => {
					// Two-step confirmation: the first click arms the button.
					if (b.buttonEl.dataset.armed !== 'true') {
						b.buttonEl.dataset.armed = 'true';
						b.setButtonText('Click again to replace all rules').setWarning();
						return;
					}
					settings.rules = cloneRules(DEFAULT_RULES);
					await this.plugin.saveAndRefresh();
					this.display();
				}),
			);
	}

	private addRuleSetting(containerEl: HTMLElement, rule: Rule, index: number): void {
		const rules = this.plugin.settings.rules;
		const setting = new Setting(containerEl).setClass('ror-rule-setting');
		const errorEl = setting.descEl.createDiv({ cls: 'ror-rule-error mod-warning' });

		const showValidation = (input: HTMLInputElement) => {
			const error = validatePattern(rule.pattern);
			errorEl.setText(error && rule.pattern !== '' ? `Invalid pattern: ${error}` : '');
			input.toggleClass('ror-invalid', error !== null && rule.pattern !== '');
		};

		setting
			.addToggle((t) =>
				t
					.setTooltip('Enable rule')
					.setValue(rule.enabled)
					.onChange(async (v) => {
						rule.enabled = v;
						await this.plugin.saveAndRefresh();
					}),
			)
			.addText((t) => {
				t.setPlaceholder('Pattern (regex)').setValue(rule.pattern);
				t.inputEl.addClass('ror-pattern-input');
				showValidation(t.inputEl);
				t.onChange((v) => {
					rule.pattern = v;
					showValidation(t.inputEl);
					this.plugin.saveAndRefreshDebounced();
				});
			})
			.addText((t) => {
				t.setPlaceholder('Replacement')
					.setValue(rule.replacement)
					.onChange((v) => {
						rule.replacement = v;
						this.plugin.saveAndRefreshDebounced();
					});
				t.inputEl.addClass('ror-replacement-input');
			})
			.addText((t) => {
				t.setPlaceholder('CSS classes')
					.setValue(rule.cssClass)
					.onChange((v) => {
						rule.cssClass = v;
						this.plugin.saveAndRefreshDebounced();
					});
				t.inputEl.addClass('ror-class-input');
			})
			.addExtraButton((b) =>
				b
					.setIcon('arrow-up')
					.setTooltip('Move up')
					.setDisabled(index === 0)
					.onClick(async () => {
						if (index === 0) return;
						[rules[index - 1], rules[index]] = [rules[index]!, rules[index - 1]!];
						await this.plugin.saveAndRefresh();
						this.display();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('arrow-down')
					.setTooltip('Move down')
					.setDisabled(index === rules.length - 1)
					.onClick(async () => {
						if (index >= rules.length - 1) return;
						[rules[index + 1], rules[index]] = [rules[index]!, rules[index + 1]!];
						await this.plugin.saveAndRefresh();
						this.display();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('trash')
					.setTooltip('Delete rule')
					.onClick(async () => {
						rules.splice(index, 1);
						await this.plugin.saveAndRefresh();
						this.display();
					}),
			);
	}
}
