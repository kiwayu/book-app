/**
 * @jest-environment jsdom
 *
 * Executes the reader's injected JS for real, instead of grepping the string it
 * lives in. The old assertions (`expect(html).toContain("nextChapter:")`) pass
 * even if the function body is empty, which is how the close/advance race
 * shipped uncaught.
 *
 * The generated document inlines ~200KB of vendored epub.js, so we pull out
 * just our own IIFE and run it against a fake `ePub`. Everything below the
 * bridge (spine walking, block seeking, message posting) is then real code.
 */
import { buildReaderHtml, DEFAULT_SETTINGS } from "../readerHtml";

/* ── extract our script from the generated document ── */
const MARK = "<script>(function(){";
const END = "})();</script>";

function scriptBody(): string {
  const html = buildReaderHtml("file:///b.epub", null, DEFAULT_SETTINGS);
  const s = html.lastIndexOf(MARK);
  const e = html.lastIndexOf(END);
  if (s < 0 || e < 0) throw new Error("reader script markers not found");
  return html.slice(s + MARK.length, e);
}

/* ── fakes ───────────────────────────────────────── */

interface Section { index: number; href: string }

/** A section's rendered document, built from paragraph text. */
function docWith(paras: string[]): Document {
  const d = document.implementation.createHTMLDocument("s");
  d.body.innerHTML = paras.map((p) => `<p>${p}</p>`).join("");
  return d;
}

interface Harness {
  api: any;
  messages: any[];
  displayed: string[];
  setContents: (docs: Document[]) => void;
  flush: () => Promise<void>;
}

/**
 * @param sections spine, in order
 * @param textFor  paragraphs each section renders (empty array = no prose)
 * @param opts.rejectHrefs hrefs whose display() rejects
 */
function boot(
  sections: Section[],
  textFor: (href: string) => string[],
  opts: { rejectHrefs?: string[]; toc?: any[] } = {}
): Harness {
  document.body.innerHTML =
    '<div id="loading"><div id="load-icon"></div><div id="load-text"></div></div>' +
    '<div id="err"><div id="err-msg"></div></div><div id="viewer"></div>';

  const messages: any[] = [];
  const displayed: string[] = [];
  (window as any).ReactNativeWebView = {
    postMessage: (s: string) => messages.push(JSON.parse(s)),
  };

  let contents: any[] = [
    { document: docWith(["start"]), cfiFromNode: () => "cfi(start)" },
  ];
  const location = { start: { href: sections[0].href, index: 0, displayed: {} } };

  const rendition = {
    hooks: { content: { register: () => {} } },
    on: () => {},
    resize: () => {},
    next: () => {},
    prev: () => {},
    getContents: () => contents,
    location,
    display: (target?: string) => {
      displayed.push(target ?? "<initial>");
      if (opts.rejectHrefs?.includes(target ?? "")) {
        return Promise.reject(new Error("render failed"));
      }
      const sec = sections.find((x) => x.href === target);
      if (sec) {
        location.start.href = sec.href;
        location.start.index = sec.index;
        const paras = textFor(sec.href);
        contents = [
          {
            document: docWith(paras),
            cfiFromNode: (el: Element) => `cfi(${sec.href}:${el.textContent})`,
          },
        ];
      }
      return Promise.resolve();
    },
  };

  const book = {
    renderTo: () => rendition,
    ready: Promise.resolve(),
    loaded: {
      navigation: Promise.resolve({ toc: opts.toc ?? [] }),
      metadata: Promise.resolve({}),
    },
    locations: {
      generate: () => Promise.resolve(),
      length: () => 0,
      locationFromCfi: () => 0,
    },
    spine: {
      get: (t: any) =>
        typeof t === "number"
          ? sections.find((x) => x.index === t) ?? null
          : sections.find((x) => x.href === t) ?? null,
    },
    coverUrl: () => Promise.resolve(null),
  };

  // eslint-disable-next-line no-new-func
  new Function("ePub", scriptBody())(() => book);

  return {
    api: (window as any).readerApi,
    messages,
    displayed,
    setContents: (docs) => {
      contents = docs.map((d) => ({
        document: d,
        cfiFromNode: (el: Element) => `cfi(${el.textContent})`,
      }));
    },
    flush: async () => {
      for (let i = 0; i < 300; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const chapterMsgs = (h: Harness) =>
  h.messages.filter((m) => m.type === "chapterText");

/* ── nextChapter ─────────────────────────────────── */

describe("readerApi.nextChapter", () => {
  it("skips sections with no prose and streams the first real chapter", async () => {
    const h = boot(
      [
        { index: 0, href: "c0.xhtml" },
        { index: 1, href: "cover.xhtml" },
        { index: 2, href: "nav.xhtml" },
        { index: 3, href: "c1.xhtml" },
      ],
      (href) => (href === "c1.xhtml" ? ["real text here"] : [])
    );

    h.api.nextChapter();
    await h.flush();

    const msg = chapterMsgs(h).pop();
    expect(msg.advanced).toBe(true);
    expect(msg.paragraphs).toEqual(["real text here"]);
    expect(msg.spineIndex).toBe(3);
    // cover + nav were really navigated past, not guessed at
    expect(h.displayed).toEqual(
      expect.arrayContaining(["cover.xhtml", "nav.xhtml", "c1.xhtml"])
    );
  });

  it("restores the starting section when nothing is left to read", async () => {
    const h = boot(
      [
        { index: 0, href: "c0.xhtml" },
        { index: 1, href: "back.xhtml" },
      ],
      (href) => (href === "c0.xhtml" ? ["start"] : [])
    );

    h.api.nextChapter();
    await h.flush();

    const msg = chapterMsgs(h).pop();
    expect(msg.endOfBook).toBe(true);
    // must not leave the book parked on the blank trailing section
    expect(h.displayed[h.displayed.length - 1]).toBe("c0.xhtml");
  });

  it("caps the skip run so a failing rendition cannot walk the whole spine", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      index: i,
      href: `s${i}.xhtml`,
    }));
    const h = boot(many, () => []); // nothing anywhere has text

    h.api.nextChapter();
    await h.flush();

    expect(chapterMsgs(h).pop().endOfBook).toBe(true);
    const walked = h.displayed.filter((d) => d.startsWith("s")).length;
    expect(walked).toBeLessThanOrEqual(22); // 20 cap + restore + initial
  });

  it("treats a rejected display as a failure and keeps walking", async () => {
    const h = boot(
      [
        { index: 0, href: "c0.xhtml" },
        { index: 1, href: "broken.xhtml" },
        { index: 2, href: "c1.xhtml" },
      ],
      (href) => (href === "c0.xhtml" ? ["start"] : ["text"]),
      { rejectHrefs: ["broken.xhtml"] }
    );

    h.api.nextChapter();
    await h.flush();

    const msg = chapterMsgs(h).pop();
    expect(msg.advanced).toBe(true);
    expect(msg.spineIndex).toBe(2); // recovered past the broken section
  });

  it("goes quiet when the advance is cancelled mid-walk", async () => {
    const h = boot(
      [
        { index: 0, href: "c0.xhtml" },
        { index: 1, href: "cover.xhtml" },
        { index: 2, href: "c1.xhtml" },
      ],
      (href) => (href === "c0.xhtml" || href === "c1.xhtml" ? ["text"] : [])
    );

    h.api.nextChapter();
    h.api.cancelAdvance(); // user closed the overlay before it landed
    await h.flush();

    // No advanced reply, and no endOfBook either — the walk simply stops.
    expect(chapterMsgs(h)).toHaveLength(0);
  });
});

