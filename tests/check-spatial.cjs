const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function fixture(reduce = false, finePointer = true) {
  const handlers = {},
    styles = {};
  const scene = {
    style: { setProperty: (key, value) => (styles[key] = value) },
    addEventListener: (type, fn) => (handlers[type] = fn),
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 600, height: 500 }),
  };
  vm.runInNewContext(fs.readFileSync("spatial.js", "utf8"), {
    document: { querySelector: () => scene, addEventListener() {} },
    matchMedia: (query) => ({
      matches: query.includes("reduced") ? reduce : finePointer,
      addEventListener() {},
    }),
    addEventListener: (type) =>
      assert.notEqual(type, "scroll", "scroll must not control the scene"),
  });
  return { handlers, styles };
}
const normal = fixture();
normal.handlers.pointermove({ clientX: 600, clientY: 500 });
assert.equal(normal.styles["--ry"], "2deg");
normal.handlers.pointerleave();
assert.equal(normal.styles["--ry"], "0deg");
for (const f of [fixture(true), fixture(false, false)]) {
  f.handlers.pointermove({ clientX: 600, clientY: 500 });
  assert.deepEqual(f.styles, {}, "touch and reduced motion have no tilt");
}
const home = fs.readFileSync("index.html", "utf8");
assert.ok(!home.includes('class="brand-sculpture"'));
assert.ok(!home.includes("Scroll of kies"));
console.log(
  "Spatial checks passed: no scroll-driven steps, no sculpture, reduced motion, touch and pointer reset.",
);
