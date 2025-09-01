/** Phase 1 — Core editor:
 * - Hidden textarea for input
 * - Virtualized per-line rendering (<div> per line)
 * - Accurate line numbers (including trailing empties)
 * - Scroll sync gutter/content
 * - No syntax highlight, no selection overlays yet
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
  "message": "Welcome to Phase 1!",
  "note": "This is a CodeMirror-like core with virtualization.",
  "todo": ["highlighting", "selection overlay", "auto-pairing"]
}
`;

  // State
  const state = {
    text: INITIAL_TEXT,
    // Keep text as lines with trailing empties preserved:
    get lines() {
      // Using split with plain '\n' preserves trailing empty line entries
      return this.text.split("\n");
    },
    // Caret within the linear text buffer; selection will come later
    selectionStart: INITIAL_TEXT.length,
    selectionEnd: INITIAL_TEXT.length,
    // Scroll
    scrollTop: 0,
    scrollLeft: 0,
    // Viewport metrics
    viewportHeight: 0,
    viewportWidth: 0,
    // Derived
    get totalLines() {
      return this.lines.length;
    },
    get docHeightPx() {
      return this.totalLines * LINE_HEIGHT;
    },
  };

  // --- Initialization
  hiddenInput.value = state.text;
  // Keep caret visible and functional
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

  // --- Rendering (virtualized)
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
    // Set total scrollable height via phantom blocks
    contentPhantom.style.height = `${state.docHeightPx}px`;
    gutterPhantom.style.height = `${state.docHeightPx}px`;
  }

  function renderSlice() {
    const { first, last } = computeVisibleRange();

    // Offset the viewport slice to align with the scrolled position
    const offsetY = first * LINE_HEIGHT;
    contentViewport.style.transform = `translateY(${offsetY}px)`;
    gutterViewport.style.transform = `translateY(${offsetY}px)`;

    // Build DOM for content lines
    const fragContent = document.createDocumentFragment();
    const fragGutter = document.createDocumentFragment();

    for (let i = first; i <= last; i++) {
      // Gutter line number
      const gl = document.createElement("div");
      gl.className = "line";
      gl.textContent = String(i + 1);
      fragGutter.appendChild(gl);

      // Content line text (no highlighting yet)
      const cl = document.createElement("div");
      cl.className = "line";
      // Keep spaces as-is and prevent collapsing; white-space:pre is in CSS
      cl.textContent = state.lines[i] ?? "";
      fragContent.appendChild(cl);
    }

    // Swap content
    contentViewport.replaceChildren(fragContent);
    gutterViewport.replaceChildren(fragGutter);
  }

  function renderAll() {
    renderPhantoms();
    renderSlice();
    statusEl.textContent = `Lines: ${state.totalLines} • ScrollTop: ${state.scrollTop}px`;
  }

  // --- Scroll handling (single scroll host)
  scrollHost.addEventListener(
    "scroll",
    () => {
      state.scrollTop = scrollHost.scrollTop;
      state.scrollLeft = scrollHost.scrollLeft;

      // Keep hidden input's scroll aligned so caret positions feel natural later
      hiddenInput.scrollTop = state.scrollTop;
      hiddenInput.scrollLeft = state.scrollLeft;

      renderSlice();
    },
    { passive: true },
  );

  // --- Input handling (hidden textarea is single source of truth)
  function syncFromInput() {
    state.text = hiddenInput.value;
    state.selectionStart = hiddenInput.selectionStart;
    state.selectionEnd = hiddenInput.selectionEnd;
    renderAll();
  }

  hiddenInput.addEventListener("input", syncFromInput);
  hiddenInput.addEventListener("keyup", syncFromInput);
  hiddenInput.addEventListener("mouseup", syncFromInput);
  hiddenInput.addEventListener("select", syncFromInput);

  // Clicking in content should focus input (Phase 2 will map positions)
  content.addEventListener("pointerdown", () => {
    hiddenInput.focus();
  });

  // Initial render
  renderAll();

  // --- Optional: expose for debugging
  window.__EDITOR_STATE__ = state;
})();
