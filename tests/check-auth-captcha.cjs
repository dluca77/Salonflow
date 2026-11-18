const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('auth-captcha.js','utf8');
async function scenario(outcome){
 let options,removed=0,focus=0,dialog;
 const document={activeElement:{focus(){focus++}},head:{append(){}},body:{append(el){dialog=el}},createElement(){return{style:{},append(){},setAttribute(){},addEventListener(name,fn){this[name]=fn},showModal(){},remove(){}}}};
 const window={turnstile:{render(_el,o){options=o;return 'widget'},remove(){removed++}}};
 const ctx={window,document,setTimeout,clearTimeout,Error,Promise};vm.runInNewContext(source,ctx);
 const first=window.kronrCaptcha();await new Promise(setImmediate);
 await assert.rejects(window.kronrCaptcha(),/loopt al/);
 if(outcome==='success'){options.callback('single-use-token');assert.equal(await first,'single-use-token');}
 else {if(outcome==='cancel')dialog.cancel();else options[outcome]();await assert.rejects(first,/niet afgerond/);}
 assert.equal(removed,1);assert.equal(focus,1);
 const retry=window.kronrCaptcha();await new Promise(setImmediate);options.callback('fresh-token');assert.equal(await retry,'fresh-token');assert.equal(removed,2);
}
(async()=>{
 for(const outcome of ['success','error-callback','expired-callback','timeout-callback','cancel'])await scenario(outcome);
 for(const name of ['login','medewerker-login','medewerker-activeren','postvak-login']){
  const html=fs.readFileSync(name+'/index.html','utf8');assert.match(html,/auth-captcha\.js/);assert.match(html,/captchaToken/);
  assert.doesNotMatch(html,/kronr-turnstile.*\/verify/,'Auth must verify token once, server-side');
 }
 console.log('PASS Auth CAPTCHA: fresh tokens, concurrent guard, cancellation, expiry, retry and all entry points wired');
})().catch(e=>{console.error(e);process.exit(1)});
