const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function fixture(reduce = false) {
  const handlers = {},
    sceneHandlers = {},
    buttons = [],
    frames = [],
    stages = [];
  let top = 350;
  const motion = { matches: reduce, addEventListener() {} };
  const scene = {
    style: { setProperty() {} },
    addEventListener: (type, fn) => (sceneHandlers[type] = fn),
    getBoundingClientRect: () => ({
      top,
      bottom: top + 530,
      height: 530,
      width: 600,
      left: 0,
    }),
    dispatchEvent: (event) => stages.push(event.detail),
  };
  const document = {
    hidden: false,
    querySelector: () => scene,
    querySelectorAll: () => [{ addEventListener: (_, fn) => buttons.push(fn) }],
    addEventListener() {},
  };
  vm.runInNewContext(fs.readFileSync("spatial.js", "utf8"), {
    document,
    innerHeight: 900,
    matchMedia: (query) =>
      query.includes("reduced") ? motion : { matches: true },
    addEventListener: (name, fn) => (handlers[name] = fn),
    requestAnimationFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    CustomEvent: function (type, init) {
      this.type = type;
      this.detail = init.detail;
    },
  });
  const flush = () => {
    while (frames.length) frames.shift()();
  };
  flush();
  return {
    stages,
    frames,
    flush,
    buttons,
    document,
    handlers,
    move(value) {
      top = value;
      handlers.scroll();
      flush();
    },
  };
}
const normal = fixture();
normal.move(100);
normal.move(-50);
assert.deepEqual(normal.stages, [1, 2], "scroll advances through both stages");
normal.move(350);
assert.equal(normal.stages.at(-1), 0, "scrolling back restores booking");
normal.buttons[0]();
normal.move(-50);
assert.equal(
  normal.stages.at(-1),
  0,
  "manual choice has priority over scrolling",
);
const quiet = fixture(true);
quiet.move(-50);
assert.deepEqual(quiet.stages, [], "reduced motion disables scroll animation");
const background = fixture();
background.document.hidden = true;
background.move(-50);
assert.deepEqual(
  background.stages,
  [],
  "background tab does no animation work",
);
const coalesced = fixture();
coalesced.handlers.scroll();
coalesced.handlers.scroll();
assert.equal(coalesced.frames.length, 1, "scroll events share one frame");
coalesced.flush();
assert.equal(coalesced.frames.length, 0, "no permanent animation loop");
console.log(
  "Spatial checks passed: stages, reverse scroll, manual priority, reduced motion, hidden tab and frame scheduling.",
);
