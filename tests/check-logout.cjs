const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('kronr.js','utf8');const code=s.slice(s.indexOf('async function uitloggen()'),s.indexOf('// Kleine helper:',s.indexOf('async function uitloggen()')));
(async()=>{for(const state of ['success','failure','unavailable']){
 const removed=[];const storage={removeItem:key=>removed.push(key)};
 const ctx={window:{localStorage:storage,sessionStorage:storage,location:{}},sb:state==='unavailable'?null:{auth:{signOut:async opts=>{assert.equal(opts.scope,'local');if(state==='failure')throw Error('Expired session')}}},setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(code,ctx);await ctx.uitloggen();assert.equal(ctx.window.location.href,'/login/');assert.equal(removed.length,4);assert.ok(removed.every(k=>k.startsWith('sb-pscybcirexnltqvziixt-auth-token')));
}console.log('PASS logout clears only own Auth keys and redirects despite expired session or missing client');})().catch(e=>{console.error(e);process.exit(1)});
