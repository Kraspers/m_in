async function loginAdmin(){
  const pass=document.getElementById('pass').value;
  const err=document.getElementById('err');
  err.textContent='';
  try{
    const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'Ошибка входа');
    localStorage.setItem('adminToken',j.token);
    location.href='/admin-panel';
  }catch(e){err.textContent=e.message;}
}
document.getElementById('loginBtn').addEventListener('click',loginAdmin);
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')loginAdmin();});
