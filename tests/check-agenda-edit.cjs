const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('agenda/index.html','utf8');const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',style:{}});return nodes.get(id)};
const appointment={id:'a',dienst_id:'service',duur_min:75,klant_naam:'Test',datum_tijd:'2030-06-10T12:00:00',medewerker_id:'staff',status:'bevestigd',herhaling:'wekelijks',herhaling_einde:'2030-07-01',diensten:{naam:'Treatment',prijs:45}};
const ctx={sb:{rpc:async()=>({data:[{dienst_id:'extra',naam:'Extra',duur_min:15,prijs:10}]})},geselecteerdeApt:appointment,geselecteerdeDiensten:[{dienst_id:'wrong',duur_min:10}],document:{getElementById:el,querySelector:()=>({})},Date,dk:()=> '2030-06-10',ft:()=> '12:00',setModalTab:()=>{},renderDienstenLijst:()=>{},closePop:()=>{},openModal:()=>{}};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function bewerkHuidige(){'),source.indexOf('// ── NIEUWE AFSPRAAK')),ctx);(async()=>{await ctx.bewerkHuidige();
assert.equal(ctx.geselecteerdeDiensten[0].dienst_id,'service');assert.equal(ctx.geselecteerdeDiensten[0].duur_min,60);assert.equal(ctx.geselecteerdeDiensten[1].dienst_id,'extra');assert.equal(el('iherhaling').value,'wekelijks');assert.equal(el('iherhaling-einde').value,'2030-07-01');assert.equal(el('modal-apt-title').textContent,'Afspraak bewerken');assert.equal(ctx.geselecteerdeApt.id,'a');
console.log('PASS: edit hydrates persisted service, full duration, recurrence and title rather than stale form state');

})();
