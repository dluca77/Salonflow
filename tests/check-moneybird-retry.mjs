import assert from 'node:assert/strict';import {findExternalInvoice} from '../workers/kronr-moneybird.js';
let calls=0;
globalThis.fetch=async url=>{calls++;assert.ok(url.includes('period%3A20261106..20261106'));return Response.json(calls===1?Array.from({length:100},(_,i)=>({reference:'other'+i})): [{id:'saved',reference:'payment'}]);};
assert.equal((await findExternalInvoice('mock','admin','2026-11-06','payment')).id,'saved');assert.equal(calls,2);
globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(()=>findExternalInvoice('mock','admin','2026-11-06','payment'));
globalThis.fetch=async()=>Response.json([]);assert.equal(await findExternalInvoice('mock','admin','2026-11-06','payment'),null);
console.log('PASS: retry finds existing invoice across pages; lookup failure never permits duplicate creation');
