const assert = require("node:assert/strict");
const fs = require("node:fs");
const m = require("../demo/model.js");
let s = m.initial();
assert.equal(m.reduce(s, { type: "pay" }).paid, false);
assert.equal(m.total(s), 7200);
s = m.reduce(s, { type: "time", value: "14:30" });
s = m.reduce(s, { type: "book" });
assert.equal(s.time, "14:30");
assert.equal(s.booked, true);
s = m.reduce(s, { type: "time", value: "09:30" });
assert.equal(s.time, "09:30");
assert.equal(m.reduce(s, { type: "time", value: "25:00" }), s);
s = m.reduce(s, { type: "quantity", delta: 1 });
assert.equal(m.total(s), 9050);
s = m.reduce(s, { type: "method", value: "Contant" });
s = m.reduce(s, { type: "pay" });
assert.equal(s.receipt.cents, 9050);
assert.equal(s.receipt.time, "09:30");
assert.equal(s.receipt.method, "Contant");
assert.equal(m.reduce(s, { type: "pay" }), s);
assert.equal(m.reduce(s, { type: "quantity", delta: 1 }), s);
assert.equal(m.reduce(s, { type: "time", value: "11:00" }), s);
s = m.reduce(s, { type: "reset" });
assert.deepEqual(s, m.initial());
for (let i = 0; i < 6; i++)
  s = m.reduce(m.reduce(s, { type: "book" }), { type: "quantity", delta: 1 });
assert.equal(s.productQuantity, 3);
for (let i = 0; i < 6; i++) s = m.reduce(s, { type: "quantity", delta: -1 });
assert.equal(s.productQuantity, 0);
const js =
  fs.readFileSync("demo/demo.js", "utf8") +
  fs.readFileSync("demo/model.js", "utf8");
assert.doesNotMatch(
  js,
  /fetch\(|XMLHttpRequest|localStorage|supabase|sendBeacon/,
);
const home = fs.readFileSync("index.html", "utf8").replace(/\s+/g, " ");
assert.ok(home.includes('id="kennismaken"'));
assert.ok(home.includes("geen automatische of"));
assert.ok(!home.includes("Kronr heeft een importfunctie"));
assert.ok(home.includes("Registratie is nog gesloten"));
console.log(
  "PASS connected demo: booking, reschedule, quantity limits, exact cents, receipt consistency, idempotent payment, reset and no production APIs",
);
