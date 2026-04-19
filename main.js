var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => KarmaPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_KARMA_NOTES = "karma-notes-view";
var DEFAULT_SETTINGS = {
  showScoreInStatusBar: true,
  notesFolder: "unique_content",
  filterProperties: ["tags", "class", "view"]
};
var DEFAULT_KARMA = {
  score: 2,
  lastVoteDate: "",
  lastOpenedDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
  createdDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
  dailyBaseScore: 2,
  dailyBaseDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
};
var KarmaNotesView = class extends import_obsidian.ItemView {
  plugin;
  currentSort = "karma-desc";
  currentKarmaFilter = "all";
  selectedFilters = /* @__PURE__ */ new Set();
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_KARMA_NOTES;
  }
  getDisplayText() {
    return "Karma Notes";
  }
  getIcon() {
    return "trophy";
  }
  async onOpen() {
    this.containerEl.addClass("karma-notes-view");
    await this.render();
  }
  async onClose() {
    return Promise.resolve();
  }
  getAllNotes() {
    const folder = this.plugin.settings.notesFolder;
    const notes = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(folder)) {
        const karma = this.plugin.getNoteKarma(file.path);
        this.plugin.ensureDailyBase(karma);
        const cache = this.app.metadataCache.getFileCache(file);
        let hasFrontmatter = false;
        let frontmatter = null;
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
          frontmatter
        });
      }
    }
    return notes;
  }
  filterByKarmaRange(notes) {
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
  filterByProperties(notes) {
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
  sortNotes(notes) {
    switch (this.currentSort) {
      case "karma-desc":
        return notes.sort((a, b) => b.score - a.score);
      case "karma-asc":
        return notes.sort((a, b) => a.score - b.score);
      case "alpha":
        return notes.sort((a, b) => a.name.localeCompare(b.name));
      case "date":
        return notes.sort(
          (a, b) => new Date(b.lastOpenedDate || 0).getTime() - new Date(a.lastOpenedDate || 0).getTime()
        );
      default:
        return notes;
    }
  }
  getScoreIcon(score) {
    if (score >= 5) return "\u{1F525}";
    if (score >= 0) return "\u2B50";
    return "\u2744\uFE0F";
  }
  async render() {
    this.contentEl.empty();
    const allNotes = this.getAllNotes();
    const filteredByKarma = this.filterByKarmaRange(allNotes);
    const filteredByProps = this.filterByProperties(filteredByKarma);
    const sortedNotes = this.sortNotes([...filteredByProps]);
    const header = document.createElement("div");
    header.addClass("karma-notes-header");
    const titleRow = document.createElement("div");
    titleRow.addClass("karma-header-row");
    const title = document.createElement("h3");
    title.textContent = "Karma Notes";
    titleRow.appendChild(title);
    const noteCount = document.createElement("span");
    noteCount.addClass("karma-note-count");
    noteCount.textContent = `${sortedNotes.length}`;
    titleRow.appendChild(noteCount);
    header.appendChild(titleRow);
    const filtersRow = document.createElement("div");
    filtersRow.addClass("karma-filters-row");
    const sortSelect = document.createElement("select");
    sortSelect.addClass("karma-dropdown");
    sortSelect.innerHTML = `
			<option value="karma-desc">\u2193 Karma</option>
			<option value="karma-asc">\u2191 Karma</option>
			<option value="alpha">A-Z</option>
			<option value="date">Recent</option>
		`;
    sortSelect.value = this.currentSort;
    sortSelect.addEventListener("change", () => {
      this.currentSort = sortSelect.value;
      this.render();
    });
    filtersRow.appendChild(sortSelect);
    const karmaSelect = document.createElement("select");
    karmaSelect.addClass("karma-dropdown");
    karmaSelect.innerHTML = `
			<option value="all">All karma</option>
			<option value="high">\u{1F525} >5</option>
			<option value="medium">\u2B50 2-5</option>
			<option value="low">\u{1F4CA} 0-1</option>
			<option value="negative">\u2744\uFE0F <0</option>
		`;
    karmaSelect.value = this.currentKarmaFilter;
    karmaSelect.addEventListener("change", () => {
      this.currentKarmaFilter = karmaSelect.value;
      this.render();
    });
    filtersRow.appendChild(karmaSelect);
    header.appendChild(filtersRow);
    const propertyGroups = /* @__PURE__ */ new Map();
    for (const note of allNotes) {
      if (!note.hasFrontmatter || !note.frontmatter) continue;
      for (const prop of this.plugin.settings.filterProperties) {
        if (note.frontmatter[prop]) {
          if (!propertyGroups.has(prop)) {
            propertyGroups.set(prop, /* @__PURE__ */ new Map());
          }
          const propVal = note.frontmatter[prop];
          const values = Array.isArray(propVal) ? propVal : [propVal];
          for (const v of values) {
            const valStr = String(v);
            const current = propertyGroups.get(prop).get(valStr) || 0;
            propertyGroups.get(prop).set(valStr, current + 1);
          }
        }
      }
    }
    if (propertyGroups.size > 0) {
      const propsRow = document.createElement("div");
      propsRow.addClass("karma-props-row");
      for (const [prop, values] of propertyGroups) {
        const wrapper = document.createElement("div");
        wrapper.addClass("karma-multiselect-wrapper");
        const toggle = document.createElement("button");
        toggle.addClass("karma-multiselect-toggle");
        const selectedForProp = Array.from(this.selectedFilters).filter((f) => f.startsWith(`${prop}:`)).length;
        toggle.innerHTML = selectedForProp > 0 ? `${prop} <span class="karma-filter-count">${selectedForProp}</span>` : prop;
        if (selectedForProp > 0) toggle.addClass("has-selection");
        const dropdown = document.createElement("div");
        dropdown.addClass("karma-multiselect-dropdown");
        dropdown.style.display = "none";
        const sortedValues = Array.from(values.entries()).sort((a, b) => b[1] - a[1]);
        for (const [val, count] of sortedValues) {
          const key = `${prop}:${val}`;
          const option = document.createElement("label");
          option.addClass("karma-multiselect-option");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = this.selectedFilters.has(key);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              this.selectedFilters.add(key);
            } else {
              this.selectedFilters.delete(key);
            }
            this.render();
          });
          option.appendChild(checkbox);
          option.appendChild(document.createTextNode(` ${val}`));
          const countSpan = document.createElement("span");
          countSpan.addClass("karma-option-count");
          countSpan.textContent = String(count);
          option.appendChild(countSpan);
          dropdown.appendChild(option);
        }
        toggle.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".karma-multiselect-dropdown").forEach((d) => {
            if (d !== dropdown) d.style.display = "none";
          });
          dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
        });
        wrapper.appendChild(toggle);
        wrapper.appendChild(dropdown);
        propsRow.appendChild(wrapper);
      }
      if (this.selectedFilters.size > 0) {
        const clearBtn = document.createElement("button");
        clearBtn.addClass("karma-clear-filters");
        clearBtn.textContent = "\u2715";
        clearBtn.title = "Clear all filters";
        clearBtn.addEventListener("click", () => {
          this.selectedFilters.clear();
          this.render();
        });
        propsRow.appendChild(clearBtn);
      }
      header.appendChild(propsRow);
    }
    this.contentEl.appendChild(header);
    this.contentEl.addEventListener("click", () => {
      document.querySelectorAll(".karma-multiselect-dropdown").forEach((d) => {
        d.style.display = "none";
      });
    });
    const list = document.createElement("div");
    list.addClass("karma-notes-list");
    for (const note of sortedNotes) {
      const item = document.createElement("div");
      item.addClass("karma-note-item");
      const canUpvote = note.score < note.dailyBaseScore + 1;
      const canDownvote = note.score > note.dailyBaseScore - 1;
      const voteContainer = document.createElement("div");
      voteContainer.addClass("karma-vote-container");
      const upBtn = document.createElement("button");
      upBtn.addClass("karma-vote-btn", "karma-vote-up");
      if (!canUpvote) upBtn.addClass("disabled");
      upBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
      upBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (canUpvote) {
          await this.plugin.vote(note.file, "up");
          this.render();
        }
      });
      const scoreSpan = document.createElement("span");
      scoreSpan.addClass("karma-note-score");
      scoreSpan.textContent = String(note.score);
      const downBtn = document.createElement("button");
      downBtn.addClass("karma-vote-btn", "karma-vote-down");
      if (!canDownvote) downBtn.addClass("disabled");
      downBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
      downBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (canDownvote) {
          await this.plugin.vote(note.file, "down");
          this.render();
        }
      });
      voteContainer.appendChild(upBtn);
      voteContainer.appendChild(scoreSpan);
      voteContainer.appendChild(downBtn);
      item.appendChild(voteContainer);
      const noteName = document.createElement("span");
      noteName.addClass("karma-note-name");
      noteName.textContent = note.name;
      noteName.addEventListener("click", async () => {
        await this.app.workspace.getLeaf(false).openFile(note.file);
      });
      item.appendChild(noteName);
      list.appendChild(item);
    }
    this.contentEl.appendChild(list);
  }
};
var KarmaPlugin = class extends import_obsidian.Plugin {
  settings;
  karmaData = { notes: {} };
  statusBarItem;
  karmaView;
  currentButtons = null;
  async onload() {
    await this.loadSettings();
    await this.loadKarmaData();
    this.registerView(
      VIEW_TYPE_KARMA_NOTES,
      (leaf) => this.karmaView = new KarmaNotesView(leaf, this)
    );
    this.addRibbonIcon("trophy", "Karma Notes", () => {
      this.activateView();
    });
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("karma-status-bar");
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
    this.addSettingTab(new KarmaSettingTab(this.app, this));
    await this.checkDecay();
    this.registerInterval(
      window.setInterval(async () => {
        await this.checkDecay();
      }, 1e3 * 60 * 60)
      // every hour
    );
    setTimeout(() => {
      this.updateButtonsForActiveFile();
    }, 500);
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
      type: VIEW_TYPE_KARMA_NOTES
    });
  }
  async activateView() {
    let leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
    } else {
      await this.app.workspace.getRightLeaf(false)?.setViewState({
        type: VIEW_TYPE_KARMA_NOTES
      });
      leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
      if (leaves.length > 0) {
        this.app.workspace.revealLeaf(leaves[0]);
      }
    }
  }
  // ─── Data helpers ──────────────────────────────────────────────────────────
  getToday() {
    return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
  getNoteKarma(filePath) {
    if (!this.karmaData.notes[filePath]) {
      this.karmaData.notes[filePath] = {
        ...DEFAULT_KARMA,
        lastOpenedDate: this.getToday(),
        createdDate: this.getToday()
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
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1e3;
    let changed = false;
    for (const [path, karma] of Object.entries(this.karmaData.notes)) {
      if (!karma.lastOpenedDate) continue;
      const lastOpened = new Date(karma.lastOpenedDate).getTime();
      const now = new Date(today).getTime();
      if (now - lastOpened >= twoWeeksMs) {
        const daysSincePenalty = karma.lastVoteDate ? Math.floor(
          (now - new Date(karma.lastVoteDate).getTime()) / (1e3 * 60 * 60 * 24)
        ) : 999;
        if (daysSincePenalty >= 14) {
          karma.score -= 1;
          karma.lastVoteDate = today;
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
  async handleFileOpen(file) {
    if (file.extension !== "md") return;
    const karma = this.getNoteKarma(file.path);
    karma.lastOpenedDate = this.getToday();
    await this.saveKarmaData();
    this.updateStatusBar(karma.score);
    this.injectKarmaButtons(file);
  }
  // ─── Voting ────────────────────────────────────────────────────────────────
  ensureDailyBase(karma) {
    const today = this.getToday();
    if (karma.dailyBaseDate !== today) {
      karma.dailyBaseScore = karma.score;
      karma.dailyBaseDate = today;
    }
  }
  async vote(file, direction) {
    const karma = this.getNoteKarma(file.path);
    this.ensureDailyBase(karma);
    const baseScore = karma.dailyBaseScore;
    const maxScore = baseScore + 1;
    const minScore = baseScore - 1;
    if (direction === "up") {
      if (karma.score >= maxScore) {
        new import_obsidian.Notice(`\u23F3 Max daily increase reached (${maxScore} pts)`, 3e3);
        return;
      }
      karma.score += 1;
      new import_obsidian.Notice(`\u2B06\uFE0F +1 karma \u2192 ${karma.score} pts`, 2e3);
    } else {
      if (karma.score <= minScore) {
        new import_obsidian.Notice(`\u23F3 Max daily decrease reached (${minScore} pts)`, 3e3);
        return;
      }
      karma.score -= 1;
      new import_obsidian.Notice(`\u2B07\uFE0F -1 karma \u2192 ${karma.score} pts`, 2e3);
    }
    karma.lastVoteDate = this.getToday();
    await this.saveKarmaData();
    this.updateStatusBar(karma.score);
    this.updateButtonDisplay(file);
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
  injectKarmaButtons(file) {
    this.removeKarmaButtons();
    const leaf = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
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
    const upBtn = widget.querySelector(".karma-up");
    const downBtn = widget.querySelector(".karma-down");
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
  updateButtonDisplay(file) {
    const widget = document.querySelector(
      `.karma-widget[data-file-path="${file.path}"]`
    );
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
    const infoLabel = widget.querySelector(".karma-daily-info");
    if (infoLabel) {
      infoLabel.textContent = `Today: ${baseScore - 1} to ${baseScore + 1}`;
    }
  }
  updateStatusBar(score) {
    if (!this.settings.showScoreInStatusBar) {
      this.statusBarItem.setText("");
      return;
    }
    if (score !== void 0) {
      const emoji = score >= 5 ? "\u{1F525}" : score >= 0 ? "\u2B50" : "\u2744\uFE0F";
      this.statusBarItem.setText(`${emoji} Karma: ${score}`);
    }
  }
};
var KarmaSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Karma Notes \u2014 Settings" });
    new import_obsidian.Setting(containerEl).setName("Show karma in status bar").setDesc("Display the active note's score at the bottom.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showScoreInStatusBar).onChange(async (value) => {
        this.plugin.settings.showScoreInStatusBar = value;
        await this.plugin.saveSettings();
        this.plugin.updateButtonsForActiveFile();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Notes folder").setDesc("Folder to display in the Karma Notes sidebar (relative to vault root).").addText(
      (text) => text.setPlaceholder("unique_content").setValue(this.plugin.settings.notesFolder).onChange(async (value) => {
        this.plugin.settings.notesFolder = value || "unique_content";
        await this.plugin.saveSettings();
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
        if (leaves.length > 0 && leaves[0].view instanceof KarmaNotesView) {
          await leaves[0].view.render();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("Filter properties").setDesc("Frontmatter properties to show as filters (comma-separated).").addText(
      (text) => text.setPlaceholder("tags,class,view").setValue(this.plugin.settings.filterProperties.join(",")).onChange(async (value) => {
        this.plugin.settings.filterProperties = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        await this.plugin.saveSettings();
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KARMA_NOTES);
        if (leaves.length > 0 && leaves[0].view instanceof KarmaNotesView) {
          await leaves[0].view.render();
        }
      })
    );
  }
};
