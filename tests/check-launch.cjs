const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
for (const file of ["index.html", "demo/index.html", "login/index.html"]) {
  const html = fs.readFileSync(file, "utf8");
  for (const [, attrs, code] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    if (!/src=|application\/ld\+json/i.test(attrs))
      new vm.Script(code, { filename: file });
  }
  for (const [, href, label] of html.matchAll(
    /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    if (
      /Start.*gratis|launchupdate|Blijf op de hoogte|Houd me op de hoogte/i.test(
        label,
      )
    )
      assert.ok(
        href.includes("#registreer"),
        `${file}: registration CTA goes to login`,
      );
  }
}
const home = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("rebrand.js", "utf8");
new vm.Script(script, { filename: "rebrand.js" });
assert.ok(
  /url\.search\s*\+\s*url\.hash/.test(script),
  "UTM handling must retain registration hash",
);
assert.ok(
  !home.includes('id="heroCycleWord"'),
  "Hero must not type or delete its heading",
);
assert.ok(home.includes('aria-controls="mobile-menu"'));
assert.ok(home.includes('aria-label="Menu sluiten"'));
assert.ok(
  fs
    .readFileSync("login/index.html", "utf8")
    .includes("const PRE_LAUNCH = true;"),
  "Do not open public registration as part of design changes",
);
console.log(
  "Launch checks passed: JS syntax, registration links, UTM hash, fixed heading, menu semantics and pre-launch guard.",
);
// Internal routes/assets must resolve on the static host; anchors must exist.
const ids = new Set([...home.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
for (const [, url] of home.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (url.startsWith("#"))
    assert.ok(ids.has(url.slice(1)), `Missing anchor ${url}`);
  if (url.startsWith("/")) {
    let path = url.split(/[?#]/)[0];
    if (path.endsWith("/")) path += "index.html";
    assert.ok(fs.existsSync("." + path), `Missing local route/asset ${url}`);
  }
}
assert.equal((home.match(/<h1\b/g) || []).length, 1);
assert.ok(script.includes("prefers-reduced-motion"));
assert.ok(home.includes("Fictieve salon en voorbeelddata"));
console.log(
  "Rebrand checks passed: local routes/assets, anchor targets, one H1, motion preference and example-data label.",
);
