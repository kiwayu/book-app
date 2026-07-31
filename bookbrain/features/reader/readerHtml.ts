import jszipSrc from "./vendor/jszipMin";
import epubjsSrc from "./vendor/epubjsMin";

export type ReaderTheme = "light" | "sepia" | "dark" | "night";
export type ReaderFont  = "georgia" | "palatino" | "charter" | "system";

export interface ReaderSettings {
  theme:       ReaderTheme;
  font:        ReaderFont;
  fontSize:    number;   // px  13–26
  lineHeight:  number;   // multiplier  1.3–2.0
  marginWidth: number;   // px  8–56
  /* Exact palette (e.g. an app theme like Catppuccin). When set, the book
     renders these colours directly instead of the classic filter theme. */
  bg?:         string | null;
  fg?:         string | null;
  link?:       string | null;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme:       "light",
  font:        "georgia",
  fontSize:    17,
  lineHeight:  1.6,
  marginWidth: 20,
};

const INIT_BG: Record<ReaderTheme, string> = {
  light: "#fafafa",
  sepia: "#f4ecd8",
  dark:  "#1c1c1c",
  night: "#000000",
};

export function buildReaderHtml(
  epubUrl:    string,
  initialCfi: string | null,
  settings:   ReaderSettings
): string {
  const initBg      = INIT_BG[settings.theme];
  const cfiArg      = initialCfi ? JSON.stringify(initialCfi) : "null";
  const urlArg      = JSON.stringify(epubUrl);
  const settingsArg = JSON.stringify(settings);

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<script>${jszipSrc}<\/script>
<script>${epubjsSrc}<\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
body{background:${initBg};transition:background .2s}
#viewer{width:100%;height:100%;padding:0 ${settings.marginWidth}px}
#loading{
  position:fixed;inset:0;
  background:${initBg};
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  z-index:100;transition:opacity .3s
}
#loading.gone{opacity:0;pointer-events:none}
#load-icon{width:34px;height:34px;border-radius:50%;border:3px solid rgba(127,127,127,.22);border-top-color:#3f82bc;margin-bottom:16px;animation:spin .8s linear infinite}
#load-text{font-family:-apple-system,sans-serif;font-size:14px;opacity:.45}
@keyframes spin{to{transform:rotate(360deg)}}
#err{
  position:fixed;inset:0;background:${initBg};
  display:none;flex-direction:column;
  align-items:center;justify-content:center;
  padding:32px;z-index:101
}
#err-msg{font-family:-apple-system,sans-serif;font-size:15px;color:#dc2626;text-align:center;line-height:1.6}
</style>
</head><body>
<div id="loading"><div id="load-icon"></div><div id="load-text">Opening book…</div></div>
<div id="err"><div id="err-msg"></div></div>
<div id="viewer"></div>
<script>(function(){
var THEMES={
  light:{bg:"#fafafa",fg:"#1a1a1a",link:"#3f82bc"},
  sepia:{bg:"#f4ecd8",fg:"#5b4636",link:"#8b5e3c"},
  dark: {bg:"#1c1c1c",fg:"#d4d4d4",link:"#88BDF2"},
  night:{bg:"#000000",fg:"#a0a0a0",link:"#6A89A7"}
};
/* Theme is applied as a CSS *filter* on the outer #viewer element (which we
   fully control). A filter is a paint effect the browser composites over
   everything inside #viewer — INCLUDING the cross-origin book iframe — so it
   works where touching the iframe DOM is blocked. Dark = invert the viewer;
   under invert a white page becomes dark and black text becomes light. */
var THEME_VIEW={
  light:{filter:"none",             pageBg:"#fafafa", edgeBg:"#fafafa"},
  sepia:{filter:"sepia(0.55) brightness(1.02) contrast(0.96)", pageBg:"#f4ecd8", edgeBg:"#f4ecd8"},
  dark: {filter:"invert(1) hue-rotate(180deg)",               pageBg:"#ffffff", edgeBg:"#1c1c1c"},
  night:{filter:"invert(1) hue-rotate(180deg) brightness(0.82)", pageBg:"#ffffff", edgeBg:"#000000"}
};
var FONTS={
  georgia: "Georgia,'Times New Roman',serif",
  palatino:"'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif",
  charter: "Charter,'Bitstream Charter',Georgia,serif",
  system:  "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
};
var s=${settingsArg};
var currentCfi=${cfiArg};
var totalPages=0;
var book=null,rendition=null;

/* ── messaging ────────────────────────────────────── */
function post(type,data){
  try{window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:type},data||{})));}catch(e){}
}

