import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildReaderHtml, DEFAULT_SETTINGS } from "@/features/reader/readerHtml";
import { writeReaderHtmlFile, readAccessRoot } from "@/services/localEpub";
import { applyEpubMeta } from "@/services/epubMeta";
import { saveCover } from "@/services/epubCover";

/*
 * Extracts author/metadata + cover from an epub at IMPORT time using a hidden
 * WebView (epub.js needs a DOM). Reuses the reader HTML so there's one code
 * path. If anything fails or times out it just finishes — the reader's
 * first-open extraction is the fallback.
 */
export function EpubExtractor({
  bookId,
  epubUrl,
  onDone,
}: {
  bookId: number;
  epubUrl: string;
  onDone: () => void;
}) {
  const ref = useRef<WebView>(null);
  const html = useMemo(() => buildReaderHtml(epubUrl, null, DEFAULT_SETTINGS), [epubUrl]);
  const isFile = epubUrl.startsWith("file://");
  const [uri, setUri] = useState<string | null>(null);
  const [fileReady, setFileReady] = useState(!isFile);

  const doneRef = useRef(false);
  const gotMeta = useRef(false);
  const gotCover = useRef(false);

  const finish = () => {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  };
  const maybeFinish = () => {
    if (gotMeta.current && gotCover.current) finish();
  };

  useEffect(() => {
    let cancelled = false;
    if (isFile) {
      writeReaderHtmlFile(html, "extract.html")
        .then((u) => { if (!cancelled) { setUri(u); setFileReady(true); } })
        .catch(() => { if (!cancelled) setFileReady(true); });
    }
    return () => { cancelled = true; };
  }, [html, isFile]);

  // Hard timeout so a bad/huge epub never leaves the extractor mounted forever.
  useEffect(() => {
    const t = setTimeout(finish, 20000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = async (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "ready") {
        ref.current?.injectJavaScript(
          "window.readerApi.extractMeta();window.readerApi.extractCover();true;"
        );
      } else if (msg.type === "meta") {
        await applyEpubMeta(bookId, msg);
        gotMeta.current = true;
        maybeFinish();
      } else if (msg.type === "cover") {
        if (msg.dataUrl) await saveCover(bookId, msg.dataUrl);
        gotCover.current = true;
        maybeFinish();
      } else if (msg.type === "error") {
        finish();
      }
    } catch {
      /* ignore malformed messages */
    }
  };

  if (!fileReady) return null;

  return (
    <WebView
      ref={ref}
      source={uri ? { uri } : { html }}
      originWhitelist={["*"]}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      allowingReadAccessToURL={readAccessRoot()}
      mixedContentMode="always"
      pointerEvents="none"
      style={st.hidden}
    />
  );
}

const st = StyleSheet.create({
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, left: -9999, top: -9999 },
});
