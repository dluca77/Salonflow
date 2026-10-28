const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('login/index.html', 'utf8');
const handler = html.slice(html.indexOf('// ── ENTER TOETS'), html.indexOf('// ── URL HASH'));
let keydown, calls, section, busy;
const context = {
  PRE_LAUNCH: true,
  document: {
    addEventListener: (name, fn) => { if(name === 'keydown') keydown = fn; },
    getElementById: () => ({classList: {contains: () => section === 'login'}}),
    querySelector: () => busy ? {} : null,
  },
  login: () => calls.push('login'),
  schrijfInPrelaunch: () => calls.push('prelaunch'),
  registreer: () => calls.push('register'),
};
vm.runInNewContext(handler, context);
function press(overrides = {}) {
  keydown({key:'Enter', target:{tagName:'INPUT',type:'email'}, preventDefault(){}, ...overrides});
}
calls=[]; section='login'; busy=false;
press({target:{tagName:'BUTTON',type:'button'}});
press({target:{tagName:'A'}});
press({target:{tagName:'INPUT',type:'checkbox'}});
press({repeat:true});
press({isComposing:true});
assert.deepEqual(calls, [], 'Navigation, password toggles and IME must not submit login');
press();
assert.deepEqual(calls, ['login']);
busy=true; press();
assert.deepEqual(calls, ['login'], 'Enter while pending must not send a duplicate request');
busy=false; section='prelaunch'; press();
assert.deepEqual(calls, ['login','prelaunch']);
context.PRE_LAUNCH=false; press();
assert.deepEqual(calls, ['login','prelaunch','register']);
console.log('Login keyboard checks passed: navigation, IME, repeat, pending and correct form routing.');