/* ── overlays ─────────────────────────────────────── */
function hideLoading(){
  var el=document.getElementById("loading");
  if(el){el.classList.add("gone");setTimeout(function(){el.style.display="none";},350);}
}
function showError(msg){
  hideLoading();
  var el=document.getElementById("err"),txt=document.getElementById("err-msg");
  if(el&&txt){el.style.display="flex";txt.textContent=msg;}
  post("error",{message:msg});
}

/* ── chapter title resolver ───────────────────────── */
/* Populated from the flattened nav tree once navigation loads. Searching the
   flat list matters: epubs nest chapters under parts, and a top-level-only
   scan returns "" for every nested chapter — which is most of them in a book
   that has parts at all. */
var flatToc=[];
function chapterOf(href){
  if(!href)return"";
  for(var i=0;i<flatToc.length;i++){
    if(flatToc[i].href&&flatToc[i].href.indexOf(href)!==-1)return flatToc[i].label;
  }
  // Nav tree not loaded yet: fall back to the raw top-level list.
  if(!book||!book.navigation||!book.navigation.toc)return"";
  var toc=book.navigation.toc;
  for(var j=0;j<toc.length;j++){
    if(toc[j].href&&toc[j].href.indexOf(href)!==-1)return(toc[j].label||"").trim();
  }
  return"";
}

/* THEME: applied entirely on the outer #viewer via a CSS filter (see above).
   This is the guaranteed path — no iframe access. */
function applyTheme(){
  var v=document.getElementById("viewer");
  var loadEl=document.getElementById("loading");
  if(s.bg&&s.fg){
    // Exact palette (app theme): colour the content directly (via contentCss on
    // the content hook), no filter — so images look normal and colours are true.
    if(v){
      v.style.padding="0 "+s.marginWidth+"px";
      v.style.filter="none";v.style.webkitFilter="none";
      v.style.background=s.bg;
    }
    document.body.style.background=s.bg;
    if(loadEl)loadEl.style.background=s.bg;
    repaintContents();
    return;
  }
  var cfg=THEME_VIEW[s.theme]||THEME_VIEW.light;
  if(v){
    v.style.padding="0 "+s.marginWidth+"px";
    v.style.filter=cfg.filter;
    v.style.webkitFilter=cfg.filter;
    v.style.background=cfg.pageBg;   // white under invert → dark page
  }
  document.body.style.background=cfg.edgeBg;      // margins (not inverted)
  if(loadEl)loadEl.style.background=cfg.edgeBg;
}

/* TYPOGRAPHY (font/size/spacing) — best effort via epub.js's own Contents API.
   No colours here: the filter owns colour, so this never fights it. */
function contentCss(){
  var ff=(FONTS[s.font]||FONTS.georgia);
  var css="html,body{font-family:"+ff+" !important;line-height:"+s.lineHeight+" !important;"
    +"font-size:"+s.fontSize+"px !important;}"
    +"body *{font-family:"+ff+" !important;line-height:"+s.lineHeight+" !important;}"
    +"p{margin-bottom:.75em;}"
    +"h1,h2,h3,h4,h5,h6{margin:1em 0 .5em;}"
    +"img,svg{max-width:100% !important;height:auto !important;}";
  if(s.bg&&s.fg){
    // exact palette: paint colours here (the filter path leaves colours alone)
    var link=s.link||s.fg;
    css+="html,body{background:"+s.bg+" !important;color:"+s.fg+" !important;}"
      +"body *{color:"+s.fg+" !important;}"
      +"a,a *{color:"+link+" !important;}";
  }
  return css;
}
function paintContents(contents){
  try{if(contents&&contents.addStylesheetCss)contents.addStylesheetCss(contentCss(), "bb-type");}catch(e){}
}
function repaintContents(){
  if(!rendition||!rendition.getContents)return;
  try{
    var cs=rendition.getContents();
    if(cs&&cs.document)cs=[cs];
    if(cs&&cs.length)for(var i=0;i<cs.length;i++)paintContents(cs[i]);
  }catch(e){}
}

