const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('login/index.html','utf8');
const code=html.slice(html.indexOf('let registratieBezig'),html.indexOf('// ── WACHTWOORD RESET'));
async function scenario({network=false,duplicate=false,session=false,verify=true}={}){
 const fields={};for(const id of ['r-contactnaam','r-naam','r-type','r-email','r-telefoon','r-pass','login-tabs','sectie-reg','form-title','form-sub','reg-succes-email','reg-succes'])fields[id]={value:'',style:{}};
 Object.assign(fields['r-contactnaam'],{value:' Test Owner '});fields['r-naam'].value=' Test Salon ';fields['r-type'].value='Kapper';fields['r-email'].value=' TEST@example.invalid ';fields['r-telefoon'].value='06 12345678';fields['r-pass'].value='Password123';
 let payload,messages=[],busy=false,redirect=false,resets=0,signups=0;
 const ctx={document:{getElementById:id=>fields[id]},kronrCaptcha:async()=>{resets++;if(network)throw new TypeError('offline');if(!verify)throw Error('Verification failed');return 'captcha';},AbortSignal,localStorage:{setItem(){}},wwVoldoetAanEisen:()=>true,setLaden:(_id,b)=>busy=b,leegMsg(){},toonMsg:m=>messages.push(m),redirectNaJuisteBestemming:async()=>redirect=true,fetch:async()=>{if(network)throw new TypeError('offline');return {ok:true,json:async()=>({success:verify})}},sb:{auth:{signUp:async p=>{signups++;payload=p;return{data:{user:{identities:duplicate?[]:[{}]},session:session?{}:null}}}},from(){throw Error('Must not write salon before confirmation')}},TypeError};
 vm.createContext(ctx);vm.runInContext(code,ctx);await Promise.all([ctx.registreer(),ctx.registreer()]);
 assert.equal(busy,false);assert.equal(resets,1);assert.ok(signups<=1);
 if(network||!verify){assert.equal(signups,0);assert.equal(messages.length,1);}else if(duplicate){assert.equal(messages.length,1);assert.notEqual(fields['reg-succes'].style.display,'block');}else{assert.equal(payload.options.captchaToken,'captcha');assert.equal(payload.email,'test@example.invalid');assert.equal(payload.options.data.telefoon,'+31612345678');assert.equal(payload.options.data.bedrijf_naam,'Test Salon');assert.equal(redirect,session);if(!session)assert.equal(fields['reg-succes'].style.display,'block');}
}
(async()=>{for(const opts of [{},{network:true},{duplicate:true},{session:true},{verify:false}])await scenario(opts);console.log('PASS registration: confirmation, direct session, duplicate guard, captcha failure and network recovery; no anonymous salon insert');})().catch(e=>{console.error(e);process.exit(1)});
