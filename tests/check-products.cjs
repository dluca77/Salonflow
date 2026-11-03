const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const page=fs.readFileSync('producten/index.html','utf8');
const source=[...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('let PRODUCTEN='));
const fields={};
const element=id=>fields[id]??=( {value:'',checked:true,disabled:false,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}}} );
let calls=[],failure=null,rows=[];
const db={from(table){let op='select',payload;const q={select(){return q},order(){return q},eq(k,v){calls.push(['filter',k,v]);return q},insert(p){op='insert';payload=p;return q},update(p){op='update';payload=p;return q},delete(){op='delete';return q},single:async()=>{calls.push([op,table,payload]);return {data:failure?null:{id:'p1'},error:failure}},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}};
const context=vm.createContext({document:{getElementById:element,body:{style:{}}},sb:db,SALON_ID:'salon1',escapeHtml:s=>s,kronrInit(){},confirm:()=>true,console});
vm.runInContext(source,context);
async function save(values){for(const [key,value] of Object.entries(values))element('p-'+key).value=value;await vm.runInContext('slaProductOp()',context)}
(async()=>{
 await save({id:'',naam:'Shampoo',prijs:'12.50',voorraad:'4',drempel:'0'});
 assert.equal(calls.find(c=>c[0]==='insert')[2].lage_voorraad_drempel,0);
 calls=[];await save({id:'p1',voorraad:'2.5'});assert.equal(calls.length,0,'Fractional inventory must be rejected');
 await save({voorraad:''});assert.equal(calls.length,0,'Blank inventory must be rejected');
 await save({voorraad:'6'});assert.ok(calls.some(c=>c[0]==='update'));assert.ok(calls.some(c=>c[1]==='salon_id'&&c[2]==='salon1'));
 failure={code:'42501'};await save({voorraad:'7'});assert.equal(element('p-err').style.display,'block');assert.equal(element('p-save').disabled,false);
 vm.runInContext("PRODUCTEN=[{id:'p1',naam:'Shampoo'}]",context);
 failure={code:'23503'};await vm.runInContext("verwijderProduct('p1',{disabled:false})",context);
 assert.match(element('product-feedback').textContent,/verkoophistorie/);
 failure=null;await vm.runInContext("verwijderProduct('p1',{disabled:false})",context);
 assert.equal(element('product-feedback').textContent,'Product verwijderd.');
 console.log('PASS: product create/update/delete, salon filters, zero threshold, integer stock, access failures and sales-history protection. Database mocked.');
})().catch(e=>{console.error(e);process.exitCode=1});
