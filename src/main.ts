import { MarkdownView, Platform, Plugin, TFile, View, setIcon } from "obsidian";

const BTN_CLASS = "outline-jump-btn";

// The core Outline view isn't in the public typings; it exposes the note it is showing as `file`.
type OutlineView = View & { file?: TFile | null };

export default class OutlineJumpPlugin extends Plugin {
	onload() {
		this.app.workspace.onLayoutReady(() => this.decorateAll());
		this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateAll()));
	}

	onunload() {
		document.querySelectorAll("." + BTN_CLASS).forEach((el) => el.remove());
	}

	decorateAll() {
		for (const leaf of this.app.workspace.getLeavesOfType("outline")) {
			const outline = leaf.view as OutlineView;
			const bar = outline.containerEl.querySelector<HTMLElement>(".nav-header .nav-buttons-container");
			if (!bar || bar.querySelector("." + BTN_CLASS)) continue;
			this.addButton(bar, "arrow-up-to-line", "Jump to top", () => this.jump(outline, "top"));
			this.addButton(bar, "arrow-down-to-line", "Jump to bottom", () => this.jump(outline, "bottom"));
		}
	}

	// Plain addEventListener: the button dies with the outline view, no need to hold it until unload.
	addButton(bar: HTMLElement, icon: string, label: string, onClick: () => void) {
		const el = bar.createDiv({ cls: `clickable-icon nav-action-button ${BTN_CLASS}` });
		setIcon(el, icon);
		el.setAttribute("aria-label", label);
		el.addEventListener("click", onClick);
	}

	findNoteView(file: TFile | null | undefined): MarkdownView | null {
		if (!file) return null;
		const recent = this.app.workspace.getMostRecentLeaf();
		if (recent && recent.view instanceof MarkdownView && recent.view.file === file) return recent.view;
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file === file) return leaf.view;
		}
		return null;
	}

	// Content renders lazily and scrollHeight grows as it does, so chase the end for a few frames.
	chaseBottom(scroller: HTMLElement) {
		let n = 0;
		const step = () => {
			scroller.scrollTop = scroller.scrollHeight;
			if (++n < 5) scroller.win.requestAnimationFrame(step); // the note may live in a popout window
		};
		step();
	}

	jump(outline: OutlineView, where: "top" | "bottom") {
		const view = this.findNoteView(outline.file);
		if (!view) return;

		// On phones the outline lives in a drawer that covers the note; close it so the jump is visible.
		if (Platform.isPhone) {
			const root = outline.leaf.getRoot();
			const { leftSplit, rightSplit } = this.app.workspace;
			if (root === leftSplit) leftSplit.collapse();
			else if (root === rightSplit) rightSplit.collapse();
		}

		if (view.getMode() === "preview") {
			const scroller =
				view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-view") ?? view.previewMode.containerEl;
			if (where === "top") {
				view.previewMode.applyScroll(0);
				scroller.scrollTop = 0;
			} else {
				this.chaseBottom(scroller);
			}
			return;
		}

		const editor = view.editor;
		if (where === "top") {
			editor.scrollIntoView({ from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 } });
			editor.scrollTo(null, 0);
		} else {
			const last = editor.lastLine();
			const pos = { line: last, ch: editor.getLine(last).length };
			editor.scrollIntoView({ from: pos, to: pos });
			// Last line visible isn't the end: the editor has bottom padding, so finish with the scroller itself.
			const scroller = view.contentEl.querySelector<HTMLElement>(".cm-scroller");
			if (scroller) this.chaseBottom(scroller);
		}
	}
}
