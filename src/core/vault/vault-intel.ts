import { App, TFolder, type CachedMetadata } from "obsidian";
import type { AIEngine } from "../ai/ai-engine";

// --- Data Types ---

export interface FolderInfo {
	path: string;
	noteCount: number;
	subfolderCount: number;
	commonTags: string[];
}

export interface TagInfo {
	tag: string;
	count: number;
	folders: string[];
}

export interface FrontmatterFieldInfo {
	key: string;
	count: number;
	types: string[];
}

export interface FolderPattern {
	pattern: "by-project" | "by-date" | "by-type" | "flat";
	confidence: number;
	description: string;
}

export interface VaultIntelData {
	folders: FolderInfo[];
	tags: TagInfo[];
	frontmatterFields: FrontmatterFieldInfo[];
	folderPatterns: FolderPattern[];
	totalNotes: number;
	lastScanTime: number;
}

// --- Main Class ---

export class VaultIntel {
	private data: VaultIntelData | null = null;
	private dirty = true;

	constructor(
		private app: App,
		private aiEngine: AIEngine,
	) {}

	invalidate(): void {
		this.dirty = true;
	}

	async ensureFresh(): Promise<VaultIntelData> {
		if (!this.data || this.dirty) {
			this.data = this.scan();
			this.dirty = false;
		}
		return this.data;
	}

	getData(): VaultIntelData | null {
		return this.data;
	}

	// --- Scanning (P1-11 through P1-14) ---

	private scan(): VaultIntelData {
		const files = this.app.vault.getMarkdownFiles();

		const folderMap = new Map<
			string,
			{
				noteCount: number;
				subfolderCount: number;
				tags: Map<string, number>;
			}
		>();
		const tagMap = new Map<
			string,
			{ count: number; folders: Set<string> }
		>();
		const fmFieldMap = new Map<
			string,
			{ count: number; types: Set<string> }
		>();

		for (const abstractFile of this.app.vault.getAllLoadedFiles()) {
			if (abstractFile instanceof TFolder) {
				const parentPath = abstractFile.parent?.path ?? "/";
				ensureFolder(folderMap, parentPath).subfolderCount++;
				ensureFolder(folderMap, abstractFile.path);
			}
		}

		for (const file of files) {
			const folderPath = file.parent?.path ?? "/";
			ensureFolder(folderMap, folderPath).noteCount++;

			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

			const fileTags = extractTags(cache);
			const folderData = ensureFolder(folderMap, folderPath);

			for (const tag of fileTags) {
				folderData.tags.set(
					tag,
					(folderData.tags.get(tag) ?? 0) + 1,
				);

				let tagData = tagMap.get(tag);
				if (!tagData) {
					tagData = { count: 0, folders: new Set() };
					tagMap.set(tag, tagData);
				}
				tagData.count++;
				tagData.folders.add(folderPath);
			}

			if (cache.frontmatter) {
				for (const [key, value] of Object.entries(
					cache.frontmatter,
				)) {
					if (key === "position") continue;
					let field = fmFieldMap.get(key);
					if (!field) {
						field = { count: 0, types: new Set() };
						fmFieldMap.set(key, field);
					}
					field.count++;
					field.types.add(detectValueType(value));
				}
			}
		}

		const folders: FolderInfo[] = [...folderMap.entries()].map(
			([path, data]) => ({
				path,
				noteCount: data.noteCount,
				subfolderCount: data.subfolderCount,
				commonTags: [...data.tags.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5)
					.map(([tag]) => tag),
			}),
		);
		folders.sort((a, b) => b.noteCount - a.noteCount);

		const tags: TagInfo[] = [...tagMap.entries()]
			.map(([tag, data]) => ({
				tag,
				count: data.count,
				folders: [...data.folders],
			}))
			.sort((a, b) => b.count - a.count);

		const frontmatterFields: FrontmatterFieldInfo[] = [
			...fmFieldMap.entries(),
		]
			.map(([key, data]) => ({
				key,
				count: data.count,
				types: [...data.types],
			}))
			.sort((a, b) => b.count - a.count);

		const folderPatterns = detectFolderPatterns(folders);

		return {
			folders,
			tags,
			frontmatterFields,
			folderPatterns,
			totalNotes: files.length,
			lastScanTime: Date.now(),
		};
	}

	// --- AI-Powered Suggestions (P1-16, P1-17) ---

	async suggestFolder(content: string): Promise<string> {
		const data = await this.ensureFresh();
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			return heuristicFolderSuggestion(data, content);
		}

		const folderList = data.folders
			.filter((f) => f.path !== "/" && f.noteCount > 0)
			.slice(0, 20)
			.map(
				(f) =>
					`${f.path} (${f.noteCount} notes${f.commonTags.length ? ", tags: " + f.commonTags.join(", ") : ""})`,
			)
			.join("\n");

		const prompt = [
			"Given this vault folder structure:",
			folderList,
			"",
			"Suggest the single best folder for this content:",
			'"""',
			content.slice(0, 500),
			'"""',
			"",
			"Respond with ONLY the folder path. If no folder fits, suggest a new name.",
		].join("\n");

		const response = await this.aiEngine.chatComplete(
			[{ role: "user", content: prompt, timestamp: Date.now() }],
			{ temperature: 0.3, maxTokens: 50 },
		);

