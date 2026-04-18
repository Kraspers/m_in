  /* ── Навигация ── */
  function isDesktop(){ return window.innerWidth >= 768; }

  /* Экраны, которые на десктопе открываются в сайдбаре (поверх списка чатов) */
  const SIDEBAR_OVERLAY=['screen-search','screen-profile'];
  /* Экраны правой панели */
  const RIGHT_PANEL=['screen-chat','screen-favorites'];

  function resetScreen(s){s.classList.remove('active');s.style.transform='';s.style.transition='';s.style.opacity='';s.style.pointerEvents='';}

  function showScreen(id){
    if(isDesktop()){
      if(id==='screen-list'){
        /* Закрываем оверлеи сайдбара (поиск, профиль) */
        SIDEBAR_OVERLAY.forEach(sid=>resetScreen(document.getElementById(sid)));
        return;
      }
      if(SIDEBAR_OVERLAY.includes(id)){
        /* Открываем в сайдбаре поверх списка чатов */
        SIDEBAR_OVERLAY.forEach(sid=>{ if(sid!==id) resetScreen(document.getElementById(sid)); });
        document.getElementById(id).classList.add('active');
        if(id==='screen-search') setTimeout(()=>{doSearch('');document.getElementById('search-input').focus();},80);
        return;
      }
      /* Правая панель */
      RIGHT_PANEL.forEach(sid=>resetScreen(document.getElementById(sid)));
      document.getElementById(id).classList.add('active');
      document.body.classList.add('has-right-screen');
      if(id==='screen-chat') setTimeout(()=>document.getElementById('chat-bottom').scrollIntoView({behavior:'smooth'}),50);
      if(id==='screen-favorites') setTimeout(()=>document.getElementById('fav-bottom').scrollIntoView({behavior:'smooth'}),50);
      return;
    }
    /* Мобильное поведение */
    document.querySelectorAll('.screen').forEach(s=>resetScreen(s));
    document.getElementById(id).classList.add('active');
    if(id==='screen-chat') setTimeout(()=>document.getElementById('chat-bottom').scrollIntoView({behavior:'smooth'}),50);
    if(id==='screen-favorites') setTimeout(()=>document.getElementById('fav-bottom').scrollIntoView({behavior:'smooth'}),50);
    if(id==='screen-search') setTimeout(()=>{doSearch('');document.getElementById('search-input').focus();},80);
  }

  /* ── Избранное ── */
  function openFavorites(){ showScreen('screen-favorites'); }

  function updateFavBtn(){
    const btn=document.getElementById('fav-send-btn');
    const val=document.getElementById('fav-input').value.trim();
    const hasMedia=attachedFavMedia.length>0;
    const editingMedia=favEditingBubble&&!favEditMediaRemoved&&!!favEditingBubble.querySelector('.msg-media-grid');
    const active=val||hasMedia||editingMedia;
    btn.style.opacity=active?'1':'0.4';
    btn.style.pointerEvents=active?'all':'none';
  }

  function sendFavMessage(){
    const inp=document.getElementById('fav-input');
    const txt=inp.value.trim();
    const hasMedia=attachedFavMedia.length>0;
    if(!txt&&!hasMedia&&!favEditingBubble)return;
    /* Режим редактирования в избранном */
    if(favEditingBubble){
      const hasEditMedia=!!favEditingBubble.querySelector('.msg-media-grid');
      if(!txt&&!hasEditMedia){dismissFavEdit();return;}
      const pEl=favEditingBubble.querySelector('p.msg-text-out');
      if(txt){
        if(pEl){
          pEl.textContent=txt;
        } else if(hasEditMedia){
          const metaEl=favEditingBubble.querySelector('.msg-meta');
          const cap=document.createElement('p');
          cap.className='msg-text-out';
          cap.style.cssText='padding:4px 8px 0;margin:0;';
          cap.textContent=txt;
          if(metaEl) favEditingBubble.insertBefore(cap,metaEl);
          const ovl=favEditingBubble.querySelector('.media-time-ovl');
          if(ovl) ovl.remove();
          const footMeta=favEditingBubble.querySelector('.media-meta-foot');
          if(footMeta){footMeta.style.display='flex';footMeta.classList.remove('media-meta-foot');}
          favEditingBubble.style.padding='3px 4px 6px 4px';
        }
      } else if(hasEditMedia&&pEl){
        /* Удаляем подпись — восстанавливаем вид чистого медиа (время поверх фото) */
        const metaEl=favEditingBubble.querySelector('.msg-meta');
        const timeText=metaEl?metaEl.querySelector('.msg-time-out')?.textContent:'';
        const tickSvg=metaEl?metaEl.querySelector('svg')?.outerHTML:'';
        pEl.remove();
        if(metaEl){metaEl.classList.add('media-meta-foot');metaEl.style.display='';}
        const relDiv=favEditingBubble.querySelector('div[style*="position:relative"]');
        if(relDiv&&timeText){
          const ovl=document.createElement('div');
          ovl.className='media-time-ovl';
          ovl.innerHTML=`<span class="msg-time-out">${timeText}</span>${tickSvg||''}`;
          relDiv.appendChild(ovl);
        }
        favEditingBubble.style.padding='3px';
      }
      inp.value='';
      dismissFavEdit();
      return;
    }
    if(!txt&&!hasMedia)return;
    const msgs=document.getElementById('fav-messages');
    const anchor=document.getElementById('fav-bottom');
    const now=new Date();
    const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const w=document.createElement('div');
    w.style.cssText='align-self:flex-end;max-width:78%;';
    const thumbHtml=replyToMediaSrc
      ?`<img src="${replyToMediaSrc}" style="width:34px;height:34px;border-radius:5px;object-fit:cover;flex-shrink:0;" />`
      :`<div style="width:34px;height:34px;border-radius:5px;background:rgba(255,255,255,0.22);flex-shrink:0;"></div>`;
    const quoteHtml=replyToName
      ?(replyToText==='__media__'
        ?`<div class="msg-quote-out" data-reply-mid="${replyToMediaMid}" style="display:flex;align-items:center;gap:7px;">${thumbHtml}<div><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Медиа</div></div></div>`
        :`<div class="msg-quote-out"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">${esc(replyToText)}</div></div>`)
      :'';
    const tick=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(hasMedia){
      const mid='m'+(++msgIdCounter);
      const textPart=txt?`<p class="msg-text-out" style="padding:4px 8px 0;margin:0;">${esc(txt)}</p>`:'';
      if(!quoteHtml&&!txt){
        const pureGrid=buildMediaGrid(attachedFavMedia.slice(),mid,'calc(1.4rem - 3px) calc(1.4rem - 3px) 0 calc(1.4rem - 3px)');
        w.innerHTML=`<div class="bubble-out msg-bubble" style="padding:3px;"><div style="position:relative;line-height:0;">${pureGrid}<div class="media-time-ovl"><span class="msg-time-out">${t}</span>${tick}</div></div><div class="msg-meta media-meta-foot"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
      } else {
        if(quoteHtml) w.style.cssText='align-self:flex-end;max-width:calc(100% - 24px);';
        const topBr=quoteHtml?'0':'calc(1.4rem - 3px)';
        const gridBr=`${topBr} ${topBr} 0 0`;
        const gridHtml=buildMediaGrid(attachedFavMedia.slice(),mid,gridBr);
        const gridWrapped=`<div style="overflow:hidden;margin-bottom:${txt?'4px':'0'};">${gridHtml}</div>`;
        const tp=quoteHtml?'10px':'3px';
        w.innerHTML=`<div class="bubble-out msg-bubble" style="padding:${tp} 4px 6px 4px;">${quoteHtml}${gridWrapped}${textPart}<div class="msg-meta" style="padding-right:4px;"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
      }
    } else {
      w.innerHTML=`<div class="bubble-out msg-bubble">${quoteHtml}<p class="msg-text-out">${esc(txt)}</p><div class="msg-meta"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
    }
    msgs.insertBefore(w,anchor);
    inp.value='';
    dismissFavReply();
    clearFavMedia();
    updateFavBtn();
    anchor.scrollIntoView({behavior:'smooth'});
    const newFavBubble=w.querySelector('.msg-bubble');
    bindBubble(newFavBubble);
    bindMsgRow(w);
    newFavBubble.querySelectorAll('.msg-quote-out').forEach(bindQuoteTap);
  }

  /* ── Кнопка отправки ── */
  let editMediaRemoved=false;
  let favEditMediaRemoved=false;

  function updateSendBtn(){
    const btn=document.getElementById('send-btn');
    const inp=document.getElementById('msg-input');
    if(!btn||!inp)return;
    const val=inp.value.trim();
    const hasMedia=attachedMedia.length>0;
    const editingMedia=editingBubble&&!editMediaRemoved&&!!editingBubble.querySelector('.msg-media-grid');
    const active=val||hasMedia||editingMedia;
    btn.style.opacity=active?'1':'0.4';
    btn.style.pointerEvents=active?'all':'none';
  }

  /* ── Медиа ── */
  const MAX_MEDIA=10;
  let attachedMedia=[];
  let attachedFavMedia=[];
  const msgMediaMap={};
  let msgIdCounter=0;
  let favEditingBubble=null;

  function triggerMedia(){document.getElementById('media-file').click();}

  /* ── Медиа избранного ── */
  function addFavMedia(input){
    Array.from(input.files).forEach(file=>{
      if(attachedFavMedia.length>=MAX_MEDIA)return;
      const type=file.type.startsWith('video')?'video':'image';
      attachedFavMedia.push({type,src:URL.createObjectURL(file)});
    });
    input.value='';
    renderFavMediaPreview();
  }
  function removeFavMedia(idx){attachedFavMedia.splice(idx,1);renderFavMediaPreview();}
  function renderFavMediaPreview(){
    const strip=document.getElementById('fav-media-preview');
    strip.querySelectorAll('.media-thumb:not(.fav-edit-media-thumb)').forEach(e=>e.remove());
    if(!attachedFavMedia.length){
      if(!strip.querySelector('.fav-edit-media-thumb'))strip.classList.remove('show');
      updateFavBtn();return;
    }
    strip.classList.add('show');
    updateFavBtn();
    const html=attachedFavMedia.map((m,i)=>`<div class="media-thumb">${
      m.type==='video'?`<video src="${m.src}" muted playsinline></video>`:`<img src="${m.src}" alt="">`
    }<button class="media-thumb-del" onclick="removeFavMedia(${i})"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="1" y1="1" x2="9" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>`).join('');
    const editThumb=strip.querySelector('.fav-edit-media-thumb');
    if(editThumb)editThumb.insertAdjacentHTML('afterend',html);
    else strip.innerHTML=html;
  }
  function clearFavMedia(){attachedFavMedia=[];renderFavMediaPreview();}

  function addMedia(input){
    Array.from(input.files).forEach(file=>{
      if(attachedMedia.length>=MAX_MEDIA)return;
      const type=file.type.startsWith('video')?'video':'image';
      attachedMedia.push({type,src:URL.createObjectURL(file)});
    });
    input.value='';
    renderMediaPreview();
  }

  function removeMedia(idx){attachedMedia.splice(idx,1);renderMediaPreview();}

  function renderMediaPreview(){
    const strip=document.getElementById('media-preview');
    if(!attachedMedia.length){strip.classList.remove('show');strip.innerHTML='';updateSendBtn();return;}
    strip.classList.add('show');
    updateSendBtn();
    strip.innerHTML=attachedMedia.map((m,i)=>`<div class="media-thumb">${
      m.type==='video'?`<video src="${m.src}" muted playsinline></video>`:`<img src="${m.src}" alt="">`
    }<button class="media-thumb-del" onclick="removeMedia(${i})"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="1" y1="1" x2="9" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>`).join('');
  }

  function clearMedia(){attachedMedia=[];renderMediaPreview();}

  function buildMediaGrid(media,mid,br){
    msgMediaMap[mid]=media;
    const MAX_SHOW=9;
    const show=media.slice(0,MAX_SHOW);
    const extra=media.length-MAX_SHOW;
    const cls='n'+Math.min(media.length,MAX_SHOW);
    const uploadSvg=`<div class="mi-upload-anim"><svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="rgba(0,0,0,0.28)" stroke="none"/><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2.8"/><circle cx="22" cy="22" r="18" fill="none" stroke="#fff" stroke-width="2.8" stroke-dasharray="113" stroke-dashoffset="113" class="upload-arc"/></svg></div>`;
    const items=show.map((m,i)=>{
      const isLast=i===show.length-1&&extra>0;
      const content=m.type==='video'
        ?`<video src="${m.src}" autoplay muted loop playsinline></video>`
        :`<img src="${m.src}" alt="">`;
      const moreOvl=isLast?`<div class="mi-more">+${extra+1}</div>`:'';
      return `<div class="mi" onclick="openViewer('${mid}',${i})">${content}${uploadSvg}${moreOvl}</div>`;
    });
    const st=br?`style="border-radius:${br};"`:''
    return `<div class="msg-media-grid ${cls}" ${st}>${items.join('')}</div>`;
  }

  /* ── Отправка ── */
  function sendMessage(){
    const inp=document.getElementById('msg-input');
    const txt=inp.value.trim();
    const hasMedia=attachedMedia.length>0;
    if(!txt&&!hasMedia&&!editingBubble)return;
    /* Режим редактирования */
    if(editingBubble){
      let hasEditMedia=!!editingBubble.querySelector('.msg-media-grid');
      /* Если медиа было удалено при редактировании — убираем его из DOM */
      if(editMediaRemoved&&hasEditMedia){
        const grid=editingBubble.querySelector('.msg-media-grid');
        if(grid){
          const gridParent=grid.parentElement;
          if(gridParent!==editingBubble)gridParent.remove();
          else grid.remove();
        }
        const ovl=editingBubble.querySelector('.media-time-ovl');
        if(ovl) ovl.remove();
        const footMeta=editingBubble.querySelector('.media-meta-foot');
        if(footMeta){footMeta.style.display='';footMeta.classList.remove('media-meta-foot');}
        const capEl=editingBubble.querySelector('p.msg-text-out');
        if(capEl)capEl.style.cssText='';
        editingBubble.style.padding='';
        hasEditMedia=false;
      }
      /* Пользователь добавил новое медиа при редактировании текстового сообщения */
      if(hasMedia&&!hasEditMedia){
        const mid='m'+(++msgIdCounter);
        const pEl2=editingBubble.querySelector('p.msg-text-out');
        const metaEl2=editingBubble.querySelector('.msg-meta');
        const reactDiv2=editingBubble.querySelector('.msg-reactions');
        const insertAnchor2=reactDiv2||metaEl2;
        const currentTxt=txt||(pEl2?pEl2.textContent.trim():'');
        if(pEl2)pEl2.remove();
        const gridBr='calc(1.4rem - 3px) calc(1.4rem - 3px) 0 0';
        const gridHtml2=buildMediaGrid(attachedMedia.slice(),mid,gridBr);
        const gridWrap=document.createElement('div');
        gridWrap.style.cssText='overflow:hidden;margin-bottom:'+(currentTxt?'4px':'0')+';';
        gridWrap.innerHTML=gridHtml2;
        if(insertAnchor2)editingBubble.insertBefore(gridWrap,insertAnchor2);
        else editingBubble.appendChild(gridWrap);
        if(currentTxt){
          const cap=document.createElement('p');
          cap.className='msg-text-out';
          cap.style.cssText='padding:4px 8px 0;margin:0;';
          cap.textContent=currentTxt;
          if(insertAnchor2)editingBubble.insertBefore(cap,insertAnchor2);
          else editingBubble.appendChild(cap);
        }
        editingBubble.style.padding='3px 4px 6px 4px';
        if(metaEl2)metaEl2.style.paddingRight='4px';
        inp.value='';
        clearMedia();
        dismissEdit();
        return;
      }
      if(!txt&&!hasEditMedia){dismissEdit();return;}
      const pEl=editingBubble.querySelector('p.msg-text-out');
      if(txt){
        if(pEl){
          pEl.textContent=txt;
        } else if(hasEditMedia){
          /* Добавляем подпись к медиа-сообщению */
          const metaEl=editingBubble.querySelector('.msg-meta');
          const reactDiv=editingBubble.querySelector('.msg-reactions');
          const cap=document.createElement('p');
          cap.className='msg-text-out';
          cap.style.cssText='padding:4px 8px 0;margin:0;';
          cap.textContent=txt;
          const beforeEl=reactDiv||metaEl;
          if(beforeEl) editingBubble.insertBefore(cap,beforeEl);
          /* Убираем наложение времени поверх фото, показываем время снизу */
          const ovl=editingBubble.querySelector('.media-time-ovl');
          if(ovl) ovl.remove();
          const footMeta=editingBubble.querySelector('.media-meta-foot');
          if(footMeta){footMeta.style.display='flex';footMeta.classList.remove('media-meta-foot');footMeta.style.paddingRight='4px';}
          const metaElPad=editingBubble.querySelector('.msg-meta');
          if(metaElPad) metaElPad.style.paddingRight='4px';
          editingBubble.style.padding='3px 4px 6px 4px';
        } else {
          /* Медиа было удалено, создаём текстовый параграф */
          const metaEl=editingBubble.querySelector('.msg-meta');
          const cap=document.createElement('p');
          cap.className='msg-text-out';
          cap.textContent=txt;
          if(metaEl) editingBubble.insertBefore(cap,metaEl);
          editingBubble.style.padding='';
        }
      } else if(hasEditMedia&&pEl){
        /* Удаляем подпись — восстанавливаем вид чистого медиа (время поверх фото) */
        const metaEl=editingBubble.querySelector('.msg-meta');
        const timeText=metaEl?metaEl.querySelector('.msg-time-out')?.textContent:'';
        const tickSvg=metaEl?metaEl.querySelector('svg')?.outerHTML:'';
        pEl.remove();
        if(metaEl){metaEl.classList.add('media-meta-foot');metaEl.style.display='';}
        const relDiv=editingBubble.querySelector('div[style*="position:relative"]');
        if(relDiv&&timeText){
          const ovl=document.createElement('div');
          ovl.className='media-time-ovl';
          ovl.innerHTML=`<span class="msg-time-out">${timeText}</span>${tickSvg||''}`;
          relDiv.appendChild(ovl);
        }
        editingBubble.style.padding='3px';
      }
      inp.value='';
      dismissEdit();
      return;
    }
    const msgs=document.getElementById('chat-messages');
    const anchor=document.getElementById('chat-bottom');
    const now=new Date();
    const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const w=document.createElement('div');
    w.style.cssText='align-self:flex-end;max-width:78%;';
    const thumbHtml=replyToMediaSrc
      ?`<img src="${replyToMediaSrc}" style="width:34px;height:34px;border-radius:5px;object-fit:cover;flex-shrink:0;" />`
      :`<div style="width:34px;height:34px;border-radius:5px;background:rgba(255,255,255,0.22);flex-shrink:0;"></div>`;
    const quoteHtml=replyToName
      ?(replyToText==='__media__'
        ?`<div class="msg-quote-out" data-reply-mid="${replyToMediaMid}" style="display:flex;align-items:center;gap:7px;">${thumbHtml}<div><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Медиа</div></div></div>`
        :`<div class="msg-quote-out"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">${esc(replyToText)}</div></div>`)
      :'';
    const tick=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(hasMedia){
      const mid='m'+(++msgIdCounter);
      const textPart=txt?`<p class="msg-text-out" style="padding:4px 8px 0;margin:0;">${esc(txt)}</p>`:'';
      if(!quoteHtml&&!txt){
        /* Чистое медиа — Telegram-стиль: правильный внутренний радиус, время поверх изображения */
        w.style.cssText='align-self:flex-end;max-width:78%;';
        const pureGrid=buildMediaGrid(attachedMedia.slice(),mid,'calc(1.4rem - 3px) calc(1.4rem - 3px) 0 calc(1.4rem - 3px)');
        w.innerHTML=`<div class="bubble-out msg-bubble" style="padding:3px;"><div style="position:relative;line-height:0;">${pureGrid}<div class="media-time-ovl"><span class="msg-time-out">${t}</span>${tick}</div></div><div class="msg-meta media-meta-foot"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
      } else {
        /* Медиа с цитатой или текстом — обычный вид, шире если есть цитата */
        if(quoteHtml) w.style.cssText='align-self:flex-end;max-width:calc(100% - 24px);';
        /* Радиус углов сетки: верх — внутренние углы пузыря (если нет цитаты), иначе 0 */
        const topBr=quoteHtml?'0':'calc(1.4rem - 3px)';
        const gridBr=`${topBr} ${topBr} 0 0`;
        const gridHtml=buildMediaGrid(attachedMedia.slice(),mid,gridBr);
        const gridWrapped=`<div style="overflow:hidden;margin-bottom:${txt?'4px':'0'};">${gridHtml}</div>`;
        const tp=quoteHtml?'10px':'3px';
        w.innerHTML=`<div class="bubble-out msg-bubble" style="padding:${tp} 4px 6px 4px;">${quoteHtml}${gridWrapped}${textPart}<div class="msg-meta" style="padding-right:4px;"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
      }
    }else{
      w.innerHTML=`<div class="bubble-out msg-bubble">${quoteHtml}<p class="msg-text-out">${esc(txt)}</p><div class="msg-meta"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
    }
    msgs.insertBefore(w,anchor);
    /* ── Анимация загрузки (как в Telegram) ── */
    if(hasMedia){
      const anims=w.querySelectorAll('.mi-upload-anim');
      setTimeout(()=>{
        anims.forEach(el=>{
          el.classList.add('done');
          setTimeout(()=>el.remove(),400);
        });
      },1150);
    }
    inp.value='';
    dismissReply();
    clearMedia();
    updateSendBtn();
    anchor.scrollIntoView({behavior:'smooth'});
    const newBubble=w.querySelector('.msg-bubble');
    bindBubble(newBubble);
    bindMsgRow(w);
    newBubble.querySelectorAll('.msg-quote-out').forEach(bindQuoteTap);
  }

  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  /* ── Контекстное меню ── */
  const overlay=document.getElementById('ctx-overlay');
  const ctxMsgWrap=document.getElementById('ctx-msg-wrap');
  const ctxMenu=document.getElementById('ctx-menu');
  const ctxEdit=document.getElementById('ctx-edit');
  const ctxDelete=document.getElementById('ctx-delete');
  let pressTimer=null;
  let currentBubble=null;
  let closeTimer=null;
  let replyToName='';
  let replyToText='';
  let replyToMediaSrc='';
  let replyToMediaMid='';
  let ctxMsgOriginalOffset=0;
  let scaleTimer=null;
  let editingBubble=null;
  let pinnedBubble=null;
  let favPinnedBubble=null;
  let forwardingBubble=null;
  let forwardingSenderName='';

  function resetBubbleScale(el){
    el.style.transition='transform 0.18s ease';
    el.style.transform='';
  }

  function bindBubble(el){
    let tsX=0,tsY=0,tMoved=false;
    let lastTapTime=0;

    el.addEventListener('touchstart',e=>{
      tsX=e.touches[0].clientX;tsY=e.touches[0].clientY;tMoved=false;
      pressTimer=setTimeout(()=>openCtx(el),480);
      scaleTimer=setTimeout(()=>{if(!tMoved){el.style.transition='transform 0.22s ease';el.style.transform='scale(0.94)';}},220);
    },{passive:true});

    el.addEventListener('touchmove',e=>{
      const dx=Math.abs(e.touches[0].clientX-tsX);
      const dy=Math.abs(e.touches[0].clientY-tsY);
      if(dx>7||dy>7){
        tMoved=true;
        clearTimeout(pressTimer);clearTimeout(scaleTimer);resetBubbleScale(el);
      }
    },{passive:true});

    let didTouchReact=false;
    el.addEventListener('touchend',e=>{
      clearTimeout(pressTimer);clearTimeout(scaleTimer);resetBubbleScale(el);
      if(tMoved)return;
      const now=Date.now();
      if(now-lastTapTime<320&&now-lastTapTime>50){
        addReaction(el,'❤️');
        didTouchReact=true;
        setTimeout(()=>{didTouchReact=false;},600);
      }
      lastTapTime=now;
    });
    el.addEventListener('dblclick',e=>{if(!didTouchReact)addReaction(el,'❤️');});
    el.addEventListener('mousedown',()=>{
      scaleTimer=setTimeout(()=>{el.style.transition='transform 0.22s ease';el.style.transform='scale(0.94)';},220);
      pressTimer=setTimeout(()=>openCtx(el),480);
    });
    el.addEventListener('mouseup',()=>{clearTimeout(pressTimer);clearTimeout(scaleTimer);resetBubbleScale(el);});
    el.addEventListener('mouseleave',()=>{clearTimeout(pressTimer);clearTimeout(scaleTimer);resetBubbleScale(el);});
    el.addEventListener('contextmenu',e=>{e.preventDefault();openCtx(el);});
    /* Привязываем цитаты к клику — для пузырей, созданных после загрузки страницы */
    const quoteEl=el.querySelector('.msg-quote-out');
    if(quoteEl) bindQuoteTap(quoteEl);
  }

  function openCtx(el){
    currentBubble=el;
    clearTimeout(scaleTimer);
    el.style.transition='transform 0.18s ease';el.style.transform='';
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null;}
    overlay.classList.remove('open');

    const isOut=el.classList.contains('bubble-out');

    /* показываем/скрываем кнопки только для своих сообщений */
    const isForwarded=el.classList.contains('msg-fwd');
    ctxEdit.style.display=(isOut&&!isForwarded)?'flex':'none';
    ctxDelete.style.display=isOut?'flex':'none';

    /* Закрепить/Открепить */
    const inFavCtx=!!el.closest('#fav-messages');
    const isPinned=inFavCtx?(favPinnedBubble&&favPinnedBubble===el):(pinnedBubble&&pinnedBubble===el);
    document.getElementById('ctx-pin-label').textContent=isPinned?'Открепить':'Закрепить';

    const clone=el.cloneNode(true);
    clone.style.display='inline-flex';
    clone.style.flexDirection='column';
    ctxMsgWrap.innerHTML='';
    ctxMsgWrap.appendChild(clone);

    const rect=el.getBoundingClientRect();
    const vw=window.innerWidth;
    const vh=window.innerHeight;
    const safeTop=112;
    const safeBot=vh-16;
    const gap=20;

    /* высота меню — точнее считаем реальное число пунктов */
    const visibleItems=Array.from(ctxMenu.querySelectorAll('.ctx-item')).filter(b=>b.style.display!=='none');
    const menuH=visibleItems.length*50+2;

    /* начальная позиция клона */
    let cloneTop=Math.max(safeTop,rect.top);
    const cloneH=rect.height;

    /* выбираем сторону для меню без перекрытия клона */
    const spaceBelow=safeBot-(cloneTop+cloneH+gap);
    const spaceAbove=cloneTop-gap-safeTop;
    let menuTop;

    if(spaceBelow>=menuH){
      /* достаточно места ниже — меню под сообщением */
      menuTop=cloneTop+cloneH+gap;
    } else if(spaceAbove>=menuH){
      /* достаточно места выше — меню над сообщением */
      menuTop=cloneTop-menuH-gap;
    } else {
      /* места мало с обеих сторон */
      if(spaceBelow>=spaceAbove){
        /* больше места снизу — меню под, сжимаем если надо */
        menuTop=cloneTop+cloneH+gap;
      } else {
        /* больше места сверху — меню над, двигаем клон вниз чтобы не перекрыться */
        menuTop=safeTop;
        cloneTop=safeTop+menuH+gap;
      }
    }

    ctxMsgWrap.style.top=cloneTop+'px';
    ctxMsgWrap.style.left=isOut?'auto':'12px';
    ctxMsgWrap.style.right=isOut?'12px':'auto';
    ctxMsgWrap.style.maxWidth=Math.min(rect.width+32,vw*0.82)+'px';

    ctxMenu.style.top=menuTop+'px';
    ctxMenu.style.left=isOut?'auto':'12px';
    ctxMenu.style.right=isOut?'12px':'auto';

    /* Сохраняем смещение для обратной анимации при закрытии */
    ctxMsgOriginalOffset=rect.top-cloneTop;
    /* Начинаем с позиции оригинального сообщения */
    ctxMsgWrap.style.transition='none';
    ctxMsgWrap.style.transform=`translateY(${ctxMsgOriginalOffset}px)`;

    /* запускаем анимацию в следующем кадре чтобы transition отработал */
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      overlay.classList.add('open');
      ctxMsgWrap.style.transition='transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
      ctxMsgWrap.style.transform='translateY(0)';
    }));
  }

  function closeCtx(e){
    if(e&&e.target!==document.getElementById('ctx-blur-bg')&&e.target!==overlay)return;
    closeCtxClean();
  }
  function closeCtxClean(){
    overlay.style.pointerEvents='none';
    /* Плавное затухание фона */
    overlay.style.transition='opacity 0.30s ease';
    overlay.style.opacity='0';
    /* Сообщение плавно возвращается на место */
    ctxMsgWrap.style.transition='transform 0.28s cubic-bezier(0.36,0,0.66,0)';
    ctxMsgWrap.style.transform=`translateY(${ctxMsgOriginalOffset}px)`;
    /* Анимация меню */
    ctxMenu.style.transition='transform 0.28s cubic-bezier(0.36,0,0.66,0),opacity 0.24s ease';
    ctxMenu.style.transform='scale(0.86)';
    ctxMenu.style.opacity='0';
    closeTimer=setTimeout(()=>{
      overlay.classList.remove('open');
      overlay.style.transition='';overlay.style.opacity='';overlay.style.pointerEvents='';
      ctxMsgWrap.style.transition='';ctxMsgWrap.style.transform='';
      ctxMenu.style.transition='';ctxMenu.style.transform='';ctxMenu.style.opacity='';
      setTimeout(()=>{ctxMsgWrap.innerHTML='';closeTimer=null;},100);
    },310);
  }

  /* ── Ответить ── */
  function doReply(){
    if(!currentBubble)return;
    const inFav=!!currentBubble.closest('#fav-messages');
    const isOut=currentBubble.classList.contains('bubble-out');
    const msgText=currentBubble.querySelector('p');
    const hasMediaGrid=!!currentBubble.querySelector('.msg-media-grid');
    const rawText=msgText?msgText.textContent.trim().slice(0,80):'';
    const preview=rawText||(hasMediaGrid?'__media__':'');

    let senderName='Вы';
    if(!isOut){
      const wrap=currentBubble.closest('div[style*="flex-start"]');
      if(wrap){
        const nameEl=wrap.querySelector('[style*="color:#8E8E93"]');
        if(nameEl) senderName=nameEl.textContent.trim();
      }
    }

    replyToName=senderName;
    replyToText=preview;
    replyToMediaSrc='';
    replyToMediaMid='';
    if(preview==='__media__'){
      const firstImg=currentBubble.querySelector('.msg-media-grid img');
      const firstVid=currentBubble.querySelector('.msg-media-grid video');
      replyToMediaSrc=(firstImg?firstImg.src:firstVid?firstVid.src:'');
      const grid=currentBubble.querySelector('.msg-media-grid');
      if(grid){
        const mi=grid.querySelector('.mi[onclick]');
        if(mi){
          const m=mi.getAttribute('onclick').match(/'([^']+)'/);
          if(m) replyToMediaMid=m[1];
        }
      }
    }

    if(inFav){
      document.getElementById('fav-reply-island-title').textContent='В ответ '+senderName;
      document.getElementById('fav-reply-island-preview').textContent=preview==='__media__'?'Медиа':preview;
      document.getElementById('fav-reply-island').classList.add('show');
      document.getElementById('fav-input').focus();
    } else {
      document.getElementById('reply-island-title').textContent='В ответ '+senderName;
      document.getElementById('reply-island-preview').textContent=preview==='__media__'?'Медиа':preview;
      document.getElementById('reply-island').classList.add('show');
      document.getElementById('msg-input').focus();
    }
    closeCtxClean();
  }

  function dismissReply(){
    document.getElementById('reply-island').classList.remove('show');
    replyToName='';
    replyToText='';
    replyToMediaSrc='';
  }

  function dismissFavReply(){
    document.getElementById('fav-reply-island').classList.remove('show');
    replyToName='';
    replyToText='';
    replyToMediaSrc='';
  }

  /* ── Скопировать ── */
  function doCopy(){
    if(!currentBubble)return closeCtxClean();
    const pEl=currentBubble.querySelector('p');
    const txt=pEl?pEl.textContent.trim():'';
    if(txt){
      navigator.clipboard.writeText(txt).catch(()=>{});
    }
    closeCtxClean();
  }

  /* ── Изменить ── */
  function doEdit(){
    if(!currentBubble)return closeCtxClean();
    /* Если сообщение из избранного — открываем редактирование там */
    if(currentBubble.closest('#fav-messages')){doFavEdit();return;}
    editMediaRemoved=false;
    editingBubble=currentBubble;
    const pEl=currentBubble.querySelector('p.msg-text-out');
    const txt=pEl?pEl.textContent.trim():'';
    /* Медиа-миниатюра: показываем в #media-preview как при выборе фото */
    const mediaPrev=document.getElementById('media-preview');
    document.querySelectorAll('.edit-media-thumb-wrap').forEach(e=>e.remove());
    const grid=currentBubble.querySelector('.msg-media-grid');
    if(grid){
      const firstImg=grid.querySelector('img');
      const firstVid=grid.querySelector('video');
      const src=firstImg?firstImg.src:firstVid?firstVid.src:null;
      if(src){
        const wrap=document.createElement('div');
        wrap.className='media-thumb edit-media-thumb-wrap';
        const xSvg=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="1" y1="1" x2="9" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
        wrap.innerHTML=`<img src="${src}" alt=""><button class="media-thumb-del" onclick="removeEditMedia()">${xSvg}</button>`;
        mediaPrev.insertBefore(wrap,mediaPrev.firstChild);
        mediaPrev.classList.add('show');
      }
    }
    document.getElementById('edit-island-preview').textContent=txt||(grid?'Медиа':'');
    document.getElementById('edit-island').classList.add('show');
    const inp=document.getElementById('msg-input');
    inp.value=txt;
    updateSendBtn();
    inp.focus();
    closeCtxClean();
  }

  function dismissEdit(){
    editingBubble=null;
    editMediaRemoved=false;
    document.getElementById('edit-island').classList.remove('show');
    document.querySelectorAll('.edit-media-thumb-wrap').forEach(e=>e.remove());
    const strip=document.getElementById('media-preview');
    if(!attachedMedia.length)strip.classList.remove('show');
    document.getElementById('msg-input').value='';
    updateSendBtn();
  }

  /* ── Изменить в избранном ── */
  function doFavEdit(){
    favEditMediaRemoved=false;
    favEditingBubble=currentBubble;
    const pEl=currentBubble.querySelector('p.msg-text-out');
    const txt=pEl?pEl.textContent.trim():'';
    const mediaPrev=document.getElementById('fav-media-preview');
    document.querySelectorAll('.fav-edit-media-thumb').forEach(e=>e.remove());
    const grid=currentBubble.querySelector('.msg-media-grid');
    if(grid){
      const firstImg=grid.querySelector('img');
      const firstVid=grid.querySelector('video');
      const src=firstImg?firstImg.src:firstVid?firstVid.src:null;
      if(src){
        const wrap=document.createElement('div');
        wrap.className='media-thumb fav-edit-media-thumb';
        const xSvg=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="1" y1="1" x2="9" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
        wrap.innerHTML=`<img src="${src}" alt=""><button class="media-thumb-del" onclick="removeFavEditMedia()">${xSvg}</button>`;
        mediaPrev.insertBefore(wrap,mediaPrev.firstChild);
        mediaPrev.classList.add('show');
      }
    }
    document.getElementById('fav-edit-island-preview').textContent=txt||(grid?'Медиа':'');
    document.getElementById('fav-edit-island').classList.add('show');
    const inp=document.getElementById('fav-input');
    inp.value=txt;
    updateFavBtn();
    inp.focus();
    closeCtxClean();
  }

  function dismissFavEdit(){
    favEditingBubble=null;
    favEditMediaRemoved=false;
    document.getElementById('fav-edit-island').classList.remove('show');
    document.querySelectorAll('.fav-edit-media-thumb').forEach(e=>e.remove());
    const strip=document.getElementById('fav-media-preview');
    if(!attachedFavMedia.length)strip.classList.remove('show');
    document.getElementById('fav-input').value='';
    updateFavBtn();
  }

  function removeEditMedia(){
    editMediaRemoved=true;
    document.querySelectorAll('.edit-media-thumb-wrap').forEach(e=>e.remove());
    const strip=document.getElementById('media-preview');
    if(!attachedMedia.length)strip.classList.remove('show');
    updateSendBtn();
  }

  function removeFavEditMedia(){
    favEditMediaRemoved=true;
    document.querySelectorAll('.fav-edit-media-thumb').forEach(e=>e.remove());
    const strip=document.getElementById('fav-media-preview');
    if(!attachedFavMedia.length)strip.classList.remove('show');
    updateFavBtn();
  }

  /* ── Закрепить / Открепить ── */
  function doPinMessage(){
    if(!currentBubble)return closeCtxClean();
    const inFav=!!currentBubble.closest('#fav-messages');
    if(inFav){
      if(favPinnedBubble&&favPinnedBubble===currentBubble){
        unpinFavMessage();
        closeCtxClean();
        return;
      }
      favPinnedBubble=currentBubble;
      const pEl=currentBubble.querySelector('p');
      const hasMedia=!!currentBubble.querySelector('.msg-media-grid');
      let preview='';
      if(pEl&&pEl.textContent.trim()) preview=pEl.textContent.trim().slice(0,60);
      else if(hasMedia) preview='📷 Медиа';
      document.getElementById('fav-pinned-bar-preview').textContent=preview||'Сообщение';
      document.getElementById('fav-pinned-bar').classList.add('show');
      document.getElementById('ctx-pin-label').textContent='Открепить';
      closeCtxClean();
      return;
    }
    if(pinnedBubble&&pinnedBubble===currentBubble){
      unpinMessage();
      closeCtxClean();
      return;
    }
    pinnedBubble=currentBubble;
    const pEl=currentBubble.querySelector('p');
    const hasMedia=!!currentBubble.querySelector('.msg-media-grid');
    let preview='';
    if(pEl&&pEl.textContent.trim()) preview=pEl.textContent.trim().slice(0,60);
    else if(hasMedia) preview='📷 Медиа';
    document.getElementById('pinned-bar-preview').textContent=preview||'Сообщение';
    document.getElementById('pinned-bar').classList.add('show');
    closeCtxClean();
  }

  function unpinMessage(){
    pinnedBubble=null;
    document.getElementById('pinned-bar').classList.remove('show');
  }

  function unpinFavMessage(){
    favPinnedBubble=null;
    document.getElementById('fav-pinned-bar').classList.remove('show');
  }

  function scrollToPinned(){
    if(!pinnedBubble)return;
    pinnedBubble.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>{
      pinnedBubble.classList.remove('msg-flash');
      void pinnedBubble.offsetWidth;
      pinnedBubble.classList.add('msg-flash');
      setTimeout(()=>pinnedBubble.classList.remove('msg-flash'),1200);
    },350);
  }

  function scrollToFavPinned(){
    if(!favPinnedBubble)return;
    favPinnedBubble.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>{
      favPinnedBubble.classList.remove('msg-flash');
      void favPinnedBubble.offsetWidth;
      favPinnedBubble.classList.add('msg-flash');
      setTimeout(()=>favPinnedBubble.classList.remove('msg-flash'),1200);
    },350);
  }

  /* ── Переслать ── */
  function doForward(){
    if(!currentBubble)return closeCtxClean();
    forwardingBubble=currentBubble;
    /* Получаем имя отправителя */
    const isOut=currentBubble.classList.contains('bubble-out');
    forwardingSenderName='Вы';
    if(!isOut){
      const wrap=currentBubble.closest('div[style*="flex-start"]');
      if(wrap){
        const nameEl=wrap.querySelector('[style*="color:#8E8E93"]');
        if(nameEl) forwardingSenderName=nameEl.textContent.trim();
      }
    }
    closeCtxClean();
    setTimeout(()=>document.getElementById('forward-overlay').classList.add('open'),60);
  }

  /* ── Удалить сообщение ── */
  function doDeleteMessage(){
    if(!currentBubble)return closeCtxClean();
    const bubble=currentBubble;
    closeCtxClean();
    if(pinnedBubble===bubble) unpinMessage();
    /* ищем строку-обёртку независимо от контейнера */
    const container=bubble.closest('#chat-messages,#fav-messages');
    let row=null;
    if(container){
      let el=bubble.parentElement;
      while(el&&el.parentElement!==container) el=el.parentElement;
      row=el;
    }
    setTimeout(()=>{if(row&&row.parentElement)row.remove();},320);
  }

  /* ── Удалить чат ── */
  function doDeleteChat(){
    if(!currentChatListEl)return closeChatListCtxClean();
    const el=currentChatListEl;
    closeChatListCtxClean();
    setTimeout(()=>{if(el&&el.parentElement)el.remove();},320);
  }

  function closeForwardIfBg(e){
    if(e&&(e.target===document.getElementById('forward-bg')||e.target===document.getElementById('forward-overlay'))){
      closeForward();
    }
  }

  function closeForward(){
    document.getElementById('forward-overlay').classList.remove('open');
    setTimeout(()=>{forwardingBubble=null;forwardingSenderName='';},400);
  }

  function forwardToChat(dest){
    if(!forwardingBubble)return closeForward();
    const pEl=forwardingBubble.querySelector('p');
    const grid=forwardingBubble.querySelector('.msg-media-grid');
    const txt=pEl?pEl.textContent.trim():'';
    const now=new Date();
    const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const tick=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const fwdHeader=`<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:1px;">Переслано</div><div style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:5px;">от <b>${esc(forwardingSenderName)}</b></div>`;

    const msgsId=dest==='favorites'?'fav-messages':'chat-messages';
    const anchorId=dest==='favorites'?'fav-bottom':'chat-bottom';
    const msgs=document.getElementById(msgsId);
    const anchor=document.getElementById(anchorId);
    const w=document.createElement('div');
    w.style.cssText='align-self:flex-end;max-width:78%;';

    /* Клонируем медиа-сетку если есть */
    let mediaClone='';
    if(grid){
      const cloned=grid.cloneNode(true);
      cloned.style.borderRadius='0';
      cloned.style.margin='0 3px';
      cloned.style.width='calc(100% - 6px)';
      const tmp=document.createElement('div');
      tmp.appendChild(cloned);
      mediaClone=tmp.innerHTML;
    }

    if(grid){
      /* Пересланное сообщение с медиа — медиа растягивается на всю ширину (как в Telegram) */
      const textPart=txt?`<p class="msg-text-out" style="padding:4px 14px 0;margin:0;">${esc(txt)}</p>`:'';
      const metaStyle=txt?'padding:0 14px 6px;':'padding:4px 14px 4px;align-self:flex-end;';
      w.innerHTML=`<div class="bubble-out msg-bubble msg-fwd" style="padding:0;overflow:hidden;"><div style="padding:8px 14px 6px;">${fwdHeader}</div>${mediaClone}${textPart}<div class="msg-meta" style="${metaStyle}"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
    } else {
      const textPart=txt?`<p class="msg-text-out">${esc(txt)}</p>`:'';
      w.innerHTML=`<div class="bubble-out msg-bubble msg-fwd">${fwdHeader}${textPart}<div class="msg-meta"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
    }
    msgs.insertBefore(w,anchor);
    bindBubble(w.querySelector('.msg-bubble'));
    bindMsgRow(w);
    closeForward();
    if(dest==='favorites') showScreen('screen-favorites');
    else showScreen('screen-chat');
    setTimeout(()=>anchor.scrollIntoView({behavior:'smooth'}),80);
  }

  /* ── Привязка двойного тапа ко всей строке сообщения ── */
  function bindMsgRow(rowEl){
    let lastRowTap=0;
    rowEl.addEventListener('touchend',e=>{
      if(e.target.closest('.msg-bubble'))return; /* bubble сам обрабатывает */
      const now=Date.now();
      if(now-lastRowTap<320&&now-lastRowTap>50){
        const bubble=rowEl.querySelector('.msg-bubble');
        if(bubble) addReaction(bubble,'❤️');
      }
      lastRowTap=now;
    },{passive:true});
    rowEl.addEventListener('dblclick',e=>{
      if(e.target.closest('.msg-bubble'))return;
      const bubble=rowEl.querySelector('.msg-bubble');
      if(bubble) addReaction(bubble,'❤️');
    });
  }

  document.querySelectorAll('.msg-bubble').forEach(bindBubble);
  document.querySelectorAll('#chat-messages>div').forEach(bindMsgRow);

  /* ── Реакции ── */
  const reactionsData=new WeakMap();

  function addReaction(bubble,emoji){
    let data=reactionsData.get(bubble)||{};
    if(!data[emoji])data[emoji]={count:0,active:false};
    let isAdding=false;
    if(data[emoji].active){
      data[emoji].active=false;
      data[emoji].count--;
      if(data[emoji].count<=0)delete data[emoji];
    }else{
      data[emoji].active=true;
      data[emoji].count++;
      isAdding=true;
    }
    reactionsData.set(bubble,data);
    renderReactions(bubble);
    if(isAdding)spawnReactionBurst(bubble,emoji);
  }

  function renderReactions(bubble){
    let rDiv=bubble.querySelector('.msg-reactions');
    const data=reactionsData.get(bubble)||{};
    const entries=Object.entries(data).filter(([,v])=>v.count>0);
    if(!entries.length){
      if(rDiv){
        rDiv.classList.remove('visible');
        setTimeout(()=>{if(rDiv.parentElement)rDiv.remove();},340);
      }
      return;
    }
    const metaEl=bubble.querySelector('.msg-meta');
    const isNew=!rDiv;
    if(isNew){
      rDiv=document.createElement('div');
      rDiv.className='msg-reactions';
      if(metaEl)metaEl.before(rDiv);
      else bubble.appendChild(rDiv);
    }
    const currentEmojis=new Set(entries.map(([e])=>e));
    /* Анимированное удаление исчезнувших пилюль */
    Array.from(rDiv.querySelectorAll('.reaction-pill[data-emoji]')).forEach(pill=>{
      if(!currentEmojis.has(pill.dataset.emoji)){
        pill.style.transition='transform 0.2s cubic-bezier(0.36,0,0.66,0),opacity 0.16s ease';
        pill.style.transform='scale(0.4)';
        pill.style.opacity='0';
        setTimeout(()=>{if(pill.parentElement)pill.remove();},220);
      }
    });
    /* Добавление новых или обновление существующих пилюль */
    entries.forEach(([emoji,v])=>{
      let pill=Array.from(rDiv.querySelectorAll('.reaction-pill[data-emoji]'))
        .find(p=>p.dataset.emoji===emoji);
      if(pill){
        pill.className='reaction-pill'+(v.active?' active':'');
        pill.textContent=emoji+' '+v.count;
      }else{
        pill=document.createElement('button');
        pill.className='reaction-pill'+(v.active?' active':'');
        pill.dataset.emoji=emoji;
        pill.textContent=emoji+' '+v.count;
        pill.onclick=e=>{e.stopPropagation();addReaction(bubble,emoji);};
        if(!isNew){
          /* Контейнер уже visible — анимируем вход вручную */
          pill.style.transform='scale(0.4)';
          pill.style.opacity='0';
          rDiv.appendChild(pill);
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            pill.style.transition='transform 0.28s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s ease,background 0.18s ease';
            pill.style.transform='scale(1)';
            pill.style.opacity='1';
          }));
        }else{
          rDiv.appendChild(pill);
        }
      }
    });
    if(isNew){
      requestAnimationFrame(()=>requestAnimationFrame(()=>rDiv.classList.add('visible')));
    }
  }

  function spawnReactionBurst(bubble,emoji){
    const pill=bubble.querySelector(`.reaction-pill[data-emoji="${emoji}"]`);
    const rect=pill?pill.getBoundingClientRect():bubble.getBoundingClientRect();
    const originX=rect.left+rect.width/2;
    const originY=rect.top+rect.height/2;
    const count=5;
    for(let i=0;i<count;i++){
      const el=document.createElement('span');
      el.textContent=emoji;
      const sz=16+Math.random()*10;
      el.style.cssText=`position:fixed;z-index:600;pointer-events:none;font-size:${sz}px;left:${originX}px;top:${originY}px;transform:translate(0,0) scale(1);opacity:1;will-change:transform,opacity;line-height:1;`;
      document.body.appendChild(el);
      const angle=(-Math.PI*0.85)+(i/(count-1))*Math.PI*0.7+(Math.random()-0.5)*0.25;
      const dist=32+Math.random()*36;
      const dx=Math.cos(angle)*dist;
      const dy=Math.sin(angle)*dist;
      const delay=i*28;
      setTimeout(()=>{
        el.style.transition=`transform 0.72s cubic-bezier(0.22,1,0.36,1),opacity 0.52s ease 0.22s`;
        el.style.transform=`translate(${dx}px,${dy}px) scale(${0.7+Math.random()*0.5})`;
        el.style.opacity='0';
      },delay);
      setTimeout(()=>{if(el.parentElement)el.remove();},delay+850);
    }
  }

  let reactionPickerBubble=null;

  function openReactionPicker(){
    reactionPickerBubble=currentBubble;
    closeCtxClean();
    setTimeout(()=>document.getElementById('reaction-picker').classList.add('open'),60);
  }

  function closeReactionPicker(){
    document.getElementById('reaction-picker').classList.remove('open');
    reactionPickerBubble=null;
  }

  function doReaction(emoji){
    if(reactionPickerBubble) addReaction(reactionPickerBubble,emoji);
    closeReactionPicker();
  }

  /* ── Просмотр медиа ── */
  let viewerMedia=[];
  let viewerIdx=0;
  const mvEl=document.getElementById('media-viewer');
  const mvWrap=document.getElementById('mv-wrap');
  const mvItem=document.getElementById('mv-item');
  const mvCount=document.getElementById('mv-count');
  const mvPrev=document.getElementById('mv-prev');
  const mvNext=document.getElementById('mv-next');

  function openViewer(mid,idx){
    viewerMedia=msgMediaMap[mid]||[];
    viewerIdx=idx;
    renderViewer();
    mvWrap.style.transform='';
    mvWrap.style.transition='';
    mvEl.classList.add('open');
  }
  function closeViewer(){
    mvEl.classList.remove('open');
    const v=mvItem.querySelector('video');
    if(v)v.pause();
  }
  function renderViewer(){
    const m=viewerMedia[viewerIdx];
    if(!m)return;
    mvItem.innerHTML=m.type==='video'
      ?`<video src="${m.src}" controls autoplay loop playsinline></video>`
      :`<img src="${m.src}" alt="" draggable="false">`;
    const n=viewerMedia.length;
    mvCount.textContent=n>1?`${viewerIdx+1} / ${n}`:'';
    mvPrev.style.display=(n>1&&viewerIdx>0)?'flex':'none';
    mvNext.style.display=(n>1&&viewerIdx<n-1)?'flex':'none';
  }
  function mvNav(dir){
    const ni=viewerIdx+dir;
    if(ni<0||ni>=viewerMedia.length)return;
    viewerIdx=ni;
    mvWrap.style.transition='none';
    mvWrap.style.transform='';
    renderViewer();
  }

  /* ── Свайп вправо для выхода из чата ── */
  const chatScreenEl=document.getElementById('screen-chat');
  let chatSwipeSx=0,chatSwipeSy=0,chatSwiping=false,chatSwipeDir=null;

  chatScreenEl.addEventListener('touchstart',e=>{
    if(e.target.closest('#ctx-overlay')||e.target.closest('input')||e.target.closest('button'))return;
    if(e.touches[0].clientX<30){
      chatSwipeSx=e.touches[0].clientX;
      chatSwipeSy=e.touches[0].clientY;
      chatSwiping=true;chatSwipeDir=null;
    }
  },{passive:true});

  chatScreenEl.addEventListener('touchmove',e=>{
    if(!chatSwiping)return;
    const dx=e.touches[0].clientX-chatSwipeSx;
    const dy=e.touches[0].clientY-chatSwipeSy;
    if(chatSwipeDir===null){
      if(Math.abs(dx)>6||Math.abs(dy)>6) chatSwipeDir=Math.abs(dx)>=Math.abs(dy)?'h':'v';
    }
    if(chatSwipeDir==='h'&&dx>0){
      chatScreenEl.style.transition='none';
      chatScreenEl.style.transform=`translateX(${dx}px)`;
    }
  },{passive:true});

  chatScreenEl.addEventListener('touchend',e=>{
    if(!chatSwiping)return;
    chatSwiping=false;
    const dx=e.changedTouches[0].clientX-chatSwipeSx;
    if(chatSwipeDir==='h'&&dx>90){
      chatScreenEl.style.transition='transform 0.26s cubic-bezier(0.25,0.46,0.45,0.94)';
      chatScreenEl.style.transform='translateX(100%)';
      setTimeout(()=>showScreen('screen-list'),260);
    } else {
      chatScreenEl.style.transition='transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)';
      chatScreenEl.style.transform='translateX(0)';
      setTimeout(()=>{chatScreenEl.style.transition='';chatScreenEl.style.transform='';},290);
    }
    chatSwipeDir=null;
  },{passive:true});

  /* Свайп в просмотре */
  let mvSx=0,mvSy=0,mvDragging=false;
  mvEl.addEventListener('touchstart',e=>{
    if(e.target.closest('button'))return;
    mvSx=e.touches[0].clientX;
    mvSy=e.touches[0].clientY;
    mvDragging=true;
    mvWrap.style.transition='none';
  },{passive:true});
  mvEl.addEventListener('touchmove',e=>{
    if(!mvDragging)return;
    const dx=e.touches[0].clientX-mvSx;
    const dy=e.touches[0].clientY-mvSy;
    if(Math.abs(dy)>Math.abs(dx)){
      mvWrap.style.transform=`translateY(${dy}px)`;
    }else{
      mvWrap.style.transform=`translateX(${dx}px)`;
    }
  },{passive:true});
  mvEl.addEventListener('touchend',e=>{
    if(!mvDragging)return;
    mvDragging=false;
    const dx=e.changedTouches[0].clientX-mvSx;
    const dy=e.changedTouches[0].clientY-mvSy;
    mvWrap.style.transition='transform 0.22s ease';
    if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>90){
      /* свайп вверх/вниз — закрыть */
      mvWrap.style.transform=`translateY(${dy>0?'110%':'-110%'})`;
      setTimeout(closeViewer,230);
    }else if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>60){
      /* свайп влево/вправо — листать */
      if(dx<0&&viewerIdx<viewerMedia.length-1){
        mvWrap.style.transform='translateX(-110%)';
        setTimeout(()=>{mvNav(1);mvWrap.style.transition='none';mvWrap.style.transform='';},200);
      }else if(dx>0&&viewerIdx>0){
        mvWrap.style.transform='translateX(110%)';
        setTimeout(()=>{mvNav(-1);mvWrap.style.transition='none';mvWrap.style.transform='';},200);
      }else{
        mvWrap.style.transform='';
      }
    }else{
      mvWrap.style.transform='';
    }
  });

  /* ── Контекстное меню списка чатов ── */
  const clOverlay=document.getElementById('chatlist-ctx-overlay');
  const clRowWrap=document.getElementById('chatlist-ctx-row-wrap');
  const clMenu=document.getElementById('chatlist-ctx-menu');
  let clCloseTimer=null;
  let clMsgOriginalOffset=0;
  let currentChatListEl=null;

  function openChatListCtx(el){
    currentChatListEl=el;
    document.getElementById('chatlist-pin-label').textContent=el.classList.contains('chat-pinned')?'Открепить':'Закрепить';
    if(clCloseTimer){clearTimeout(clCloseTimer);clCloseTimer=null;}
    clOverlay.classList.remove('open');

    const clone=el.cloneNode(true);
    clone.style.cssText='display:flex;align-items:center;gap:12px;background:#1A1A1A;border-radius:999px;padding:12px 16px;width:100%;box-sizing:border-box;';
    clRowWrap.innerHTML='';
    clRowWrap.appendChild(clone);

    const rect=el.getBoundingClientRect();
    const vh=window.innerHeight;
    const safeTop=80,safeBot=vh-16,gap=10;
    const menuH=108;

    let cloneTop=Math.max(safeTop,rect.top);
    const spaceBelow=safeBot-(cloneTop+rect.height+gap);
    let menuTop=spaceBelow>=menuH ? cloneTop+rect.height+gap : cloneTop-menuH-gap;

    clRowWrap.style.top=cloneTop+'px';
    clMenu.style.top=menuTop+'px';

    clMsgOriginalOffset=rect.top-cloneTop;
    clRowWrap.style.transition='none';
    clRowWrap.style.transform=`translateY(${clMsgOriginalOffset}px)`;

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      clOverlay.classList.add('open');
      clRowWrap.style.transition='transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
      clRowWrap.style.transform='translateY(0)';
    }));
  }

  function closeChatListCtx(e){
    if(e&&e.target!==document.getElementById('chatlist-ctx-blur-bg')&&e.target!==clOverlay)return;
    closeChatListCtxClean();
  }
  function closeChatListCtxClean(){
    clOverlay.style.pointerEvents='none';
    clOverlay.style.transition='opacity 0.30s ease';
    clOverlay.style.opacity='0';
    clRowWrap.style.transition='transform 0.28s cubic-bezier(0.36,0,0.66,0)';
    clRowWrap.style.transform=`translateY(${clMsgOriginalOffset}px)`;
    clMenu.style.transition='transform 0.28s cubic-bezier(0.36,0,0.66,0),opacity 0.24s ease';
    clMenu.style.transform='scale(0.86)';
    clMenu.style.opacity='0';
    clCloseTimer=setTimeout(()=>{
      clOverlay.classList.remove('open');
      clOverlay.style.transition='';clOverlay.style.opacity='';clOverlay.style.pointerEvents='';
      clRowWrap.style.transition='';clRowWrap.style.transform='';
      clMenu.style.transition='';clMenu.style.transform='';clMenu.style.opacity='';
      setTimeout(()=>{clRowWrap.innerHTML='';clCloseTimer=null;},100);
    },310);
  }

  function bindChatRow(el){
    let crTsX=0,crTsY=0,crMoved=false,crPressTimer=null,crScaleTimer=null,crLongPressed=false;

    /* Десктоп: открытие по клику мышью */
    el.addEventListener('click',e=>{
      if(!isDesktop()) return;
      showScreen('screen-chat');
    });

    /* Десктоп: правая кнопка мыши → контекстное меню */
    el.addEventListener('contextmenu',e=>{
      if(!isDesktop()) return;
      e.preventDefault();
      openChatListCtx(el);
    });

    el.addEventListener('touchstart',e=>{
      crTsX=e.touches[0].clientX;crTsY=e.touches[0].clientY;crMoved=false;crLongPressed=false;
      crScaleTimer=setTimeout(()=>{if(!crMoved){el.style.transition='transform 0.22s ease';el.style.transform='scale(0.97)';}},220);
      crPressTimer=setTimeout(()=>{crLongPressed=true;el.style.transition='transform 0.18s ease';el.style.transform='';openChatListCtx(el);},480);
    },{passive:true});

    el.addEventListener('touchmove',e=>{
      const dx=Math.abs(e.touches[0].clientX-crTsX);
      const dy=Math.abs(e.touches[0].clientY-crTsY);
      if(dx>7||dy>7){crMoved=true;clearTimeout(crPressTimer);clearTimeout(crScaleTimer);el.style.transition='transform 0.18s ease';el.style.transform='';}
    },{passive:true});

    el.addEventListener('touchend',()=>{
      clearTimeout(crPressTimer);clearTimeout(crScaleTimer);
      el.style.transition='transform 0.18s ease';el.style.transform='';
      if(!crLongPressed&&!crMoved) showScreen('screen-chat');
    });
  }

  document.querySelectorAll('.chat-row-item').forEach(bindChatRow);

  /* ── Нажатие на цитату → переход к оригиналу ── */
  function bindQuoteTap(quoteEl){
    quoteEl.style.cursor='pointer';
    quoteEl.addEventListener('click',e=>{
      e.stopPropagation();
      const quotedText=quoteEl.querySelector('.msg-quote-text')?.textContent.trim();
      if(!quotedText)return;
      const needle=quotedText.slice(0,40).toLowerCase();
      let target=null;
      if(needle==='медиа'){
        /* ищем конкретный пузырь по сохранённому mid, иначе последний */
        const replyMid=quoteEl.dataset.replyMid;
        if(replyMid){
          const all=Array.from(document.querySelectorAll('.msg-bubble'));
          target=all.find(b=>{
            const g=b.querySelector('.msg-media-grid');
            if(!g)return false;
            const mi=g.querySelector('.mi[onclick]');
            return mi&&mi.getAttribute('onclick').includes(`'${replyMid}'`);
          })||null;
        }
        if(!target){
          const all=Array.from(document.querySelectorAll('.msg-bubble')).filter(b=>b.querySelector('.msg-media-grid'));
          target=all.length?all[all.length-1]:null;
        }
      } else {
        document.querySelectorAll('.msg-bubble').forEach(b=>{
          const p=b.querySelector('p');
          if(p&&p.textContent.trim().toLowerCase().includes(needle)) target=b;
        });
      }
      if(!target)return;
      target.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>{
        target.classList.remove('msg-flash');
        void target.offsetWidth;
        target.classList.add('msg-flash');
        setTimeout(()=>target.classList.remove('msg-flash'),1200);
      },350);
    });
  }

  document.querySelectorAll('.msg-quote-out').forEach(bindQuoteTap);

  /* ── Закрепить чат ── */
  function pinChat(){
    if(!currentChatListEl)return;
    const list=document.querySelector('#screen-list .scroll-area');
    const el=currentChatListEl;
    const isPinned=el.classList.contains('chat-pinned');
    if(isPinned){
      el.classList.remove('chat-pinned');
      const pi=el.querySelector('.chat-pin-icon');if(pi)pi.remove();
    } else {
      el.classList.add('chat-pinned');
      if(!el.querySelector('.chat-pin-icon')){
        const pi=document.createElement('div');
        pi.className='chat-pin-icon';
        pi.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/></svg>';
        el.insertBefore(pi,el.firstChild);
      }
      list.prepend(el);
    }
  }

  /* ── Поиск ── */
  const chatData=[
    {name:'чат с поддержкой',preview:'Ограничения не связаны с работой оборуд…',time:'12:29',avatar:'П',color:'linear-gradient(135deg,#0078FF,#005fcc)'},
    {name:'уведомления',preview:'с заботой, ваш MIN',time:'',avatar:'У',color:'linear-gradient(135deg,#555,#333)'},
    {name:'что нового',preview:'для вас уникальные предложения',time:'',avatar:'Ч',color:'linear-gradient(135deg,#e53935,#b71c1c)'},
    {name:'Михаил',preview:'Как дела? Давно не виделись',time:'вчера',avatar:'М',color:'linear-gradient(135deg,#1976D2,#0D47A1)'},
    {name:'Диана',preview:'Скинь файл потом',time:'пн',avatar:'Д',color:'linear-gradient(135deg,#388E3C,#1B5E20)'},
  ];

  function doSearch(q){
    const res=document.getElementById('search-results');
    if(!q.trim()){res.innerHTML='<div style="color:#8E8E93;font-size:15px;text-align:center;padding:32px 0;">Введите имя для поиска</div>';return;}
    const filtered=chatData.filter(c=>c.name.toLowerCase().includes(q.toLowerCase().trim()));
    if(!filtered.length){res.innerHTML='<div style="color:#8E8E93;font-size:15px;text-align:center;padding:32px 0;">Ничего не найдено</div>';return;}
    res.innerHTML=filtered.map(c=>`<button class="chat-row" onclick="showScreen('screen-chat')" style="display:flex;align-items:center;gap:12px;width:100%;border:none;cursor:pointer;text-align:left;">
      <div class="tg-avatar" style="width:48px;height:48px;background:${c.color};font-size:20px;flex-shrink:0;">${c.avatar}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#fff;font-size:16px;font-weight:600;">${esc(c.name)}</span>${c.time?`<span style="color:#8E8E93;font-size:12px;">${c.time}</span>`:''}</div>
        <span style="color:#8E8E93;font-size:14px;">${esc(c.preview)}</span>
      </div>
    </button>`).join('');
  }

  /* ── Редактирование профиля ── */
  let profileJustOpened=false;
  function openProfileEdit(){
    profileJustOpened=true;
    document.getElementById('profile-edit-wrap').classList.add('open');
    setTimeout(()=>{ profileJustOpened=false; },600);
  }
  function closeProfileEdit(){
    document.getElementById('profile-edit-wrap').classList.remove('open');
    const bOver=document.getElementById('pe-banner-overlay');
    const bCam=document.getElementById('pe-banner-cam');
    const avOver=document.getElementById('pe-avatar-overlay');
    const avCam=document.getElementById('pe-avatar-cam');
    bOver.style.background='transparent';bCam.style.opacity='0';
    avOver.style.background='transparent';avCam.style.opacity='0';
  }
  function setPeBanner(input){
    if(!input.files||!input.files[0])return;
    const url=URL.createObjectURL(input.files[0]);
    const img=document.getElementById('pe-banner-img');
    img.src=url;img.style.display='block';
    input.value='';
  }
  function setPeAvatar(input){
    if(!input.files||!input.files[0])return;
    const url=URL.createObjectURL(input.files[0]);
    const av=document.getElementById('pe-avatar-circle');
    av.innerHTML='';
    av.style.background='none';
    av.style.padding='0';
    const img=document.createElement('img');
    img.src=url;img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%;';
    av.appendChild(img);
    input.value='';
  }
  function saveProfileEdit(){
    closeProfileEdit();
  }

  /* ── Конфиденциальность ── */
  function openPrivacy(){
    document.getElementById('privacy-wrap').classList.add('open');
  }
  function closePrivacy(){
    document.getElementById('privacy-wrap').classList.remove('open');
  }
  function openPwdSheet(){
    document.getElementById('pwd-wrap').classList.add('open');
  }
  function closePwdSheet(){
    document.getElementById('pwd-wrap').classList.remove('open');
  }
  function openDelSheet(){
    document.getElementById('del-wrap').classList.add('open');
  }
  function closeDelSheet(){
    document.getElementById('del-wrap').classList.remove('open');
  }
  let copyToastTimer=null;
  function copyPrivacyCode(){
    const code=document.getElementById('privacy-code-text').textContent;
    navigator.clipboard.writeText(code).catch(()=>{});
    const toast=document.getElementById('copy-toast');
    toast.classList.add('show');
    if(copyToastTimer)clearTimeout(copyToastTimer);
    copyToastTimer=setTimeout(()=>toast.classList.remove('show'),1800);
  }
  /* ── Инициализация кнопки отправки ── */
  (function(){
    const btn=document.getElementById('send-btn');
    btn.style.opacity='0.4';
    btn.style.pointerEvents='none';
    const favBtn=document.getElementById('fav-send-btn');
    favBtn.style.opacity='0.4';
    favBtn.style.pointerEvents='none';
  })();

  /* Hover эффекты на баннер и аватар (только mouse, без touch — фикс бага рандомного выделения) */
  (function(){
    const banner=document.getElementById('pe-banner');
    const bOver=document.getElementById('pe-banner-overlay');
    const bCam=document.getElementById('pe-banner-cam');
    const showB=()=>{if(profileJustOpened)return;bOver.style.background='rgba(0,0,0,0.35)';bCam.style.opacity='1';};
    const hideB=()=>{bOver.style.background='transparent';bCam.style.opacity='0';};
    banner.addEventListener('mouseenter',showB);
    banner.addEventListener('mouseleave',hideB);
    banner.addEventListener('click',()=>document.getElementById('pe-banner-input').click());
    /* Hover на аватар */
    const avWrap=document.getElementById('pe-avatar-wrap');
    const avOver=document.getElementById('pe-avatar-overlay');
    const avCam=document.getElementById('pe-avatar-cam');
    const showA=()=>{if(profileJustOpened)return;avOver.style.background='rgba(0,0,0,0.45)';avCam.style.opacity='1';};
    const hideA=()=>{avOver.style.background='transparent';avCam.style.opacity='0';};
    avWrap.addEventListener('mouseenter',showA);
    avWrap.addEventListener('mouseleave',hideA);
    /* Клик в любом месте шторки — убирает выделение */
    const sheet=document.getElementById('profile-edit-sheet');
    sheet.addEventListener('click',function(e){
      if(!banner.contains(e.target)&&!avWrap.contains(e.target)){hideB();hideA();}
    });
  })();

  /* ── Drag & drop медиа в чат (только десктоп) ── */
  (function(){
    const chatEl=document.getElementById('screen-chat');
    const pill=chatEl.querySelector('.input-pill');
    let cnt=0;
    chatEl.addEventListener('dragenter',e=>{
      if(!e.dataTransfer||!e.dataTransfer.types.includes('Files'))return;
      cnt++;
      pill.classList.add('drag-over');
    },{passive:true});
    chatEl.addEventListener('dragleave',()=>{
      cnt--;
      if(cnt<=0){cnt=0;pill.classList.remove('drag-over');}
    },{passive:true});
    chatEl.addEventListener('dragover',e=>e.preventDefault());
    chatEl.addEventListener('drop',e=>{
      e.preventDefault();
      cnt=0;
      pill.classList.remove('drag-over');
      const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/'));
      files.forEach(file=>{
        if(attachedMedia.length>=MAX_MEDIA)return;
        const type=file.type.startsWith('video')?'video':'image';
        attachedMedia.push({type,src:URL.createObjectURL(file)});
      });
      if(files.length>0)renderMediaPreview();
    });
  })();

