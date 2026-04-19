import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	MarkdownView,
	Notice,
	WorkspaceLeaf,
	ItemView,
} from "obsidian";

const VIEW_TYPE_KARMA_NOTES = "karma-notes-view";

interface NoteKarma {
	score: number;
	lastVoteDate: string; // ISO date string (YYYY-MM-DD)
	lastOpenedDate: string; // ISO date string (YYYY-MM-DD)
	createdDate: string;
	dailyBaseScore: number; // Score at the start of the day
	dailyBaseDate: string; // Date when dailyBaseScore was set
}

interface KarmaData {
	notes: Record<string, NoteKarma>;
}

interface KarmaPluginSettings {
	showScoreInStatusBar: boolean;
	notesFolder: string;
	filterProperties: string[];
}

const DEFAULT_SETTINGS: KarmaPluginSettings = {
	showScoreInStatusBar: true,
	notesFolder: "unique_content",
	filterProperties: ["tags", "class", "view"],
};

const DEFAULT_KARMA: NoteKarma = {
	score: 2,
	lastVoteDate: "",
	lastOpenedDate: new Date().toISOString().split("T")[0],
	createdDate: new Date().toISOString().split("T")[0],
	dailyBaseScore: 2,
	dailyBaseDate: new Date().toISOString().split("T")[0],
};

// ─── Karma Notes View (Sidebar) ────────────────────────────────────────────────

interface NoteInfo {
	file: TFile;
	path: string;
	name: string;
	score: number;
	dailyBaseScore: number;
	lastVoteDate: string;
	lastOpenedDate: string;
	hasFrontmatter: boolean;
	frontmatter: Record<string, unknown> | null;
}