/* ── goToBlock ───────────────────────────────────── */

describe("readerApi.goToBlock", () => {
  it("seeks the Nth text block and reports the CFI it computed", async () => {
    const h = boot([{ index: 0, href: "c0.xhtml" }], () => []);
    h.setContents([docWith(["alpha", "beta", "gamma"])]);

    h.api.goToBlock(1);
    await h.flush();

    expect(h.displayed).toContain("cfi(beta)");
    expect(h.messages.filter((m) => m.type === "currentCfi").pop().cfi).toBe(
      "cfi(beta)"
    );
  });

  it("skips empty blocks exactly as the token stream does", async () => {
    const h = boot([{ index: 0, href: "c0.xhtml" }], () => []);
    const d = document.implementation.createHTMLDocument("s");
    // A spacer <p></p> must not consume an index, or the seek drifts.
    d.body.innerHTML = "<p>alpha</p><p></p><p>beta</p>";
    h.setContents([d]);

    h.api.goToBlock(1);
    await h.flush();

    expect(h.displayed).toContain("cfi(beta)");
  });

  it("walks across multiple documents instead of clamping into the first", async () => {
    const h = boot([{ index: 0, href: "c0.xhtml" }], () => []);
    // paragraphIndex is minted over the concatenation of both docs
    h.setContents([docWith(["a1", "a2"]), docWith(["b1", "b2"])]);

    h.api.goToBlock(3); // → second block of the SECOND document
    await h.flush();

    expect(h.displayed).toContain("cfi(b2)");
  });

  it("clamps past the end rather than throwing", async () => {
    const h = boot([{ index: 0, href: "c0.xhtml" }], () => []);
    h.setContents([docWith(["only"])]);

    h.api.goToBlock(99);
    await h.flush();

    expect(h.messages.filter((m) => m.type === "currentCfi")).toHaveLength(1);
  });
});

/* ── chapter labels ──────────────────────────────── */

describe("chapter labels", () => {
  it("resolves chapters nested under parts, not just top-level entries", async () => {
    const h = boot(
      [
        { index: 0, href: "c0.xhtml" },
        { index: 1, href: "c1.xhtml" },
      ],
      (href) => (href === "c1.xhtml" ? ["text"] : ["start"]),
      {
        toc: [
          {
            label: "Part One",
            href: "part1.xhtml",
            subitems: [{ label: "The Real Chapter", href: "c1.xhtml" }],
          },
        ],
      }
    );
    await h.flush(); // let book.loaded.navigation populate the flat toc

    h.api.nextChapter();
    await h.flush();

    expect(chapterMsgs(h).pop().chapter).toBe("The Real Chapter");
  });
});
