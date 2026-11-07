import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Prec, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { CompiledRule, Match, findMatches, spanClasses } from './rules';

/**
 * Obsidian's editor uses a stream parser, so syntax nodes are flat tokens named
 * by their CSS classes joined with "_" (e.g. "formatting_formatting-code_inline-code").
 * A token is excluded when any of its classes matches this predicate.
 */
function isExcludedClass(cls: string): boolean {
	return (
		cls.includes('code') || // inline code, fenced/indented code blocks
		cls.includes('math') ||
		cls.includes('frontmatter') ||
		cls === 'url' ||
		cls === 'string' || // link URLs and titles, HTML attribute values
		cls === 'link-has-alias' || // the target half of [[target|alias]]
		cls.includes('barelink') ||
		cls === 'hr' ||
		cls.includes('table-sep') ||
		cls === 'hashtag' ||
		cls === 'tag' || // HTML tags
		cls === 'attribute' ||
		cls.includes('escape')
	);
}

export interface EditorOptions {
	/** Show replacements in Live Preview (otherwise only wrap matches). */
	replace: boolean;
	excludeComments: boolean;
}

/** 'comment' tokens are excluded or not depending on settings. */
type TokenKind = 'text' | 'excluded' | 'comment';

const kindCache = new Map<string, TokenKind>();
function tokenKind(name: string): TokenKind {
	let kind = kindCache.get(name);
	if (kind === undefined) {
		const classes = name.split('_');
		// Markup characters (**, [[, ```, %%, list markers, ...) are never substituted.
		// Frontmatter is checked first so YAML comments inside it stay excluded.
		if (classes.some((c) => c.startsWith('formatting') || c.includes('frontmatter'))) kind = 'excluded';
		else if (classes.includes('comment')) kind = 'comment';
		else kind = classes.some(isExcludedClass) ? 'excluded' : 'text';
		kindCache.set(name, kind);
	}
	return kind;
}

/** Narrows a comment token to exclude its delimiters (<!-- --> or %%). */
function trimCommentDelimiters(text: string, start: number, end: number): [number, number] {
	for (const open of ['<!--', '%%']) {
		if (text.startsWith(open)) {
			start += open.length;
			break;
		}
	}
	for (const close of ['-->', '%%']) {
		if (text.endsWith(close) && end - close.length >= start) {
			end -= close.length;
			break;
		}
	}
	return [start, end];
}

class ReplacementWidget extends WidgetType {
	constructor(
		readonly text: string,
		readonly source: string,
		readonly className: string,
	) {
		super();
	}

	eq(other: ReplacementWidget): boolean {
		return other.text === this.text && other.source === this.source && other.className === this.className;
	}

	toDOM(): HTMLElement {
		return createSpan({ cls: this.className, text: this.text, attr: { 'data-ror-source': this.source } });
	}

	ignoreEvent(): boolean {
		// Let the editor handle clicks so the cursor lands here and reveals the source.
		return false;
	}
}

/** Splits [from, to) into the text segments not covered by excluded tokens, breaking at token boundaries. */
function eligibleSegments(state: EditorState, from: number, to: number, opts: EditorOptions): [number, number][] {
	const segments: [number, number][] = [];
	let pos = from;
	syntaxTree(state).iterate({
		from,
		to,
		enter: (node) => {
			if (node.type.isTop) return;
			const start = Math.max(node.from, from);
			const end = Math.min(node.to, to);
			if (start > pos) segments.push([pos, start]); // untokenized gap = plain text
			if (end > start) {
				const kind = tokenKind(node.name);
				if (kind === 'text') {
					segments.push([start, end]);
				} else if (kind === 'comment' && !opts.excludeComments) {
					const [s, e] = trimCommentDelimiters(state.doc.sliceString(start, end), start, end);
					if (e > s) segments.push([s, e]);
				}
			}
			pos = Math.max(pos, end);
			return false;
		},
	});
	if (pos < to) segments.push([pos, to]);
	return segments;
}

function touchesSelection(state: EditorState, from: number, to: number): boolean {
	return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

function buildDecorations(view: EditorView, rules: CompiledRule[], opts: EditorOptions): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const state = view.state;
	const livePreview = state.field(editorLivePreviewField, false) ?? false;
	const doc = state.doc;

	for (const { from, to } of view.visibleRanges) {
		let line = doc.lineAt(from);
		for (;;) {
			const lineFrom = Math.max(line.from, from);
			const lineTo = Math.min(line.to, to);
			for (const [segFrom, segTo] of eligibleSegments(state, lineFrom, lineTo, opts)) {
				const text = doc.sliceString(segFrom, segTo);
				for (const m of findMatches(text, rules)) {
					addMatch(builder, state, m, segFrom, livePreview && opts.replace);
				}
			}
			if (line.to >= to || line.number >= doc.lines) break;
			line = doc.line(line.number + 1);
		}
	}
	return builder.finish();
}

function addMatch(
	builder: RangeSetBuilder<Decoration>,
	state: EditorState,
	m: Match,
	offset: number,
	replace: boolean,
): void {
	const from = offset + m.from;
	const to = offset + m.to;
	if (replace && !touchesSelection(state, from, to)) {
		const widget = new ReplacementWidget(m.text, m.source, spanClasses(m, true).join(' '));
		builder.add(from, to, Decoration.replace({ widget }));
	} else {
		builder.add(
			from,
			to,
			Decoration.mark({
				class: spanClasses(m, false).join(' '),
				attributes: { 'data-ror-source': m.source },
			}),
		);
	}
}

/**
 * Editor extension: in Live Preview, replaces matches with spans showing the
 * replacement (revealing the source when the selection touches them). In
 * Source mode, or when Live Preview substitution is off, matches are wrapped
 * in spans that keep the original text.
 */
export function substitutionExtension(rules: CompiledRule[], opts: EditorOptions): Extension {
	// CodeMirror only wraps a replacement widget in mark decorations from
	// sources with lower precedence than the widget's own. Obsidian's syntax
	// highlighting and link marks (underline, click target, unresolved fading)
	// sit above the default precedence, so without Prec.highest they'd skip our
	// widgets, losing the link styling and click-to-follow.
	return Prec.highest(ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, rules, opts);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					syntaxTree(update.startState) !== syntaxTree(update.state) ||
					update.startState.field(editorLivePreviewField, false) !==
						update.state.field(editorLivePreviewField, false)
				) {
					this.decorations = buildDecorations(update.view, rules, opts);
				}
			}
		},
		{ decorations: (v) => v.decorations },
	));
}
