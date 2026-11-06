import assert from 'node:assert/strict';
import mail from '../workers/kronr-mail.js';
const salon='11111111-1111-4111-8111-111111111111';let sent=null;
globalThis.fetch=async(url,opts={})=>{
 if(String(url).includes('/salons?'))return Response.json([{naam:'Salon <test>'}]);
 if(String(url).includes('/rpc/vraag_stempelkaart_code_aan'))return Response.json('123456');
 if(String(url).includes('/rpc/kronr_claim_request'))return Response.json(true);
 if(String(url)==='https://api.resend.com/emails'){sent=JSON.parse(opts.body);return Response.json({id:'mock-email'});}
 throw Error('Unexpected mocked request '+url);
};
const env={SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE:'mock',RESEND_API_KEY:'mock'};
const res=await mail.fetch(new Request('https://worker.invalid/abonnement-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({salon_id:salon,email:'member@example.invalid'})}),env);
assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true});
assert.ok(sent.html.includes('123456'));assert.ok(sent.html.includes('Salon &lt;test&gt;'));assert.ok(sent.html.includes('abonnement'));assert.equal(sent.to[0]||sent.to,'member@example.invalid');
console.log('PASS: verification code only in mocked email, never in browser response; salon text escaped');