/* ── apply settings ───────────────────────────────── */
function applySettings(json){
  var incoming;
  try{incoming=JSON.parse(json);}catch(e){return;}
  var prevLayout=s.font+"_"+s.fontSize+"_"+s.lineHeight+"_"+s.marginWidth;
  Object.assign(s,incoming);
  var newLayout=s.font+"_"+s.fontSize+"_"+s.lineHeight+"_"+s.marginWidth;
  applyTheme();                    // theme (colour) — instant, guaranteed
  repaintContents();               // typography — best effort
  if(newLayout!==prevLayout&&rendition){
    try{
      var v=document.getElementById("viewer");
      rendition.resize(v.clientWidth-2*s.marginWidth,v.clientHeight);
    }catch(e){}
    if(currentCfi)rendition.display(currentCfi).then(repaintContents).catch(function(){});
  }
}

/* ── book init ────────────────────────────────────── */
try{
  book=ePub(${urlArg});
  rendition=book.renderTo("viewer",{
    width:"100%",height:"100%",
    spread:"none",flow:"paginated"
  });

  /* Style every section as epub.js renders it — runs inside epub.js so it can
     reach the content. This is what makes the theme (incl. default) actually
     apply to the book text. */
  if(rendition.hooks&&rendition.hooks.content){
    rendition.hooks.content.register(function(contents){paintContents(contents);});
  }

  applyTheme();

  var dp=currentCfi?rendition.display(currentCfi):rendition.display();
  dp.then(function(){hideLoading();post("ready");})
    .catch(function(e){showError("Could not display book: "+(e&&e.message||"unknown error"));});

  book.ready
    .then(function(){return book.locations.generate(1600);})
    .then(function(){totalPages=book.locations.length();post("locationsGenerated",{totalPages:totalPages});})
    .catch(function(){});

  /* Flatten the nav tree: epubs nest chapters under parts ("books within the
     book"), so a flat nav.toc.map drops every nested chapter. Recurse into
     subitems and carry depth for indentation. */
  function flattenToc(items,level,out){
    for(var i=0;i<items.length;i++){
      var ch=items[i];
      out.push({
        id:ch.id||(level+"_"+out.length),
        label:(ch.label||"").trim(),
        href:ch.href,
        level:level
      });
      if(ch.subitems&&ch.subitems.length)flattenToc(ch.subitems,level+1,out);
    }
    return out;
  }
  book.loaded.navigation
    .then(function(nav){
      flatToc=flattenToc(nav.toc||[],0,[]);   // also feeds chapterOf()
      post("tocLoaded",{toc:flatToc});
    }).catch(function(){});

  rendition.on("relocated",function(loc){
    var pct=loc.start.percentage||0;
    var cfi=loc.start.cfi;
    currentCfi=cfi;
    var page=0;
    if(book.locations&&cfi){try{page=book.locations.locationFromCfi(cfi)||0;}catch(e){}}
    /* epub.js already paginates the current section; reuse its counts. */
    var disp=(loc.start&&loc.start.displayed)||{};
    post("locationChanged",{
      cfi:cfi,
      percentage:Math.round(pct*10000)/100,
      currentPage:page,
      totalPages:totalPages,
      chapterPage:disp.page||0,
      chapterPages:disp.total||0,
      chapter:chapterOf(loc.start.href||"")
    });
  });

  /* Tap/swipe: epub.js does NOT emit rendition touch events, so bind real
     DOM listeners to each chapter iframe document as it renders. Zones use
     the iframe's own width (the book text lives inside it). */
  function zoneAction(x,w){
    if(x<w*0.3)rendition.prev();
    else if(x>w*0.7)rendition.next();
    else post("tap",{});
  }
  function wireInput(doc){
    if(!doc||doc.__bbWired)return;
    doc.__bbWired=true;
    var win=doc.defaultView||window,sx=0,sy=0,moved=false;
    doc.addEventListener("touchstart",function(e){
      var t=e.changedTouches[0];sx=t.clientX;sy=t.clientY;moved=false;
    },{passive:true});
    doc.addEventListener("touchend",function(e){
      var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>40){dx>0?rendition.prev():rendition.next();}
      else if(Math.abs(dx)<12&&Math.abs(dy)<12){moved=true;zoneAction(t.clientX,win.innerWidth);}
    },{passive:true});
    /* Non-touch (web/dev): click drives the same zones. Guard so a click
       synthesized after a touch does not double-fire. */
    doc.addEventListener("click",function(e){
      if(moved){moved=false;return;}
      zoneAction(e.clientX,win.innerWidth);
    });
  }
  rendition.on("rendered",function(section,view){
    wireInput((view&&view.document)||(view&&view.iframe&&view.iframe.contentDocument));
  });

}catch(err){showError("Failed to load book: "+(err&&err.message||"unknown error"));}

