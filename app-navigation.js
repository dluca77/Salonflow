// Keyboard support for the shared mobile navigation, independent of salon data.
(() => {
  const menu=document.getElementById('sb');
  const trigger=document.querySelector('.hbg');
  const main=document.querySelector('.main');
  if(!menu||!trigger)return;
  trigger.setAttribute('aria-label','Menu openen');
  trigger.setAttribute('aria-controls','sb');
  menu.setAttribute('role','dialog');
  menu.setAttribute('aria-label','Hoofdnavigatie');
  menu.querySelector('.mob-x')?.setAttribute('aria-label','Menu sluiten');
  let wasOpen=false;
  const sync=()=>{
    const open=menu.classList.contains('on');
    trigger.setAttribute('aria-expanded',String(open));
    menu.inert=!open;
    menu.setAttribute('aria-modal',String(open));
    if(main)main.inert=open;
    if(open&&!wasOpen)menu.querySelector('.mob-x')?.focus();
    if(!open&&wasOpen)trigger.focus();
    wasOpen=open;
  };
  new MutationObserver(sync).observe(menu,{attributes:true,attributeFilter:['class']});
  menu.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();menu.querySelector('.mob-x')?.click();return;}
    if(e.key!=='Tab')return;
    const stops=[...menu.querySelectorAll('a[href],button,input,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    const first=stops[0],last=stops[stops.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  });
  window.addEventListener('resize',()=>{
    if(wasOpen&&getComputedStyle(trigger).display==='none')menu.querySelector('.mob-x')?.click();
  });
  sync();
})();
