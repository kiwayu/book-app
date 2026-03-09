export type ReaderTheme = "dark" | "light" | "sepia";

const THEMES: Record<ReaderTheme, { bg: string; fg: string }> = {
  dark: { bg: "#0a0a0a", fg: "#e5e5e5" },
  light: { bg: "#ffffff", fg: "#1a1a1a" },
  sepia: { bg: "#f4ecd8", fg: "#5b4636" },
};

export function buildReaderHtml(
  epubUrl: string,
  initialCfi: string | null,
  initialFontSize: number,
  initialTheme: ReaderTheme
) {
  const themeBg = THEMES[initialTheme].bg;
  const cfiArg = initialCfi ? JSON.stringify(initialCfi) : "undefined";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background: ${themeBg}; transition: background .2s; }
    #reader { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="reader"></div>
  <script>
  (function () {
    var themes = ${JSON.stringify(THEMES)};
    var currentTheme = "${initialTheme}";
    var fontSize = ${initialFontSize};
    var totalPages = 0;

    /* ── helpers ─────────────────────────────────── */

    function send(type, data) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify(Object.assign({ type: type }, data || {}))
      );
    }

    function applyTheme(name) {
      currentTheme = name;
      var t = themes[name];
      document.body.style.background = t.bg;
      if (!rendition) return;
      rendition.themes.override("color", t.fg);
      rendition.themes.override("background", t.bg);
    }

    function applyFontSize(px) {
      fontSize = px;
      if (rendition) rendition.themes.fontSize(px + "px");
    }

    function resolveChapter(href) {
      if (!book.navigation || !book.navigation.toc) return "";
      for (var i = 0; i < book.navigation.toc.length; i++) {
        if (book.navigation.toc[i].href.indexOf(href) !== -1)
          return book.navigation.toc[i].label.trim();
      }
      return "";
    }

    /* ── book setup ──────────────────────────────── */

    var book, rendition;

    try {
      book = ePub(${JSON.stringify(epubUrl)});

      rendition = book.renderTo("reader", {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated",
      });

      rendition.themes.default({
        body: { "font-family": "Georgia, serif", "line-height": "1.6", padding: "12px 16px" },
        p:    { "margin-bottom": "0.8em" },
        a:    { color: "inherit" },
      });

      applyTheme(currentTheme);
      applyFontSize(fontSize);

      rendition.display(${cfiArg}).then(function () { send("ready"); });

      /* generate locations for page numbers */
      book.ready
        .then(function () { return book.locations.generate(1600); })
        .then(function () {
          totalPages = book.locations.length();
          send("locationsGenerated", { totalPages: totalPages });
        });

      /* table of contents */
      book.loaded.navigation.then(function (nav) {
        send("tocLoaded", {
          toc: nav.toc.map(function (ch, i) {
            return { id: ch.id, label: ch.label.trim(), href: ch.href, index: i };
          }),
        });
      });

      /* ── relocation → progress updates ─────────── */

      rendition.on("relocated", function (loc) {
        var pct = loc.start.percentage || 0;
        var cfi = loc.start.cfi;
        var page = 0;
        if (book.locations && cfi) {
          page = book.locations.locationFromCfi(cfi) || 0;
        }

        send("locationChanged", {
          cfi: cfi,
          percentage: Math.round(pct * 10000) / 100,
          currentPage: page,
          totalPages: totalPages,
          chapter: resolveChapter(loc.start.href),
        });
      });

      /* re-apply theme when a new chapter iframe loads */
      rendition.on("displayed", function () { applyTheme(currentTheme); });

      /* ── swipe navigation ──────────────────────── */

      var startX = 0, startY = 0;

      rendition.on("touchstart", function (e) {
        startX = e.changedTouches[0].clientX;
        startY = e.changedTouches[0].clientY;
      });

      rendition.on("touchend", function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          dx > 0 ? rendition.prev() : rendition.next();
        }
      });

    } catch (err) {
      send("error", { message: err.message || "Failed to load book" });
    }

    /* ── API for React Native ────────────────────── */

    window.readerApi = {
      nextPage:    function ()     { if (rendition) rendition.next(); },
      prevPage:    function ()     { if (rendition) rendition.prev(); },
      setFontSize: function (px)   { applyFontSize(px); },
      setTheme:    function (name) { applyTheme(name); },
      goToChapter: function (href) { if (rendition) rendition.display(href); },
      goToCfi:     function (cfi)  { if (rendition) rendition.display(cfi); },
    };
  })();
  <\/script>
</body>
</html>`;
}
