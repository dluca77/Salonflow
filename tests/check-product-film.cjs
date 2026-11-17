const assert=require('node:assert/strict'),fs=require('node:fs');
const {stateAt}=require('../product-film.js');
assert.deepEqual(stateAt(0).shape,[218,362,164,60,30]);
assert.deepEqual(stateAt(.49).shape,[116,305,440,68,12]);
assert.deepEqual(stateAt(1).shape,[180,373,240,60,30]);
for(let i=0;i<=1000;i++){
 const a=stateAt(i/1000),b=stateAt((i+1)/1000);
 assert.ok(Math.abs(a.weights.reduce((x,y)=>x+y,0)-1)<1e-8);
 assert.ok(a.weights.every(x=>x>=0&&x<=1));
 assert.ok(a.shape.every((x,j)=>Number.isFinite(x)&&Math.abs(x-b.shape[j])<5),'Morph must stay continuous');
 assert.ok(a.shape[0]>=0&&a.shape[0]+a.shape[2]<=600);
}
assert.deepEqual(stateAt(-1),stateAt(0));assert.deepEqual(stateAt(2),stateAt(1));
const home=fs.readFileSync('index.html','utf8'),hero=home.slice(home.indexOf('<section class="arrival"'),home.indexOf('<div class="capability-strip"'));
assert.ok(!hero.includes('<img'));assert.ok(!hero.includes('space-card'));
assert.ok(hero.includes('film-toggle'));
console.log('PASS: continuous bounded shared-shape morph, correct stages, no screenshot/card stack and visible example label/pause control');
// Exercise the actual browser controller with a deterministic animation clock.
const vm=require('node:vm');
function setup(reduce=false){
 const make=()=>({attrs:{},style:{},events:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this.events[k]=v},querySelector(){return this.bar||(this.bar=make())}});
 const shape=make(),layers=[make(),make(),make()],captions=[make(),make(),make()],steps=[make(),make(),make()];
 const nodes={'film-shape':shape,'film-toggle':make(),'film-status':make(),'film-booking-text':make(),'film-agenda-text':make(),'film-receipt-text':make()};
 const film={querySelector:()=>shape,querySelectorAll:s=>s.includes('layer')?layers:s.includes('caption')?captions:steps};
 const frames=new Map();let id=0,observer;const media={matches:reduce,addEventListener(k,fn){this.change=fn}};
 const document={hidden:false,getElementById:k=>k==='product-film'?film:nodes[k],addEventListener(k,fn){this[k]=fn}};
 const context={window:{},document,matchMedia:()=>media,requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:n=>frames.delete(n),IntersectionObserver:class{constructor(fn){observer=fn}observe(){}}};
 vm.runInNewContext(fs.readFileSync('product-film.js','utf8'),context);
 return{nodes,steps,media,frames,document,visible(v){observer([{isIntersecting:v}])},advance(t){const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(t))}};
}
const f=setup();f.visible(true);assert.equal(f.frames.size,1);f.advance(0);f.advance(100);const moved=f.nodes['film-shape'].attrs.x;
f.nodes['film-toggle'].events.click();assert.equal(f.frames.size,0);assert.equal(f.nodes['film-toggle'].textContent,'Afspelen');
f.steps[1].events.click();f.advance(0);f.advance(900);assert.equal(f.nodes['film-shape'].attrs.x,'116.000');assert.equal(f.steps[1].attrs['aria-pressed'],'true');
f.nodes['film-toggle'].events.click();assert.equal(f.frames.size,1);f.visible(false);assert.equal(f.frames.size,0);f.visible(true);assert.equal(f.frames.size,1);
f.document.hidden=true;f.document.visibilitychange();assert.equal(f.frames.size,0);f.document.hidden=false;f.document.visibilitychange();assert.equal(f.frames.size,1);
for(let t=0;t<20000;t+=100)f.advance(t);assert.equal(f.nodes['film-toggle'].textContent,'Opnieuw');assert.equal(f.frames.size,0);
f.nodes['film-toggle'].events.click();assert.equal(f.nodes['film-shape'].attrs.x,'218.000');assert.equal(f.frames.size,1);
const r=setup(true);r.visible(true);assert.equal(r.frames.size,0);r.steps[2].events.click();assert.equal(r.nodes['film-shape'].attrs.x,'180.000');
console.log('PASS: pause/resume, manual stages, offscreen/hidden suspension, end/replay and reduced-motion startup');
