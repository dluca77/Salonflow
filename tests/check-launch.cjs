const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
for(const file of ['index.html','demo/index.html','login/index.html']){
  const html=fs.readFileSync(file,'utf8');
  for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/src=|application\/ld\+json/i.test(attrs))new vm.Script(code,{filename:file});
  }
  for(const [,href,label] of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
    if(/Start.*gratis|launchupdate|Blijf op de hoogte|Houd me op de hoogte/i.test(label))assert.ok(href.includes('#registreer'),`${file}: registration CTA goes to login`);
  }
}
const home=fs.readFileSync('index.html','utf8');
assert.ok(home.includes('url.search+url.hash'),'UTM handling must retain registration hash');
assert.ok(!home.includes('id="heroCycleWord"'),'Hero must not type or delete its heading');
assert.ok(home.includes('aria-controls="mob-nav"'));
assert.ok(home.includes('aria-label="Menu sluiten"'));
assert.ok(fs.readFileSync('login/index.html','utf8').includes('const PRE_LAUNCH = true;'),'Do not open public registration as part of design changes');
console.log('Launch checks passed: JS syntax, registration links, UTM hash, fixed heading, menu semantics and pre-launch guard.');