class KarmaNotesView extends ItemView {
	plugin: KarmaPlugin;
	private currentSort: string = "karma-desc";
	private currentKarmaFilter: string = "all";
	private selectedFilters: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: KarmaPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_KARMA_NOTES;
	}

	getDisplayText(): string {
		return "Karma Notes";
	}

	getIcon(): string {
		return "trophy";
	}

	async onOpen(): Promise<void> {
		this.containerEl.addClass("karma-notes-view");
		await this.render();
	}

	async onClose(): Promise<void> {
		return Promise.resolve();
	}

	getAllNotes(): NoteInfo[] {
		const folder = this.plugin.settings.notesFolder;
		const notes: NoteInfo[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file.path.startsWith(folder)) {
				const karma = this.plugin.getNoteKarma(file.path);
				this.plugin.ensureDailyBase(karma);
				const cache = this.app.metadataCache.getFileCache(file);
				let hasFrontmatter = false;
				let frontmatter: Record<string, unknown> | null = null;

				if (cache && cache.frontmatter) {
					hasFrontmatter = true;
					frontmatter = cache.frontmatter;
				}

				notes.push({
					file,
					path: file.path,
					name: file.basename,
					score: karma.score,
					dailyBaseScore: karma.dailyBaseScore,
					lastVoteDate: karma.lastVoteDate,
					lastOpenedDate: karma.lastOpenedDate,
					hasFrontmatter,
					frontmatter,
				});
			}
		}
		return notes;
	}

	filterByKarmaRange(notes: NoteInfo[]): NoteInfo[] {
		if (this.currentKarmaFilter === "all") return notes;

		switch (this.currentKarmaFilter) {
			case "high":
				return notes.filter((n) => n.score > 5);
			case "medium":
				return notes.filter((n) => n.score >= 2 && n.score <= 5);
			case "low":
				return notes.filter((n) => n.score >= 0 && n.score < 2);
			case "negative":
				return notes.filter((n) => n.score < 0);
			default:
				return notes;
		}
	}

	filterByProperties(notes: NoteInfo[]): NoteInfo[] {
		if (this.selectedFilters.size === 0) return notes;

		return notes.filter((note) => {
			if (!note.hasFrontmatter) return false;

			for (const filter of this.selectedFilters) {
				const [prop, val] = filter.split(":");
				const propValue = note.frontmatter?.[prop];
				if (!propValue) return false;

				if (Array.isArray(propValue)) {
					if (!propValue.includes(val)) return false;
				} else if (propValue !== val) {
					return false;
				}
			}
			return true;
		});
	}

	sortNotes(notes: NoteInfo[]): NoteInfo[] {
		switch (this.currentSort) {
			case "karma-desc":
				return notes.sort((a, b) => b.score - a.score);
			case "karma-asc":
				return notes.sort((a, b) => a.score - b.score);
			case "alpha":
				return notes.sort((a, b) => a.name.localeCompare(b.name));
			case "date":
				return notes.sort(
					(a, b) =>
						new Date(b.lastOpenedDate || 0).getTime() -
						new Date(a.lastOpenedDate || 0).getTime()
				);
			default:
				return notes;
		}
	}

	getScoreIcon(score: number): string {
		if (score >= 5) return "🔥";
		if (score >= 0) return "⭐";
		return "❄️";
	}

	async render(): Promise<void> {
		this.contentEl.empty();

		const allNotes = this.getAllNotes();
		const filteredByKarma = this.filterByKarmaRange(allNotes);
		const filteredByProps = this.filterByProperties(filteredByKarma);
		const sortedNotes = this.sortNotes([...filteredByProps]);

		// Header
		const header = document.createElement("div");
		header.addClass("karma-notes-header");

		const title = document.createElement("h3");
		title.textContent = "Karma Notes";
		header.appendChild(title);

		// Sort control
		const controls = document.createElement("div");
		controls.addClass("karma-notes-controls");

		const sortSelect = document.createElement("select");
		sortSelect.addClass("karma-sort-select");
		sortSelect.innerHTML = `
			<option value="karma-desc">Karma (highest)</option>
			<option value="karma-asc">Karma (lowest)</option>
			<option value="alpha">Alphabetical</option>
			<option value="date">Last opened</option>
		`;
		sortSelect.value = this.currentSort;
		sortSelect.addEventListener("change", () => {
			this.currentSort = sortSelect.value;
			this.render();
		});
		controls.appendChild(sortSelect);
		header.appendChild(controls);

		// Filters
		const filtersContainer = document.createElement("div");
		filtersContainer.addClass("karma-notes-filters");

		// Karma range filter chips
		const karmaChips = document.createElement("div");
		karmaChips.addClass("karma-filter-chips");

		const karmaFilters = [
			{ id: "all", label: "All", icon: "📊" },
			{ id: "high", label: ">5", icon: "⚡" },
			{ id: "medium", label: "2-5", icon: "⭐" },
			{ id: "low", label: "0-1", icon: "📊" },
			{ id: "negative", label: "<0", icon: "❄️" },
		];

		for (const f of karmaFilters) {
			const chip = document.createElement("button");
			chip.addClass("karma-filter-chip");
			if (this.currentKarmaFilter === f.id) chip.addClass("active");
			chip.innerHTML = `${f.icon} ${f.label}`;
			chip.addEventListener("click", () => {
				this.currentKarmaFilter = f.id;
				this.render();
			});
			karmaChips.appendChild(chip);
		}
		filtersContainer.appendChild(karmaChips);

		// Property filters
		const propertyMap = new Map<
			string,
			{ property: string; value: string; count: number }
		>();
		for (const note of allNotes) {
			if (!note.hasFrontmatter || !note.frontmatter) continue;
			for (const prop of this.plugin.settings.filterProperties) {
				if (note.frontmatter[prop]) {
					const propVal = note.frontmatter[prop];
					if (Array.isArray(propVal)) {
						for (const v of propVal) {
							const key = `${prop}:${v}`;
							if (!propertyMap.has(key)) {
								propertyMap.set(key, { property: prop, value: v as string, count: 0 });
							}
							propertyMap.get(key)!.count++;
						}
					} else {
						const key = `${prop}:${propVal}`;
						if (!propertyMap.has(key)) {
							propertyMap.set(key, { property: prop, value: propVal as string, count: 0 });
						}
						propertyMap.get(key)!.count++;
					}
				}
			}
		}

		if (propertyMap.size > 0) {
			const propFilters = document.createElement("div");
			propFilters.addClass("karma-property-filters");

			for (const [key, info] of propertyMap) {
				const chip = document.createElement("button");
				chip.addClass("karma-property-chip");
				if (this.selectedFilters.has(key)) chip.addClass("active");
				chip.innerHTML = `${info.property}: ${info.value} (${info.count})`;
				chip.addEventListener("click", () => {
					if (this.selectedFilters.has(key)) {
						this.selectedFilters.delete(key);
					} else {
						this.selectedFilters.add(key);
					}
					this.render();
				});
				propFilters.appendChild(chip);
			}
			filtersContainer.appendChild(propFilters);
		}

		this.contentEl.appendChild(header);
		this.contentEl.appendChild(filtersContainer);

		// Notes list
		const list = document.createElement("div");
		list.addClass("karma-notes-list");

		const today = this.plugin.getToday();

		for (const note of sortedNotes) {
			const item = document.createElement("div");
			item.addClass("karma-note-item");

			const noteHeader = document.createElement("div");
			noteHeader.addClass("karma-note-header");

			const noteName = document.createElement("span");
			noteName.addClass("karma-note-name");
			noteName.textContent = note.name;
			noteName.style.cursor = "pointer";
			noteName.addEventListener("click", async () => {
				await this.app.workspace.getLeaf(false).openFile(note.file);
			});
			noteHeader.appendChild(noteName);

			const noteMeta = document.createElement("div");
			noteMeta.addClass("karma-note-meta");

			const scoreSpan = document.createElement("span");
			scoreSpan.addClass("karma-note-score");
			scoreSpan.innerHTML = `${this.getScoreIcon(note.score)} ${note.score}`;
			noteMeta.appendChild(scoreSpan);

			// Vote buttons with new logic
			const canUpvote = note.score < note.dailyBaseScore + 1;
			const canDownvote = note.score > note.dailyBaseScore - 1;

			const upBtn = document.createElement("button");
			upBtn.addClass("karma-vote-btn", "karma-vote-up");
			if (!canUpvote) upBtn.addClass("disabled");
			upBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
			upBtn.disabled = !canUpvote;
			upBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				if (canUpvote) {
					await this.plugin.vote(note.file, "up");
					this.render();
				}
			});

			const downBtn = document.createElement("button");
			downBtn.addClass("karma-vote-btn", "karma-vote-down");
			if (!canDownvote) downBtn.addClass("disabled");
			downBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
			downBtn.disabled = !canDownvote;
			downBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				if (canDownvote) {
					await this.plugin.vote(note.file, "down");
					this.render();
				}
			});

			noteMeta.appendChild(upBtn);
			noteMeta.appendChild(downBtn);
			noteHeader.appendChild(noteMeta);
			item.appendChild(noteHeader);

			// Badges
			const badges = document.createElement("div");
			badges.addClass("karma-note-badges");

			if (!note.hasFrontmatter) {
				const badge = document.createElement("span");
				badge.addClass("karma-note-badge", "karma-badge-warning");
				badge.innerHTML = "⚠️ No frontmatter";
				badges.appendChild(badge);
			} else if (note.frontmatter) {
				for (const prop of this.plugin.settings.filterProperties) {
					if (note.frontmatter[prop]) {
						const propVal = note.frontmatter[prop];
						if (Array.isArray(propVal)) {
							for (const v of propVal) {
								const badge = document.createElement("span");
								badge.addClass("karma-note-badge");
								badge.textContent = `${prop}: ${v}`;
								badges.appendChild(badge);
							}
						} else {
							const badge = document.createElement("span");
							badge.addClass("karma-note-badge");
							badge.textContent = `${prop}: ${propVal}`;
							badges.appendChild(badge);
						}
					}
				}
			}

			item.appendChild(badges);
			list.appendChild(item);
		}

		this.contentEl.appendChild(list);
	}
}

