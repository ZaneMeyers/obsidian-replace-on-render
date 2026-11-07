/** A user-defined substitution rule, as stored in settings. */
export interface Rule {
	/** JavaScript regular expression source (no delimiters or flags). */
	pattern: string;
	/** Replacement text. Supports $1, $<name>, $&, $` , $' and $$. */
	replacement: string;
	enabled: boolean;
	/** Extra CSS class(es), space-separated, added to this rule's spans. */
	cssClass: string;
}

/** A rule whose pattern has been compiled successfully. */
export interface CompiledRule {
	index: number;
	regex: RegExp;
	replacement: string;
	classes: string[];
}

export interface Match {
	from: number;
	to: number;
	source: string;
	text: string;
	rule: CompiledRule;
}

/** Class added to every span the plugin creates. */
export const MATCH_CLASS = 'ror-match';
/** Added when the span shows the replacement text. */
export const REPLACED_CLASS = 'ror-replaced';
/** Added when the span shows the original source text. */
export const RAW_CLASS = 'ror-raw';

// Order matters: at the same position, the earlier rule wins, so --- beats --.
export const DEFAULT_RULES: Rule[] = [
	{ pattern: '---', replacement: '—', enabled: true, cssClass: 'ror-em-dash' },
	{ pattern: '--', replacement: '–', enabled: true, cssClass: 'ror-en-dash' },
];

/** Returns an error message if the pattern is invalid or can match the empty string. */
export function validatePattern(pattern: string): string | null {
	if (pattern === '') return 'Pattern is empty.';
	let regex: RegExp;
	try {
		regex = new RegExp(pattern, 'g');
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
	if (regex.test('')) return 'Pattern matches the empty string.';
	return null;
}

export function compileRules(rules: Rule[]): CompiledRule[] {
	const compiled: CompiledRule[] = [];
	rules.forEach((rule, index) => {
		if (!rule.enabled || validatePattern(rule.pattern) !== null) return;
		compiled.push({
			index,
			regex: new RegExp(rule.pattern, 'g'),
			replacement: rule.replacement,
			classes: rule.cssClass.split(/\s+/).filter((c) => c !== ''),
		});
	});
	return compiled;
}

/** Expands $-references in a replacement template, like String.prototype.replace. */
export function expandReplacement(template: string, m: RegExpExecArray): string {
	if (!template.includes('$')) return template;
	const input = m.input;
	const start = m.index;
	const end = start + m[0].length;
	return template.replace(/\$(\$|&|`|'|\d{1,2}|<([^>]*)>)/g, (whole, token: string, name?: string) => {
		if (token === '$') return '$';
		if (token === '&') return m[0];
		if (token === '`') return input.slice(0, start);
		if (token === "'") return input.slice(end);
		if (name !== undefined) {
			if (!m.groups) return whole;
			return m.groups[name] ?? '';
		}
		// Prefer a two-digit group reference if it exists, else fall back to one digit.
		const two = parseInt(token, 10);
		if (token.length === 2 && two >= 1 && two < m.length) return m[two] ?? '';
		const one = parseInt(token[0]!, 10);
		if (one >= 1 && one < m.length) return (m[one] ?? '') + token.slice(1);
		return whole;
	});
}

/**
 * Finds non-overlapping matches of all rules in `text`. Scanning left to right,
 * the earliest match wins; when several rules match at the same position, the
 * one listed first in settings wins.
 */
export function findMatches(text: string, rules: CompiledRule[]): Match[] {
	const matches: Match[] = [];
	if (rules.length === 0 || text === '') return matches;

	// Next pending match per rule (null = no more matches).
	const pending: (RegExpExecArray | null)[] = rules.map(() => null);
	const exhausted: boolean[] = rules.map(() => false);
	let pos = 0;

	const nextFor = (i: number): RegExpExecArray | null => {
		const current = pending[i];
		if (current && current.index >= pos) return current;
		if (exhausted[i]) return null;
		const regex = rules[i]!.regex;
		regex.lastIndex = pos;
		let m: RegExpExecArray | null;
		while ((m = regex.exec(text)) !== null && m[0].length === 0) {
			regex.lastIndex = m.index + 1; // never happens for validated rules; defensive
		}
		pending[i] = m;
		if (!m) exhausted[i] = true;
		return m;
	};

	while (pos < text.length) {
		let best: RegExpExecArray | null = null;
		let bestRule = -1;
		for (let i = 0; i < rules.length; i++) {
			const m = nextFor(i);
			if (m && (best === null || m.index < best.index)) {
				best = m;
				bestRule = i;
			}
		}
		if (!best) break;
		const rule = rules[bestRule]!;
		const from = best.index;
		const to = from + best[0].length;
		matches.push({ from, to, source: best[0], text: expandReplacement(rule.replacement, best), rule });
		pos = to;
	}
	return matches;
}

export function spanClasses(match: Match, replaced: boolean): string[] {
	return [MATCH_CLASS, replaced ? REPLACED_CLASS : RAW_CLASS, ...match.rule.classes];
}
