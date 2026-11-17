/* One persistent shape, three meanings. No requests or customer records. */
(function (root) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { v=clamp(v); return v*v*v*(v*(v*6-15)+10); };
  const mix = (a,b,t) => a+(b-a)*t;
  function stateAt(progress) {
    const p=clamp(progress), a=smooth((p-.24)/.14), b=smooth((p-.60)/.15);
    const weights=[1-a,a*(1-b),b];
    const forms=[[218,362,164,60,30],[116,305,440,68,12],[180,373,240,60,30]];
    const shape=forms[0].map((v,i)=>mix(mix(v,forms[1][i],a),forms[2][i],b));
    const lift=4*a*(1-a)+4*b*(1-b);
    shape[1]-=12*lift;
    return {progress:p,weights,shape,lift,stage:b>.5?2:a>.5?1:0};
  }
  const api={stateAt,clamp};
  if(typeof module==='object' && module.exports){module.exports=api;return;}
  const film=document.getElementById('product-film');if(!film)return;
  const shape=film.querySelector('#film-shape'), layers=[...film.querySelectorAll('[data-film-layer]')],
    captions=[...film.querySelectorAll('[data-film-caption]')], steps=[...film.querySelectorAll('[data-film-step]')],
    labels=['film-booking-text','film-agenda-text','film-receipt-text'].map(id=>document.getElementById(id)),
    toggle=document.getElementById('film-toggle'), status=document.getElementById('film-status'),
    reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const light=document.getElementById('film-light'),sheen=document.getElementById('film-sheen');
  const duration=16000, stops=[.12,.49,.88];
  let progress=0, paused=reduced.matches, visible=false, frame=0, previous=null, stage=-1;
  const descriptions=['Voorbeeld: Lisa kiest 11:00 voor haar behandeling.','Voorbeeld: Lisa’s afspraak staat in de agenda.','Voorbeeld: de behandeling is afgerond op een bon van €72,00. Geen echte betaling.'];
  function paint(){
    const s=stateAt(progress);
    film.style.setProperty('--film-depth',reduced.matches?'0':s.lift.toFixed(4));
    light.setAttribute('transform',`translate(${(s.weights[1]-s.weights[2])*32} ${-s.lift*16})`);
    sheen.setAttribute('gradientTransform',`translate(${-160+progress*1000} 0)`);
    ['x','y','width','height','rx'].forEach((key,i)=>shape.setAttribute(key,s.shape[i].toFixed(3)));
    layers.forEach((layer,i)=>{
      const w=s.weights[i];layer.setAttribute('opacity',w.toFixed(4));
      layer.setAttribute('transform',`translate(0 ${(1-w)*14}) translate(300 300) scale(${.985+.015*w}) translate(-300 -300)`);
      labels[i].setAttribute('opacity',Math.max(0,(w-.55)/.45).toFixed(4));
      captions[i].setAttribute('opacity',w.toFixed(4));
      steps[i].querySelector('span').style.transform=`scaleX(${clamp(progress*3-i)})`;
    });
    if(s.stage!==stage){stage=s.stage;steps.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===stage)));status.textContent=descriptions[stage];}
    toggle.textContent=progress>=1?'Opnieuw':paused?'Afspelen':'Pauze';
    toggle.setAttribute('aria-label',progress>=1?'Animatie opnieuw afspelen':paused?'Animatie afspelen':'Animatie pauzeren');
  }
  function stopFrame(){cancelAnimationFrame(frame);frame=0;previous=null;}
  function tick(now){
    frame=0;if(paused||!visible||document.hidden)return;
    if(previous!==null)progress=clamp(progress+Math.min(now-previous,100)/duration);
    previous=now;paint();
    if(progress<1)frame=requestAnimationFrame(tick);else{paused=true;previous=null;paint();}
  }
  function run(){stopFrame();if(!paused&&visible&&!document.hidden&&progress<1)frame=requestAnimationFrame(tick);}
  steps.forEach((button,i)=>button.addEventListener('click',()=>{
    paused=true;stopFrame();
    const from=progress,to=stops[i];let started=null;
    if(reduced.matches||!visible){progress=to;paint();return;}
    function seek(now){
      if(started===null)started=now;
      const t=clamp((now-started)/850);
      progress=mix(from,to,smooth(t));paint();
      frame=t<1?requestAnimationFrame(seek):0;
    }
    frame=requestAnimationFrame(seek);
  }));
  toggle.addEventListener('click',()=>{if(progress>=1)progress=0;paused=!paused;paint();run();});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;run();},{threshold:.25}).observe(film);
  document.addEventListener('visibilitychange',run);
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;stopFrame();paint();}});
  paint();
})(typeof window==='undefined'?globalThis:window);
