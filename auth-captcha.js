/* One fresh, single-use token per Auth request; Supabase verifies it server-side. */
(() => {
  let loading, pending = false;
  function load() {
    if (window.turnstile) return Promise.resolve();
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 15000);
      const fail = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error('De beveiligingscontrole kon niet laden. Probeer opnieuw.')); };
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = fail;
      document.head.append(script);
    });
    return loading;
  }
  window.kronrCaptcha = async () => {
    if (pending) throw new Error('Er loopt al een beveiligingscontrole.');
    pending = true;
    let dialog, widget, timer;
    const previous = document.activeElement;
    try {
      await load();
      return await new Promise((resolve, reject) => {
        dialog = document.createElement('dialog');
        dialog.setAttribute('aria-label', 'Beveiligingscontrole');
        dialog.style.cssText = 'margin:auto;border:1px solid #ded5e7;border-radius:18px;padding:24px;background:#faf8f2;color:#291d32;max-width:calc(100vw - 32px);font:14px Inter, sans-serif';
        const title = document.createElement('p'); title.textContent = 'Een korte beveiligingscontrole';
        const target = document.createElement('div');
        const cancel = document.createElement('button'); cancel.textContent = 'Annuleren';
        cancel.style.cssText = 'display:block;margin-top:16px;padding:10px 16px;margin:auto;border:1px solid #ded5e7;border-radius:8px;background:transparent;color:inherit;cursor:pointer';
        const fail = () => reject(new Error('Beveiligingscontrole niet afgerond. Probeer opnieuw.'));
        cancel.onclick = fail;
        dialog.addEventListener('cancel', fail);
        dialog.append(title, target, cancel); document.body.append(dialog); dialog.showModal();
        timer = setTimeout(fail, 120000);
        widget = window.turnstile.render(target, {
          sitekey: '0x4AAAAAAD0aeX0QQ5F-MtW4', size: 'flexible', theme: 'light',
          callback: token => token ? resolve(token) : fail(),
          'error-callback': fail, 'expired-callback': fail, 'timeout-callback': fail
        });
      });
    } finally {
      clearTimeout(timer);
      if (widget !== undefined) window.turnstile.remove(widget);
      dialog?.remove(); pending = false;
      previous?.focus?.({ preventScroll: true });
    }
  };
})();