		return response.trim().replace(/^["']|["']$/g, "");
	}

	async suggestTags(content: string): Promise<string[]> {
		const data = await this.ensureFresh();
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			return heuristicTagSuggestion(data, content);
		}

		const tagList = data.tags
			.slice(0, 30)
			.map((t) => `${t.tag} (${t.count})`)
			.join(", ");

		const prompt = [
			`Existing vault tags: ${tagList}`,
			"",
			"Suggest 1-5 tags for this content (prefer existing tags):",
			'"""',
			content.slice(0, 500),
			'"""',
			"",
			"Respond with ONLY comma-separated tags, no # prefix.",
		].join("\n");

		const response = await this.aiEngine.chatComplete(
			[{ role: "user", content: prompt, timestamp: Date.now() }],
			{ temperature: 0.3, maxTokens: 50 },
		);

		return response
			.split(",")
			.map((t) => t.trim().replace(/^#/, ""))
			.filter((t) => t.length > 0);
	}
}

// --- Helpers ---

function ensureFolder(
	map: Map<
		string,
		{
			noteCount: number;
			subfolderCount: number;
			tags: Map<string, number>;
		}
	>,
	path: string,
) {
	let entry = map.get(path);
	if (!entry) {
		entry = { noteCount: 0, subfolderCount: 0, tags: new Map() };
		map.set(path, entry);
	}
	return entry;
}

function extractTags(cache: CachedMetadata): string[] {
	const tags: string[] = [];

	if (cache.tags) {
		for (const t of cache.tags) {
			tags.push(t.tag.replace(/^#/, ""));
		}
	}

	const fmTags = cache.frontmatter?.tags;
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) {
			if (typeof t === "string") tags.push(t.replace(/^#/, ""));
		}
	} else if (typeof fmTags === "string") {
		tags.push(fmTags.replace(/^#/, ""));
	}

	return [...new Set(tags)];
}

function detectValueType(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number") return "number";
	if (Array.isArray(value)) return "array";
	if (typeof value === "string") {
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
		return "string";
	}
	return "object";
}

const DATE_NAME_PATTERNS = [
	/^\d{4}$/,
	/^\d{4}[-/]\d{2}$/,
	/^\d{4}[-/]\d{2}[-/]\d{2}$/,
	/^(January|February|March|April|May|June|July|August|September|October|November|December)/i,
	/^\d{4}[-/]W\d{1,2}$/i,
];

const TYPE_KEYWORDS = [
	"templates",
	"template",
	"inbox",
	"archive",
	"archives",
	"meeting",
	"meetings",
	"notes",
	"drafts",
	"journal",
	"daily",
	"weekly",
	"monthly",
	"resources",
	"reference",
	"projects",
	"tasks",
	"attachments",
	"images",
	"media",
];

function isDateNamed(path: string): boolean {
	const name = path.split("/").pop() ?? "";
	return DATE_NAME_PATTERNS.some((p) => p.test(name));
}

function isTypeNamed(path: string): boolean {
	const name = (path.split("/").pop() ?? "").toLowerCase();
	return TYPE_KEYWORDS.some((k) => name.includes(k));
}

function detectFolderPatterns(folders: FolderInfo[]): FolderPattern[] {
	const nonRoot = folders.filter((f) => f.path !== "/");
	if (nonRoot.length === 0) {
		return [
			{ pattern: "flat", confidence: 1, description: "No folders" },
		];
	}

	const patterns: FolderPattern[] = [];
	const dateCount = nonRoot.filter((f) => isDateNamed(f.path)).length;
	const typeCount = nonRoot.filter((f) => isTypeNamed(f.path)).length;

	if (dateCount > nonRoot.length * 0.3) {
		patterns.push({
			pattern: "by-date",
			confidence: dateCount / nonRoot.length,
			description: `${dateCount} date-named folders`,
		});
	}

	if (typeCount > nonRoot.length * 0.3) {
		patterns.push({
			pattern: "by-type",
			confidence: typeCount / nonRoot.length,
			description: `${typeCount} category-named folders`,
		});
	}

	const projectFolders = nonRoot.filter(
		(f) =>
			f.noteCount >= 3 &&
			!isDateNamed(f.path) &&
			!isTypeNamed(f.path),
	);
	if (projectFolders.length > 0) {
		patterns.push({
			pattern: "by-project",
			confidence: Math.min(
				projectFolders.length / nonRoot.length + 0.3,
				1,
			),
			description: `${projectFolders.length} project-like folders`,
		});
	}

	if (patterns.length === 0) {
		patterns.push({
			pattern: "flat",
			confidence: 0.8,
			description: "Minimal folder organization",
		});
	}

	return patterns.sort((a, b) => b.confidence - a.confidence);
}

function heuristicFolderSuggestion(
	data: VaultIntelData,
	content: string,
): string {
	const contentLower = content.toLowerCase();
	let bestFolder = data.folders[0]?.path ?? "/";
	let bestScore = 0;

	for (const folder of data.folders) {
		if (folder.path === "/") continue;
		let score = 0;

		const folderName = folder.path.split("/").pop() ?? "";
		if (contentLower.includes(folderName.toLowerCase())) {
			score += 3;
		}

		for (const tag of folder.commonTags) {
			if (contentLower.includes(tag.toLowerCase())) {
				score += 1;
			}
		}

		if (score > bestScore) {
			bestScore = score;
			bestFolder = folder.path;
		}
	}

	return bestFolder;
}

function heuristicTagSuggestion(
	data: VaultIntelData,
	content: string,
): string[] {
	const contentLower = content.toLowerCase();
	const suggestions: string[] = [];

	for (const tagInfo of data.tags) {
		if (suggestions.length >= 5) break;
		if (contentLower.includes(tagInfo.tag.toLowerCase())) {
			suggestions.push(tagInfo.tag);
		}
	}

	return suggestions;
}
