import { App, PluginSettingTab, Setting, SettingDefinitionItem, requireApiVersion } from 'obsidian';
import { ConfirmModal } from './confirm-modal';
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
const BOOLEAN_KEYS: readonly BooleanKey[] = ['readingView', 'livePreview', 'excludeComments'];

function isBooleanKey(key: string): key is BooleanKey {
	return (BOOLEAN_KEYS as readonly string[]).includes(key);
}

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

/** Name, description and key of each toggle, shared by both settings UIs. */
const TOGGLES: { key: BooleanKey; name: string; desc: string }[] = [
	{
		key: 'readingView',
		name: 'Enable in Reading view',
		desc: 'Show replacements in Reading view. When off, matches are still wrapped in spans but keep their original text.',
	},
	{
		key: 'livePreview',
		name: 'Enable in Live Preview',
		desc: 'Show replacements in Live Preview. Editing a match shows its original text. When off, matches are still wrapped in spans but keep their original text.',
	},
];

const SKIP_COMMENTS = {
	key: 'excludeComments' as const,
	name: 'Skip comments',
	desc: 'Leave %% Obsidian %% and <!-- HTML --> comments untouched. Comments are hidden in Reading view, so this only affects the editor.',
};

function rulesHelp(): DocumentFragment {
	return createFragment((f) => {
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
	});
}

/**
 * Obsidian 1.13+ renders this tab from getSettingDefinitions(), which makes
 * the settings searchable and gives the rule list drag-to-reorder. Older
 * versions call display(), which renders the same settings imperatively.
 */
export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ReplaceOnRenderPlugin,
	) {
		super(app, plugin);
	}

	// ---- Obsidian 1.13+ (declarative) ----

	getSettingDefinitions(): SettingDefinitionItem[] {
		const rules = this.plugin.settings.rules;
		return [
			...TOGGLES.map((t) => ({ name: t.name, desc: t.desc, control: { type: 'toggle' as const, key: t.key } })),
			{
				type: 'group',
				heading: 'Exclusions',
				items: [
					{
						name: SKIP_COMMENTS.name,
						desc: SKIP_COMMENTS.desc,
						control: { type: 'toggle', key: SKIP_COMMENTS.key },
					},
				],
			},
			{
				type: 'group',
				heading: 'Rules',
				items: [
					{ name: 'How rules work', desc: rulesHelp() },
					{
						name: 'Restore default rules',
						desc: 'Replace all rules with the defaults.',
						action: () => this.confirmRestoreDefaults(),
					},
				],
			},
			{
				type: 'list',
				cls: 'ror-rule-list',
				emptyState: 'No rules. Add one with the + button.',
				addItem: { name: 'Add rule', action: () => void this.addRule() },
				onReorder: (from, to) => void this.moveRule(from, to),
				onDelete: (index) => void this.deleteRule(index),
				items: rules.map((rule, index) => ({
					name: `Rule ${index + 1}`,
					aliases: [rule.pattern, rule.replacement, rule.cssClass].filter((s) => s !== ''),
					render: (setting: Setting) => this.addRuleControls(setting, rule),
				})),
			},
		];
	}

	getControlValue(key: string): unknown {
		return isBooleanKey(key) ? this.plugin.settings[key] : undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!isBooleanKey(key) || typeof value !== 'boolean') return;
		this.plugin.settings[key] = value;
		await this.plugin.saveAndRefresh();
	}

	// ---- Obsidian < 1.13 (imperative fallback) ----

	display(): void {
		this.renderLegacy();
	}

	private renderLegacy(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		for (const t of [...TOGGLES, SKIP_COMMENTS]) {
			if (t === SKIP_COMMENTS) new Setting(containerEl).setName('Exclusions').setHeading();
			new Setting(containerEl)
				.setName(t.name)
				.setDesc(t.desc)
				.addToggle((toggle) =>
					toggle.setValue(settings[t.key]).onChange(async (v) => {
						settings[t.key] = v;
						await this.plugin.saveAndRefresh();
					}),
				);
		}

		new Setting(containerEl).setName('Rules').setHeading().setDesc(rulesHelp());

		settings.rules.forEach((rule, index) => {
			const setting = new Setting(containerEl);
			this.addRuleControls(setting, rule);
			setting
				.addExtraButton((b) =>
					b
						.setIcon('arrow-up')
						.setTooltip('Move up')
						.setDisabled(index === 0)
						.onClick(() => void this.moveRule(index, index - 1)),
				)
				.addExtraButton((b) =>
					b
						.setIcon('arrow-down')
						.setTooltip('Move down')
						.setDisabled(index === settings.rules.length - 1)
						.onClick(() => void this.moveRule(index, index + 1)),
				)
				.addExtraButton((b) =>
					b
						.setIcon('trash')
						.setTooltip('Delete rule')
						.onClick(() => void this.deleteRule(index)),
				);
		});

		new Setting(containerEl)
			.addButton((b) =>
				b
					.setButtonText('Add rule')
					.setCta()
					.onClick(() => void this.addRule()),
			)
			.addButton((b) => b.setButtonText('Restore default rules').onClick(() => this.confirmRestoreDefaults()));
	}

	// ---- Shared ----

	/** Re-renders after rules are added, removed or reordered. */
	private rerender(): void {
		if (requireApiVersion('1.13.0')) this.update();
		else this.renderLegacy();
	}

	private async addRule(): Promise<void> {
		this.plugin.settings.rules.push({ pattern: '', replacement: '', enabled: true, cssClass: '' });
		await this.plugin.saveAndRefresh();
		this.rerender();
	}

	private async deleteRule(index: number): Promise<void> {
		this.plugin.settings.rules.splice(index, 1);
		await this.plugin.saveAndRefresh();
		this.rerender();
	}

	private async moveRule(from: number, to: number): Promise<void> {
		const rules = this.plugin.settings.rules;
		if (from < 0 || from >= rules.length || to < 0 || to >= rules.length || from === to) return;
		const [rule] = rules.splice(from, 1);
		rules.splice(to, 0, rule!);
		await this.plugin.saveAndRefresh();
		this.rerender();
	}

	private confirmRestoreDefaults(): void {
		new ConfirmModal(
			this.app,
			'Restore default rules',
			'Replace all rules with the defaults? Your current rules will be lost.',
			'Restore defaults',
			async () => {
				this.plugin.settings.rules = cloneRules(DEFAULT_RULES);
				await this.plugin.saveAndRefresh();
				this.rerender();
			},
		).open();
	}

	/** Adds the enable toggle, pattern, replacement and class inputs for one rule. */
	private addRuleControls(setting: Setting, rule: Rule): void {
		setting.setClass('ror-rule-setting');
		const errorEl = setting.descEl.createDiv({ cls: 'ror-rule-error' });

		const showValidation = (input: HTMLInputElement) => {
			const error = rule.pattern === '' ? null : validatePattern(rule.pattern);
			errorEl.setText(error ? `Invalid pattern: ${error}` : '');
			input.toggleClass('ror-invalid', error !== null);
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
			});
	}
}
