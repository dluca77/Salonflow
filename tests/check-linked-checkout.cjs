const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('kassa/index.html','utf8');
const code=html.slice(html.indexOf('async function koppelAfspraak('),html.indexOf('function ontkoppelAfspraak('));
(async()=>{for(const variant of [null,'variant-1']){
 const calls=[];const row={id:'apt',dienst_id:'service-1',dienst_variant_id:variant,medewerker_id:'staff',diensten:{naam:'Knippen',prijs:35},dienst_varianten:{naam:'Lang',prijs:45}};
 const chain={select(){return this},eq(){return this},single:async()=>({data:row})};
 const ctx={sb:{from:()=>chain,rpc:async()=>({data:[{dienst_id:'extra-1',naam:'Extra',prijs:10}]})},document:{getElementById:()=>({style:{}})},allMedewerkers:[{id:'staff'}],add:(...args)=>calls.push(args),console};
 vm.createContext(ctx);vm.runInContext(code,ctx);await ctx.koppelAfspraak('apt');assert.equal(calls[0][4],'service-1');assert.equal(calls[0][6]||null,variant);assert.equal(calls[1][4],'extra-1');
}console.log('PASS linked appointment passes primary, variant and extra service IDs to checkout');})().catch(e=>{console.error(e);process.exit(1)});
