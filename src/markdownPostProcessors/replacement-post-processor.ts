import { MarkdownPostProcessor } from 'obsidian';
import { PluginSettings } from '../interfaces/plugin-settings';

export class ReplacementPostProcessor {
	private readonly ELEMENTS_TO_PROCESS = 'p, li';

	constructor(private readonly settings: PluginSettings) {}

	private replaceTextInElement(element: HTMLElement): void {
		if (!this.settings.enable) {
			return;
		}

		const elements = element.querySelectorAll(this.ELEMENTS_TO_PROCESS);
		elements.forEach((candidate) => {
			const textNodes = Array.from(candidate.childNodes).filter(
				(child): child is Text => child.nodeType === Node.TEXT_NODE,
			);

			textNodes.forEach((textNode) => {
				const originalText = textNode.textContent ?? '';
				let updatedText = originalText;

				this.settings.rules.forEach((rule) => {
					if (!rule.match) {
						return;
					}

					const regex = new RegExp(rule.match, 'g');
					updatedText = updatedText.replace(regex, rule.replacement);
				});

				if (updatedText !== originalText) {
					textNode.textContent = updatedText;
				}
			});
		});
	}

	process: MarkdownPostProcessor = (htmlElement: HTMLElement): void => {
		this.replaceTextInElement(htmlElement);
	};
}
