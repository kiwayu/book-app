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
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
body{background:${initBg};transition:background .2s}
#viewer{width:100%;height:100%}
#loading{
  position:fixed;inset:0;
  background:${initBg};
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  z-index:100;transition:opacity .3s
}
#loading.gone{opacity:0;pointer-events:none}
#load-icon{font-size:40px;margin-bottom:14px;animation:pulse 1.6s ease-in-out infinite}
#load-text{font-family:-apple-system,sans-serif;font-size:14px;opacity:.45}
@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
#err{
  position:fixed;inset:0;background:${initBg};
  display:none;flex-direction:column;
  align-items:center;justify-content:center;
  padding:32px;z-index:101
}
#err-msg{font-family:-apple-system,sans-serif;font-size:15px;color:#dc2626;text-align:center;line-height:1.6}
</style>
</head><body>
<div id="loading"><div id="load-icon">📖</div><div id="load-text">Opening book…</div></div>
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

/* ── CSS for chapter iframes ──────────────────────── */
function chapterCss(cfg){
  var th=THEMES[cfg.theme]||THEMES.light;
  return[
    "html,body{",
    "  background:"+th.bg+"!important;",
    "  color:"+th.fg+"!important;",
    "  font-family:"+(FONTS[cfg.font]||FONTS.georgia)+"!important;",
    "  font-size:"+cfg.fontSize+"px!important;",
    "  line-height:"+cfg.lineHeight+"!important;",
    "  padding:0 "+cfg.marginWidth+"px!important;",
    "}",
    "a{color:"+th.link+"!important;}",
    "p{margin-bottom:.75em;}",
    "h1,h2,h3,h4,h5{margin:1em 0 .5em;font-family:"+(FONTS[cfg.font]||FONTS.georgia)+"!important;}",
    "img{max-width:100%!important;height:auto!important;}",
  ].join("\\n");
}

function injectIntoView(view,cfg){
  try{
    var doc=view.document||(view.iframe&&view.iframe.contentDocument);
    if(!doc)return;
    var el=doc.getElementById("bb-st");
    if(el)el.remove();
    var st=doc.createElement("style");
    st.id="bb-st";st.textContent=chapterCss(cfg);
    (doc.head||doc.documentElement).appendChild(st);
  }catch(e){}
}

function injectAll(cfg){
  if(!rendition||!rendition.manager)return;
  var views=(rendition.manager.views&&(rendition.manager.views._views||rendition.manager.views.views))||[];
  for(var i=0;i<views.length;i++)injectIntoView(views[i],cfg);
}

/* ── apply settings ───────────────────────────────── */
function applySettings(json){
  var incoming;
  try{incoming=JSON.parse(json);}catch(e){return;}
  var prevLayout=s.font+"_"+s.fontSize+"_"+s.lineHeight+"_"+s.marginWidth;
  Object.assign(s,incoming);
  var newLayout=s.font+"_"+s.fontSize+"_"+s.lineHeight+"_"+s.marginWidth;
  var th=THEMES[s.theme]||THEMES.light;
  document.body.style.background=th.bg;
  var loadEl=document.getElementById("loading");
  if(loadEl)loadEl.style.background=th.bg;
  injectAll(s);
  if(newLayout!==prevLayout&&rendition&&currentCfi){
    rendition.display(currentCfi).catch(function(){});
  }
}

/* ── book init ────────────────────────────────────── */
try{
  book=ePub(${urlArg});
  rendition=book.renderTo("viewer",{
    width:"100%",height:"100%",
    spread:"none",flow:"paginated"
  });

  rendition.on("rendered",function(section,view){injectIntoView(view,s);});

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
      post("tap",{});
    }
  });

}catch(err){showError("Failed to load book: "+(err&&err.message||"unknown error"));}

/* ── public API ───────────────────────────────────── */
window.readerApi={
  nextPage:      function(){if(rendition)rendition.next();},
  prevPage:      function(){if(rendition)rendition.prev();},
  goToChapter:   function(href){if(rendition)rendition.display(href);},
  goToCfi:       function(cfi){if(rendition)rendition.display(cfi);},
  applySettings: applySettings,
};
})();<\/script>
</body></html>`;
}
