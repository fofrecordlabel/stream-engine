export const T = {
  bg: "#050506", bg1: "#08080b", bg2: "#0d0d10", card: "#101013", cardH: "#141418",
  b0: "rgba(255,255,255,.055)", b1: "rgba(255,255,255,.1)", b2: "rgba(255,255,255,.16)",
  gn: "#7fff00", gnB: "rgba(127,255,0,.25)", gnGl: "rgba(127,255,0,.12)",
  gnGl2: "rgba(127,255,0,.06)", gnGl3: "rgba(127,255,0,.03)",
  w: "#fff", g50: "#f0f0f0", g100: "#d0d0d0", g200: "#969696", g300: "#606060", g400: "#363636",
  gold: "#ffc740", red: "#ff4060", blue: "#38bdf8",
};

export const GLOBAL_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
:root{--se-right-gutter:24px}
body{background:#050506;color:#fff;font-family:'Outfit',system-ui,sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
/* Right-side "safe gutter" so UI isn't blocked by IDE panels (Cursor, devtools, etc.) */
.se-safe-root{padding-right:var(--se-right-gutter)}
@media(max-width:700px){:root{--se-right-gutter:0px}}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:#050506}
::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:3px}
button,input,select,textarea{font-family:inherit;border:none;outline:none}
img{display:block;max-width:100%}
input[type=range]{-webkit-appearance:none;height:3px;background:rgba(255,255,255,.1);border-radius:3px;cursor:pointer;width:100%}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#7fff00;box-shadow:0 0 8px rgba(127,255,0,.6);cursor:pointer}
input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:5px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.04);cursor:pointer;flex-shrink:0;transition:all .15s;position:relative}
input[type=checkbox]:checked{background:#7fff00;border-color:#7fff00}
input[type=checkbox]:checked::after{content:'';position:absolute;top:2px;left:5px;width:5px;height:8px;border-right:2px solid #000;border-bottom:2px solid #000;transform:rotate(45deg)}
a{color:inherit;text-decoration:none}

@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.65)}}
@keyframes glow{0%,100%{text-shadow:0 0 30px rgba(127,255,0,.25)}50%{text-shadow:0 0 70px rgba(127,255,0,.6),0 0 110px rgba(127,255,0,.15)}}
@keyframes checkPop{0%{transform:scale(0) rotate(-12deg)}65%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes barRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes borderGlow{0%,100%{box-shadow:0 0 0 2px rgba(127,255,0,.35)}50%{box-shadow:0 0 0 2px rgba(127,255,0,.75),0 0 28px rgba(127,255,0,.1)}}
@keyframes successBounce{0%{transform:scale(.75);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes arrowBounce{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
@keyframes drawerSlide{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes toastIn{from{opacity:0;transform:translateX(-24px) scale(.95)}to{opacity:1;transform:translateX(0) scale(1)}}
@keyframes toastOut{from{opacity:1;transform:translateX(0) scale(1)}to{opacity:0;transform:translateX(-16px) scale(.95)}}

.fu1{animation:fadeUp .5s ease both}
.fu2{animation:fadeUp .5s .08s ease both}
.fu3{animation:fadeUp .5s .16s ease both}
.fu4{animation:fadeUp .5s .24s ease both}
.fu5{animation:fadeUp .5s .32s ease both}

.bp{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:linear-gradient(135deg,#7fff00 0%,#6de800 50%,#5ac800 100%);color:#000;font-weight:800;font-size:14px;letter-spacing:.01em;padding:13px 24px;border-radius:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:0 0 0 1px rgba(127,255,0,.35),0 4px 20px rgba(127,255,0,.2),inset 0 1px 0 rgba(255,255,255,.22);position:relative;overflow:hidden;transition:all .2s cubic-bezier(.34,1.56,.64,1)}
.bp::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.18) 0%,transparent 55%);border-radius:inherit;pointer-events:none}
.bp:hover{background:linear-gradient(135deg,#96ff14 0%,#7fff00 50%,#65d800 100%);box-shadow:0 0 0 1px rgba(127,255,0,.6),0 8px 32px rgba(127,255,0,.35),inset 0 1px 0 rgba(255,255,255,.25);transform:translateY(-2px) scale(1.01)}
.bp:active{transform:translateY(0) scale(.98)}
.bp:disabled{opacity:.35;cursor:not-allowed;transform:none !important;box-shadow:none !important}
.bp .arr{display:inline-block;transition:transform .2s}
.bp:hover .arr{animation:arrowBounce .5s ease infinite}

.bs{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:rgba(255,255,255,.045);color:#fff;font-weight:500;font-size:14px;padding:13px 24px;border-radius:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;border:1px solid rgba(255,255,255,.1);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);transition:all .2s ease}
.bs:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);transform:translateY(-1px)}
.bs:active{transform:translateY(0) scale(.98)}

.bt{display:inline-flex;align-items:center;gap:5px;background:none;color:#969696;font-size:13px;font-weight:500;cursor:pointer;padding:2px 0;transition:color .15s;border:none}
.bt:hover{color:#fff}

.chip{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.02em;white-space:nowrap;transition:all .15s;cursor:pointer}
.cg{background:rgba(127,255,0,.1);color:#7fff00;border:1px solid rgba(127,255,0,.25)}
.co{background:rgba(255,199,64,.1);color:#ffc740;border:1px solid rgba(255,199,64,.22)}
.cb{background:rgba(255,255,255,.06);color:#d0d0d0;border:1px solid rgba(255,255,255,.1)}
.cr{background:rgba(255,64,96,.1);color:#ff4060;border:1px solid rgba(255,64,96,.22)}
.csel{background:#7fff00;color:#000;border:1px solid #7fff00}
.chip:not(.csel):hover{border-color:rgba(127,255,0,.4);color:#7fff00}

.crd{background:linear-gradient(145deg,#101013,#0d0d10);border:1px solid rgba(255,255,255,.055);border-radius:16px;position:relative;overflow:hidden;transition:all .22s}
.crd:hover{border-color:rgba(255,255,255,.1);transform:translateY(-3px);box-shadow:0 16px 48px rgba(0,0,0,.55)}

.drawer{position:fixed;top:0;left:0;bottom:0;width:260px;background:#09090c;border-right:1px solid rgba(255,255,255,.07);z-index:500;animation:drawerSlide .25s cubic-bezier(.25,.46,.45,.94) both;overflow-y:auto}
.drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:499;animation:fadeIn .2s ease both;backdrop-filter:blur(4px)}

.na{color:#969696;font-size:14px;font-weight:500;cursor:pointer;background:none;border:none;padding:0;transition:color .15s}
.na:hover{color:#fff}

.sni{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;cursor:pointer;width:100%;text-align:left;border:none;font-size:13.5px;font-weight:500;transition:all .15s;border-left:2px solid transparent;background:none;color:#606060}
.sni:hover{background:rgba(255,255,255,.04);color:#d0d0d0}
.sni.act{background:rgba(127,255,0,.08);color:#7fff00;border-left-color:#7fff00;font-weight:700}

.scroll-x{overflow-x:auto;scrollbar-width:none}
.scroll-x::-webkit-scrollbar{display:none}
.mono{font-family:'DM Mono',monospace}

@media(max-width:700px){
  .hide-sm{display:none !important}
  .bp,.bs{font-size:13.5px;padding:10px 16px}
  .sm-full{width:100%;justify-content:center}
  nav{overflow:hidden}
  nav .bp{padding:8px 16px 8px 13px;font-size:12.5px;min-width:0}
}
`;
