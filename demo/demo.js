// A self-contained product example. No accounts, network calls or stored data.
const appointments = [
  {name:'Fem de Vries',service:'Knippen & styling',time:'09:00',staff:'Jasmijn',price:'42,50',duration:45,color:'c0',column:0,row:0},
  {name:'Roos Bakker',service:'Highlights & föhnen',time:'09:00',staff:'Tom',price:'107,50',duration:90,color:'c2',column:2,row:0},
  {name:'Daan Klerks',service:'Baard trimmen',time:'10:00',staff:'Sara',price:'25,00',duration:30,color:'c1',column:1,row:1},
  {name:'Iris Visser',service:'Kleuring',time:'10:00',staff:'Nina',price:'65,00',duration:60,color:'c3',column:3,row:1},
  {name:'Maud Smit',service:'Föhnen',time:'11:00',staff:'Jasmijn',price:'22,50',duration:30,color:'c2',column:0,row:2},
  {name:'Lars Peters',service:'Knippen',time:'11:00',staff:'Nina',price:'32,50',duration:30,color:'c0',column:3,row:2},
];
const customers = [
  {name:'Fem de Vries',initials:'FV',visit:'3 dagen geleden',stamps:8,note:'Draagt haar haar graag natuurlijk. Bespreek de gewenste lengte vóór het knippen.',service:'Knippen & styling',price:'42,50'},
  {name:'Roos Bakker',initials:'RB',visit:'Vandaag',stamps:3,note:'Een zachte, warme kleur en een natuurlijke overgang bij de aanzet.',service:'Highlights & föhnen',price:'107,50'},
  {name:'Daan Klerks',initials:'DK',visit:'Vorige week',stamps:10,note:'Strakke contouren, met behoud van lengte in de baard.',service:'Baard trimmen',price:'25,00'},
];
let activeTab='agenda';
let paymentMethod='Pin';
let paid=false;
let dialogTrigger;
const content=document.getElementById('tabContent');
const detail=document.getElementById('demo-detail');
const icons={agenda:'▦',kassa:'€',klanten:'◎'};

