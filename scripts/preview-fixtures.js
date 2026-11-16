/* Local preview only. Loaded by preview-backoffice.py, never by production pages. */
(() => {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw Error('Local preview only');
  const staffMode=new URLSearchParams(location.search).get('role')==='staff';
  const salon = {id:'preview-salon',owner_id:'preview-owner',naam:'Studio Nova',type_bedrijf:'Kapper',plan:'business',created_at:'2026-11-01',logo_url:null};
  const team = [{id:'m1',naam:'Julia',rol:'Stylist',actief:true},{id:'m2',naam:'Noor',rol:'Colorist',actief:true}];
  const services = [
    {id:'d1',naam:'Knippen & styling',prijs:72,duur_min:60,categorie:'Haar',actief:true},
    {id:'d2',naam:'Kleuren & föhnen',prijs:125,duur_min:90,categorie:'Kleur',actief:true},
    {id:'d3',naam:'Wassen & föhnen',prijs:38,duur_min:30,categorie:'Haar',actief:true},
    {id:'d4',naam:'Balayage',prijs:165,duur_min:120,categorie:'Kleur',actief:true}
  ];
  const products=[{id:'p1',naam:'Verzorgende shampoo',prijs:18.5,voorraad_aantal:12,actief:true},{id:'p2',naam:'Herstellend masker',prijs:26,voorraad_aantal:8,actief:true},{id:'p3',naam:'Styling crème',prijs:22.5,voorraad_aantal:6,actief:true}];
  const names=['Lisa','Emma','Sophie','Mila','Sara','Eva','Tess','Lotte','Fleur','Nina'];
  const monday=new Date(); monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  const appointments=Array.from({length:20},(_,i)=>{
    const date=new Date(monday); date.setDate(date.getDate()+Math.floor(i/4));date.setHours(9+(i%4)*2, (i%2?30:0)+(Math.floor(i/4)%3)*15,0,0);
    const d=services[i%services.length],m=team[i%2];
    return {id:'a'+i,salon_id:salon.id,klant_naam:names[i%names.length],klant_email:'voorbeeld'+i+'@example.invalid',datum_tijd:date.toISOString(),duur_min:d.duur_min,status:'bevestigd',dienst_id:d.id,medewerker_id:m.id,diensten:d,medewerkers:m,herhaling:'geen'};
  });
  function query(rows){
    let single=false,writing=false;
    const result=()=>({data:writing?null:(single?(Array.isArray(rows)?rows[0]||null:rows):rows),error:writing?{message:'Deze lokale voorbeeldomgeving bewaart geen wijzigingen.'}:null,count:Array.isArray(rows)?rows.length:0});
    const chain=new Proxy({}, {get(_,key){
      if(key==='then')return (resolve,reject)=>Promise.resolve(result()).then(resolve,reject);
      if(['single','maybeSingle'].includes(key))return ()=>{single=true;return chain;};
      if(['insert','update','delete','upsert'].includes(key))return ()=>{writing=true;return chain;};
      return ()=>chain;
    }});return chain;
  }
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:staffMode?'preview-staff':'preview-owner',email:'demo@example.invalid'}}}}),signOut:async()=>({})},
    from:table=>query(({salons:staffMode?[]:[salon],medewerkers:staffMode?[{...team[0],salon_id:salon.id,auth_user_id:'preview-staff',rechten:{agenda:'bekijken',klanten:'bekijken',diensten:'bekijken',kassa:'geen',rapportages:'geen'}}]:team,diensten:services,producten:products,afspraken:appointments,klanten:names.map((naam,i)=>({id:'k'+i,naam,email:'voorbeeld'+i+'@example.invalid'}))})[table]||[]),
    rpc:name=>query(name==='kronr_team_overzicht'?team:name==='kronr_medewerker_context'?salon:[])
  })};
})();
