import { CompiledRule, MATCH_CLASS, findMatches, spanClasses } from './rules';

/**
 * Elements whose text is never touched in Reading view: code, math,
 * frontmatter, tags, raw HTML containers, and our own spans.
 */
const EXCLUDED_SELECTOR = [
	'code',
	'pre',
	'kbd',
	'samp',
	'script',
	'style',
	'textarea',
	'svg',
	'math',
	'.math',
	'mjx-container',
	'.frontmatter',
	'.frontmatter-container',
	'.metadata-container',
	'a.tag',
	`.${MATCH_CLASS}`,
].join(',');

/**
 * Wraps rule matches in text nodes under `root` with spans. When `replace` is
 * true the span shows the replacement; otherwise it keeps the original text.
 * (Comments are never rendered in Reading view, so there's no comment option.)
 */
export function processElement(root: HTMLElement, rules: CompiledRule[], replace: boolean): void {
	if (rules.length === 0) return;
	const doc = root.ownerDocument;
	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) => {
			const parent = node.parentElement;
			if (!parent || parent.closest(EXCLUDED_SELECTOR)) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	// Collect first: mutating while walking would confuse the walker.
	const nodes: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

	for (const node of nodes) processTextNode(node, rules, replace);
}

function processTextNode(node: Text, rules: CompiledRule[], replace: boolean): void {
	const text = node.data;
	const doc = node.ownerDocument;
	const fragment = createFragment();
	let last = 0;
	let changed = false;

	// Match line by line, so matching behaves the same as in the editor.
	let lineStart = 0;
	for (const line of text.split('\n')) {
		for (const m of findMatches(line, rules)) {
			const from = lineStart + m.from;
			const to = lineStart + m.to;
			if (from > last) fragment.appendChild(doc.createTextNode(text.slice(last, from)));
			fragment.appendChild(
				createSpan({
					cls: spanClasses(m, replace),
					text: replace ? m.text : m.source,
					attr: { 'data-ror-source': m.source },
				}),
			);
			last = to;
			changed = true;
		}
		lineStart += line.length + 1;
	}

	if (!changed) return;
	if (last < text.length) fragment.appendChild(doc.createTextNode(text.slice(last)));
	node.replaceWith(fragment);
}