function kpis(){
  return `<div class="kpi-row"><div class="kpi"><div class="kpi-l">Afspraken vandaag</div><div class="kpi-v">6</div></div><div class="kpi"><div class="kpi-l">Afgerond in deze demo</div><div class="kpi-v">${paid?'€96,75':'€0,00'}</div></div><div class="kpi"><div class="kpi-l">Voorbeeldklanten</div><div class="kpi-v">3</div></div><div class="kpi"><div class="kpi-l">Teamleden</div><div class="kpi-v">4</div></div></div>`;
}
function agenda(){
  let cells='<div class="ah"></div>'+['Jasmijn','Sara','Tom','Nina'].map(n=>`<div class="ah">${n}</div>`).join('');
  for(let row=0;row<3;row++){
    cells+=`<div class="atime">${9+row}:00</div>`;
    for(let column=0;column<4;column++){
      const i=appointments.findIndex(a=>a.row===row&&a.column===column);
      const a=appointments[i];
      cells+=`<div class="aslot">${a?`<button class="apt ${a.color}" data-appointment="${i}" aria-label="${a.name}, ${a.service}, ${a.time}, bij ${a.staff}"><strong>${a.name.split(' ')[0]}</strong><span>${a.service}</span></button>`:''}</div>`;
    }
  }
  return `<div class="demo-workday"><div><p class="demo-eyebrow">STUDIO NOVA · VOORBEELD</p><h2>Een fijne dag voor de boeg.</h2></div><span>Woensdag · dagoverzicht</span></div><div class="panel"><div class="panel-head"><span>Jouw agenda</span><span>Kies een afspraak</span></div><div class="agenda-scroll" tabindex="0" role="region" aria-label="Voorbeeldagenda; schuif horizontaal om alle medewerkers te zien"><div class="agenda-rows">${cells}</div></div></div><p class="demo-hint">Elke afspraak opent een detailkaart. Op een klein scherm kun je de agenda zijwaarts schuiven.</p>`;
}
function checkout(){
  return `<div class="demo-workday"><div><p class="demo-eyebrow">VAN BEHANDELING NAAR BETALING</p><h2>Netjes afgerond.</h2></div></div><div class="kassa-grid"><div class="panel"><div class="panel-head"><span>Bon · Roos Bakker</span><span>Voorbeeld</span></div><div class="cart-item"><span>Highlights</span><span>€85,00</span></div><div class="cart-item"><span>Föhnen</span><span>€22,50</span></div><div class="cart-item"><span>Voorbeeldkorting · 10%</span><span>−€10,75</span></div><div class="cart-total"><span>Totaal</span><span>€96,75</span></div></div><div class="panel payment-panel">${paid?`<div class="payment-success" role="status"><span class="success-icon">✓</span><h3>Voorbeeldbetaling afgerond</h3><p>€96,75 · ${paymentMethod}</p><p>Je hebt niets betaald. Deze bon bestaat alleen in de demo.</p><button class="demo-action secondary" data-reset>Opnieuw proberen</button></div>`:`<div class="panel-head"><span>Kies een betaalwijze</span></div><div class="pay-btns">${['Pin','iDEAL','Contant'].map(m=>`<button class="pay-btn ${paymentMethod===m?'on':''}" aria-pressed="${paymentMethod===m}" data-payment="${m}">${m}</button>`).join('')}</div><div class="pay-confirm"><button class="demo-action" data-pay>Rond voorbeeldbetaling af →</button><p>Simulatie · geen echte betaling.</p></div>`}</div></div>`;
}
function customerList(){
  return `<div class="demo-workday"><div><p class="demo-eyebrow">JE KLANTEN, GOED IN BEELD</p><h2>Persoonlijk, bij elk bezoek.</h2></div></div><div class="panel"><div class="panel-head"><span>Klanten</span><span>3 voorbeeldprofielen</span></div><div class="klant-rows">${customers.map((c,i)=>`<button class="klant-row" data-customer="${i}"><span class="klant-avatar">${c.initials}</span><span class="klant-info"><span class="klant-name">${c.name}</span><span class="klant-meta">Laatste bezoek: ${c.visit.toLowerCase()}</span></span><span class="loyalty-label">${c.stamps}/10 stempels</span><span aria-hidden="true">↗</span></button>`).join('')}</div></div><p class="demo-hint">Open een profiel voor voorkeuren, bezoekgeschiedenis en spaarsaldo.</p>`;
}
function showTab(name){
  activeTab=name;
  content.innerHTML=kpis()+({agenda, kassa:checkout, klanten:customerList}[name])();
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-pressed',String(b.dataset.tab===name));});
  document.querySelectorAll('[data-side]').forEach(b=>{b.classList.toggle('on',b.dataset.side===name);b.setAttribute('aria-pressed',String(b.dataset.side===name));});
}
function openDetail(title,body,trigger){
  dialogTrigger=trigger;
  document.getElementById('detail-title').textContent=title;
  document.getElementById('detail-body').innerHTML=body;
  detail.showModal();
}
document.querySelectorAll('[data-tab],[data-side]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab||b.dataset.side)));
document.querySelectorAll('[data-side]').forEach(b=>b.textContent=icons[b.dataset.side]);
content.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b)return;
  if(b.hasAttribute('data-appointment')){
    const a=appointments[Number(b.dataset.appointment)];
    openDetail(a.name,`<span class="detail-status">Bevestigd · voorbeeld</span><h3>${a.service}</h3><dl><div><dt>Tijd</dt><dd>Woensdag ${a.time}</dd></div><div><dt>Medewerker</dt><dd>${a.staff}</dd></div><div><dt>Duur</dt><dd>${a.duration} minuten</dd></div><div><dt>Prijs</dt><dd>€${a.price}</dd></div></dl><p class="detail-note">Alles voor deze afspraak op één plek. Dit is een fictieve afspraak; er wordt niets verstuurd of opgeslagen.</p>`,b);
  }
  if(b.hasAttribute('data-customer')){
    const c=customers[Number(b.dataset.customer)];
    openDetail(c.name,`<span class="detail-status">Voorbeeldprofiel</span><h3>Goed om te onthouden</h3><p class="customer-note">${c.note}</p><h3>Laatste bezoek</h3><dl><div><dt>Behandeling</dt><dd>${c.service}</dd></div><div><dt>Bedrag</dt><dd>€${c.price}</dd></div><div><dt>Wanneer</dt><dd>${c.visit}</dd></div></dl><div class="loyalty-card"><strong>${c.stamps} van 10 stempels</strong><progress value="${c.stamps}" max="10" aria-label="Spaarsaldo"></progress><span>${c.stamps===10?'De voorbeeldspaarkaart is vol.':'Elk bezoek een stap dichterbij.'}</span></div>`,b);
  }
  if(b.dataset.payment){paymentMethod=b.dataset.payment;showTab('kassa');content.querySelector(`[data-payment="${paymentMethod}"]`).focus();}
  if(b.hasAttribute('data-pay')){paid=true;showTab('kassa');content.querySelector('[data-reset]').focus();}
  if(b.hasAttribute('data-reset')){paid=false;showTab('kassa');content.querySelector('[data-pay]').focus();}
});
detail.querySelector('[data-close]').addEventListener('click',()=>detail.close());
detail.addEventListener('close',()=>dialogTrigger?.focus());
detail.addEventListener('click',e=>{if(e.target===detail){const r=detail.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)detail.close();}});
showTab('agenda');
