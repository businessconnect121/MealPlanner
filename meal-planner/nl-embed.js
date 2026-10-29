/* NutriLens ↔ Meal Planner bridge.
   The planner is its own page (meal-planner/index.html) shown in a frame inside the main screen, so its
   layout and code stay separate from NutriLens. Both are on the same site, so they share browser storage. */
(function(){
  const css=document.createElement('style');
  css.textContent=`#mp-view{width:100%}
#mp-view iframe{display:block;width:100%;border:0;background:var(--bg,#fff)}
body.mp-on .api-bar{display:none!important}`;
  document.head.appendChild(css);
  const view=()=>document.getElementById('mp-view');
  const body=()=>document.querySelector('#scr-main .main-body');
  const welcome=()=>document.getElementById('mobile-welcome');
  function size(){ const v=view(); if(!v||v.hidden) return; const f=v.querySelector('iframe'); const top=f.getBoundingClientRect().top+window.scrollY;
    f.style.height=Math.max(420,window.innerHeight-Math.max(0,top-window.scrollY))+'px'; }
  function show(){
    const v=view(), f=v.querySelector('iframe');
    if(!f.src) f.src='meal-planner/index.html?v=202610290414'; // new address each release, so no old copy is shown
    body().style.display='none'; const w=welcome(); if(w){ w.dataset.mpPrev=w.style.display; w.style.display='none'; }
    v.hidden=false; document.body.classList.add('mp-on'); document.getElementById('dnav-planner')?.classList.add('active');
    window.scrollTo(0,0); size();
  }
  function hide(){
    const v=view(); if(!v||v.hidden) return;
    v.hidden=true; document.body.classList.remove('mp-on'); body().style.display=''; const w=welcome(); if(w){ w.style.display=w.dataset.mpPrev||''; }
  }
  // Called at the start of navTo(): handles the planner view and returns true when it did.
  window.mpNav=function(view){ if(view==='planner'){ show(); return true; } hide(); return false; };
  window.addEventListener('resize',size);
  // After leaving Settings, keep the menu highlight on the planner if it's still on screen.
  document.addEventListener('click',e=>{ if(e.target.closest('#scr-settings')) setTimeout(()=>{ const v=view(); if(v&&!v.hidden){ document.querySelectorAll('.drawer-nav-item[id^="dnav-"]').forEach(b=>b.classList.remove('active')); document.getElementById('dnav-planner')?.classList.add('active'); size(); } },0); });
})();
