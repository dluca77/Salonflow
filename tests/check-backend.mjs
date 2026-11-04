import assert from 'node:assert/strict';
import {authorizeSalon} from '../workers/authorization.js';
import moneybird from '../workers/kronr-moneybird.js';
import mail from '../workers/kronr-mail.js';
import ai from '../workers/kronr-ai.js';
import stripe from '../workers/kronr-stripe.js';
import {verifyStripeEvent,processStripeWebhook} from '../workers/stripe-webhook.js';
const salon='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const env={SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE:'test',MONEYBIRD_CLIENT_SECRET:'test-secret',MONEYBIRD_CLIENT_ID:'test'};
let calls=[], userId=owner, staff=[];
globalThis.fetch=async(url,options={})=>{
 calls.push([String(url),options]);
 if(String(url).endsWith('/auth/v1/user'))return Response.json({id:userId});
 if(String(url).includes('/salons?'))return Response.json([{id:salon,owner_id:owner,naam:'Salon'}]);
 if(String(url).includes('/medewerkers?'))return Response.json(staff);
 if(String(url).includes('/betalingen?'))return Response.json([]);
 throw new Error('Unexpected outbound request: '+url);
};
const req=(path,body,auth=true)=>new Request('https://worker.example.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(body)});
assert.equal((await authorizeSalon(req('/',{},false),env,salon)).status,401);
assert.equal((await authorizeSalon(req('/',{}),env,salon)).ok,true);
userId=other;
assert.equal((await authorizeSalon(req('/',{}),env,salon)).status,403);
staff=[{id:other,rechten:{kassa:'bekijken'}}];
assert.equal((await authorizeSalon(req('/',{}),env,salon,{module:'kassa',allowed:['gebruiken']})).status,403);
staff=[{id:other,rechten:{kassa:'gebruiken'}}];
assert.equal((await authorizeSalon(req('/',{}),env,salon,{module:'kassa',allowed:['gebruiken']})).ok,true);
assert.equal((await authorizeSalon(req('/',{}),env,salon,{ownerOnly:true})).status,403);
userId=owner;staff=[];
assert.equal((await moneybird.fetch(req('/create-oauth-link',{salon_id:salon},false),env,{})).status,401);
assert.equal((await moneybird.fetch(req('/create-oauth-link',{salon_id:salon,return_url:'https://evil.example/'}),env,{})).status,400);
const linkResponse=await moneybird.fetch(req('/create-oauth-link',{salon_id:salon,return_url:'https://kronr.nl/instellingen/?moneybird_return=1'}),env,{});
assert.equal(linkResponse.status,200);
const link=await linkResponse.json();
assert.equal(new URL(link.url).searchParams.get('redirect_uri'),'https://kronr.nl/instellingen/?moneybird_return=1');
assert.equal((await moneybird.fetch(req('/exchange-oauth-code',{salon_id:salon,code:'test',state:link.state+'bad'}),env,{})).status,400);
assert.equal((await moneybird.fetch(req('/sync-betaling',{salon_id:salon,betaling_id:other}),env,{waitUntil(){throw Error('Must not sync')}})).status,404);
for(const path of ['/campagne','/wachtlijst-plek','/medewerker-uitnodiging']){
 assert.equal((await mail.fetch(req(path,{salon_id:salon},false),env)).status,401);
}
assert.equal((await mail.fetch(req('/bevestiging',{email:'victim@example.invalid'}),env)).status,400);
assert.equal((await mail.fetch(req('/stempelkaart-code',{salon_id:salon,email:'invalid'}),env)).status,400);
assert.equal((await ai.fetch(req('/',{salon_id:salon},false),env)).status,401);
assert.equal((await ai.fetch(req('/unknown',{salon_id:salon}),env)).status,404);
assert.ok(calls.every(([url])=>url.startsWith(env.SUPABASE_URL)),'No actual mail, AI, OAuth exchange or payment sent');
console.log('PASS: auth, salon isolation, staff permissions, OAuth state/redirect, payment ownership, mail and AI access; external providers never called.');
const payload=JSON.stringify({id:'evt_test123',type:'customer.subscription.updated',data:{object:{id:'sub_123',customer:'cus_123',status:'active',items:{data:[{price:{id:'price_pro'}}]}}}});
const timestamp=String(Math.floor(Date.now()/1000));
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('whsec_test'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+payload))).toString('hex');
const header=`t=${timestamp},v1=${'0'.repeat(64)},v1=${sig}`;
assert.equal((await verifyStripeEvent(payload,header,'whsec_test')).id,'evt_test123');
await assert.rejects(()=>verifyStripeEvent(payload,header,undefined));
await assert.rejects(()=>verifyStripeEvent(payload.replace('active','canceled'),header,'whsec_test'));
await assert.rejects(()=>verifyStripeEvent(payload,'t=garbage,v1='+sig,'whsec_test'));
const webhookReq=()=>new Request('https://example.invalid/webhook',{method:'POST',headers:{'stripe-signature':header},body:payload});
let atomicCalls=[];
let currentSubscription=JSON.parse(payload).data.object;
const dependencies={get:async(_env,path)=>{assert.equal(path,'subscriptions/sub_123');return currentSubscription},query:async(...args)=>atomicCalls.push(args)};
assert.equal((await processStripeWebhook(webhookReq(),{STRIPE_WEBHOOK_SECRET:'whsec_test',PRICE_PRO_M:'price_pro'},false,dependencies)).status,200);
assert.equal(atomicCalls[0][1],'rpc/kronr_apply_stripe_event');
assert.equal(JSON.parse(atomicCalls[0][2].body).p_actions[0].plan,'pro');
assert.equal((await processStripeWebhook(webhookReq(),{STRIPE_WEBHOOK_SECRET:'whsec_test'},false,dependencies)).status,500);
assert.equal(atomicCalls.length,1,'Unknown price must not grant plan');
assert.equal((await processStripeWebhook(webhookReq(),{STRIPE_WEBHOOK_SECRET:'whsec_test',PRICE_PRO_M:'price_pro'},false,{...dependencies,query:async()=>{throw Error('DB down')}})).status,500);
currentSubscription={...currentSubscription,status:'canceled'};
assert.equal((await processStripeWebhook(webhookReq(),{STRIPE_WEBHOOK_SECRET:'whsec_test',PRICE_PRO_M:'price_pro'},false,dependencies)).status,200);
assert.equal(JSON.parse(atomicCalls.at(-1)[2].body).p_actions[0].plan,'free','Delayed active event must not reactivate canceled subscription');
console.log('PASS: webhook signatures, multiple signatures, missing secret, tampering, unknown prices, atomic DB submission and retry on DB failure.');
let checkoutParams;
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('/afspraken?')){
  assert.ok(String(url).includes('annuleer_token=eq.'+other));
  return Response.json([{salon_id:salon,klant_email:'actual@example.invalid',diensten:{prijs:80,aanbetaling_type:'percentage',aanbetaling_bedrag:25}}]);
 }
 if(String(url).includes('/salons?'))return Response.json([{stripe_connect_account_id:'acct_test'}]);
 if(String(url)==='https://api.stripe.com/v1/checkout/sessions'){
  checkoutParams=new URLSearchParams(options.body);return Response.json({url:'https://checkout.example.invalid/test'});
 }
 throw Error('Unexpected request '+url);
};
const booking={salon_id:salon,afspraak_id:owner,annuleer_token:other,bedrag:0.01,email:'forged@example.invalid',success_url:'https://kronr.nl/boeken/',cancel_url:'https://kronr.nl/boeken/'};
assert.equal((await stripe.fetch(req('/create-deposit-checkout',booking),env)).status,200);
assert.equal(checkoutParams.get('line_items[0][price_data][unit_amount]'),'2000');
assert.equal(checkoutParams.get('customer_email'),'actual@example.invalid');
assert.equal((await stripe.fetch(req('/create-deposit-checkout',{...booking,annuleer_token:null}),env)).status,400);
assert.equal((await stripe.fetch(req('/create-deposit-checkout',{...booking,success_url:'https://evil.example/'}),env)).status,400);
console.log('PASS: deposit derives price/email from stored booking and rejects missing token/external redirects; Stripe fully mocked.');

assert.equal((await stripe.fetch(req('/create-setup-checkout',booking),env)).status,200);
assert.equal(checkoutParams.get('customer_email'),'actual@example.invalid','Setup must use stored booking email');
assert.equal(checkoutParams.get('mode'),'setup');
console.log('PASS: saved-card checkout ignores forged customer email.');