// ─── Main Plugin ───────────────────────────────────────────────────────────────

export default class KarmaPlugin extends Plugin {
	settings: KarmaPluginSettings;
	karmaData: KarmaData = { notes: {} };
	statusBarItem: HTMLElement;
	karmaView: KarmaNotesView;
	private currentButtons: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		await this.loadKarmaData();

		// Register view
		this.registerView(
			VIEW_TYPE_KARMA_NOTES,
			(leaf) => (this.karmaView = new KarmaNotesView(leaf, this))
		);

		// Ribbon icon
		this.addRibbonIcon("trophy", "Karma Notes", () => {
			this.activateView();
		});

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("karma-status-bar");

		// Register events
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file) {
					this.handleFileOpen(file);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.updateButtonsForActiveFile();
			})
		);

		// Settings tab
		this.addSettingTab(new KarmaSettingTab(this.app, this));

		// Run decay check on startup
		await this.checkDecay();

		// Schedule daily decay check
		this.registerInterval(
			window.setInterval(async () => {
				await this.checkDecay();
			}, 1000 * 60 * 60) // every hour
		);

		// Initial render
		setTimeout(() => {
			this.updateButtonsForActiveFile();
		}, 500);

		// Initialize sidebar view
		if (this.app.workspace.layoutReady) {
			this.initKarmaView();
		} else {
			this.registerEvent(
				this.app.workspace.on("layout-ready", this.initKarmaView.bind(this))
			);
		}
	}

	onunload() {
		this.removeKarmaButtons();
	}

	initKarmaView() {
		if (this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES).length) {
			return;
		}
		this.app.workspace.getRightLeaf(false)?.setViewState({
			type: VIEW_TYPE_KARMA_NOTES,
		});
	}

	async activateView() {
		let leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
		if (leaves.length > 0) {
			this.app.workspace.revealLeaf(leaves[0]);
		} else {
			await this.app.workspace.getRightLeaf(false)?.setViewState({
				type: VIEW_TYPE_KARMA_NOTES,
			});
			leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
			if (leaves.length > 0) {
				this.app.workspace.revealLeaf(leaves[0]);
			}
		}
	}

	// ─── Data helpers ──────────────────────────────────────────────────────────

	getToday(): string {
		return new Date().toISOString().split("T")[0];
	}

	getNoteKarma(filePath: string): NoteKarma {
		if (!this.karmaData.notes[filePath]) {
			this.karmaData.notes[filePath] = {
				...DEFAULT_KARMA,
				lastOpenedDate: this.getToday(),
				createdDate: this.getToday(),
			};
		}
		return this.karmaData.notes[filePath];
	}

	async saveKarmaData() {
		await this.saveData({ karma: this.karmaData, settings: this.settings });
	}

	async loadKarmaData() {
		const data = await this.loadData();
		if (data?.karma) {
			this.karmaData = data.karma;
		}
		if (data?.settings) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		}
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
	}

	async saveSettings() {
		await this.saveKarmaData();
	}

	// ─── Decay logic ───────────────────────────────────────────────────────────

	async checkDecay() {
		const today = this.getToday();
		const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
		let changed = false;

		for (const [path, karma] of Object.entries(this.karmaData.notes)) {
			if (!karma.lastOpenedDate) continue;
			const lastOpened = new Date(karma.lastOpenedDate).getTime();
			const now = new Date(today).getTime();
			if (now - lastOpened >= twoWeeksMs) {
				// Apply -1 only once per 2-week period
				const daysSincePenalty = karma.lastVoteDate
					? Math.floor(
							(now - new Date(karma.lastVoteDate).getTime()) /
								(1000 * 60 * 60 * 24)
					  )
					: 999;

				if (daysSincePenalty >= 14) {
					karma.score -= 1;
					karma.lastVoteDate = today; // reuse field to track last penalty
					changed = true;
				}
			}
		}

		if (changed) {
			await this.saveKarmaData();
			this.updateStatusBar();
		}
	}

	// ─── File open ─────────────────────────────────────────────────────────────

	async handleFileOpen(file: TFile) {
		if (file.extension !== "md") return;

		const karma = this.getNoteKarma(file.path);
		karma.lastOpenedDate = this.getToday();
		await this.saveKarmaData();

		this.updateStatusBar(karma.score);
		this.injectKarmaButtons(file);
	}

	// ─── Voting ────────────────────────────────────────────────────────────────

	ensureDailyBase(karma: NoteKarma) {
		const today = this.getToday();
		if (karma.dailyBaseDate !== today) {
			karma.dailyBaseScore = karma.score;
			karma.dailyBaseDate = today;
		}
	}

	async vote(file: TFile, direction: "up" | "down") {
		const karma = this.getNoteKarma(file.path);
		this.ensureDailyBase(karma);

		const baseScore = karma.dailyBaseScore;
		const maxScore = baseScore + 1;
		const minScore = baseScore - 1;

		if (direction === "up") {
			if (karma.score >= maxScore) {
				new Notice(`⏳ Max daily increase reached (${maxScore} pts)`, 3000);
				return;
			}
			karma.score += 1;
			new Notice(`⬆️ +1 karma → ${karma.score} pts`, 2000);
		} else {
			if (karma.score <= minScore) {
				new Notice(`⏳ Max daily decrease reached (${minScore} pts)`, 3000);
				return;
			}
			karma.score -= 1;
			new Notice(`⬇️ -1 karma → ${karma.score} pts`, 2000);
		}

		karma.lastVoteDate = this.getToday();
		await this.saveKarmaData();

		this.updateStatusBar(karma.score);
		this.updateButtonDisplay(file);

		// Refresh sidebar view
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
		if (leaves.length > 0 && leaves[0].view instanceof KarmaNotesView) {
			await leaves[0].view.render();
		}
	}

	// ─── UI: Buttons ───────────────────────────────────────────────────────────

	updateButtonsForActiveFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && activeFile.extension === "md") {
			this.injectKarmaButtons(activeFile);
			const karma = this.getNoteKarma(activeFile.path);
			this.updateStatusBar(karma.score);
		} else {
			this.removeKarmaButtons();
			this.statusBarItem.setText("");
		}
	}

	removeKarmaButtons() {
		if (this.currentButtons) {
			this.currentButtons.remove();
			this.currentButtons = null;
		}
		document.querySelectorAll(".karma-widget").forEach((el) => el.remove());
	}

	injectKarmaButtons(file: TFile) {
		this.removeKarmaButtons();

		// Find active markdown view
		const leaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!leaf) return;

		const container = leaf.containerEl;
		const karma = this.getNoteKarma(file.path);
		this.ensureDailyBase(karma);

		const baseScore = karma.dailyBaseScore;
		const canUpvote = karma.score < baseScore + 1;
		const canDownvote = karma.score > baseScore - 1;

		const widget = document.createElement("div");
		widget.addClass("karma-widget");
		widget.setAttribute("data-file-path", file.path);

		widget.innerHTML = `
			<div class="karma-inner">
				<button class="karma-btn karma-up ${!canUpvote ? "karma-disabled" : ""}" title="Upvote (+1 karma)">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="18 15 12 9 6 15"/>
					</svg>
				</button>
				<span class="karma-score" title="Karma score">${karma.score}</span>
				<button class="karma-btn karma-down ${!canDownvote ? "karma-disabled" : ""}" title="Downvote (-1 karma)">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="6 9 12 15 18 9"/>
					</svg>
				</button>
			</div>
			<div class="karma-daily-info">Today: ${baseScore - 1} to ${baseScore + 1}</div>
		`;

		const upBtn = widget.querySelector(".karma-up") as HTMLElement;
		const downBtn = widget.querySelector(".karma-down") as HTMLElement;

		upBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.vote(file, "up");
		});

		downBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.vote(file, "down");
		});

		container.appendChild(widget);
		this.currentButtons = widget;
	}

	updateButtonDisplay(file: TFile) {
		const widget = document.querySelector(
			`.karma-widget[data-file-path="${file.path}"]`
		) as HTMLElement;
		if (!widget) return;

		const karma = this.getNoteKarma(file.path);
		this.ensureDailyBase(karma);

		const scoreEl = widget.querySelector(".karma-score");
		if (scoreEl) scoreEl.textContent = String(karma.score);

		const baseScore = karma.dailyBaseScore;
		const canUpvote = karma.score < baseScore + 1;
		const canDownvote = karma.score > baseScore - 1;

		const upBtn = widget.querySelector(".karma-up");
		const downBtn = widget.querySelector(".karma-down");

		if (upBtn) {
			canUpvote ? upBtn.removeClass("karma-disabled") : upBtn.addClass("karma-disabled");
		}
		if (downBtn) {
			canDownvote ? downBtn.removeClass("karma-disabled") : downBtn.addClass("karma-disabled");
		}

		// Update daily info label
		const infoLabel = widget.querySelector(".karma-daily-info");
		if (infoLabel) {
			infoLabel.textContent = `Today: ${baseScore - 1} to ${baseScore + 1}`;
		}
	}

	updateStatusBar(score?: number) {
		if (!this.settings.showScoreInStatusBar) {
			this.statusBarItem.setText("");
			return;
		}
		if (score !== undefined) {
			const emoji = score >= 5 ? "🔥" : score >= 0 ? "⭐" : "❄️";
			this.statusBarItem.setText(`${emoji} Karma: ${score}`);
		}
	}
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

class KarmaSettingTab extends PluginSettingTab {
	plugin: KarmaPlugin;

	constructor(app: App, plugin: KarmaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Karma Notes — Settings" });

		new Setting(containerEl)
			.setName("Show karma in status bar")
			.setDesc("Display the active note's score at the bottom.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScoreInStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showScoreInStatusBar = value;
						await this.plugin.saveSettings();
						this.plugin.updateButtonsForActiveFile();
					})
			);
	}
}
