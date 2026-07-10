import { App, PluginSettingTab, Setting } from 'obsidian';
import ReplaceOnRenderPlugin from './main';

export class SettingsTab extends PluginSettingTab {
	plugin: ReplaceOnRenderPlugin;

	constructor(app: App, plugin: ReplaceOnRenderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private arrayMove<T>(arr: T[], fromIndex: number, toIndex: number): void {
		if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) {
			return;
		}
		const element = arr[fromIndex]!;
		arr[fromIndex] = arr[toIndex]!;
		arr[toIndex] = element;
	}

	private addRuleSettings() {
		new Setting(this.containerEl)
			.setName('Enable replacements')
			.setDesc('Turn the replacement rules on or off.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.enable).onChange(async (value) => {
					this.plugin.settings.enable = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl).setHeading().setName('Replacement rules');

		this.plugin.settings.rules.forEach((rule, index) => {
			new Setting(this.containerEl)
				.addText((text) => {
					text.setPlaceholder('Pattern').setValue(rule.match).onChange((newMatch) => {
						const currentRule = this.plugin.settings.rules[index];
						if (!currentRule) {
							return;
						}
						currentRule.match = newMatch;
						void this.plugin.saveSettings();
					});
				})
				.addText((text) => {
					text.setPlaceholder('Replacement').setValue(rule.replacement).onChange((newReplacement) => {
						const currentRule = this.plugin.settings.rules[index];
						if (!currentRule) {
							return;
						}
						currentRule.replacement = newReplacement;
						void this.plugin.saveSettings();
					});
				})
				.addExtraButton((button) => {
					button
						.setIcon('up-chevron-glyph')
						.setTooltip('Move up')
						.onClick(() => {
							this.arrayMove(this.plugin.settings.rules, index, index - 1);
							void this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon('down-chevron-glyph')
						.setTooltip('Move down')
						.onClick(() => {
							this.arrayMove(this.plugin.settings.rules, index, index + 1);
							void this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon('cross')
						.setTooltip('Delete')
						.onClick(() => {
							this.plugin.settings.rules.splice(index, 1);
							void this.plugin.saveSettings();
							this.display();
						});
				});
		});

		new Setting(this.containerEl).addButton((button) => {
			button
				.setButtonText('Add replacement rule')
				.setCta()
				.onClick(() => {
					this.plugin.settings.rules.push({ match: '', replacement: '' });
					void this.plugin.saveSettings();
					this.display();
				});
		});
	}

	async display() {
		const { containerEl } = this;
		containerEl.empty();
		this.addRuleSettings();
	}
}
