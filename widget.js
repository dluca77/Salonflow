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
  var LABEL = scriptTag.getAttribute('data-label') || 'Boek nu';

  // ── SHADOW HOST ─────────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.id = 'kronr-widget-host';
  document.documentElement.appendChild(host);
  var root = host.attachShadow({mode:'open'});

  // ── STYLES (volledig geïsoleerd van de host-site) ──────────────────────
  var style = document.createElement('style');
  style.textContent = [
    "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Inter:wght@400;500;600&display=swap');",
    ":host{all:initial;}",
    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}",
    ".kw-root{position:fixed;bottom:0;" + POSITION + ":0;z-index:2147483000;font-family:'Inter',sans-serif;}",

    /* Zwevende knop */
    ".kw-btn{position:fixed;bottom:22px;" + POSITION + ":22px;display:flex;align-items:center;gap:10px;",
    "background:#1a1714;color:#faf8f4;border:none;padding:14px 20px;cursor:pointer;",
    "box-shadow:0 8px 24px rgba(26,23,20,0.35);font-family:'Inter',sans-serif;",
    "font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;",
    "transition:transform .15s ease, box-shadow .15s ease;z-index:2147483000;border-radius:2px;}",
    ".kw-btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(26,23,20,0.4);}",
    ".kw-btn-dot{width:8px;height:8px;border-radius:50%;background:#8c6d3f;flex-shrink:0;}",
    ".kw-btn svg{width:15px;height:15px;flex-shrink:0;}",

    /* Overlay + modal */
    ".kw-overlay{position:fixed;inset:0;background:rgba(26,23,20,0.55);z-index:2147483001;",
    "display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;",
    "transition:opacity .2s ease;padding:20px;}",
    ".kw-overlay.open{opacity:1;pointer-events:auto;}",

    ".kw-panel{background:#faf8f4;width:min(480px,100%);height:min(760px,94vh);",
    "display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.3);",
    "transform:translateY(16px) scale(0.98);transition:transform .2s ease;overflow:hidden;}",
    ".kw-overlay.open .kw-panel{transform:translateY(0) scale(1);}",

    ".kw-panel-head{display:flex;align-items:center;justify-content:space-between;",
    "padding:14px 18px;background:#1a1714;flex-shrink:0;}",
    ".kw-brand{display:flex;align-items:center;gap:10px;}",
    ".kw-brand-mark{width:26px;height:26px;background:#8c6d3f;display:flex;align-items:center;",
    "justify-content:center;font-family:'Playfair Display',serif;color:#faf8f4;font-size:12px;font-weight:700;}",
    ".kw-brand-name{font-family:'Playfair Display',serif;color:#faf8f4;font-size:15px;font-weight:700;letter-spacing:0.3px;}",
    ".kw-close{width:28px;height:28px;border:none;background:transparent;color:rgba(250,248,244,0.6);",
    "cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;",
    "transition:color .15s;}",
    ".kw-close:hover{color:#faf8f4;}",

    ".kw-panel-body{flex:1;min-height:0;}",
    ".kw-panel-body iframe{width:100%;height:100%;border:none;display:block;}",

    /* Mobiel: volledig scherm */
    "@media(max-width:600px){",
    "  .kw-overlay{padding:0;}",
    "  .kw-panel{width:100%;height:100%;max-height:100vh;}",
    "  .kw-btn{padding:12px 16px;font-size:11px;bottom:16px;" + POSITION + ":16px;}",
    "}"
  ].join('\n');
  root.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.className = 'kw-root';
  wrap.innerHTML =
    '<button class="kw-btn" type="button" aria-label="' + LABEL + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
      '<span>' + LABEL + '</span>' +
    '</button>' +
    '<div class="kw-overlay">' +
      '<div class="kw-panel">' +
        '<div class="kw-panel-head">' +
          '<div class="kw-brand"><div class="kw-brand-mark">K</div><div class="kw-brand-name">Kronr<span style="color:#8c6d3f;">.</span></div></div>' +
          '<button class="kw-close" type="button" aria-label="Sluiten">&#10005;</button>' +
        '</div>' +
        '<div class="kw-panel-body"></div>' +
      '</div>' +
    '</div>';
  root.appendChild(wrap);

  var btn = wrap.querySelector('.kw-btn');
  var overlay = wrap.querySelector('.kw-overlay');
  var closeBtn = wrap.querySelector('.kw-close');
  var body = wrap.querySelector('.kw-panel-body');
  var iframeLoaded = false;

  function openWidget(){
    if(!iframeLoaded){
      var iframe = document.createElement('iframe');
      iframe.src = BASE_URL + '/boeken.html?salon=' + encodeURIComponent(SALON_ID) + '&embed=1';
      iframe.setAttribute('title', 'Afspraak maken');
      body.appendChild(iframe);
      iframeLoaded = true;
    }
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeWidget(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', openWidget);
  closeBtn.addEventListener('click', closeWidget);
  overlay.addEventListener('click', function(e){
    if(e.target === overlay) closeWidget();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeWidget();
  });

  // Luister naar berichten vanuit de iframe (bijv. om te sluiten na bevestigen)
  window.addEventListener('message', function(e){
    if(e.data === 'kronr:close') closeWidget();
  });
})();