/* ── chapter text extraction (RSVP speed reading) ──── */
/* Paginated flow keeps the whole section in one iframe document, so the
   block-level text we read here is the entire current chapter — exactly
   what the RSVP engine tokenizes. */
function currentDocs(){
  var docs=[];
  try{
    if(rendition&&typeof rendition.getContents==="function"){
      var cs=rendition.getContents()||[];
      if(cs&&cs.document)cs=[cs];           // some versions return one Contents
      for(var i=0;i<cs.length;i++)if(cs[i]&&cs[i].document)docs.push(cs[i].document);
    }
  }catch(e){}
  if(!docs.length){
    var views=(rendition&&rendition.manager&&rendition.manager.views&&(rendition.manager.views._views||rendition.manager.views.views))||[];
    for(var j=0;j<views.length;j++){
      var v=views[j],d=v.document||(v.iframe&&v.iframe.contentDocument);
      if(d)docs.push(d);
    }
  }
  return docs;
}
var BLOCK_SEL="p,li,blockquote,h1,h2,h3,h4,h5,h6";
/* Blocks that actually carry text, in reading order. The RSVP token stream is
   built from exactly this list, so token.paragraphIndex indexes straight back
   into it — that is what lets goToBlock() land the page on the stopping word.
   Empty spacer blocks must stay skipped in BOTH places or the mapping drifts. */
function textBlocks(doc){
  var out=[];
  if(!doc||!doc.body)return out;
  var blocks=doc.body.querySelectorAll(BLOCK_SEL);
  for(var i=0;i<blocks.length;i++){
    if((blocks[i].textContent||"").replace(/\\s+/g," ").trim())out.push(blocks[i]);
  }
  return out;
}
function collectParagraphs(doc){
  var out=[];
  if(!doc||!doc.body)return out;
  var blocks=textBlocks(doc);
  if(blocks.length){
    for(var i=0;i<blocks.length;i++){
      out.push((blocks[i].textContent||"").replace(/\\s+/g," ").trim());
    }
  }else{
    var body=(doc.body.textContent||"").replace(/\\r/g,"");
    var parts=body.split(/\\n\\s*\\n/);
    for(var k=0;k<parts.length;k++){
      var p=parts[k].replace(/\\s+/g," ").trim();
      if(p)out.push(p);
    }
  }
  return out;
}
function chapterParagraphs(){
  var paras=[],docs=currentDocs();
  for(var i=0;i<docs.length;i++){
    var got=collectParagraphs(docs[i]);
    for(var k=0;k<got.length;k++)paras.push(got[k]);
  }
  return paras;
}
function currentHref(){
  return (rendition&&rendition.location&&rendition.location.start&&rendition.location.start.href)||"";
}
function getChapterText(){
  try{
    var h=currentHref();
    /* href identifies WHICH chapter these tokens are: a resume pointer without
       it can land part-way into a different, merely-long-enough chapter. */
    post("chapterText",{paragraphs:chapterParagraphs(),chapter:chapterOf(h),href:h});
  }catch(e){post("chapterText",{paragraphs:[],chapter:"",href:""});}
}

/* Auto-advance when speed reading finishes a chapter: actually navigate the
   book to the next spine section with text, then hand its paragraphs back.
   Moving the rendition (rather than reading ahead invisibly) is what keeps the
   page underneath correct when the overlay is closed. Sections with no text —
   covers, nav pages — are skipped, so the reader never lands on a blank one. */
/* Generation counter: closing the overlay bumps it, so an advance already in
   flight goes quiet instead of racing the close and dragging the page forward
   a chapter. Every async continuation re-checks it before touching anything. */
var advGen=0;
/* A rendition that fails systematically would otherwise walk the entire spine,
   one real display() per section. Bound the skip run. */
var MAX_SKIP=20;

