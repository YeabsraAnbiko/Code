/**
 * Phase 2 — Incremental per-line tokenization + virtualized rendering
 *
 * - Tokenizes each line independently (fast, incremental)
 * - On input, computes changed line range and re-tokenizes just that range
 * - Virtualized rendering: only visible lines are in DOM
 * - Each token rendered as <span class="token TYPE">...</span>
 *
 * Notes:
 * - Tokenization is regex-based and per-line (sufficient for JSON)
 * - Strings that contain literal newlines are not valid JSON; per-line tokenization is safe
 */

(function () {
  // Elements
  const statusEl = document.getElementById("status");

  const scrollHost = document.getElementById("scrollHost");
  const gutter = document.getElementById("gutter");
  const gutterPhantom = document.getElementById("gutterPhantom");
  const gutterViewport = document.getElementById("gutterViewport");

  const content = document.getElementById("content");
  const contentPhantom = document.getElementById("contentPhantom");
  const contentViewport = document.getElementById("contentViewport");

  const hiddenInput = document.getElementById("hiddenInput");

  // Constants
  const LINE_HEIGHT =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--line-height-px",
      ),
      10,
    ) || 28;
  const RENDER_BUFFER = 8; // lines above & below viewport to render

  const INITIAL_TEXT = `{
  "message": "Welcome to Phase 2!",
  "number": 42,
  "flag": true,
  "nil": null,
  "arr": [
    "one",
    "two",
    "three"
  ]
}
`;

  // Token regex for JSON, works per-line
  // Groups: 1=string, 2=number, 3=true|false|null, 4=punctuation
  const tokenRegex =
    /("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\]:,])/g;

  // Utility: escape HTML
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Tokenize a single line into array of {type, text}
  function tokenizeLine(line) {
    const tokens = [];
    let last = 0;
    tokenRegex.lastIndex = 0;
    let m;
    while ((m = tokenRegex.exec(line)) !== null) {
      if (m.index > last) {
        tokens.push({ type: "plain", text: line.slice(last, m.index) });
      }
      if (m[1]) {
        // string -- could be key or string value, we'll detect key-ness by looking ahead (not across lines)
        tokens.push({ type: "string", text: m[1] });
      } else if (m[2]) {
        tokens.push({ type: "number", text: m[2] });
      } else if (m[3]) {
        const cls = m[3] === "null" ? "null" : "boolean";
        tokens.push({ type: cls, text: m[3] });
      } else if (m[4]) {
        tokens.push({ type: "punctuation", text: m[4] });
      }
      last = tokenRegex.lastIndex;
    }
    if (last < line.length) {
      tokens.push({ type: "plain", text: line.slice(last) });
    }

    // Post-process: mark keys. Heuristic: if a string is immediately followed by optional spaces then a colon token in the same line -> it's a key
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].type === "string") {
        // find next non-plain token or plain that contains colon
        let j = i + 1;
        // skip plain whitespace tokens
        while (
          j < tokens.length &&
          tokens[j].type === "plain" &&
          /^\s*$/.test(tokens[j].text)
        )
          j++;
        if (
          j < tokens.length &&
          tokens[j].type === "punctuation" &&
          tokens[j].text === ":"
        ) {
          tokens[i].type = "key";
        }
      }
    }

    return tokens;
  }

  // Convert token array to HTML (safe)
  function tokensToHtml(tokens) {
    return tokens
      .map((t) => {
        if (t.type === "plain") return escapeHtml(t.text);
        return `<span class="token ${t.type}">${escapeHtml(t.text)}</span>`;
      })
      .join("");
  }

  // State
  const state = {
    text: INITIAL_TEXT,
    tokens: [], // array per-line token HTML strings
    get lines() {
      return this.text.split("\n");
    },
    selectionStart: INITIAL_TEXT.length,
    selectionEnd: INITIAL_TEXT.length,
    scrollTop: 0,
    scrollLeft: 0,
    viewportHeight: 0,
    viewportWidth: 0,
    get totalLines() {
      return this.lines.length;
    },
    get docHeightPx() {
      return this.totalLines * LINE_HEIGHT;
    },
  };

  // Initialize hidden input and tokens
  hiddenInput.value = state.text;
  state.tokens = state.lines.map((l) => tokensToHtml(tokenizeLine(l)));

  // Focus caret
  requestAnimationFrame(() => {
    hiddenInput.focus();
    hiddenInput.selectionStart = state.selectionStart;
    hiddenInput.selectionEnd = state.selectionEnd;
  });

  // Measure viewport
  function measureViewport() {
    state.viewportHeight = scrollHost.clientHeight;
    state.viewportWidth = scrollHost.clientWidth;
  }
  measureViewport();
  new ResizeObserver(measureViewport).observe(scrollHost);

  // Virtualization helpers
  function computeVisibleRange() {
    const first = Math.max(
      0,
      Math.floor(state.scrollTop / LINE_HEIGHT) - RENDER_BUFFER,
    );
    const visibleCount =
      Math.ceil(state.viewportHeight / LINE_HEIGHT) + 2 * RENDER_BUFFER;
    const last = Math.min(state.totalLines - 1, first + visibleCount - 1);
    return { first, last };
  }

  function renderPhantoms() {
    contentPhantom.style.height = `${state.docHeightPx}px`;
    gutterPhantom.style.height = `${state.docHeightPx}px`;
  }

  // Render slice using token HTML for content lines
  function renderSlice() {
    const { first, last } = computeVisibleRange();
    const offsetY = first * LINE_HEIGHT;
    contentViewport.style.transform = `translateY(${offsetY}px)`;
    gutterViewport.style.transform = `translateY(${offsetY}px)`;

    const fragContent = document.createDocumentFragment();
    const fragGutter = document.createDocumentFragment();

    for (let i = first; i <= last; i++) {
      // Gutter
      const gl = document.createElement("div");
      gl.className = "line";
      gl.textContent = String(i + 1);
      fragGutter.appendChild(gl);

      // Content
      const cl = document.createElement("div");
      cl.className = "line";
      // Use token HTML (already escaped)
      cl.innerHTML = state.tokens[i] || ""; // for safety
      fragContent.appendChild(cl);
    }

    contentViewport.replaceChildren(fragContent);
    gutterViewport.replaceChildren(fragGutter);
  }

  function renderAll() {
    renderPhantoms();
    renderSlice();
    statusEl.textContent = `Lines: ${state.totalLines} • Tokens cached: ${state.tokens.length}`;
  }

  // Scroll handling
  scrollHost.addEventListener("scroll", () => {
    state.scrollTop = scrollHost.scrollTop;
    state.scrollLeft = scrollHost.scrollLeft;

    // Offset textarea to match virtualized content
    hiddenInput.scrollTop = state.scrollTop;
    hiddenInput.scrollLeft = state.scrollLeft;

    // Transform the virtualized viewport
    const { first } = computeVisibleRange();
    const offsetY = first * LINE_HEIGHT;
    contentViewport.style.transform = `translateY(${offsetY}px)`;
    gutterViewport.style.transform = `translateY(${offsetY}px)`;
  });

  // Incremental update: compare old lines to new, find changed range
  function findChangedRange(oldLines, newLines) {
    const minLen = Math.min(oldLines.length, newLines.length);
    let start = 0;
    while (start < minLen && oldLines[start] === newLines[start]) start++;
    if (start === oldLines.length && start === newLines.length) {
      return null; // identical
    }
    let endOld = oldLines.length - 1;
    let endNew = newLines.length - 1;
    while (
      endOld >= start &&
      endNew >= start &&
      oldLines[endOld] === newLines[endNew]
    ) {
      endOld--;
      endNew--;
    }
    return { start, endOld, endNew }; // inclusive indices
  }

  // Re-tokenize a range of newLines indices [start..endNew]
  function retokenizeRange(newLines, start, endNew) {
    const newTokens = newLines
      .slice(start, endNew + 1)
      .map((l) => tokensToHtml(tokenizeLine(l)));
    // replace in state.tokens
    state.tokens.splice(start, endNew - start + 1, ...newTokens);
  }

  // On input: compute changed range and update tokens + state
  function syncFromInput() {
    const oldText = state.text;
    const oldLines = state.lines.slice();
    const newText = hiddenInput.value;
    const newLines = newText.split("\n");

    const changed = findChangedRange(oldLines, newLines);
    state.text = newText;
    state.selectionStart = hiddenInput.selectionStart;
    state.selectionEnd = hiddenInput.selectionEnd;

    if (!changed) {
      // nothing changed (rare)
      renderAll();
      return;
    }
    const { start, endOld, endNew } = changed;

    // If lines were added/removed, adjust tokens array accordingly and retokenize the changed region
    // For simplicity: we'll rebuild tokens for the changed region and splice into tokens array
    retokenizeRange(newLines, start, endNew);

    // If number of lines changed, ensure tokens length matches newLines length
    if (state.tokens.length > newLines.length) {
      state.tokens.length = newLines.length;
    } else if (state.tokens.length < newLines.length) {
      // append any missing (should not happen because retokenizeRange splices), but safe fallback
      for (let i = state.tokens.length; i < newLines.length; i++) {
        state.tokens[i] = tokensToHtml(tokenizeLine(newLines[i]));
      }
    }

    // Update rendering math and re-render
    renderAll();
  }

  // Input event listeners
  hiddenInput.addEventListener("input", syncFromInput);
  hiddenInput.addEventListener("keyup", syncFromInput);
  hiddenInput.addEventListener("mouseup", syncFromInput);
  hiddenInput.addEventListener("select", syncFromInput);

  // Clicking content will focus the hidden input (mapping caret coordinates to a line/pos is Phase 3)
  content.addEventListener("pointerdown", () => hiddenInput.focus());

  // Initial render
  renderAll();

  // Expose for debugging
  window.__EDITOR_PHASE2__ = {
    state,
    tokenizeLine,
    tokensToHtml,
  };
  function syncHiddenInputSize() {
    hiddenInput.style.left = getComputedStyle(gutter).width;
    hiddenInput.style.width =
      scrollHost.clientWidth - gutter.offsetWidth + "px";
  }
  window.addEventListener("resize", syncHiddenInputSize);
  syncHiddenInputSize();
})();
