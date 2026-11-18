const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('medewerker-login/index.html','utf8');
const body=source.slice(source.indexOf('async function login(){'),source.indexOf('</script>',source.indexOf('async function login(){')));
function context(sb){
 const nodes={'inp-email':{value:'test@example.invalid'},'inp-ww':{value:'not-a-real-password'},'btn-login':{disabled:false},err:{style:{}}};
 const ctx={sb,kronrCaptcha:async()=>'captcha',document:{getElementById:id=>nodes[id]},window:{location:{href:''}},sessionStorage:{getItem:()=> 'pending',removeItem:()=>{ctx.removed=true}}};
 vm.createContext(ctx);vm.runInContext(body,ctx);return {ctx,nodes};
}
(async()=>{
 for(const sb of [undefined,{auth:{signInWithPassword:async()=>{throw Error('Offline')}}},{auth:{signInWithPassword:async()=>({})},rpc:async()=>({error:{message:'Invitation invalid'}})}]){
  const {ctx,nodes}=context(sb);await ctx.login();assert.equal(nodes['btn-login'].disabled,false);assert.equal(nodes.err.style.display,'block');assert.equal(ctx.window.location.href,'');assert.ok(!ctx.removed,'Failed invitation must remain retryable');
 }
 const {ctx,nodes}=context({auth:{signInWithPassword:async()=>({})},rpc:async()=>({error:null})});await ctx.login();assert.equal(ctx.window.location.href,'/medewerker-portal/');assert.equal(ctx.removed,true);
 nodes['btn-login'].disabled=true;ctx.window.location.href='';await ctx.login();assert.equal(ctx.window.location.href,'');
 console.log('PASS: employee login recovers from offline/CDN/invitation failure, retains invitation and prevents duplicate submission');
})().catch(e=>{console.error(e);process.exit(1)});