function nextChapter(){
  var gen=++advGen;
  var startHref=currentHref();
  function alive(){return gen===advGen;}
  function stop(){
    // Nothing further to read: put the book back where the walk started rather
    // than leaving it parked on whatever blank section we stopped at.
    if(!alive())return;
    if(startHref){try{rendition.display(startHref);}catch(e){}}
    post("chapterText",{paragraphs:[],chapter:"",endOfBook:true});
  }
  if(!book||!rendition||!book.spine){stop();return;}
  var cur=null;
  try{cur=book.spine.get(startHref);}catch(e){}
  if(!cur||typeof cur.index!=="number"){stop();return;}
  function step(n,skipped){
    if(!alive())return;
    if(skipped>=MAX_SKIP){stop();return;}
    var sec=null;
    try{sec=book.spine.get(n);}catch(e){}
    if(!sec){stop();return;}
    rendition.display(sec.href).then(function(){
      if(!alive())return;
      var paras=chapterParagraphs();
      if(!paras.length){step(n+1,skipped+1);return;}
      repaintContents();
      post("chapterText",{
        paragraphs:paras,
        chapter:chapterOf(sec.href),
        href:sec.href,
        spineIndex:n,
        advanced:true
      });
    }).catch(function(){
      // A rejected display is a failure, not an empty chapter. Keep walking,
      // but it counts against the skip budget so we cannot loop the book.
      step(n+1,skipped+1);
    });
  }
  step(cur.index+1,0);
}

/* Called before the overlay closes: invalidates any in-flight advance so the
   close-time seek is the last navigation to win. */
function cancelAdvance(){advGen++;}

/* Move the page to the Nth text block of the current chapter — where speed
   reading stopped (RSVP tokens carry that index). Posts currentCfi afterwards
   so the caller can drop its marker on the page the reader actually landed on,
   not the stale one it was showing while the overlay was up. */
function goToBlock(n){
  function fallback(){post("currentCfi",{cfi:currentCfi});}
  try{
    var cs=rendition&&rendition.getContents&&rendition.getContents();
    if(cs&&cs.document)cs=[cs];
    if(!cs||!cs.length){fallback();return;}
    /* paragraphIndex is minted over the CONCATENATION of every doc in
       chapterParagraphs(), so consume it the same way: walk the docs in order,
       subtracting each one's block count, instead of clamping into doc 0. */
    var idx=Math.max(0,n),c=null,el=null;
    for(var i=0;i<cs.length;i++){
      if(!cs[i]||!cs[i].document)continue;
      var blocks=textBlocks(cs[i].document);
      if(!blocks.length)continue;
      if(idx<blocks.length){c=cs[i];el=blocks[idx];break;}
      idx-=blocks.length;
      c=cs[i];el=blocks[blocks.length-1];   // past the end → last block seen
    }
    if(!c||!el||!c.cfiFromNode){fallback();return;}
    var cfi=c.cfiFromNode(el);
    if(!cfi){fallback();return;}
    /* Post the CFI we computed, not currentCfi: relocated is not guaranteed to
       have run, and the marker must land on the block we asked for. */
    rendition.display(cfi)
      .then(function(){post("currentCfi",{cfi:cfi});})
      .catch(fallback);
  }catch(e){fallback();}
}

/* ── caret (pick RSVP start word) ──────────────────────
   Draw a blinking caret at a tapped word and report its word index in the
   current chapter, so speed reading can start exactly there. Runs against the
   current section document (same handle epub.js styles); wrapped so a
   cross-origin failure just disables the caret. */
function caretDoc(){
  try{
    var cs=rendition.getContents();
    if(cs&&cs.document)cs=[cs];
    if(cs&&cs.length&&cs[0])return cs[0].document;
  }catch(e){}
  return null;
}
function bbCaretEl(doc){
  var el=doc.getElementById("bb-caret");
  if(!el){
    el=doc.createElement("div");
    el.id="bb-caret";
    el.style.cssText="position:absolute;width:2px;background:currentColor;opacity:.85;z-index:99999;pointer-events:none;border-radius:1px;";
    var st=doc.createElement("style");
    st.textContent="#bb-caret{animation:bbcaretblink 1s step-end infinite}@keyframes bbcaretblink{50%{opacity:0}}";
    (doc.head||doc.body).appendChild(st);
    doc.body.appendChild(el);
  }
  return el;
}
function caretRange(doc,x,y){
  if(doc.caretRangeFromPoint)return doc.caretRangeFromPoint(x,y);
  if(doc.caretPositionFromPoint){
    var p=doc.caretPositionFromPoint(x,y);
    if(p){var r=doc.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true);return r;}
  }
  return null;
}
/* Count whitespace words before (node,offset) in reading order — matches the
   RSVP tokeniser closely enough to land on the tapped word. */
