#!/usr/bin/env python3
"""
check-responsive.py — Kronr multi-device layout-check
========================================================
Rendert alle hoofdpagina's op een reeks veelgebruikte device-breedtes
(telefoon, tablet, laptop) en controleert op:
  1. Horizontale overflow (pagina "valt buiten beeld")
  2. JS pageerrors tijdens laden

Gebruik (vanuit de root van de repo):
    python3 tests/check-responsive.py
    python3 tests/check-responsive.py dashboard.html kassa.html   # alleen specifieke pagina's

Vereisten: playwright (python), chromium browser (playwright install chromium)
Dit script start zelf een lokale http.server op poort 8899 voor de duur
van de test -- er is geen internet/Supabase nodig, alles wordt gemockt.

BELANGRIJK — grenzen van dit script:
  Dit draait op de Chromium-engine. Sommige bugs zijn engine-specifiek
  (bv. het 100vh-vs-adresbalk-verschil op iOS Safari) en worden hier
  NIET gevonden. Dit script is een eerste, snelle vangnet voor de
  meeste layout-bugs (overflow, gebroken grids, ontbrekende media
  queries) -- geen vervanging voor een echte check op een iPhone/
  Android/iPad, alleen een manier om dat sneller/minder vaak nodig
  te maken.
"""
import subprocess, sys, time, os, signal
from playwright.sync_api import sync_playwright

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8899

# ── Device-breedtes die we altijd checken ───────────────────────────────────
# (naam, breedte, hoogte) -- van klein naar groot
VIEWPORTS = [
    ("iPhone SE / kleine telefoon", 375, 667),
    ("iPhone standaard",            390, 844),
    ("Android (Samsung-achtig)",    412, 915),
    ("iPad portrait",               768, 1024),
    ("iPad landscape",             1024, 768),
    ("Laptop",                     1280, 800),
    ("Desktop",                    1440, 900),
]

DEFAULT_PAGES = [
    "dashboard.html", "agenda.html", "klanten.html", "kassa.html",
    "medewerkers.html", "diensten.html", "rapportages.html",
    "instellingen.html", "boeken.html", "index.html",
]

MOCK_JS = """
window.supabase = {
  createClient: function(url, key, opts) {
    function chain(finalResult) {
      var handler = {
        get: function(target, prop) {
          if (prop === 'then') { var p = Promise.resolve(finalResult); return p.then.bind(p); }
          if (prop === 'catch') { var p = Promise.resolve(finalResult); return p.catch.bind(p); }
          if (prop === 'single') { return function() { return Promise.resolve(finalResult); }; }
          return function() { return new Proxy({}, handler); };
        }
      };
      return new Proxy({}, handler);
    }
    var salonRow = {
      id: '5bc98b8b-e259-478d-b37b-a4f22e805d73',
      naam: 'Kapsalon Test Amsterdam Noord', type_bedrijf: 'Kapper',
      email: 'test@kronr.nl', plan: 'business',
      created_at: new Date(Date.now()-20*24*60*60*1000).toISOString(), logo_url: null,
      adres: 'Teststraat 1', stad: 'Amsterdam', telefoon: '+31612345678'
    };
    var afspraakRow = {
      id:'apt1', datum_tijd:new Date().toISOString(), status:'gepland',
      klant_naam:'Fatima Elisabeth de Vries-Bakker', klant_email:'fatima@example.com',
      duur_min:45, medewerker_id:'m1',
      diensten:{ naam:'Balayage + Kleuring + Föhnen deluxe behandeling', prijs:145 },
      medewerkers:{ naam:'Sanne-Marie Bakker' }
    };
    var medewerkerRow = { id:'m1', naam:'Sanne-Marie Bakker', rol:'Senior Kapper / Colorist', actief:true };
    var dienstRow = { id:'d1', naam:'Balayage + Kleuring + Föhnen deluxe behandeling', prijs:145, duur_min:90, actief:true };
    var klantRow = { id:'k1', naam:'Fatima Elisabeth de Vries-Bakker', email:'fatima@example.com', telefoon:'+31612345678' };
    return {
      auth: {
        getSession: function(){ return Promise.resolve({data:{session:{user:{id:'u1',email:'test@kronr.nl'}}}}); },
        signOut: function(){ return Promise.resolve({}); }
      },
      rpc: function(name){
        if(name==='get_salon_via_slug') return chain({data:[salonRow], error:null});
        return chain({data:null, error:null});
      },
      from: function(table) {
        if (table === 'salons') return chain({ data: salonRow, error: null });
        if (table === 'afspraken') return chain({ data: [afspraakRow, afspraakRow, afspraakRow], error: null, count: 3 });
        if (table === 'medewerkers') return chain({ data: [medewerkerRow, medewerkerRow], error: null });
        if (table === 'diensten') return chain({ data: [dienstRow, dienstRow, dienstRow, dienstRow], error: null });
        if (table === 'klanten') return chain({ data: [klantRow], error: null, count: 12 });
        return chain({ data: [], error: null, count: 0 });
      }
    };
  }
};
window.fetch = (function(orig){
  return function(url, opts){
    if (String(url).indexOf('workers.dev') !== -1) {
      return Promise.resolve({ ok:true, json:()=>Promise.resolve({insights:['Testinzicht.']}) });
    }
    return orig(url, opts);
  };
})(window.fetch);
"""

