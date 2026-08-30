/**
 * Word search grid renderer + per-mode interaction logic.
 *
 * Expects puzzle data shaped like the FastAPI /puzzles/generate response:
 *   {
 *     grid: [["T","E","L",...], ...],   // size x size
 *     words: [
 *       { word: "SUBJECT", tap_order: [[6,0],[5,0],...], direction: "N" },
 *       ...
 *     ],
 *     show_word_list: false
 *   }
 *
 * Easy/Medium rules:
 *  - Letters are always visible.
 *  - Drag in a straight horizontal, vertical, or diagonal line.
 *  - A word can be selected from either end of its path.
 *  - Correct words remain highlighted; invalid selections briefly flash.
 *
 * Hard mode rules:
 *  - Tiles start covered (no letter shown).
 *  - Tapping a tile opens it (reveals letter); tapping a different tile
 *    closes the previously-open one - only one tile visually open at a
 *    time. The tap SEQUENCE is still remembered internally.
 *  - Player must tap in the word's spelling order (tap_order), not the
 *    grid's physical placement order.
 *  - A tap that doesn't continue any valid word's prefix is rejected
 *    (briefly flashes open, then closes) WITHOUT resetting progress -
 *    the player's current valid prefix is preserved (soft-fail, per
 *    design discussion: full-reset-on-any-mistake was judged too
 *    punishing given the one-tile-open constraint).
 *  - Once a full word's tap_order is completed, all its tiles become
 *    permanently "found" and stay revealed.
 */

class WordSearchGame {
  constructor(rootEl, puzzle, { mode = "hard", debug = false } = {}) {
    this.root = rootEl;
    this.puzzle = puzzle;
    this.mode = mode; // "easy" | "medium" | "hard"
    this.debug = debug; // reveals words in the tracker panel for testing
    this.size = puzzle.grid.length;

    this.foundWords = new Set();
    this.currentAttempt = []; // sequence of [row, col] tapped so far (Hard mode)
    this.openTile = null; // currently visually-open tile element (Hard mode)

    // Easy/Medium drag-selection state. Pointer events cover both mouse
    // and touch input, so the same mechanic works on desktop and mobile.
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionPath = [];
    this.activePointerId = null;

    this._buildDom();
    this._render();

    // Bind Easy/Medium selection only after the tiles exist.
    // Keeping this after _render() also avoids relying on event delegation
    // through button elements, which proved inconsistent in some browsers.
    if (this.mode !== "hard") {
      this._bindDragSelection();
    }

    if (this.debug) {
      console.log(
        "[WordSmash debug] puzzle words (word, tap_order [row,col] in spelling order, direction):"
      );
      console.table(
        this.puzzle.words.map((w) => ({
          word: w.word,
          direction: w.direction,
          tap_order: JSON.stringify(w.tap_order),
        }))
      );
    }
  }