function wordIndexBefore(root,node,offset){
  var count=0,done=false;
  (function walk(n){
    if(done||!n)return;
    if(n.nodeType===3){
      var txt=(n===node)?String(n.nodeValue).slice(0,offset):String(n.nodeValue||"");
      var m=txt.match(/\\S+/g);if(m)count+=m.length;
      if(n===node)done=true;
      return;
    }
    for(var i=0;i<n.childNodes.length&&!done;i++)walk(n.childNodes[i]);
  })(root);
  return count;
}
function placeCaret(doc,x,y){
  var rng=caretRange(doc,x,y);
  if(!rng||!rng.startContainer)return -1;
  try{
    var rect=rng.getBoundingClientRect();
    var win=doc.defaultView||{};
    var el=bbCaretEl(doc);
    el.style.left=(rect.left+(win.scrollX||0))+"px";
    el.style.top=(rect.top+(win.scrollY||0))+"px";
    el.style.height=((rect.height||18))+"px";
    el.style.display="block";
  }catch(e){}
  return wordIndexBefore(doc.body,rng.startContainer,rng.startOffset||0);
}

/* ── public API ───────────────────────────────────── */
window.readerApi={
  nextPage:       function(){if(rendition)rendition.next();},
  prevPage:       function(){if(rendition)rendition.prev();},
  goToChapter:    function(href){if(rendition)rendition.display(href);},
  goToCfi:        function(cfi){if(rendition)rendition.display(cfi);},
  getCurrentCfi:  function(){post("currentCfi",{cfi:currentCfi});},
  goToPercentage: function(p){if(rendition&&book&&book.locations){var c=book.locations.cfiFromPercentage(Math.max(0,Math.min(1,p)));if(c)rendition.display(c);}},
  applySettings:  applySettings,
  getChapterText: getChapterText,
  nextChapter:    nextChapter,
  cancelAdvance:  cancelAdvance,
  goToBlock:      goToBlock,
  /* Place the caret at a WebView-relative point; posts the word index. */
  caretAt:        function(mx,my){
    try{
      var doc=caretDoc();if(!doc)return;
      var ifr=document.querySelector("#viewer iframe");if(!ifr)return;
      var rect=ifr.getBoundingClientRect();
      var idx=placeCaret(doc,mx-rect.left,my-rect.top);
      if(idx>=0)post("caret",{wordIndex:idx});
    }catch(e){}
  },
  caretHide:      function(){
    try{var doc=caretDoc();if(!doc)return;var el=doc.getElementById("bb-caret");if(el)el.style.display="none";}catch(e){}
  },
  /* Post the epub's own metadata (author etc.) so the library can fill blanks. */
  extractMeta:    function(){
    try{
      book.loaded.metadata.then(function(m){
        post("meta",{
          title:(m&&m.title)||"",
          creator:(m&&m.creator)||"",
          publisher:(m&&m.publisher)||"",
          pubdate:(m&&(m.pubdate||m.date))||"",
          language:(m&&m.language)||""
        });
      }).catch(function(){post("meta",{});});
    }catch(e){post("meta",{});}
  },
  /* Resolve the epub's cover to a base64 data URL and post it back. epub.js
     parses the OPF + inflates the image from the zip archive for us. */
  extractCover:   function(){
    try{
      if(!book){post("cover",{dataUrl:null});return;}
      book.coverUrl().then(function(url){
        if(!url){post("cover",{dataUrl:null});return;}
        return fetch(url).then(function(r){return r.blob();}).then(function(blob){
          var fr=new FileReader();
          fr.onload=function(){post("cover",{dataUrl:fr.result});};
          fr.onerror=function(){post("cover",{dataUrl:null});};
          fr.readAsDataURL(blob);
        });
      }).catch(function(){post("cover",{dataUrl:null});});
    }catch(e){post("cover",{dataUrl:null});}
  },
};
})();<\/script>
</body></html>`;
}
