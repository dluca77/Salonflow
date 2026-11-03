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
// Consistent keyboard and close controls for app dialogs.
(() => {
  document.querySelectorAll('.mbg').forEach(backdrop=>{
    const panel=backdrop.querySelector('.modal');
    if(!panel)return;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    const title=panel.querySelector('.mt,[id$="-naam"]');
    if(title){if(!title.id)title.id=backdrop.id+'-title';panel.setAttribute('aria-labelledby',title.id);}
    let close=panel.querySelector('.modal-close');
    if(!close){close=document.createElement('button');close.type='button';close.className='pt-btn modal-close';close.textContent='Sluiten';close.setAttribute('aria-label','Venster sluiten');close.addEventListener('click',()=>backdrop.click());panel.prepend(close);}
    let previous=null,opened=false;
    new MutationObserver(()=>{
      const active=backdrop.classList.contains('on');
      if(active&&!opened){previous=document.activeElement;close.focus();}
      if(!active&&opened&&previous?.isConnected)previous.focus();
      opened=active;
    }).observe(backdrop,{attributes:true,attributeFilter:['class']});
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close.click();return;}
      if(event.key!=='Tab')return;
      const items=[...panel.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
  });
})();
