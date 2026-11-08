const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const listeners = {},
  frames = new Map();
let seq = 0,
  builds = 0;
const timelines = [],
  stages = [];
const root = { clientWidth: 390, classList: { toggle() {} } };
const track = {
  style: {},
  append() {},
  getBoundingClientRect() {
    return { top: 1000 - context.scrollY };
  },
  get offsetHeight() {
    return parseFloat(this.style.height) || 600;
  },
};
const wrap = { offsetHeight: 600, before() {} };
const cards = Array.from({ length: 3 }, () => ({
  animate() {
    builds++;
    const a = { currentTime: 0, pause() {}, cancel() {} };
    timelines.push(a);
    return a;
  },
}));
const scene = {
  clientHeight: 440,
  closest: () => wrap,
  querySelectorAll: () => cards,
  style: { setProperty() {} },
  classList: { add() {}, remove() {} },
  dataset: {},
  dispatchEvent(e) {
    stages.push(e.detail);
  },
};
const context = {
  document: {
    addEventListener: (name, fn) => (listeners[name] = fn),
    querySelector: () => scene,
    createElement: () => track,
    documentElement: root,
    querySelectorAll: () => [],
  },
  Element: { prototype: { animate() {} } },
  matchMedia: (q) => ({
    matches: q.includes("max-width"),
    addEventListener() {},
  }),
  getComputedStyle: (el) =>
    el === wrap
      ? { top: "85px" }
      : { transform: "none", opacity: "1", filter: "none" },
  scrollY: 0,
  innerHeight: 844,
  requestAnimationFrame: (fn) => {
    frames.set(++seq, fn);
    return seq;
  },
  cancelAnimationFrame: (id) => frames.delete(id),
  CustomEvent: class {
    constructor(type, o) {
      this.detail = o.detail;
    }
  },
  addEventListener: (name, fn) => (listeners[name] = fn),
  window: { scrollTo() {} },
};
let clock = 100;
function tick(ms = 16) {
  clock += ms;
  for (const [id, fn] of [...frames]) {
    frames.delete(id);
    fn(clock);
  }
}
function flush() {
  let count = 0;
  while (frames.size) {
    tick();
    assert.ok(
      ++count < 100,
      "Animation must settle and stop requesting frames",
    );
  }
}
vm.runInNewContext(fs.readFileSync("spatial.js", "utf8"), context);
flush();
const height = track.style.height;
assert.equal(builds, 3);
context.scrollY = 1400;
listeners.scroll();
tick();
const first = timelines[0].currentTime;
assert.ok(first > 0 && first < 600, "Scroll movement eases instead of jumping");
tick();
assert.ok(
  timelines[0].currentTime > first,
  "Animation continues between scroll events",
);
flush();
const middle = timelines[0].currentTime;
context.innerHeight = 730;
listeners.resize();
flush();
assert.equal(builds, 3, "Browser toolbar must not rebuild animations");
assert.equal(
  track.style.height,
  height,
  "Browser toolbar must not alter track height",
);
assert.equal(timelines[0].currentTime, middle);
context.scrollY = 1800;
listeners.scroll();
flush();
assert.equal(timelines[0].currentTime, 1000);
context.scrollY = 1200;
listeners.scroll();
flush();
assert.ok(timelines[0].currentTime < middle, "Reverse scroll rewinds");
context.scrollY = 500;
listeners.scroll();
flush();
assert.equal(timelines[0].currentTime, 0);
assert.equal(stages.at(-1), 0);
root.clientWidth = 844;
scene.clientHeight = 300;
listeners.resize();
flush();
assert.equal(builds, 6, "Actual orientation/layout changes rebuild");
console.log(
  "PASS: mobile toolbar resize preserves scroll geometry; reverse scrolling rewinds; orientation rebuilds",
);

context.document.hidden = true;
listeners.visibilitychange();
assert.equal(frames.size, 0);
context.scrollY = 1600;
listeners.scroll();
assert.equal(frames.size, 0, "Hidden page does not animate");
context.document.hidden = false;
listeners.visibilitychange();
flush();
assert.ok(timelines.at(-1).currentTime > 0);
assert.equal(frames.size, 0, "No perpetual idle animation");
console.log(
  "PASS: eased intermediate frames, convergence, reverse motion and hidden-tab suspension",
);
