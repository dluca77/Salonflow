const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('boeken/index.html','utf8');
const start=source.indexOf('function lokaleDatumSleutel');
const end=source.indexOf('function slotHTML',start);
const ctx={Date,Set,console,window:{BOEKEN_MEDEWERKERS:[{id:'staff'}],BOEKEN_RUIMTES:[{id:'room'}]},SALON_ID:'salon',HUIDIGE_BOEK_LOCATIE_ID:null,state:{},totaleDuur:()=>30};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
(async()=>{
 const dt=new Date(2030,5,10,12);
 assert.equal(ctx.lokaleDatumSleutel(dt),'2030-06-10');
 for(const fail of ['get_bezette_tijden','get_verlof_op_datum','get_bezette_ruimtes']){
  ctx.sb={rpc:async name=>name===fail?{error:{message:'offline'}}:{data:[]}};
  if(fail!=='get_bezette_ruimtes'){
   assert.equal(await ctx.vindBeschikbareMedewerker(dt,30),null);
   assert.equal(await ctx.vindBeschikbareMedewerkers(dt,30,1),null);
  }else{
   assert.equal(await ctx.vindBeschikbareRuimte(dt,30),null);
   assert.equal(await ctx.vindBeschikbareRuimtes(dt,30,1),null);
  }
  ctx.state={vereist_ruimte:true};
  assert.equal((await ctx.berekenBeschikbareSlots(dt)).length,0);
 }
 ctx.sb={rpc:async()=>({data:[]})};
 assert.equal(await ctx.vindBeschikbareMedewerker(dt,30),'staff');
 assert.equal(await ctx.vindBeschikbareRuimte(dt,30),'room');
 assert.ok((await ctx.berekenBeschikbareSlots(dt)).length>0);
 console.log('PASS: availability failures never become free slots; successful availability and local date preserved');
})().catch(e=>{console.error(e);process.exit(1)});
