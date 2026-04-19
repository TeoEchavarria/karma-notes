import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	MarkdownView,
	Notice,
	WorkspaceLeaf,
} from "obsidian";

interface NoteKarma {
	score: number;
	lastVoteDate: string; // ISO date string (YYYY-MM-DD)
	lastOpenedDate: string; // ISO date string (YYYY-MM-DD)
	createdDate: string;
}

interface KarmaData {
	notes: Record<string, NoteKarma>;
}

interface KarmaPluginSettings {
	showScoreInStatusBar: boolean;
}

const DEFAULT_SETTINGS: KarmaPluginSettings = {
	showScoreInStatusBar: true,
};

const DEFAULT_KARMA: NoteKarma = {
	score: 2,
	lastVoteDate: "",
	lastOpenedDate: new Date().toISOString().split("T")[0],
	createdDate: new Date().toISOString().split("T")[0],
};

export default class KarmaPlugin extends Plugin {
	settings: KarmaPluginSettings;
	karmaData: KarmaData = { notes: {} };
	statusBarItem: HTMLElement;
	private currentButtons: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		await this.loadKarmaData();

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
	}

	onunload() {
		this.removeKarmaButtons();
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

	async vote(file: TFile, direction: "up" | "down") {
		const today = this.getToday();
		const karma = this.getNoteKarma(file.path);

		if (karma.lastVoteDate === today) {
			new Notice("⏳ Ya votaste hoy en esta nota. Vuelve mañana.", 3000);
			return;
		}

		if (direction === "up") {
			karma.score += 1;
			new Notice(`⬆️ +1 karma → ${karma.score} pts`, 2000);
		} else {
			karma.score -= 1;
			new Notice(`⬇️ -1 karma → ${karma.score} pts`, 2000);
		}

		karma.lastVoteDate = today;
		await this.saveKarmaData();

		this.updateStatusBar(karma.score);
		this.updateButtonDisplay(file);
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
		const today = this.getToday();
		const votedToday = karma.lastVoteDate === today;

		const widget = document.createElement("div");
		widget.addClass("karma-widget");
		widget.setAttribute("data-file-path", file.path);

		widget.innerHTML = `
			<div class="karma-inner">
				<button class="karma-btn karma-up ${votedToday ? "karma-voted" : ""}" title="Upvote (+1 karma hoy)">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="18 15 12 9 6 15"/>
					</svg>
				</button>
				<span class="karma-score" title="Karma score">${karma.score}</span>
				<button class="karma-btn karma-down ${votedToday ? "karma-voted" : ""}" title="Downvote (-1 karma hoy)">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="6 9 12 15 18 9"/>
					</svg>
				</button>
			</div>
			${votedToday ? '<div class="karma-voted-label">Votado hoy ✓</div>' : ""}
		`;

		const upBtn = widget.querySelector(".karma-up") as HTMLElement;
		const downBtn = widget.querySelector(".karma-down") as HTMLElement;

		upBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			if (!votedToday) await this.vote(file, "up");
		});

		downBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			if (!votedToday) await this.vote(file, "down");
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
		const scoreEl = widget.querySelector(".karma-score");
		if (scoreEl) scoreEl.textContent = String(karma.score);

		const today = this.getToday();
		const votedToday = karma.lastVoteDate === today;

		widget
			.querySelectorAll(".karma-btn")
			.forEach((btn) =>
				votedToday ? btn.addClass("karma-voted") : btn.removeClass("karma-voted")
			);

		// Add or remove voted label
		let label = widget.querySelector(".karma-voted-label");
		if (votedToday && !label) {
			label = document.createElement("div");
			label.addClass("karma-voted-label");
			label.textContent = "Votado hoy ✓";
			widget.appendChild(label);
		} else if (!votedToday && label) {
			label.remove();
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
		containerEl.createEl("h2", { text: "Karma Notes — Ajustes" });

		new Setting(containerEl)
			.setName("Mostrar karma en la barra de estado")
			.setDesc("Muestra el puntaje de la nota activa en la parte inferior.")
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