  _buildDom() {
    this.root.innerHTML = "";

    const gridPanel = document.createElement("div");
    gridPanel.className = "grid-panel";

    const grid = document.createElement("div");
    grid.className = "letter-grid";
    grid.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${this.size}, 1fr)`;
    this.gridEl = grid;
    gridPanel.appendChild(grid);
    this.root.appendChild(gridPanel);

    const panel = document.createElement("div");
    panel.className = "word-list-panel";

    const title = document.createElement("div");
    title.className = "word-list-title";
    title.textContent = `${this.puzzle.words.length} words to find`;
    if (this.debug) { title.textContent += " · DEBUG"; title.classList.add("debug-active"); }
    panel.appendChild(title);

    const groups = document.createElement("div");
    groups.className = "word-length-groups";
    const byLength = new Map();
    this.puzzle.words.forEach(w => {
      if (!byLength.has(w.word.length)) byLength.set(w.word.length, []);
      byLength.get(w.word.length).push(w);
    });
    [...byLength.entries()].sort((a,b) => a[0]-b[0]).forEach(([length, words]) => {
      const group = document.createElement("div"); group.className = "word-length-group";
      const label = document.createElement("div"); label.className = "word-length-label";
      label.textContent = `${length} letters`; group.appendChild(label);
      const items = document.createElement("div"); items.className = "word-length-items";
      words.forEach(w => {
        const row = document.createElement("div"); row.className = "word-clue"; row.dataset.word = w.word;
        const revealIndex = this.mode === "medium" ? Math.floor(Math.random() * w.word.length) : -1;
        row.dataset.revealIndex = revealIndex;
        for (let i=0; i<w.word.length; i++) {
          const box = document.createElement("span"); box.className = "letter-box";
          if (this.mode === "easy" || this.debug || i === revealIndex) { box.textContent = w.word[i]; box.classList.add("revealed"); }
          row.appendChild(box);
        }
        items.appendChild(row);
      });
      group.appendChild(items); groups.appendChild(group);
    });
    panel.appendChild(groups);
    this.wordBlanksEl = groups;
    this.root.appendChild(panel);
  }

  _render() {
    this.gridEl.innerHTML = "";
    this.tileEls = [];

    for (let r = 0; r < this.size; r++) {
      const rowEls = [];
      for (let c = 0; c < this.size; c++) {
        const tile = document.createElement("button");
        tile.className = "tile";
        tile.dataset.row = r;
        tile.dataset.col = c;

        if (this.mode === "hard") {
          tile.classList.add("covered");
          tile.textContent = this.puzzle.grid[r][c];
          tile.addEventListener("click", () => this._onHardTap(r, c, tile));
        } else {
          // Easy/Medium: letters always visible. Selection is handled
          // through pointer-driven straight-line dragging on the grid.
          tile.textContent = this.puzzle.grid[r][c];
        }

        this.gridEl.appendChild(tile);
        rowEls.push(tile);
      }
      this.tileEls.push(rowEls);
    }
  }

  _tileAt(r, c) {
    return this.tileEls[r][c];
  }

  _bindDragSelection() {
    this.gridEl.classList.add("drag-select-grid");

    const tileFromPoint = (x, y) => {
      // elementFromPoint may briefly return the grid itself while the pointer
      // passes through a CSS grid gap. That is expected; keep the current
      // selection until the pointer reaches the next tile.
      const el = document.elementFromPoint(x, y);
      const tile = el?.closest?.(".tile");
      return tile && this.gridEl.contains(tile) ? tile : null;
    };

    const updateToTile = (tile) => {
      if (!this.isSelecting || !tile) return;
      const end = [Number(tile.dataset.row), Number(tile.dataset.col)];
      const path = this._straightPath(this.selectionStart, end);
      if (!path) return;

      this.selectionPath = path;
      this._paintSelection();

      if (this.debug) {
        console.debug("[WordSmash selection] move", {
          start: this.selectionStart,
          end,
          path: this.selectionPath,
        });
      }
    };

    const begin = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const tile = event.currentTarget;

      // Prevent native scrolling/text selection from taking ownership of a
      // touch drag before WordSmash receives the following pointermove events.
      event.preventDefault();

      this.isSelecting = true;
      this.activePointerId = event.pointerId;
      this.selectionStart = [Number(tile.dataset.row), Number(tile.dataset.col)];
      this.selectionPath = [this.selectionStart];

      this._paintSelection();
      tile.classList.remove("selection-start-pulse");
      void tile.offsetWidth;
      tile.classList.add("selection-start-pulse");

      if (this.debug) {
        console.debug("[WordSmash selection] start", {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          start: this.selectionStart,
        });
      }
    };

    this.tileEls.flat().forEach((tile) => {
      tile.addEventListener("pointerdown", begin, { passive: false });
    });

    // Listen on document in the CAPTURE phase. Touch browsers can retarget
    // pointer events to the element where the gesture began, and some do not
    // emit pointerenter for each tile. The coordinates remain accurate, so we
    // resolve the tile underneath the pointer ourselves with elementFromPoint.
    this._selectionPointerMove = (event) => {
      if (!this.isSelecting) return;
      if (this.activePointerId != null && event.pointerId !== this.activePointerId) return;

      event.preventDefault();
      const tile = tileFromPoint(event.clientX, event.clientY);
      if (tile) updateToTile(tile);
    };

    this._selectionPointerUp = (event) => {
      if (!this.isSelecting) return;
      if (this.activePointerId != null && event.pointerId !== this.activePointerId) return;

      event.preventDefault();

      const tile = tileFromPoint(event.clientX, event.clientY);
      if (tile) updateToTile(tile);

      if (this.debug) {
        console.debug("[WordSmash selection] finish", {
          pointerId: event.pointerId,
          path: this.selectionPath,
        });
      }

      this._finishDragSelection();
      this.isSelecting = false;
      this.selectionStart = null;
      this.selectionPath = [];
      this.activePointerId = null;
    };

    document.addEventListener("pointermove", this._selectionPointerMove, {
      passive: false,
      capture: true,
    });
    document.addEventListener("pointerup", this._selectionPointerUp, {
      passive: false,
      capture: true,
    });
    document.addEventListener("pointercancel", this._selectionPointerUp, {
      passive: false,
      capture: true,
    });
  }

  /**
   * Returns every grid coordinate from start to end when the points form
   * a horizontal, vertical, or 45-degree diagonal line. Otherwise null.
   */
  _straightPath(start, end) {
    if (!start || !end) return null;
    const [r0, c0] = start;
    const [r1, c1] = end;
    const dr = r1 - r0;
    const dc = c1 - c0;

    const horizontal = dr === 0;
    const vertical = dc === 0;
    const diagonal = Math.abs(dr) === Math.abs(dc);
    if (!horizontal && !vertical && !diagonal) return null;

    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    const stepR = steps === 0 ? 0 : Math.sign(dr);
    const stepC = steps === 0 ? 0 : Math.sign(dc);
    const path = [];

    for (let i = 0; i <= steps; i++) {
      path.push([r0 + (stepR * i), c0 + (stepC * i)]);
    }
    return path;
  }

  _paintSelection() {
    this.gridEl.querySelectorAll(".tile.selecting").forEach((tile) => {
      tile.classList.remove("selecting");
    });
    this.selectionPath.forEach(([r, c]) => this._tileAt(r, c).classList.add("selecting"));
  }

  _finishDragSelection() {
    const selectedPath = [...this.selectionPath];
    this.gridEl.querySelectorAll(".tile.selecting").forEach((tile) => {
      tile.classList.remove("selecting");
    });

    // Single-tile drags cannot be valid because the configured word set
    // only contains words of length 3+.
    if (selectedPath.length < 2) return;

    const word = this._wordForDragPath(selectedPath);
    if (word) {
      this._markWordFound(word);
      return;
    }

    // Give immediate but lightweight feedback for a completed invalid line.
    selectedPath.forEach(([r, c]) => this._tileAt(r, c).classList.add("selection-invalid"));
    setTimeout(() => {
      selectedPath.forEach(([r, c]) => this._tileAt(r, c).classList.remove("selection-invalid"));
    }, 260);
  }

  _wordForDragPath(path) {
    return this.puzzle.words.find((wordObj) => {
      if (this.foundWords.has(wordObj.word)) return false;
      if (wordObj.tap_order.length !== path.length) return false;

      const forward = path.every(
        ([r, c], i) => wordObj.tap_order[i][0] === r && wordObj.tap_order[i][1] === c
      );
      if (forward) return true;

      // Easy/Medium behave like a conventional word search: selecting
      // the same physical word from its opposite end is also accepted.
      return path.every(([r, c], i) => {
        const reverseIndex = wordObj.tap_order.length - 1 - i;
        return wordObj.tap_order[reverseIndex][0] === r && wordObj.tap_order[reverseIndex][1] === c;
      });
    });
  }

  _onHardTap(r, c, tile) {
    const alreadyFound = tile.classList.contains("found");

    // Close the previously-open tile (unless it was a "found" tile,
    // which stays revealed regardless).
    if (this.openTile && this.openTile !== tile && !this.openTile.classList.contains("found")) {
      this.openTile.classList.remove("open");
      this.openTile.classList.add("covered");
    }

    if (alreadyFound) {
      // Tile is shared with a previously found word (grids can overlap
      // words at matching letters) - it stays visually "found" (green),
      // but the tap still needs to count toward whatever sequence is
      // being built now, or any word that legitimately reuses this
      // tile could never be completed. Give a brief pulse so the tap
      // still feels acknowledged even though the color doesn't change.
      this.openTile = null;
      tile.classList.remove("tile-pulse");
      void tile.offsetWidth; // restart the animation if it's already mid-pulse
      tile.classList.add("tile-pulse");
    } else {
      tile.classList.remove("covered");
      tile.classList.add("open");
      this.openTile = tile;
    }

    const candidateSequence = [...this.currentAttempt, [r, c]];

    const match = this._matchAgainstWords(candidateSequence);

    if (this.debug) {
      console.log(
        `[WordSmash debug] tapped [${r},${c}]="${this.puzzle.grid[r][c]}" ` +
        `| sequence so far: ${JSON.stringify(candidateSequence)} ` +
        `| match: ${match}`
      );
    }

    if (match === "complete") {
      const word = this._wordForSequence(candidateSequence);
      this._markWordFound(word);
      this.currentAttempt = [];
      this.openTile = null;
      return;
    }

    if (match === "partial") {
      // Valid so far - extend the remembered sequence.
      this.currentAttempt = candidateSequence;
      return;
    }

    // Continuing the old sequence didn't match anything. Before treating
    // this as a genuine miss, try it as the START of a fresh sequence -
    // this covers abandoning one word mid-attempt and starting a
    // different one, which previously left the old sequence stuck in
    // currentAttempt forever (every future tap kept appending onto a
    // dead prefix that could never match anything again).
    if (this.currentAttempt.length > 0) {
      const freshSequence = [[r, c]];
      const freshMatch = this._matchAgainstWords(freshSequence);

      if (this.debug) {
        console.log(
          `[WordSmash debug] old sequence dead - retrying as fresh start: ` +
          `${JSON.stringify(freshSequence)} | match: ${freshMatch}`
        );
      }

      if (freshMatch === "complete") {
        const word = this._wordForSequence(freshSequence);
        this._markWordFound(word);
        this.currentAttempt = [];
        this.openTile = null;
        return;
      }

      if (freshMatch === "partial") {
        this.currentAttempt = freshSequence;
        return;
      }
    }

    // Not a valid continuation OR a valid fresh start - genuine miss.
    // Don't reset currentAttempt in this case (preserves a mid-word typo
    // scenario where the player wants to retry the next tap without
    // losing correct progress). Keep the selected letter visible until
    // the player selects another tile; the next _onHardTap() call closes
    // this.openTile before revealing the new selection.
  }

  /**
   * Checks candidateSequence (array of [row,col]) against every
   * unfound word's tap_order. Returns:
   *   "complete" - candidateSequence exactly equals some word's full tap_order
   *   "partial"  - candidateSequence is a valid prefix of some word's tap_order
   *   "none"     - matches no word's prefix
   */
  _matchAgainstWords(candidateSequence) {
    let sawPartial = false;

    for (const w of this.puzzle.words) {
      if (this.foundWords.has(w.word)) continue;
      const tapOrder = w.tap_order;
      if (candidateSequence.length > tapOrder.length) continue;

      const isPrefix = candidateSequence.every(
        ([r, c], i) => tapOrder[i][0] === r && tapOrder[i][1] === c
      );
      if (!isPrefix) continue;

      if (candidateSequence.length === tapOrder.length) return "complete";
      sawPartial = true;
    }

    return sawPartial ? "partial" : "none";
  }

  _wordForSequence(sequence) {
    return this.puzzle.words.find((w) => {
      if (w.tap_order.length !== sequence.length) return false;
      return sequence.every(([r, c], i) => w.tap_order[i][0] === r && w.tap_order[i][1] === c);
    });
  }

  _markWordFound(wordObj) {
    this.foundWords.add(wordObj.word);
    wordObj.tap_order.forEach(([r, c]) => {
      const tile = this._tileAt(r, c);
      tile.classList.remove("open", "covered");
      tile.classList.add("found");
    });

    if (this.wordListEl) {
      const chip = this.wordListEl.querySelector(`[data-word="${wordObj.word}"]`);
      if (chip) chip.classList.add("found");
    }

    if (this.wordBlanksEl) {
      const row = this.wordBlanksEl.querySelector(`[data-word="${wordObj.word}"]`);
      if (row) {
        row.classList.add("found");
        const boxes = row.querySelectorAll(".letter-box");
        wordObj.word.split("").forEach((letter, i) => {
          if (boxes[i]) boxes[i].textContent = letter;
        });
      }
    }

    this.onWordFound?.(wordObj.word, this.foundWords.size, this.puzzle.words.length);
  }
}
