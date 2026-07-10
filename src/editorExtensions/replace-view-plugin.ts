import { EditorSelection, StateEffect } from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	MatchDecorator,
	PluginSpec,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { ReplaceMatchDecorator } from './replace-match-decorator';
import { syntaxTree } from '@codemirror/language';

class ReplacementWidget extends WidgetType {
	replacement: string;
	constructor(replacement: string) {
		super();
		this.replacement = replacement;
	}
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'ror-replacement';
		span.textContent = this.replacement;
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

class ReplaceOnRenderPlugin implements PluginValue {
	decorations: DecorationSet; // list of current decorators in view
	matchDecorator: MatchDecorator; // Creates and updates decorators
	rules: Array<{ match: string; replacement: string }>;

	constructor(view: EditorView, rules: Array<{ match: string; replacement: string }>) {
		this.rules = rules;

		const regexp = new RegExp(
			this.rules
				.filter((r) => r.match)
				.map((r) => `(${r.match})`)
				.join('|'),
			'g',
		);

		this.matchDecorator = new ReplaceMatchDecorator({
			regexp: regexp,
			decorate: (add, from, to, match, view): void => {
				// Define conditions where a decorator should not be added for a match
				if (this.isCodeblock(view, from, to)) return;
				if (this.selectionAndRangeOverlap(view.state.selection, from, to)) return;

				const matchedText = match[0] ?? view.state.doc.sliceString(from, to);
				let replacement = matchedText;
				for (const r of this.rules) {
					try {
						if (!r.match) continue;
						const rx = new RegExp(r.match);
						if (rx.test(matchedText)) {
							replacement = r.replacement ?? matchedText;
							break;
						}
					} catch (e) {
						// ignore invalid rule regex
					}
				}

				// Add a replacement widget that displays the replacement text in Live Preview
				add(from, to, Decoration.replace({ widget: new ReplacementWidget(replacement) }));
			},
		});

		// Initialize the DecoratorSet if not in source mode
		this.decorations = this.initializeDecorations(view);
	}

	/**
	 * isCodeblock returns true if the current current matches
	 * from and to position contains a code block
	 */
	private isCodeblock(view: EditorView, from: number, to: number): boolean {
		let isCodeblock = false;
		syntaxTree(view.state).iterate({
			from,
			to,
			enter: (node: any) => {
				if (/^inline-code/.test(node.name) || node.name == 'HyperMD-codeblock_HyperMD-codeblock-bg') {
					isCodeblock = true;
					return false; // short circuit child iteration
				}
				return undefined;
			},
		});
		return isCodeblock;
	}

	/**
	 * selectionAndRangeOverlap returns true if the specified range
	 * overlaps with the current cursor location or selection range
	 */
	private selectionAndRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number): boolean {
		for (const range of selection.ranges) {
			if (range.from <= rangeTo && range.to >= rangeFrom) {
				return true;
			}
		}
		return false;
	}

	update(update: ViewUpdate) {
		const isSourceMode = !update.state.field(editorLivePreviewField);
		// TODO: Make this a state field
		const isEditorLayoutChanged = update.transactions.some((t) =>
			t.effects.some((e) => e.is(workspaceLayoutChangeEffect)),
		);

		// Reinitialize Decorations if sourc mode or recetly switch back to Live Preview
		if (isSourceMode || isEditorLayoutChanged) {
			this.decorations = this.initializeDecorations(update.view);
			return;
		}

		// Update DecorationSet with MatchDecorator
		this.decorations = this.matchDecorator.updateDeco(update, this.decorations);
	}

	destroy() {}

	/**
	 * Initializes DecorationSet. Is disabled if the editor is in source mode.
	 */
	private initializeDecorations(view: EditorView): DecorationSet {
		return view.state.field(editorLivePreviewField) ? this.matchDecorator.createDeco(view) : Decoration.none;
	}
}

const pluginSpec: PluginSpec<ReplaceOnRenderPlugin> = {
	decorations: (instance: ReplaceOnRenderPlugin) => instance.decorations,
};

/**
 * replaceViewPlugin creates a ViewPlugin to be registers as an editorExtension
 */
export const replaceViewPlugin = (rules: Array<{ match: string; replacement: string }>) => {
	return ViewPlugin.define((view) => new ReplaceOnRenderPlugin(view, rules), pluginSpec);
};

/**
 * A state effect that represents the workspace's layout change.
 * Mainly intended to detect when the user switches between live preview and source mode.
 */
export const workspaceLayoutChangeEffect = StateEffect.define<null>();