CHECK_JS = """
() => {
    const vw = document.documentElement.clientWidth;

    // Bouw een whitelist van selectors die EXPLICIET overflow-x:auto/scroll
    // declareren in de brontekst van de CSS (bv. .periods, .settings-tabs --
    // bewust horizontaal scrollbare tab-balken). Containers die alleen door
    // het CSS-mechanisme "overflow-y:auto upgrade't de andere as ook naar
    // auto" toevallig x-scrollbaar worden (zoals .content, .kassa-body)
    // staan hier NIET in, en worden dus terecht als bug behandeld als er
    // iets in overflowt.
    const whitelist = new Set();
    document.querySelectorAll('style').forEach(styleEl => {
        const css = styleEl.textContent;
        const ruleRe = /([^{}]+)\\{([^{}]*)\\}/g;
        let m;
        while ((m = ruleRe.exec(css))) {
            const selector = m[1], body = m[2];
            if (/overflow-x\\s*:\\s*(auto|scroll)/.test(body) || /overflow\\s*:\\s*(auto|scroll)/.test(body)) {
                selector.split(',').forEach(s => {
                    const cls = s.trim().match(/\\.([a-zA-Z0-9_-]+)/);
                    if (cls) whitelist.add(cls[1]);
                });
            }
        }
    });

    const vh = document.documentElement.clientHeight;
    const offenders = [];
    document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const outOfBounds = r.right > vw + 2 || r.left < -2;
        if (!outOfBounds) return;

        let node = el, contained = false;
        while (node && node !== document.documentElement) {
            const cs = getComputedStyle(node);
            const isExplicitScroller = [...node.classList].some(c => whitelist.has(c));
            if (isExplicitScroller && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) { contained = true; break; }
            if (cs.position === 'fixed') {
                const nr = node.getBoundingClientRect();
                const fullyOffscreen = nr.right <= 0 || nr.left >= vw || nr.bottom <= 0 || nr.top >= vh;
                if (fullyOffscreen) { contained = true; break; }
            }
            node = node.parentElement;
        }
        if (contained) return;

        offenders.push({tag: el.tagName, id: el.id, cls: (el.className||'').toString().slice(0,50),
                         right: Math.round(r.right), left: Math.round(r.left), overflowBy: Math.round(Math.max(r.right-vw, -r.left))});
    });
    offenders.sort((a,b) => b.overflowBy - a.overflowBy);

    const trueOverflow = offenders.length > 0;
    return { vw, scrollWidth: document.documentElement.scrollWidth, trueOverflow, offenders: offenders.slice(0,5) };
}
"""

def run():
    pages = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_PAGES

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT)],
        cwd=REPO_ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)

    results = []  # (page, viewport_name, ok, detail)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for page_file in pages:
                for vname, vw, vh in VIEWPORTS:
                    page = browser.new_page(viewport={"width": vw, "height": vh})
                    page.route("**/supabase-js@2**", lambda route: route.fulfill(
                        status=200, content_type="application/javascript", body=MOCK_JS))
                    page.route("**/fonts.googleapis.com/**", lambda route: route.abort())
                    js_errors = []
                    page.on("pageerror", lambda exc: js_errors.append(str(exc)))
                    try:
                        page.goto(f"http://localhost:{PORT}/{page_file}", wait_until="load", timeout=15000)
                        page.wait_for_timeout(1200)
                        res = page.evaluate(CHECK_JS)
                        ok = (not res["trueOverflow"]) and (len(js_errors) == 0)
                        detail = ""
                        if res["trueOverflow"]:
                            top = res["offenders"][0] if res["offenders"] else None
                            detail = f"overflow {res['scrollWidth']}px>{res['vw']}px" + (f" (o.a. <{top['tag']} class=\"{top['cls']}\">, {top['overflowBy']}px)" if top else "")
                        if js_errors:
                            detail += (" | " if detail else "") + f"JS-fout: {js_errors[0][:100]}"
                        results.append((page_file, vname, ok, detail))
                    except Exception as e:
                        results.append((page_file, vname, False, f"laad-fout: {e}"))
                    finally:
                        page.close()
            browser.close()
    finally:
        server.send_signal(signal.SIGTERM)
        server.wait(timeout=5)

    # ── Rapport ──────────────────────────────────────────────────────────
    print("\n" + "="*78)
    print("RESPONSIVE-CHECK RESULTAAT")
    print("="*78)
    failures = [r for r in results if not r[2]]
    by_page = {}
    for page_file, vname, ok, detail in results:
        by_page.setdefault(page_file, []).append((vname, ok, detail))

    for page_file, rows in by_page.items():
        all_ok = all(ok for _, ok, _ in rows)
        status = "OK" if all_ok else "PROBLEMEN"
        print(f"\n{page_file}: {status}")
        for vname, ok, detail in rows:
            mark = "  ok  " if ok else "FOUT! "
            line = f"  [{mark}] {vname}"
            if detail:
                line += f" -- {detail}"
            print(line)

    print("\n" + "="*78)
    if failures:
        print(f"RESULTAAT: {len(failures)} probleem/problemen gevonden op {len(set(f[0] for f in failures))} pagina('s).")
    else:
        print(f"RESULTAAT: alles OK op {len(pages)} pagina's x {len(VIEWPORTS)} device-breedtes.")
    print("Let op: dit is Chromium-only. Engine-specifieke bugs (bv. Safari 100vh-")
    print("gedrag) kunnen hier gemist worden -- blijf bij twijfel echt testen op device.")
    print("="*78 + "\n")

    return 1 if failures else 0

if __name__ == "__main__":
    sys.exit(run())
