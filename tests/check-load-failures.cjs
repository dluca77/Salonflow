const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const chain=result=>new Proxy({}, {get:(_,key)=>key==='then'?Promise.resolve(result).then.bind(Promise.resolve(result)):()=>chain(result)});
(async()=>{
  for(const page of ['agenda','kassa']){
    const source=fs.readFileSync(page+'/index.html','utf8');
    const start=source.indexOf('async function loadData(){');
    const end=source.indexOf(page==='agenda'?'  APTS=aR.data':'  allDiensten=dR.data',start);
    for(const failedTable of (page==='agenda'?['afspraken','diensten','wachtlijst','team']:['diensten','producten','team'])){
      const failure=new Error('Simulated database failure');
      const result=table=>({data:[],error:table===failedTable?failure:null});
      const ctx={agendaPreferenceLoaded:true,firstLoad:true,cur:new Date(),SALON_ID:'salon',document:{getElementById:()=>null},metLocatie:x=>x,sb:{from:table=>chain(result(table))},kronrTeamOverzicht:()=>chain(result('team'))};
      vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'}',ctx);
      await assert.rejects(ctx.loadData(),e=>e===failure, page+' must not render empty data after '+failedTable+' fails');
    }
  }
  console.log('PASS: failed agenda/catalog/team queries never masquerade as empty successful results');
})().catch(e=>{console.error(e);process.exit(1)});
