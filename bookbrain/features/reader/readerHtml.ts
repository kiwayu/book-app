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
function chapterOf(href){
  if(!book||!book.navigation||!book.navigation.toc)return"";
  var toc=book.navigation.toc;
  for(var i=0;i<toc.length;i++){
    if(toc[i].href&&toc[i].href.indexOf(href)!==-1)return toc[i].label.trim();
  }
  return"";
}

/* ── theme plumbing ───────────────────────────────────
   Styling goes through epub.js's themes API, never hand-injected
   <style> tags: themes participate in epub.js's own layout pass, so
   pagination is computed WITH our font/line-height. Injecting styles
   after layout is what clipped text off the right and bottom edges.
   Page margins live on the OUTER #viewer container (box-sizing:
   border-box), so epub.js sizes its columns to the padded box. */
function applyTheme(){
  var th=THEMES[s.theme]||THEMES.light;
  document.body.style.background=th.bg;
  var loadEl=document.getElementById("loading");
  if(loadEl)loadEl.style.background=th.bg;
  var v=document.getElementById("viewer");
  if(v)v.style.padding="0 "+s.marginWidth+"px";
  if(!rendition)return;
  rendition.themes.default({
    "html,body":{
      "background":th.bg+" !important",
      "color":th.fg+" !important",
      "font-family":(FONTS[s.font]||FONTS.georgia)+" !important",
      "line-height":String(s.lineHeight)+" !important"
    },
    "a":{"color":th.link+" !important"},
    "p":{"margin-bottom":".75em"},
    "h1,h2,h3,h4,h5":{"margin":"1em 0 .5em"},
    "img":{"max-width":"100% !important","height":"auto !important"}
  });
  rendition.themes.fontSize(s.fontSize+"px");
}

/* ── apply settings ───────────────────────────────── */
function applySettings(json){
  var incoming;
  try{incoming=JSON.parse(json);}catch(e){return;}
  var prevLayout=s.font+"_"+s.fontSize+"_"+s.lineHeight+"_"+s.marginWidth;
  Object.assign(s,incoming);
  var newLayout=s.font+"_"+s.fontSize+"_"+s.lineHeight+"_"+s.marginWidth;
  applyTheme();
  if(newLayout!==prevLayout&&rendition){
    try{
      var v=document.getElementById("viewer");
      rendition.resize(v.clientWidth-2*s.marginWidth,v.clientHeight);
    }catch(e){}
    if(currentCfi)rendition.display(currentCfi).catch(function(){});
  }
}

/* ── book init ────────────────────────────────────── */
try{
  book=ePub(${urlArg});
  rendition=book.renderTo("viewer",{
    width:"100%",height:"100%",
    spread:"none",flow:"paginated"
  });

  applyTheme();

  var dp=currentCfi?rendition.display(currentCfi):rendition.display();
  dp.then(function(){hideLoading();post("ready");})
    .catch(function(e){showError("Could not display book: "+(e&&e.message||"unknown error"));});

  book.ready
    .then(function(){return book.locations.generate(1600);})
    .then(function(){totalPages=book.locations.length();post("locationsGenerated",{totalPages:totalPages});})
    .catch(function(){});

  book.loaded.navigation
    .then(function(nav){
      post("tocLoaded",{toc:nav.toc.map(function(ch,i){
        return{id:ch.id||String(i),label:ch.label.trim(),href:ch.href,index:i};
      })});
    }).catch(function(){});

  rendition.on("relocated",function(loc){
    var pct=loc.start.percentage||0;
    var cfi=loc.start.cfi;
    currentCfi=cfi;
    var page=0;
    if(book.locations&&cfi){try{page=book.locations.locationFromCfi(cfi)||0;}catch(e){}}
    post("locationChanged",{
      cfi:cfi,
      percentage:Math.round(pct*10000)/100,
      currentPage:page,
      totalPages:totalPages,
      chapter:chapterOf(loc.start.href||"")
    });
  });

  var sx=0,sy=0;
  rendition.on("touchstart",function(e){sx=e.changedTouches[0].clientX;sy=e.changedTouches[0].clientY;});
  rendition.on("touchend",function(e){
    var dx=e.changedTouches[0].clientX-sx;
    var dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>40){
      dx>0?rendition.prev():rendition.next();
    } else if(Math.abs(dx)<12&&Math.abs(dy)<12){
      /* MoonReader-style zones: left third = back, right third =
         forward, middle = toggle controls. */
      var x=e.changedTouches[0].clientX,w=window.innerWidth;
      if(x<w*0.3)rendition.prev();
      else if(x>w*0.7)rendition.next();
      else post("tap",{});
    }
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
function collectParagraphs(doc){
  var out=[];
  if(!doc||!doc.body)return out;
  var blocks=doc.body.querySelectorAll("p,li,blockquote,h1,h2,h3,h4,h5,h6");
  if(blocks&&blocks.length){
    for(var i=0;i<blocks.length;i++){
      var txt=(blocks[i].textContent||"").replace(/\\s+/g," ").trim();
      if(txt)out.push(txt);
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
function getChapterText(){
  try{
    var paras=[],docs=currentDocs();
    for(var i=0;i<docs.length;i++){
      var got=collectParagraphs(docs[i]);
      for(var k=0;k<got.length;k++)paras.push(got[k]);
    }
    var href=(rendition&&rendition.location&&rendition.location.start&&rendition.location.start.href)||"";
    post("chapterText",{paragraphs:paras,chapter:chapterOf(href)});
  }catch(e){post("chapterText",{paragraphs:[],chapter:""});}
}

/* ── public API ───────────────────────────────────── */
window.readerApi={
  nextPage:       function(){if(rendition)rendition.next();},
  prevPage:       function(){if(rendition)rendition.prev();},
  goToChapter:    function(href){if(rendition)rendition.display(href);},
  goToCfi:        function(cfi){if(rendition)rendition.display(cfi);},
  applySettings:  applySettings,
  getChapterText: getChapterText,
};
})();<\/script>
</body></html>`;
}
