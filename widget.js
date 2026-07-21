(function(){
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────────
  var BASE_URL = 'https://kronr.nl'; // pas aan naar je eigen domein indien nodig

  // Voorkom dubbele injectie als het script per ongeluk 2x geladen wordt
  if(window.__kronrWidgetLoaded) return;
  window.__kronrWidgetLoaded = true;

  var scriptTag = document.currentScript || (function(){
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var SALON_ID = scriptTag.getAttribute('data-salon');
  if(!SALON_ID){
    console.error('[Kronr widget] Ontbrekende data-salon attribuut op de widget <script>-tag.');
    return;
  }

  var POSITION = scriptTag.getAttribute('data-position') || 'right'; // 'right' of 'left'
  var OPPOSITE = POSITION === 'right' ? 'left' : 'right';
  var LABEL = scriptTag.getAttribute('data-label') || 'Boek nu';

  // ── SHADOW HOST ─────────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.id = 'kronr-widget-host';
  document.documentElement.appendChild(host);
  var root = host.attachShadow({mode:'open'});

  // ── STYLES (volledig geïsoleerd van de host-site) ──────────────────────
  var style = document.createElement('style');
  style.textContent = [
    "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700&family=Inter:wght@400;500;600;700&display=swap');",
    ":host{all:initial;}",
    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}",
    ".kw-root{font-family:'Inter',sans-serif;}",

    /* Onzichtbare klik-buiten-om-te-sluiten laag (geen donkere overlay, blijft modern/licht) */
    ".kw-catcher{position:fixed;inset:0;z-index:2147483000;display:none;}",
    ".kw-catcher.open{display:block;}",

    /* Zwevende knop — pilvorm */
    ".kw-btn{position:fixed;bottom:24px;" + POSITION + ":24px;display:flex;align-items:center;gap:9px;",
    "background:#1a1714;color:#faf8f4;border:none;padding:15px 22px;cursor:pointer;",
    "box-shadow:0 10px 30px -6px rgba(26,23,20,0.45);font-family:'Inter',sans-serif;",
    "font-size:13px;font-weight:600;letter-spacing:0.2px;",
    "border-radius:100px;",
    "transition:transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s ease, opacity .2s ease;",
    "z-index:2147483001;}",
    ".kw-btn:hover{transform:translateY(-3px);box-shadow:0 14px 34px -6px rgba(26,23,20,0.5);}",
    ".kw-btn:active{transform:translateY(-1px);}",
    ".kw-btn.hidden{opacity:0;pointer-events:none;transform:scale(.9);}",
    ".kw-btn svg{width:16px;height:16px;flex-shrink:0;color:#c9a35f;}",

    /* Paneel — verankerd rechtsonder, niet gecentreerd */
    ".kw-panel{position:fixed;bottom:24px;" + POSITION + ":24px;z-index:2147483001;",
    "background:#faf8f4;width:min(400px,calc(100vw - 32px));height:min(640px,calc(100vh - 110px));",
    "display:flex;flex-direction:column;overflow:hidden;",
    "border-radius:20px;",
    "box-shadow:0 24px 60px -12px rgba(26,23,20,0.35), 0 0 0 1px rgba(26,23,20,0.04);",
    "transform-origin:bottom " + POSITION + ";",
    "transform:scale(0.92) translateY(12px);opacity:0;pointer-events:none;",
    "transition:transform .25s cubic-bezier(.2,.8,.2,1), opacity .2s ease;}",
    ".kw-panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto;}",

    ".kw-panel-head{display:flex;align-items:center;justify-content:space-between;",
    "padding:14px 16px;background:#1a1714;flex-shrink:0;}",
    ".kw-brand{display:flex;align-items:center;gap:9px;}",
    ".kw-brand-mark{width:24px;height:24px;background:#8c6d3f;display:flex;align-items:center;",
    "justify-content:center;font-family:'Playfair Display',serif;color:#faf8f4;font-size:11px;font-weight:700;",
    "border-radius:7px;flex-shrink:0;}",
    ".kw-brand-name{font-family:'Playfair Display',serif;color:#faf8f4;font-size:14px;font-weight:700;letter-spacing:0.2px;}",
    ".kw-close{width:26px;height:26px;border:none;background:rgba(255,255,255,0.08);color:rgba(250,248,244,0.7);",
    "cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;",
    "border-radius:50%;transition:background .15s, color .15s;flex-shrink:0;}",
    ".kw-close:hover{background:rgba(255,255,255,0.16);color:#faf8f4;}",

    ".kw-panel-body{flex:1;min-height:0;}",
    ".kw-panel-body iframe{width:100%;height:100%;border:none;display:block;}",

    /* Mobiel: volledig scherm, schuift op vanaf onderin */
    "@media(max-width:600px){",
    "  .kw-btn{padding:13px 18px;font-size:12px;bottom:16px;" + POSITION + ":16px;}",
    "  .kw-panel{bottom:0;" + POSITION + ":0;" + OPPOSITE + ":0;width:100%;height:100%;",
    "    max-height:100vh;border-radius:0;transform-origin:bottom center;}",
    "  .kw-panel-head{padding:16px 18px;padding-top:max(16px, env(safe-area-inset-top));}",
    "}"
  ].join('\n');
  root.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.className = 'kw-root';
  wrap.innerHTML =
    '<div class="kw-catcher"></div>' +
    '<button class="kw-btn" type="button" aria-label="' + LABEL + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="4"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
      '<span>' + LABEL + '</span>' +
    '</button>' +
    '<div class="kw-panel">' +
      '<div class="kw-panel-head">' +
        '<div class="kw-brand"><div class="kw-brand-mark">K</div><div class="kw-brand-name">Kronr<span style="color:#c9a35f;">.</span></div></div>' +
        '<button class="kw-close" type="button" aria-label="Sluiten">&#10005;</button>' +
      '</div>' +
      '<div class="kw-panel-body"></div>' +
    '</div>';
  root.appendChild(wrap);

  var btn = wrap.querySelector('.kw-btn');
  var panel = wrap.querySelector('.kw-panel');
  var catcher = wrap.querySelector('.kw-catcher');
  var closeBtn = wrap.querySelector('.kw-close');
  var body = wrap.querySelector('.kw-panel-body');
  var iframeLoaded = false;

  function openWidget(){
    if(!iframeLoaded){
      var iframe = document.createElement('iframe');
      iframe.src = BASE_URL + '/boeken/?salon=' + encodeURIComponent(SALON_ID) + '&embed=1';
      iframe.setAttribute('title', 'Afspraak maken');
      body.appendChild(iframe);
      iframeLoaded = true;
    }
    panel.classList.add('open');
    catcher.classList.add('open');
    btn.classList.add('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeWidget(){
    panel.classList.remove('open');
    catcher.classList.remove('open');
    btn.classList.remove('hidden');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', openWidget);
  closeBtn.addEventListener('click', closeWidget);
  catcher.addEventListener('click', closeWidget);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeWidget();
  });

  // Luister naar berichten vanuit de iframe (bijv. om te sluiten na bevestigen)
  window.addEventListener('message', function(e){
    if(e.data === 'kronr:close') closeWidget();
  });
})();
