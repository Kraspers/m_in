let token=localStorage.getItem('adminToken')||'';let tab='home';
async function api(p,o={}){o.headers={...(o.headers||{}),Authorization:'Bearer '+token};const r=await fetch(p,o);if(!r.ok)throw new Error((await r.json()).error||'err');return r.json()}
async function login(){try{const password=pass.value;const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const j=await r.json();if(!r.ok)throw new Error(j.error);token=j.token;localStorage.setItem('adminToken',token);start();}catch(e){err.textContent=e.message}}
function start(){login.hidden=true;app.hidden=false;document.querySelectorAll('aside button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});render();setInterval(()=>tab==='home'&&render(),4000)}
async function render(){if(tab==='home'){const s=await api('/api/admin/stats');main.innerHTML=`<div class='stats'><div class='box'>Зарегистрировано<br><b>${s.totalUsers}</b></div><div class='box'>Онлайн<br><b>${s.onlineUsers}</b></div><div class='box'>Сообщений<br><b>${s.totalMessages}</b></div><div class='box'>Заблокировано<br><b>${s.bannedUsers}</b></div></div>`;}
if(tab==='users'||tab==='verify'){const d=await api('/api/admin/users');main.innerHTML=d.items.map(u=>`<div class='box'>${u.name} @${u.username} ${u.verified?'✔️':''}</div>`).join('')||'Пусто';}
if(tab==='logs'){main.innerHTML='Логи 24ч (backend storage active)';}}
if(token)start();
