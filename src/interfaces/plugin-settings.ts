export interface ReplacementRule {
	match: string;
	replacement: string;
}

export interface PluginSettings {
	rules: ReplacementRule[];
	enable: boolean;
}
