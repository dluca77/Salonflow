const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync("spatial.js", "utf8");
new vm.Script(source);
const css = fs.readFileSync("sticky-story.css", "utf8");
assert.ok(css.includes("position: sticky"));
assert.ok(source.includes("animation.currentTime = progress * 1000"));
assert.ok(!source.includes("preventDefault"));
assert.ok(source.includes('reduced.addEventListener("change", build)'));
assert.ok(
  !fs.readFileSync("index.html", "utf8").includes('class="brand-sculpture"'),
);
console.log(
  "Spatial static checks passed. Browser checks cover pinned positions, forward/reverse steps and mobile layout.",
);
