  /* ── Навигация ── */
  function isDesktop(){ return window.innerWidth >= 768; }

  /* Экраны, которые на десктопе открываются в сайдбаре (поверх списка чатов) */
  const SIDEBAR_OVERLAY=['screen-search','screen-profile'];
  /* Экраны правой панели */
  const RIGHT_PANEL=['screen-chat','screen-favorites'];
  let pendingExternalUrl='';
  let peAvatarScale=1;
  let peBannerScale=1;
  let pendingAvatarDataUrl='';
  let pendingBannerDataUrl='';
  let me=null;

  function resetScreen(s){s.classList.remove('active');s.style.transform='';s.style.transition='';s.style.opacity='';s.style.pointerEvents='';}
  function hideAppLoading(){
    const el=document.getElementById('app-loading');
    if(!el) return;
    el.classList.add('hidden');
    setTimeout(()=>{ if(el&&el.parentNode) el.parentNode.removeChild(el); },320);
  }

  function showScreen(id){
    if(isDesktop()){
      if(id==='screen-list'){
        /* Закрываем оверлеи сайдбара (поиск, профиль) */
        SIDEBAR_OVERLAY.forEach(sid=>resetScreen(document.getElementById(sid)));
        RIGHT_PANEL.forEach(sid=>resetScreen(document.getElementById(sid)));
        document.body.classList.remove('has-right-screen');
        if(window.reloadChatsWithSkeleton) window.reloadChatsWithSkeleton();
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
      SIDEBAR_OVERLAY.forEach(sid=>resetScreen(document.getElementById(sid)));
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
    if(id==='screen-list'&&window.reloadChatsWithSkeleton) window.reloadChatsWithSkeleton();
    if(id==='screen-chat') setTimeout(()=>document.getElementById('chat-bottom').scrollIntoView({behavior:'smooth'}),50);
    if(id==='screen-favorites') setTimeout(()=>document.getElementById('fav-bottom').scrollIntoView({behavior:'smooth'}),50);
    if(id==='screen-search') setTimeout(()=>{doSearch('');document.getElementById('search-input').focus();},80);
  }
  function updateChatBlockedUI(){
    const bar=document.querySelector('#screen-chat > .input-bar');
    const blocked=document.getElementById('chat-blocked-pill');
    if(!bar||!blocked) return;
    if(currentChatBlockedByPeer){
      bar.style.display='none';
      blocked.style.display='block';
    }else{
      bar.style.display='';
      blocked.style.display='none';
    }
  }

  /* ── Избранное ── */
  function openFavorites(){ showScreen('screen-favorites'); }
  function closeProfileSidebar(){
    showScreen('screen-list');
  }
  window.closeProfileSidebar=closeProfileSidebar;

  function updateFavBtn(){
    const btn=document.getElementById('fav-send-btn');
    const val=document.getElementById('fav-input').value.trim();
    const hasMedia=attachedFavMedia.length>0;
    const editingMedia=favEditingBubble&&!favEditMediaRemoved&&!!favEditingBubble.querySelector('.msg-media-grid');
    const active=val||hasMedia||editingMedia;
    btn.style.opacity='1';
    btn.style.pointerEvents='all';
    btn.classList.toggle('voice-mode',!active);
    btn.innerHTML=active?SEND_ICON_SVG:MIC_ICON_SVG;
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
        ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}" data-reply-mid="${replyToMediaMid}" style="display:flex;align-items:center;gap:7px;">${thumbHtml}<div style="min-width:0;"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Медиа</div></div></div>`
        :replyToText==='__voice__'
        ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Голосовое сообщение</div></div>`
        :`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">${esc(replyToText)}</div></div>`)
      :'';
    const tick=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(hasMedia){
      const mid='m'+(++msgIdCounter);
      const textPart=txt?`<p class="msg-text-out" style="padding:4px 8px 0;margin:0;">${renderRichText(txt)}</p>`:'';
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
      w.innerHTML=`<div class="bubble-out msg-bubble">${quoteHtml}<p class="msg-text-out">${renderRichText(txt)}</p><div class="msg-meta"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
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
    bindRichTextInteractions(newFavBubble);
    initVoicePlayers(w);
    enrichLinkPreviews(w);
    setTimeout(()=>{
      newFavBubble.querySelectorAll('.mi-upload-anim').forEach(el=>el.remove());
    },220);
  }
  function sendFavVoiceMessage(blob,durationMs,waveform=[]){
    const msgs=document.getElementById('fav-messages');
    const anchor=document.getElementById('fav-bottom');
    if(!msgs||!anchor||!blob) return;
    const now=new Date();
    const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const url=URL.createObjectURL(blob);
    const w=document.createElement('div');
    const favMid='fav-'+(++msgIdCounter);
    w.style.cssText='align-self:flex-end;max-width:276px;';
    const quoteHtml=replyToName
      ?(replyToText==='__voice__'
        ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Голосовое сообщение</div></div>`
        :replyToText==='__media__'
        ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Медиа</div></div>`
        :`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">${esc(replyToText)}</div></div>`)
      :'';
    w.innerHTML=renderVoiceBubbleHtml({mine:true,src:url,durationMs,timeText:t,waveform,quoteHtml,showUnreadDot:false}).replace('class="','data-mid="'+esc(favMid)+'" class="');
    msgs.insertBefore(w,anchor);
    const b=w.querySelector('.msg-bubble');
    bindBubble(b);
    bindMsgRow(w);
    b.querySelectorAll('.msg-quote-out').forEach(bindQuoteTap);
    initVoicePlayers(w);
    dismissFavReply();
    anchor.scrollIntoView({behavior:'smooth'});
  }

  /* ── Кнопка отправки ── */
  let editMediaRemoved=false;
  let favEditMediaRemoved=false;
  const SEND_ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 640 640" fill="#fff"><path d="M342.6 73.4C330.1 60.9 309.8 60.9 297.3 73.4L137.3 233.4C124.8 245.9 124.8 266.2 137.3 278.7C149.8 291.2 170.1 291.2 182.6 278.7L288 173.3L288 544C288 561.7 302.3 576 320 576C337.7 576 352 561.7 352 544L352 173.3L457.4 278.7C469.9 291.2 490.2 291.2 502.7 278.7C515.2 266.2 515.2 245.9 502.7 233.4L342.7 73.4z"/></svg>';
  const MIC_ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#fff"><path d="M320 64C267 64 224 107 224 160L224 288C224 341 267 384 320 384C373 384 416 341 416 288L416 160C416 107 373 64 320 64zM176 248C176 234.7 165.3 224 152 224C138.7 224 128 234.7 128 248L128 288C128 385.9 201.3 466.7 296 478.5L296 528L248 528C234.7 528 224 538.7 224 552C224 565.3 234.7 576 248 576L392 576C405.3 576 416 565.3 416 552C416 538.7 405.3 528 392 528L344 528L344 478.5C438.7 466.7 512 385.9 512 288L512 248C512 234.7 501.3 224 488 224C474.7 224 464 234.7 464 248L464 288C464 367.5 399.5 432 320 432C240.5 432 176 367.5 176 288L176 248z"/></svg>';
  const PLAY_ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#fff"><path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/></svg>';
  const PAUSE_ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#fff"><path d="M176 96C149.5 96 128 117.5 128 144L128 496C128 522.5 149.5 544 176 544L240 544C266.5 544 288 522.5 288 496L288 144C288 117.5 266.5 96 240 96L176 96zM400 96C373.5 96 352 117.5 352 144L352 496C352 522.5 373.5 544 400 544L464 544C490.5 544 512 522.5 512 496L512 144C512 117.5 490.5 96 464 96L400 96z"/></svg>';
  const GHOST_ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="rgba(255,255,255,0.95)"><path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/></svg>';
  function deletedAvatarMarkup(size=24){
    return `<span style="display:inline-flex;width:${size}px;height:${size}px;">${GHOST_ICON_SVG}</span>`;
  }
  const recordStates={
    chat:{holdTimer:null,recording:false,recorder:null,startTs:0,timerInt:null,chunks:[],stream:null,analyser:null,analyserCtx:null,meterSink:null,raf:0,levels:[],waveId:'record-wave',timeId:'record-time',pillSel:'#screen-chat .input-pill',mediaBtnId:'media-btn',inputId:'msg-input',sendBtnId:'send-btn'},
    fav:{holdTimer:null,recording:false,recorder:null,startTs:0,timerInt:null,chunks:[],stream:null,analyser:null,analyserCtx:null,meterSink:null,raf:0,levels:[],waveId:'fav-record-wave',timeId:'fav-record-time',pillSel:'#fav-input-pill',mediaBtnId:'fav-media-btn',inputId:'fav-input',sendBtnId:'fav-send-btn'}
  };
  let activeVoiceAudio=null;
  let pendingVoiceSendFn=null;

  function updateSendBtn(){
    const btn=document.getElementById('send-btn');
    const inp=document.getElementById('msg-input');
    if(!btn||!inp)return;
    const val=inp.value.trim();
    const hasMedia=attachedMedia.length>0;
    const editingMedia=editingBubble&&!editMediaRemoved&&!!editingBubble.querySelector('.msg-media-grid');
    const active=val||hasMedia||editingMedia;
    btn.style.opacity='1';
    btn.style.pointerEvents='all';
    btn.classList.toggle('voice-mode',!active);
    btn.innerHTML=active?SEND_ICON_SVG:MIC_ICON_SVG;
  }

  function formatVoiceTime(ms){
    const total=Math.max(0,Math.floor(ms/1000));
    const mm=String(Math.floor(total/60)).padStart(2,'0');
    const ss=String(total%60).padStart(2,'0');
    return `${mm}:${ss}`;
  }

  function stopActiveVoicePlayback(){
    if(!activeVoiceAudio)return;
    try{ activeVoiceAudio.pause(); }catch(_){}
    const btn=activeVoiceAudio.__btn;
    if(btn) btn.innerHTML=PLAY_ICON_SVG;
    activeVoiceAudio=null;
  }
  function initVoicePlayers(root=document){
    root.querySelectorAll('.voice-bubble').forEach(bubble=>{
      if(bubble.dataset.voiceBound==='1') return;
      bubble.dataset.voiceBound='1';
      const btn=bubble.querySelector('.voice-play-btn');
      const audio=bubble.querySelector('audio');
      const wave=bubble.querySelector('.voice-wave-static');
      if(!btn||!audio||!wave) return;
      const bars=Array.from(wave.querySelectorAll('span'));
      btn.innerHTML=PLAY_ICON_SVG;
      const paintProgress=()=>{
        const p=audio.duration?audio.currentTime/audio.duration:0;
        const fill=Math.floor(p*bars.length);
        bars.forEach((bar,i)=>{ bar.style.opacity=i<=fill?'1':'0.42'; });
      };
      const seekByClientX=(clientX)=>{
        if(!audio.duration) return;
        const rect=wave.getBoundingClientRect();
        if(!rect.width) return;
        const ratio=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
        audio.currentTime=ratio*audio.duration;
        paintProgress();
      };
      let dragging=false;
      wave.addEventListener('pointerdown',e=>{
        e.stopPropagation();
        dragging=true;
        seekByClientX(e.clientX);
        try{ wave.setPointerCapture(e.pointerId); }catch(_){}
      });
      wave.addEventListener('pointermove',e=>{
        if(!dragging) return;
        seekByClientX(e.clientX);
      });
      const stopDrag=(e)=>{
        if(!dragging) return;
        dragging=false;
        try{ wave.releasePointerCapture(e.pointerId); }catch(_){}
      };
      wave.addEventListener('pointerup',stopDrag);
      wave.addEventListener('pointercancel',stopDrag);
      wave.addEventListener('mousedown',e=>e.stopPropagation());
      wave.addEventListener('mouseup',e=>e.stopPropagation());
      wave.addEventListener('click',e=>e.stopPropagation());
      wave.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();});
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        if(activeVoiceAudio&&activeVoiceAudio!==audio) stopActiveVoicePlayback();
        if(audio.paused){
          audio.play().catch(()=>{});
          activeVoiceAudio=audio;
          audio.__btn=btn;
          btn.innerHTML=PAUSE_ICON_SVG;
          paintProgress();
          const mid=bubble.dataset.mid||'';
          const isIncoming=bubble.classList.contains('bubble-in');
          const alreadyListened=bubble.dataset.listened==='1';
          if(mid&&isIncoming&&!alreadyListened&&typeof window.__api==='function'){
            window.__api(`/messages/${encodeURIComponent(mid)}`,{method:'PATCH',body:JSON.stringify({action:'listen'})}).catch(()=>{});
            bubble.dataset.listened='1';
            const dot=bubble.querySelector('.voice-dot');
            if(dot) dot.remove();
          }
        }else{
          audio.pause();
          btn.innerHTML=PLAY_ICON_SVG;
          if(activeVoiceAudio===audio) activeVoiceAudio=null;
        }
      });
      audio.addEventListener('timeupdate',paintProgress);
      audio.addEventListener('ended',()=>{
        btn.innerHTML=PLAY_ICON_SVG;
        paintProgress();
        if(activeVoiceAudio===audio) activeVoiceAudio=null;
      });
      audio.addEventListener('pause',()=>{
        if(audio.ended) return;
        btn.innerHTML=PLAY_ICON_SVG;
        paintProgress();
      });
      paintProgress();
    });
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

  function getRecordingBarsCount(target='chat'){
    const state=recordStates[target];
    const wave=state?document.getElementById(state.waveId):null;
    const barW=isDesktop()?3:4;
    const gap=3;
    const waveWidth=wave?Math.floor(wave.clientWidth):0;
    if(waveWidth>0){
      return Math.max(18,Math.floor((waveWidth+gap)/(barW+gap)));
    }
    return isDesktop()?58:46;
  }

  function ensureRecordingBars(target='chat'){
    const state=recordStates[target];
    const wave=document.getElementById(state.waveId);
    if(!wave) return;
    const barsCount=getRecordingBarsCount(target);
    if(wave.childElementCount===barsCount) return;
    const heights=Array.from({length:barsCount}).map(()=>8);
    wave.innerHTML=heights.map(h=>`<span class="record-bar" style="height:${h}px"></span>`).join('');
    state.levels=heights.slice();
  }

  function setRecordingUiActive(on,target='chat'){
    const state=recordStates[target];
    const pill=document.querySelector(state.pillSel);
    const mediaBtn=document.getElementById(state.mediaBtnId);
    const input=document.getElementById(state.inputId);
    const sendBtn=document.getElementById(state.sendBtnId);
    if(!pill||!mediaBtn||!input||!sendBtn)return;
    if(state.uiTimer){ clearTimeout(state.uiTimer); state.uiTimer=null; }
    if(on){
      pill.classList.remove('recording-stopping');
      pill.classList.add('chat-recording');
      mediaBtn.classList.add('chat-voice-hidden');
      input.classList.add('chat-voice-hidden');
      sendBtn.classList.remove('record-pressing');
      sendBtn.classList.remove('voice-mode');
      sendBtn.classList.add('record-hold');
      sendBtn.innerHTML=SEND_ICON_SVG;
      ensureRecordingBars(target);
      requestAnimationFrame(()=>{
        ensureRecordingBars(target);
      });
      setTimeout(()=>{
        if(state.recording) ensureRecordingBars(target);
      },260);
    }else{
      sendBtn.classList.remove('record-pressing');
      sendBtn.classList.remove('record-hold');
      pill.classList.add('recording-stopping');
      state.uiTimer=setTimeout(()=>{
        pill.classList.remove('recording-stopping');
        pill.classList.remove('chat-recording');
        mediaBtn.classList.remove('chat-voice-hidden');
        input.classList.remove('chat-voice-hidden');
        target==='chat'?updateSendBtn():updateFavBtn();
        state.uiTimer=null;
      },430);
    }
  }

  function renderVoiceWave(waveform=[]){
    const data=(Array.isArray(waveform)&&waveform.length?waveform:Array.from({length:46},()=>10));
    return data.map(v=>{
      const h=Math.max(4,Math.min(18,Number(v)||8));
      return `<span style="--h:${h}px"></span>`;
    }).join('');
  }
  function renderVoiceBubbleHtml({mine=true,src='',durationMs=0,timeText='',tickHtml='',waveform=[],showUnreadDot=false,text='',forwardedFromName='',quoteHtml=''}={}){
    const timeClass=mine?'msg-time-out':'msg-time-in';
    const textClass=mine?'msg-text-out':'msg-text-in';
    const caption=text?`<p class="${textClass} voice-caption">${renderRichText(text)}</p>`:'';
    const fwd=forwardedFromName?`<div style="font-size:12px;color:rgba(255,255,255,0.62);line-height:1.25;margin-bottom:5px;flex-basis:100%;">Переслано от <b>${esc(forwardedFromName)}</b></div>`:'';
    const quote=quoteHtml?`<div style="flex-basis:100%;margin-bottom:2px;">${quoteHtml}</div>`:'';
    return `<div class="${mine?'bubble-out':'bubble-in'} msg-bubble voice-bubble">${fwd}${quote}<button class="voice-play-btn" type="button">${PLAY_ICON_SVG}</button><div style="flex:1;min-width:0;"><div class="voice-wave-static">${renderVoiceWave(waveform)}</div><div class="voice-meta"><span class="${timeClass}">${formatVoiceTime(durationMs)}</span>${showUnreadDot?'<span class="voice-dot"></span>':''}<span class="voice-sent"><span class="${timeClass} voice-time">${timeText}</span>${mine?tickHtml:''}</span></div>${caption}</div>${src?`<audio preload="metadata" data-voice-duration="${durationMs}" data-voice-wave='${esc(JSON.stringify(waveform||[]))}' src="${esc(src)}"></audio>`:''}</div>`;
  }
  async function extractWaveform(blob,bars=46){
    const ab=await blob.arrayBuffer();
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const audioBuf=await ctx.decodeAudioData(ab.slice(0));
    const raw=audioBuf.getChannelData(0);
    const block=Math.max(1,Math.floor(raw.length/bars));
    const out=[];
    for(let i=0;i<bars;i++){
      let sum=0;
      const start=i*block;
      const end=Math.min(raw.length,start+block);
      for(let j=start;j<end;j++) sum+=raw[j]*raw[j];
      const rms=Math.sqrt(sum/Math.max(1,end-start));
      out.push(Math.round(5+Math.min(13,rms*70)));
    }
    await ctx.close();
    return out;
  }
  function startRecordMeter(target){
    const state=recordStates[target];
    const wave=document.getElementById(state.waveId);
    if(!state.analyser||!wave) return;
    let bars=Array.from(wave.querySelectorAll('.record-bar'));
    const buf=new Uint8Array(state.analyser.frequencyBinCount);
    const tick=()=>{
      if(!state.recording) return;
      if(!bars.length){
        ensureRecordingBars(target);
        bars=Array.from(wave.querySelectorAll('.record-bar'));
        if(!bars.length){
          state.raf=requestAnimationFrame(tick);
          return;
        }
      }
      state.analyser.getByteFrequencyData(buf);
      bars.forEach((bar,i)=>{
        const idx=Math.floor((i/Math.max(1,bars.length-1))*(buf.length-1));
        const v=buf[idx]||0;
        const targetH=Math.max(6,Math.min(28,Math.round(6+(v/255)*22)));
        const prev=state.levels[i]||8;
        const next=Math.round(prev*0.45+targetH*0.55);
        state.levels[i]=next;
        bar.style.height=`${next}px`;
      });
      state.raf=requestAnimationFrame(tick);
    };
    state.raf=requestAnimationFrame(tick);
  }
  async function beginVoiceRecording(target='chat'){
    const state=recordStates[target];
    if(state.recording) return;
    state.stream=await navigator.mediaDevices.getUserMedia({audio:true});
    state.chunks=[];
    state.analyserCtx=new (window.AudioContext||window.webkitAudioContext)();
    const source=state.analyserCtx.createMediaStreamSource(state.stream);
    state.analyser=state.analyserCtx.createAnalyser();
    state.analyser.fftSize=256;
    state.analyser.smoothingTimeConstant=0.72;
    source.connect(state.analyser);
    state.meterSink=state.analyserCtx.createGain();
    state.meterSink.gain.value=0;
    state.analyser.connect(state.meterSink);
    state.meterSink.connect(state.analyserCtx.destination);
    if(state.analyserCtx.state==='suspended'){
      await state.analyserCtx.resume().catch(()=>{});
    }
    state.recorder=new MediaRecorder(state.stream);
    state.recorder.ondataavailable=e=>{ if(e.data&&e.data.size>0) state.chunks.push(e.data); };
    state.recorder.onstop=async ()=>{
      const elapsed=Math.max(1000,Date.now()-state.startTs);
      const blob=new Blob(state.chunks,{type:state.recorder&&state.recorder.mimeType?state.recorder.mimeType:'audio/webm'});
      const waveform=await extractWaveform(blob).catch(()=>[]);
      if(state.stream) state.stream.getTracks().forEach(t=>t.stop());
      state.stream=null;state.recorder=null;state.recording=false;
      if(state.raf) cancelAnimationFrame(state.raf);
      state.raf=0;
      if(state.analyserCtx) state.analyserCtx.close().catch(()=>{});
      state.analyserCtx=null;state.analyser=null;state.meterSink=null;
      setRecordingUiActive(false,target);
      clearInterval(state.timerInt);state.timerInt=null;
      const tEl=document.getElementById(state.timeId);if(tEl) tEl.textContent='00:00';
      if(state.sendOnStop){
        if(target==='chat'&&pendingVoiceSendFn) pendingVoiceSendFn(blob,elapsed,waveform);
        if(target==='fav') sendFavVoiceMessage(blob,elapsed,waveform);
      }
      state.sendOnStop=false;
    };
    state.startTs=Date.now();
    const tel=document.getElementById(state.timeId); if(tel) tel.textContent='00:00';
    state.timerInt=setInterval(()=>{
      const el=document.getElementById(state.timeId);
      if(el) el.textContent=formatVoiceTime(Date.now()-state.startTs);
    },200);
    state.recorder.start();
    state.recording=true;
    setRecordingUiActive(true,target);
    startRecordMeter(target);
  }
  function finishVoiceRecording(sendNow,target='chat'){
    const state=recordStates[target];
    state.sendOnStop=!!sendNow;
    if(state.holdTimer){clearTimeout(state.holdTimer);state.holdTimer=null;}
    if(!state.recorder||state.recorder.state==='inactive'){
      setRecordingUiActive(false,target);
      state.recording=false;
      return;
    }
    state.recorder.stop();
  }
  ensureRecordingBars('chat');
  ensureRecordingBars('fav');

  function buildMediaGrid(media,mid,br,showUpload=true){
    msgMediaMap[mid]=media;
    const MAX_SHOW=9;
    const show=media.slice(0,MAX_SHOW);
    const extra=media.length-MAX_SHOW;
    const cls='n'+Math.min(media.length,MAX_SHOW);
    const uploadSvg=showUpload?`<div class="mi-upload-anim"><svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="rgba(0,0,0,0.28)" stroke="none"/><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2.8"/><circle cx="22" cy="22" r="18" fill="none" stroke="#fff" stroke-width="2.8" stroke-dasharray="113" stroke-dashoffset="113" class="upload-arc"/></svg></div>`:'';
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
        ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}" data-reply-mid="${replyToMediaMid}" style="display:flex;align-items:center;gap:7px;">${thumbHtml}<div style="min-width:0;"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Медиа</div></div></div>`
        :replyToText==='__voice__'
        ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">Голосовое сообщение</div></div>`
        :`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyToName)}</div><div class="msg-quote-text">${esc(replyToText)}</div></div>`)
      :'';
    const tick=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(hasMedia){
      const mid='m'+(++msgIdCounter);
      const textPart=txt?`<p class="msg-text-out" style="padding:4px 8px 0;margin:0;">${renderRichText(txt)}</p>`:'';
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
      w.innerHTML=`<div class="bubble-out msg-bubble">${quoteHtml}<p class="msg-text-out">${renderRichText(txt)}</p><div class="msg-meta"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
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
    bindRichTextInteractions(newBubble);
    initVoicePlayers(w);
    enrichLinkPreviews(w);
  }

  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function renderRichText(text){
    const withLinks=esc(String(text||'')).replace(/((?:https?:\/\/|www\.)[^\s<]+)/gi,(m)=>{
      const raw=m.trim();
      const href=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;
      return `<a href="#" class="ext-link" data-url="${esc(href)}" style="color:#60a5fa;text-decoration:none;">${raw}</a>`;
    });
    return withLinks.replace(/(^|[^a-zA-Z0-9_.@])@([a-zA-Z0-9_.-]{2,32})\b/g,(m,p,u)=>`${p}<a href="#" class="mention-link" data-username="${u}" style="color:#60a5fa;text-decoration:none;">@${u}</a>`);
  }
  function bindRichTextInteractions(root){
    if(!root) return;
    root.querySelectorAll('.mention-link').forEach(el=>{
      if(el.dataset.bound==='1') return;
      el.dataset.bound='1';
      el.addEventListener('click',async e=>{
        e.preventDefault();
        const username=el.dataset.username||'';
        if(me&&String(me.username||'').toLowerCase()===String(username||'').toLowerCase()){
          openFavorites();
          return;
        }
        try{
          const r=await backendApi(`/users/search?q=${encodeURIComponent(username)}`);
          const user=(r.items||[]).find(u=>String(u.username||'').toLowerCase()===username.toLowerCase());
          if(!user){ alert('Пользователь не найден'); return; }
          openUserProfileView(user);
        }catch(_){ alert('Пользователь не найден'); }
      });
    });
    root.querySelectorAll('.ext-link').forEach(el=>{
      if(el.dataset.bound==='1') return;
      el.dataset.bound='1';
      el.addEventListener('click',e=>{
        e.preventDefault();
        const url=el.dataset.url||'';
        if(window.openExternalLinkModal) window.openExternalLinkModal(url);
        else if(url) window.open(url,'_blank','noopener,noreferrer');
      });
    });
  }
  async function enrichLinkPreviews(wrap){
    if(!wrap) return;
    const links=Array.from(wrap.querySelectorAll('.ext-link')).slice(0,20);
    for(const a of links){
      const bubble=a.closest('.msg-bubble');
      const url=a.dataset.url||'';
      if(!bubble||!url||bubble.querySelector(`.link-preview[data-url="${url}"]`)) continue;
      const p=document.createElement('a');
      p.className='link-preview';
      p.dataset.url=url;
      p.href='#';
      p.style.cssText='display:block;margin-top:8px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,0.10);text-decoration:none;color:#fff;';
      p.innerHTML=`<div style="font-size:12px;opacity:.7;">Загрузка предпросмотра…</div><div style="font-size:13px;opacity:.9;">${url}</div>`;
      p.addEventListener('click',e=>{
        e.preventDefault();
        if(window.openExternalLinkModal) window.openExternalLinkModal(url);
        else window.open(url,'_blank','noopener,noreferrer');
      });
      const meta=bubble.querySelector('.msg-meta');
      const react=bubble.querySelector('.msg-reactions');
      if(react) bubble.insertBefore(p,react);
      else if(meta) bubble.insertBefore(p,meta);
      else bubble.appendChild(p);
      try{
        const data=await backendApi(`/link-preview?url=${encodeURIComponent(url)}`);
        p.innerHTML=`<div style="font-size:12px;opacity:.7;">${esc(data.site||'Ссылка')}</div><div style="font-size:14px;font-weight:600;line-height:1.3;">${esc(data.title||url)}</div>${data.description?`<div style="font-size:12px;opacity:.8;line-height:1.25;margin-top:2px;">${esc(data.description)}</div>`:''}`;
      }catch(_){
        p.innerHTML=`<div style="font-size:12px;opacity:.7;">Ссылка</div><div style="font-size:13px;">${url}</div>`;
      }
    }
  }

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
  let replyToMessageId='';
  let ctxMsgOriginalOffset=0;
  let scaleTimer=null;
  let editingBubble=null;
  let pinnedBubble=null;
  let favPinnedBubble=null;
  let forwardingBubble=null;
  let forwardingSenderName='';
  const pinSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#fff"><path d="M160 96C160 78.3 174.3 64 192 64L448 64C465.7 64 480 78.3 480 96C480 113.7 465.7 128 448 128L418.5 128L428.8 262.1C465.9 283.3 494.6 318.5 507 361.8L510.8 375.2C513.6 384.9 511.6 395.2 505.6 403.3C499.6 411.4 490 416 480 416L160 416C150 416 140.5 411.3 134.5 403.3C128.5 395.3 126.5 384.9 129.3 375.2L133 361.8C145.4 318.5 174 283.3 211.2 262.1L221.5 128L192 128C174.3 128 160 113.7 160 96zM288 464L352 464L352 576C352 593.7 337.7 608 320 608C302.3 608 288 593.7 288 576L288 464z"/></svg>`;
  const unpinSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#fff"><path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L449.8 416L480 416C490 416 499.5 411.3 505.5 403.3C511.5 395.3 513.5 384.9 510.7 375.2L507 361.8C494.6 318.5 466 283.3 428.8 262.1L418.5 128L448 128C465.7 128 480 113.7 480 96C480 78.3 465.7 64 448 64L192 64C184.6 64 177.9 66.5 172.5 70.6L222.1 120.3L217.3 183.4L73 39.1zM314.2 416L181.7 283.6C159 304.1 141.9 331 133 361.9L129.2 375.3C126.4 385 128.4 395.3 134.4 403.4C140.4 411.5 150 416 160 416L314.2 416zM288 576C288 593.7 302.3 608 320 608C337.7 608 352 593.7 352 576L352 464L288 464L288 576z"/></svg>`;
  function updatePinActionUI(isPinned){
    const lbl=document.getElementById('ctx-pin-label');
    if(lbl) lbl.textContent=isPinned?'Открепить':'Закрепить';
    const ico=document.getElementById('ctx-pin-icon');
    if(ico) ico.innerHTML=isPinned?unpinSvg:pinSvg;
  }
  function updateChatPinActionUI(isPinned){
    const lbl=document.getElementById('chatlist-pin-label');
    if(lbl) lbl.textContent=isPinned?'Открепить':'Закрепить';
    const ico=document.getElementById('chatlist-pin-icon');
    if(ico) ico.innerHTML=isPinned?unpinSvg:pinSvg;
  }
  let authToken='';
  let currentChatUserId='';
  let currentChatBlockedByPeer=false;
  let currentChatBlockedPeer=false;
  const usersMap=new Map();
  let api=()=>Promise.reject(new Error('API not initialized'));

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
    const isVoice=el.classList.contains('voice-bubble');

    /* показываем/скрываем кнопки только для своих сообщений */
    const isForwarded=el.classList.contains('msg-fwd');
    ctxEdit.style.display=(isOut&&!isForwarded&&!isVoice)?'flex':'none';
    ctxDelete.style.display=isOut?'flex':'none';

    /* Закрепить/Открепить */
    const inFavCtx=!!el.closest('#fav-messages');
    const isPinned=inFavCtx?(favPinnedBubble&&favPinnedBubble===el):(pinnedBubble&&pinnedBubble===el);
    updatePinActionUI(!!isPinned);

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
  function closeCtxNow(){
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null;}
    overlay.classList.remove('open');
    overlay.style.transition='';overlay.style.opacity='';overlay.style.pointerEvents='';
    ctxMsgWrap.style.transition='';ctxMsgWrap.style.transform='';
    ctxMenu.style.transition='';ctxMenu.style.transform='';ctxMenu.style.opacity='';
    ctxMsgWrap.innerHTML='';
  }

  /* ── Ответить ── */
  function doReply(){
    if(!currentBubble)return;
    const inFav=!!currentBubble.closest('#fav-messages');
    const isOut=currentBubble.classList.contains('bubble-out');
    const msgText=currentBubble.querySelector('p');
    const hasMediaGrid=!!currentBubble.querySelector('.msg-media-grid');
    const hasVoice=!!currentBubble.classList.contains('voice-bubble');
    const rawText=msgText?msgText.textContent.trim().slice(0,80):'';
    const preview=rawText||(hasVoice?'__voice__':(hasMediaGrid?'__media__':''));

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
    replyToMessageId=currentBubble.dataset&&currentBubble.dataset.mid?currentBubble.dataset.mid:'';
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
      document.getElementById('fav-reply-island-preview').textContent=preview==='__media__'?'Медиа':(preview==='__voice__'?'Голосовое сообщение':preview);
      document.getElementById('fav-reply-island').classList.add('show');
      document.getElementById('fav-input').focus();
    } else {
      document.getElementById('reply-island-title').textContent='В ответ '+senderName;
      document.getElementById('reply-island-preview').textContent=preview==='__media__'?'Медиа':(preview==='__voice__'?'Голосовое сообщение':preview);
      document.getElementById('reply-island').classList.add('show');
      document.getElementById('msg-input').focus();
    }
    closeCtxNow();
  }

  function dismissReply(){
    document.getElementById('reply-island').classList.remove('show');
    replyToName='';
    replyToText='';
    replyToMediaSrc='';
    replyToMessageId='';
  }

  function dismissFavReply(){
    document.getElementById('fav-reply-island').classList.remove('show');
    replyToName='';
    replyToText='';
    replyToMediaSrc='';
    replyToMessageId='';
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
    const isVoice=!!currentBubble.classList.contains('voice-bubble');
    const mediaBtn=document.getElementById('media-btn');
    if(mediaBtn){
      mediaBtn.disabled=isVoice;
      mediaBtn.style.opacity=isVoice?'0.45':'';
      mediaBtn.style.pointerEvents=isVoice?'none':'';
    }
    document.getElementById('edit-island-preview').textContent=txt||(isVoice?'Голосовое сообщение':(grid?'Медиа':''));
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
    const mediaBtn=document.getElementById('media-btn');
    if(mediaBtn){
      mediaBtn.disabled=false;
      mediaBtn.style.opacity='';
      mediaBtn.style.pointerEvents='';
    }
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
    const isVoice=!!currentBubble.classList.contains('voice-bubble');
    document.getElementById('fav-edit-island-preview').textContent=txt||(isVoice?'Голосовое сообщение':(grid?'Медиа':''));
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
      const hasVoice=!!currentBubble.classList.contains('voice-bubble');
      let preview='';
      if(pEl&&pEl.textContent.trim()) preview=pEl.textContent.trim().slice(0,60);
      else if(hasVoice) preview='Голосовое сообщение';
      else if(hasMedia) preview='📷 Медиа';
      document.getElementById('fav-pinned-bar-preview').textContent=preview||'Сообщение';
      document.getElementById('fav-pinned-bar').classList.add('show');
      updatePinActionUI(true);
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
    const hasVoice=!!currentBubble.classList.contains('voice-bubble');
    let preview='';
    if(pEl&&pEl.textContent.trim()) preview=pEl.textContent.trim().slice(0,60);
    else if(hasVoice) preview='Голосовое сообщение';
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
  async function doForward(){
    if(!currentBubble)return closeCtxClean();
    forwardingBubble=currentBubble;
    /* Получаем имя отправителя */
    const isOut=currentBubble.classList.contains('bubble-out');
    forwardingSenderName=(me&&(me.name||me.username))||(document.getElementById('chat-contact-name')?.textContent.trim())||'Пользователь';
    if(!isOut){
      const wrap=currentBubble.closest('div[style*="flex-start"]');
      if(wrap){
        const nameEl=wrap.querySelector('[style*="color:#8E8E93"]');
        if(nameEl) forwardingSenderName=nameEl.textContent.trim();
      }
      if(forwardingSenderName==='Вы'){
        const contact=document.getElementById('chat-contact-name');
        if(contact&&contact.textContent.trim()) forwardingSenderName=contact.textContent.trim();
      }
    }
    const list=document.getElementById('forward-chat-list');
    if(list){
      let items=[];
      try{
        const data=await backendApi('/chats?q=');
        const chats=data.items||[];
        chats.forEach(c=>usersMap.set(c.id,c));
        items=chats.filter(u=>u&&u.id);
      }catch(_){
        items=Array.from(usersMap.values()).filter(u=>u&&u.id);
      }
      items=items.filter(u=>u.id!==(me&&me.id)&&!u.deleted);
      list.innerHTML='';
      if(!items.length){
        list.innerHTML='<div style="color:#8E8E93;font-size:14px;padding:12px 16px;">Нет доступных чатов</div>';
      }else{
        items.forEach(u=>{
          const row=document.createElement('button');
          row.className='forward-row';
          row.innerHTML=`<div class="tg-avatar" style="width:46px;height:46px;background:${esc(u.color||'linear-gradient(135deg,#0078FF,#005fcc)')};font-size:19px;flex-shrink:0;overflow:hidden;">${u.avatarDataUrl?`<img src="${esc(u.avatarDataUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:esc((u.avatar||(u.name||'U').charAt(0)).toUpperCase())}</div><span class="forward-row-name">${esc(u.name||'Пользователь')}</span>`;
          row.addEventListener('click',()=>forwardToChat(u.id));
          list.appendChild(row);
        });
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
  async function doDeleteChat(){
    if(!currentChatListEl)return closeChatListCtxClean();
    const el=currentChatListEl;
    const uid=el.dataset.chatId||'';
    closeChatListCtxClean();
    if(uid){
      try{ await api(`/chats/${encodeURIComponent(uid)}`,{method:'DELETE'}); }catch(_){}
    }
    setTimeout(()=>{if(el&&el.parentElement)el.remove();},320);
    if(currentChatUserId===uid){
      currentChatUserId='';
      showScreen('screen-list');
    }
    setTimeout(()=>loadChats('',{showSkeleton:false}),340);
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

  async function forwardToChat(dest){
    if(!forwardingBubble)return closeForward();
    const pEl=forwardingBubble.querySelector('p');
    const grid=forwardingBubble.querySelector('.msg-media-grid');
    const voiceAudio=forwardingBubble.querySelector('audio[data-voice-duration]');
    const txt=pEl?pEl.textContent.trim():'';
    const now=new Date();
    const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const tick=`<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const fwdHeader=`<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:1px;">Переслано</div><div style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:5px;">от <b>${esc(forwardingSenderName)}</b></div>`;

    const msgsId=dest==='favorites'?'fav-messages':'chat-messages';
    const anchorId=dest==='favorites'?'fav-bottom':'chat-bottom';
    const msgs=document.getElementById(msgsId);
    const anchor=document.getElementById(anchorId);
    const localForwardMid='fav-'+(++msgIdCounter);
    const w=document.createElement('div');
    w.style.cssText='align-self:flex-end;max-width:78%;';

    /* Клонируем медиа-сетку если есть */
    let mediaClone='';
    if(voiceAudio){
      const dur=Number(voiceAudio.dataset.voiceDuration||0);
      let waveform=[];
      try{ waveform=JSON.parse(voiceAudio.dataset.voiceWave||'[]'); }catch(_){}
      const src=voiceAudio.currentSrc||voiceAudio.src||'';
      w.style.cssText='align-self:flex-end;max-width:276px;';
      w.innerHTML=renderVoiceBubbleHtml({mine:true,src,durationMs:dur,timeText:t,tickHtml:tick,waveform,showUnreadDot:false,text:txt,forwardedFromName:forwardingSenderName});
    }else if(grid){
      const cloned=grid.cloneNode(true);
      cloned.style.borderRadius='0';
      cloned.style.margin='0 3px';
      cloned.style.width='calc(100% - 6px)';
      const tmp=document.createElement('div');
      tmp.appendChild(cloned);
      mediaClone=tmp.innerHTML;
    }

    if(voiceAudio){
      /* для голосового уже собран bubble выше */
    } else if(grid){
      /* Пересланное сообщение с медиа — медиа растягивается на всю ширину (как в Telegram) */
      const textPart=txt?`<p class="msg-text-out" style="padding:4px 14px 0;margin:0;">${renderRichText(txt)}</p>`:'';
      const metaStyle=txt?'padding:0 14px 6px;':'padding:4px 14px 4px;align-self:flex-end;';
      w.innerHTML=`<div class="bubble-out msg-bubble msg-fwd" style="padding:0;overflow:hidden;"><div style="padding:8px 14px 6px;">${fwdHeader}</div>${mediaClone}${textPart}<div class="msg-meta" style="${metaStyle}"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
    } else {
      const textPart=txt?`<p class="msg-text-out">${renderRichText(txt)}</p>`:'';
      w.innerHTML=`<div class="bubble-out msg-bubble msg-fwd">${fwdHeader}${textPart}<div class="msg-meta"><span class="msg-time-out">${t}</span>${tick}</div></div>`;
    }
    if(dest==='favorites'){
      msgs.insertBefore(w,anchor);
      const b=w.querySelector('.msg-bubble');
      if(b&&!b.dataset.mid) b.dataset.mid=localForwardMid;
      bindBubble(b);
      bindMsgRow(w);
      bindRichTextInteractions(b);
      initVoicePlayers(w);
      enrichLinkPreviews(w);
    }
    if(dest!=='favorites'&&authToken){
      const localMedia=voiceAudio
        ? [voiceAudio.currentSrc||voiceAudio.src].filter(Boolean)
        : Array.from(forwardingBubble.querySelectorAll('.msg-media-grid .mi img,.msg-media-grid .mi video')).map(n=>n.currentSrc||n.src).filter(Boolean);
      const voiceDurationMs=voiceAudio?Number(voiceAudio.dataset.voiceDuration||0):0;
      let voiceWaveform=[];
      if(voiceAudio){
        try{ voiceWaveform=JSON.parse(voiceAudio.dataset.voiceWave||'[]'); }catch(_){}
      }
      try{
        await api('/messages',{method:'POST',body:JSON.stringify({toUserId:dest,text:txt,media:localMedia,forwardedFromName:forwardingSenderName,voiceDurationMs,voiceWaveform})});
      }catch(e){
        alert(e.message||'Ошибка пересылки');
        return;
      }
    }
    closeForward();
    if(dest==='favorites') showScreen('screen-favorites');
    else if(dest&&dest!=='favorites'&&window.openChatWith) await openChatWith(dest);
    else showScreen('screen-list');
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
  let suppressReactionAnimations=false;

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
    const isVoice=!!bubble.classList.contains('voice-bubble');
    if(!entries.length){
      if(isVoice) bubble.classList.remove('voice-reactions-open');
      if(rDiv){
        if(suppressReactionAnimations){
          if(rDiv.parentElement) rDiv.remove();
        }else{
          rDiv.classList.remove('visible');
          setTimeout(()=>{if(rDiv.parentElement)rDiv.remove();},340);
        }
      }
      return;
    }
    const metaEl=bubble.querySelector('.msg-meta');
    const voiceMetaEl=bubble.querySelector('.voice-meta');
    const voiceMetaWrap=voiceMetaEl?voiceMetaEl.parentElement:null;
    if(isVoice) bubble.classList.add('voice-reactions-open');
    const isNew=!rDiv;
    if(isNew){
      rDiv=document.createElement('div');
      rDiv.className='msg-reactions';
      if(isVoice&&voiceMetaEl) voiceMetaEl.after(rDiv);
      else if(metaEl)metaEl.before(rDiv);
      else bubble.appendChild(rDiv);
    }else if(isVoice&&voiceMetaEl&&voiceMetaWrap&&rDiv.parentElement===voiceMetaWrap&&rDiv.previousElementSibling!==voiceMetaEl){
      voiceMetaEl.after(rDiv);
    }
    const currentEmojis=new Set(entries.map(([e])=>e));
    /* Анимированное удаление исчезнувших пилюль */
    Array.from(rDiv.querySelectorAll('.reaction-pill[data-emoji]')).forEach(pill=>{
      if(!currentEmojis.has(pill.dataset.emoji)){
        if(suppressReactionAnimations){
          if(pill.parentElement) pill.remove();
        }else{
          pill.style.transition='transform 0.2s cubic-bezier(0.36,0,0.66,0),opacity 0.16s ease';
          pill.style.transform='scale(0.4)';
          pill.style.opacity='0';
          setTimeout(()=>{if(pill.parentElement)pill.remove();},220);
        }
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
        if(!isNew&&!suppressReactionAnimations){
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
    if(isNew&&!suppressReactionAnimations){
      requestAnimationFrame(()=>requestAnimationFrame(()=>rDiv.classList.add('visible')));
    }else if(isNew){
      rDiv.classList.add('visible');
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
    updateChatPinActionUI(el.classList.contains('chat-pinned'));
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
      const uid=el.dataset.chatId;
      if(uid&&window.openChatWith) window.openChatWith(uid);
      else showScreen('screen-list');
    });

    /* Десктоп: правая кнопка мыши → контекстное меню */
    el.addEventListener('contextmenu',e=>{
      if(!isDesktop()) return;
      e.preventDefault();
      openChatListCtx(el);
    });

    el.addEventListener('touchstart',e=>{
      if(e.target.closest('.chat-open-avatar')) return;
      crTsX=e.touches[0].clientX;crTsY=e.touches[0].clientY;crMoved=false;crLongPressed=false;
      crScaleTimer=setTimeout(()=>{if(!crMoved){el.style.transition='transform 0.22s ease';el.style.transform='scale(0.97)';}},220);
      crPressTimer=setTimeout(()=>{crLongPressed=true;el.style.transition='transform 0.18s ease';el.style.transform='';openChatListCtx(el);},480);
    },{passive:true});

    el.addEventListener('touchmove',e=>{
      const dx=Math.abs(e.touches[0].clientX-crTsX);
      const dy=Math.abs(e.touches[0].clientY-crTsY);
      if(dx>7||dy>7){crMoved=true;clearTimeout(crPressTimer);clearTimeout(crScaleTimer);el.style.transition='transform 0.18s ease';el.style.transform='';}
    },{passive:true});

    el.addEventListener('touchend',(e)=>{
      if(e.target.closest('.chat-open-avatar')) return;
      clearTimeout(crPressTimer);clearTimeout(crScaleTimer);
      el.style.transition='transform 0.18s ease';el.style.transform='';
      if(el.dataset.avatarTap==='1'){
        el.dataset.avatarTap='0';
        return;
      }
      if(!crLongPressed&&!crMoved){
        const uid=el.dataset.chatId;
        if(uid&&window.openChatWith) window.openChatWith(uid);
        else showScreen('screen-list');
      }
    });
  }

  document.querySelectorAll('.chat-row-item').forEach(bindChatRow);

  /* ── Нажатие на цитату → переход к оригиналу ── */
  function bindQuoteTap(quoteEl){
    quoteEl.style.cursor='pointer';
    quoteEl.addEventListener('click',e=>{
      e.stopPropagation();
      const scope=quoteEl.closest('#fav-messages,#chat-messages')||document;
      const quotedText=quoteEl.querySelector('.msg-quote-text')?.textContent.trim();
      const replyId=quoteEl.dataset.replyId;
      if(replyId){
        const byId=scope.querySelector(`.msg-bubble[data-mid="${replyId}"]`);
        if(byId){
          byId.scrollIntoView({behavior:'smooth',block:'center'});
          setTimeout(()=>{
            byId.classList.remove('msg-flash');
            void byId.offsetWidth;
            byId.classList.add('msg-flash');
            setTimeout(()=>byId.classList.remove('msg-flash'),1200);
          },300);
          return;
        }
      }
      if(!quotedText)return;
      const needle=quotedText.slice(0,40).toLowerCase();
      let target=null;
      if(needle==='медиа'){
        /* ищем конкретный пузырь по сохранённому mid, иначе последний */
        const replyMid=quoteEl.dataset.replyMid;
        if(replyMid){
          const all=Array.from(scope.querySelectorAll('.msg-bubble'));
          target=all.find(b=>{
            const g=b.querySelector('.msg-media-grid');
            if(!g)return false;
            const mi=g.querySelector('.mi[onclick]');
            return mi&&mi.getAttribute('onclick').includes(`'${replyMid}'`);
          })||null;
        }
        if(!target){
          const all=Array.from(scope.querySelectorAll('.msg-bubble')).filter(b=>b.querySelector('.msg-media-grid'));
          target=all.length?all[all.length-1]:null;
        }
      } else if(needle==='голосовое сообщение'){
        target=null;
      } else {
        scope.querySelectorAll('.msg-bubble').forEach(b=>{
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

  document.querySelectorAll('.msg-quote-out,.msg-quote-in').forEach(bindQuoteTap);

  /* ── Закрепить чат ── */
  function decorateChatPinnedUi(el,isPinned){
    if(!el) return;
    if(isPinned){
      el.classList.add('chat-pinned');
      if(!el.querySelector('.chat-pin-icon')){
        const pi=document.createElement('div');
        pi.className='chat-pin-icon';
        pi.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill="rgba(255,255,255,0.9)"><path d="M160 96C160 78.3 174.3 64 192 64L448 64C465.7 64 480 78.3 480 96C480 113.7 465.7 128 448 128L418.5 128L428.8 262.1C465.9 283.3 494.6 318.5 507 361.8L510.8 375.2C513.6 384.9 511.6 395.2 505.6 403.3C499.6 411.4 490 416 480 416L160 416C150 416 140.5 411.3 134.5 403.3C128.5 395.3 126.5 384.9 129.3 375.2L133 361.8C145.4 318.5 174 283.3 211.2 262.1L221.5 128L192 128C174.3 128 160 113.7 160 96zM288 464L352 464L352 576C352 593.7 337.7 608 320 608C302.3 608 288 593.7 288 576L288 464z"/></svg>';
        el.insertBefore(pi,el.firstChild);
      }
      return;
    }
    el.classList.remove('chat-pinned');
    const pi=el.querySelector('.chat-pin-icon');
    if(pi) pi.remove();
  }
  function animateChatRowsReorder(list){
    if(!list) return;
    const rows=Array.from(list.querySelectorAll('.chat-row-item'));
    const firstPos=new Map(rows.map(r=>[r,r.getBoundingClientRect().top]));
    requestAnimationFrame(()=>{
      rows.forEach(r=>{
        const last=firstPos.get(r);
        if(typeof last!=='number') return;
        const now=r.getBoundingClientRect().top;
        const dy=last-now;
        if(!dy) return;
        r.style.transition='none';
        r.style.transform=`translateY(${dy}px)`;
        requestAnimationFrame(()=>{
          r.style.transition='transform .28s cubic-bezier(.22,.61,.36,1), opacity .22s ease';
          r.style.transform='';
          setTimeout(()=>{ r.style.transition=''; },300);
        });
      });
    });
  }
  async function pinChat(){
    if(!currentChatListEl)return;
    const el=currentChatListEl;
    const list=document.getElementById('chat-list');
    const isPinned=el.classList.contains('chat-pinned');
    const pinnedRows=list?Array.from(list.querySelectorAll('.chat-row-item.chat-pinned')):[];
    const wasPinned=isPinned;
    el.classList.add('chat-pin-anim');
    setTimeout(()=>el.classList.remove('chat-pin-anim'),260);
    if(isPinned){
      decorateChatPinnedUi(el,false);
      if(list){
        const pinnedLeft=Array.from(list.querySelectorAll('.chat-row-item.chat-pinned'));
        const anchor=pinnedLeft.length?pinnedLeft[pinnedLeft.length-1].nextSibling:list.firstChild;
        list.insertBefore(el,anchor);
        animateChatRowsReorder(list);
      }
    }else{
      decorateChatPinnedUi(el,true);
      if(list){
        const firstRow=list.querySelector('.chat-row-item');
        if(firstRow) list.insertBefore(el,firstRow);
        else list.appendChild(el);
        animateChatRowsReorder(list);
      }
    }
    try{
      await api(`/chats/${encodeURIComponent(el.dataset.chatId||'')}`,{method:'PATCH',body:JSON.stringify({action:isPinned?'unpin':'pin'})});
    }catch(_){
      decorateChatPinnedUi(el,wasPinned);
      if(list){
        if(wasPinned){
          const firstPinned=list.querySelector('.chat-row-item.chat-pinned');
          if(firstPinned) list.insertBefore(el,firstPinned);
        }else{
          const afterPinned=pinnedRows.length?pinnedRows[pinnedRows.length-1].nextSibling:list.firstChild;
          list.insertBefore(el,afterPinned);
        }
        animateChatRowsReorder(list);
      }
    }
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
    pendingAvatarDataUrl='';
    pendingBannerDataUrl='';
    if(me&&typeof window.applyProfileUI==='function') window.applyProfileUI(me);
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
    const name=(document.getElementById('pe-name')?.value||'').trim();
    const username=(document.getElementById('pe-username')?.value||'').trim();
    if(!name||!username){ alert('Имя и username обязательны'); return; }
    closeProfileEdit();
  }

  /* ── Конфиденциальность ── */
  function openPrivacy(){
    document.getElementById('privacy-wrap').classList.add('open');
  }
  function closePrivacy(){
    document.getElementById('privacy-wrap').classList.remove('open');
  }
  let devicesSessionsCache=[];
  function backendApi(path,opts={}){
    if(typeof window.__api==='function') return window.__api(path,opts);
    return Promise.reject(new Error('API не готов'));
  }
  function deviceIconSvg(name){
    const n=String(name||'').toLowerCase();
    if(n.includes('android')) return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill="#fff"><path d="M452.5 317.9C465.8 317.9 476.5 328.6 476.5 341.9C476.5 355.2 465.8 365.9 452.5 365.9C439.2 365.9 428.5 355.2 428.5 341.9C428.5 328.6 439.2 317.9 452.5 317.9zM187.4 317.9C200.7 317.9 211.4 328.6 211.4 341.9C211.4 355.2 200.7 365.9 187.4 365.9C174.1 365.9 163.4 355.2 163.4 341.9C163.4 328.6 174.1 317.9 187.4 317.9zM461.1 221.4L509 138.4C509.8 137.3 510.3 136 510.5 134.6C510.7 133.2 510.7 131.9 510.4 130.5C510.1 129.1 509.5 127.9 508.7 126.8C507.9 125.7 506.9 124.8 505.7 124.1C504.5 123.4 503.2 123 501.8 122.8C500.4 122.6 499.1 122.8 497.8 123.2C496.5 123.6 495.3 124.3 494.2 125.1C493.1 125.9 492.3 127.1 491.7 128.3L443.2 212.4C404.4 195 362.4 186 319.9 186C277.4 186 235.4 195 196.6 212.4L148.2 128.4C147.6 127.2 146.7 126.1 145.7 125.2C144.7 124.3 143.4 123.7 142.1 123.3C140.8 122.9 139.4 122.8 138.1 122.9C136.8 123 135.4 123.5 134.2 124.2C133 124.9 132 125.8 131.2 126.9C130.4 128 129.8 129.3 129.5 130.6C129.2 131.9 129.2 133.3 129.4 134.7C129.6 136.1 130.2 137.3 130.9 138.5L178.8 221.5C96.5 266.2 40.2 349.5 32 448L608 448C599.8 349.5 543.5 266.2 461.1 221.4z"/></svg>`;
    if(n.includes('iphone')||n.includes('ipad')||n.includes('mac')) return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill="#fff"><path d="M447.1 332.7C446.9 296 463.5 268.3 497.1 247.9C478.3 221 449.9 206.2 412.4 203.3C376.9 200.5 338.1 224 323.9 224C308.9 224 274.5 204.3 247.5 204.3C191.7 205.2 132.4 248.8 132.4 337.5C132.4 363.7 137.2 390.8 146.8 418.7C159.6 455.4 205.8 545.4 254 543.9C279.2 543.3 297 526 329.8 526C361.6 526 378.1 543.9 406.2 543.9C454.8 543.2 496.6 461.4 508.8 424.6C443.6 393.9 447.1 334.6 447.1 332.7zM390.5 168.5C417.8 136.1 415.3 106.6 414.5 96C390.4 97.4 362.5 112.4 346.6 130.9C329.1 150.7 318.8 175.2 321 202.8C347.1 204.8 370.9 191.4 390.5 168.5z"/></svg>`;
    if(n.includes('windows')) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M2 4l9-1v9H2V4zm11-1 9-1v10h-9V3zM2 13h9v9l-9-1v-8zm11 0h9v10l-9-1v-9z"/></svg>`;
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="1.4" fill="#fff" stroke="none"/></svg>`;
  }
  function renderDeviceRow(s,current){
    const when=s.lastSeenAt?new Date(s.lastSeenAt).toLocaleString('ru-RU',{day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'}):'—';
    return `<button class="settings-row device-row" data-session-id="${esc(s.id)}" style="border-bottom:1px solid #2a2a2a;background:#1A1A1A;">
      <div class="settings-icon" style="background:#50aef8;border-radius:50%;">${deviceIconSvg(s.deviceName)}</div>
      <div style="flex:1;min-width:0;text-align:left;">
        <div style="color:#fff;font-size:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.deviceName||'Устройство')}</div>
        <div style="color:#8E8E93;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.app||'MIN Web')}</div>
        <div style="color:#8E8E93;font-size:14px;">${esc(s.location||'Unknown')}${current?'':''}</div>
      </div>
      ${current?'<span style="color:#8E8E93;font-size:14px;">Это устройство</span>':'<span style="color:#8E8E93;font-size:13px;">'+esc(when)+'</span>'}
    </button>`;
  }
  function bindDeviceRows(){
    document.querySelectorAll('.device-row[data-session-id]').forEach(el=>{
      el.onclick=()=>{
        const sid=el.dataset.sessionId;
        const s=devicesSessionsCache.find(x=>x.id===sid);
        if(!s)return;
        document.getElementById('devices-main-view').style.display='none';
        document.getElementById('device-detail-view').style.display='block';
        document.getElementById('device-detail-head').textContent=s.deviceName||'Устройство';
        document.getElementById('device-detail-sub').textContent=s.lastSeenAt?new Date(s.lastSeenAt).toLocaleString('ru-RU',{day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'}):'—';
        document.getElementById('device-detail-info').innerHTML=`<div><b>${esc(s.app||'MIN Web')}</b><div style="color:#8E8E93;font-size:16px;">Приложение</div></div>
        <div style="margin-top:10px;"><b>${esc(s.osVersion||s.os||'Unknown')}</b><div style="color:#8E8E93;font-size:16px;">Версия системы</div></div>
        <div style="margin-top:10px;"><b>${esc(s.location||'Unknown')}</b><div style="color:#8E8E93;font-size:16px;">Геопозиция</div></div>`;
      };
    });
  }
  function closeDeviceDetail(){
    document.getElementById('device-detail-view').style.display='none';
    document.getElementById('devices-main-view').style.display='block';
  }
  async function openDevicesSheet(){
    document.getElementById('devices-wrap').classList.add('open');
    closeDeviceDetail();
    try{
      const r=await backendApi('/me/sessions');
      devicesSessionsCache=r.items||[];
      const c=String(r.count||1);
      const dc=document.getElementById('devices-count');
      if(dc) dc.textContent=c;
      const cur=devicesSessionsCache.filter(x=>x.current);
      const oth=devicesSessionsCache.filter(x=>!x.current);
      const loBtn=document.getElementById('devices-logout-others-btn');
      if(loBtn){
        loBtn.disabled=oth.length===0;
        loBtn.style.opacity=oth.length===0?'0.45':'1';
        loBtn.style.pointerEvents=oth.length===0?'none':'auto';
      }
      document.getElementById('devices-current-list').innerHTML=cur.map(s=>renderDeviceRow(s,true)).join('')||'<div style="color:#8E8E93;padding:0 16px 10px;">Текущее устройство не найдено</div>';
      document.getElementById('devices-other-list').innerHTML=oth.map(s=>renderDeviceRow(s,false)).join('')||'<div style="color:#8E8E93;padding:0 16px 10px;">Нет других активных сеансов</div>';
      bindDeviceRows();
    }catch(e){
      document.getElementById('devices-current-list').innerHTML='<div style="color:#ff453a;padding:0 16px 10px;">Не удалось загрузить устройства</div>';
      document.getElementById('devices-other-list').innerHTML='';
    }
  }
  function closeDevicesSheet(){
    document.getElementById('devices-wrap').classList.remove('open');
  }
  async function logoutOtherSessions(){
    try{
      await backendApi('/me/sessions/logout-others',{method:'POST',body:'{}'});
      await openDevicesSheet();
    }catch(e){ alert(e.message); }
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
  function showTopToast(msg,isError=false){
    const toast=document.getElementById('copy-toast');
    if(!toast) return;
    toast.textContent=msg;
    toast.style.background=isError?'rgba(255,69,58,0.95)':'rgba(255,255,255,0.95)';
    toast.style.color=isError?'#fff':'#111';
    toast.classList.add('show');
    if(copyToastTimer)clearTimeout(copyToastTimer);
    copyToastTimer=setTimeout(()=>toast.classList.remove('show'),1800);
  }
  function enableBasicSourceProtection(){
    document.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('keydown',e=>{
      const k=(e.key||'').toLowerCase();
      const ctrlOrMeta=e.ctrlKey||e.metaKey;
      if(k==='f12'){ e.preventDefault(); return; }
      if(ctrlOrMeta&&e.shiftKey&&(k==='i'||k==='j'||k==='c')){ e.preventDefault(); return; }
      if(ctrlOrMeta&&(k==='u'||k==='s')) e.preventDefault();
    });
  }
  enableBasicSourceProtection();
  function copyPrivacyCode(){
    const code=document.getElementById('privacy-code-text').textContent;
    navigator.clipboard.writeText(code).catch(()=>{});
    showTopToast('Скопировано');
  }
  function closeUserProfileView(){
    const view=document.getElementById('user-profile-view');
    view.classList.remove('open');
    setTimeout(()=>{
      if(!view.classList.contains('open')) view.style.display='none';
    },260);
  }
  function openUserProfileView(p){
    window.__upvUserId=p.id||'';
    document.getElementById('upv-name').textContent=p.name||'Профиль';
    document.getElementById('upv-username').textContent=p.username?`@${p.username}`:'';
    const bioEl=document.getElementById('upv-bio');
    if(bioEl) bioEl.textContent=(p.bio||'').slice(0,110);
    const banner=document.getElementById('upv-banner');
    banner.style.backgroundImage=p.bannerDataUrl?`url('${p.bannerDataUrl}')`:'none';
    banner.style.backgroundColor=p.bannerDataUrl?'transparent':'#2C2C2E';
    const av=document.getElementById('upv-avatar');
    if(p.avatarDataUrl) av.innerHTML=`<img src="${p.avatarDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    else av.innerHTML=p.deleted?deletedAvatarMarkup(34):esc((p.name||p.username||'U').charAt(0).toUpperCase());
    const view=document.getElementById('user-profile-view');
    view.style.display='flex';
    requestAnimationFrame(()=>view.classList.add('open'));
  }
  /* ── Инициализация кнопки отправки ── */
  (function(){
    const btn=document.getElementById('send-btn');
    updateSendBtn();
    const holdStart=async (e,target)=>{
      const st=recordStates[target];
      const sendBtn=target==='chat'?document.getElementById('send-btn'):document.getElementById('fav-send-btn');
      const input=target==='chat'?document.getElementById('msg-input'):document.getElementById('fav-input');
      const hasMedia=target==='chat'?attachedMedia.length:attachedFavMedia.length;
      if(!sendBtn.classList.contains('voice-mode')||!input||input.value.trim()||hasMedia||st.recording) return;
      e.preventDefault();
      sendBtn.classList.remove('record-hold');
      sendBtn.classList.add('record-pressing');
      st.holdTimer=setTimeout(async ()=>{
        try{ await beginVoiceRecording(target); }catch(_){ showTopToast('Нет доступа к микрофону',true); }
      },1000);
    };
    const holdEnd=(e,target)=>{
      const st=recordStates[target];
      const sendBtn=target==='chat'?document.getElementById('send-btn'):document.getElementById('fav-send-btn');
      if(st.holdTimer){ clearTimeout(st.holdTimer); st.holdTimer=null; }
      if(sendBtn&&!st.recording) sendBtn.classList.remove('record-pressing');
      if(st.recording){ e.preventDefault(); finishVoiceRecording(true,target); }
    };
    btn.addEventListener('pointerdown',e=>holdStart(e,'chat'));
    btn.addEventListener('pointerup',e=>holdEnd(e,'chat'));
    btn.addEventListener('pointercancel',e=>holdEnd(e,'chat'));
    const favBtn=document.getElementById('fav-send-btn');
    updateFavBtn();
    favBtn.addEventListener('pointerdown',e=>holdStart(e,'fav'));
    favBtn.addEventListener('pointerup',e=>holdEnd(e,'fav'));
    favBtn.addEventListener('pointercancel',e=>holdEnd(e,'fav'));
  })();

  /* ── Backend sync + auth + routes ── */
  (function(){
    const API_BASE='/api';
    authToken=localStorage.getItem('auth_token')||'';
    let stream=null;
    let searchTimer=null;
    const localLinkPreviewCache=new Map();
    const messageMap=new Map();

    api=function(path,opts={}){
      const headers={ 'Content-Type':'application/json', ...(opts.headers||{}) };
      if(authToken) headers['x-session-token']=authToken;
      return fetch(`${API_BASE}${path}`,{...opts,headers}).then(async r=>{
        const data=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(data.error||'API error');
        return data;
      });
    }
    window.__api=api;
    function initials(name){
      const t=(name||'М').trim();
      return t ? t.charAt(0).toUpperCase() : 'М';
    }
    function setAvatarNode(el,avatarUrl,fallback){
      if(!el)return;
      if(!el.dataset.defaultBg) el.dataset.defaultBg=el.style.background||'';
      el.innerHTML='';
      if(avatarUrl){
        const img=document.createElement('img');
        img.src=avatarUrl;
        img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;';
        el.appendChild(img);
        el.style.background='none';
      }else{
        el.textContent=initials(fallback);
        el.style.background=el.dataset.defaultBg;
      }
    }
    function applyProfileUI(profile){
      me=profile;
      const name=profile.name||profile.username||'Мой профиль';
      const username=profile.username||'';
      const bio=profile.bio||'';
      const avatar=profile.avatarDataUrl||'';
      const banner=profile.bannerDataUrl||'';
      const mainName=document.getElementById('profile-main-name');
      if(mainName) mainName.textContent=name;
      const peName=document.getElementById('pe-name');
      const peUsername=document.getElementById('pe-username');
      const peBio=document.getElementById('pe-bio');
      if(peName) peName.value=name;
      if(peUsername) peUsername.value=username;
      if(peBio) peBio.value=bio;
      setAvatarNode(document.getElementById('profile-main-avatar'),avatar,name);
      setAvatarNode(document.getElementById('profile-row-avatar'),avatar,name);
      setAvatarNode(document.getElementById('pe-avatar-circle'),avatar,name);
      const topBtn=document.getElementById('top-profile-btn');
      if(topBtn){
        topBtn.textContent=initials(name);
        if(avatar){
          topBtn.innerHTML=`<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
          topBtn.style.overflow='hidden';
          topBtn.style.background='none';
        }else{
          topBtn.innerHTML=initials(name);
          topBtn.style.background='linear-gradient(135deg,#0078FF,#005fcc)';
        }
      }
      const mainBanner=document.getElementById('profile-main-banner');
      if(mainBanner){
        mainBanner.style.backgroundImage=banner?`url('${banner}')`:'none';
        mainBanner.style.backgroundColor=banner?'transparent':'#fff';
      }
      const bImg=document.getElementById('pe-banner-img');
      if(bImg){
        if(banner){ bImg.src=banner; bImg.style.display='block'; }
        else{ bImg.removeAttribute('src'); bImg.style.display='none'; }
      }
      applyPeMediaScale();
    }
    window.applyProfileUI=applyProfileUI;
    function showLoginScreen(){ document.getElementById('login-screen').classList.remove('hidden'); }
    function hideLoginScreen(){ document.getElementById('login-screen').classList.add('hidden'); }
    window.showMainPanel=function(){
      document.getElementById('login-main-panel').style.display='flex';
      document.getElementById('reg-panel').classList.remove('active');
      document.getElementById('vpsc-panel').classList.remove('active');
      document.getElementById('login-error').textContent='';
      document.getElementById('reg-error').textContent='';
      document.getElementById('vpsc-error').textContent='';
    };
    window.showRegPanel=function(){
      document.getElementById('login-main-panel').style.display='none';
      document.getElementById('vpsc-panel').classList.remove('active');
      document.getElementById('reg-panel').classList.add('active');
      document.getElementById('login-error').textContent='';
      document.getElementById('reg-error').textContent='';
      document.getElementById('vpsc-error').textContent='';
    };
    window.showVpscPanel=function(){
      document.getElementById('login-main-panel').style.display='none';
      document.getElementById('reg-panel').classList.remove('active');
      document.getElementById('vpsc-panel').classList.add('active');
      document.getElementById('login-error').textContent='';
      document.getElementById('vpsc-error').textContent='';
      updateVpscBoxes('');
      setTimeout(()=>document.getElementById('vpsc-hidden-input').focus(),10);
    };
    function openAuth(tab='login'){
      showLoginScreen();
      if(tab==='register') window.showRegPanel();
      else window.showMainPanel();
    }
    function closeAuth(){
      hideLoginScreen();
      document.getElementById('login-error').textContent='';
      document.getElementById('reg-error').textContent='';
    }
    window.doLogin=async function(){
      const username=document.getElementById('login-username').value.trim();
      const password=document.getElementById('login-password').value;
      try{
        const res=await api('/login',{method:'POST',body:JSON.stringify({username,password})});
        authToken=res.token;
        localStorage.setItem('auth_token',authToken);
        closeAuth();
        applyProfileUI(res.user);
        startRealtime();
        await loadChats();
      }catch(e){ document.getElementById('login-error').textContent=e.message; }
    };
    window.doRegister=async function(){
      const name=document.getElementById('reg-displayname').value.trim();
      const username=document.getElementById('reg-username').value.trim();
      const password=document.getElementById('reg-password').value;
      const password2=document.getElementById('reg-password2').value;
      if(password!==password2){
        document.getElementById('reg-error').textContent='Пароли не совпадают';
        return;
      }
      try{
        const res=await api('/register',{method:'POST',body:JSON.stringify({name,username,password})});
        authToken=res.token;
        localStorage.setItem('auth_token',authToken);
        closeAuth();
        applyProfileUI(res.user);
        startRealtime();
        await loadChats();
      }catch(e){ document.getElementById('reg-error').textContent=e.message; }
    };
    function updateVpscBoxes(code){
      for(let i=0;i<6;i++){
        const box=document.getElementById(`vpsc-b${i}`);
        if(!box) continue;
        box.textContent=code[i]||'';
        box.classList.toggle('active-box',i===Math.min(code.length,5));
      }
    }
    window.doVpscLogin=async function(){
      const code=document.getElementById('vpsc-hidden-input').value.trim();
      if(code.length!==6){ document.getElementById('vpsc-error').textContent='Введите 6 символов'; return; }
      try{
        const res=await api('/vpsc/login',{method:'POST',body:JSON.stringify({code})});
        authToken=res.token;
        localStorage.setItem('auth_token',authToken);
        closeAuth();
        applyProfileUI(res.user);
        startRealtime();
        await loadChats();
      }catch(e){ document.getElementById('vpsc-error').textContent=e.message; }
    };
    let chatsRefreshTimer=null;
    let openChatRefreshTimer=null;
    let chatsLoadInFlight=false;
    let queuedChatsRefresh=false;
    let openChatReqSeq=0;
    function scheduleOpenCurrentChat(){
      if(!currentChatUserId) return;
      if(openChatRefreshTimer) clearTimeout(openChatRefreshTimer);
      openChatRefreshTimer=setTimeout(()=>{ openChatWith(currentChatUserId,{keepScreen:true}); },80);
    }
    function scheduleChatsRefresh(){
      if(chatsRefreshTimer) clearTimeout(chatsRefreshTimer);
      chatsRefreshTimer=setTimeout(()=>{ loadChats('',{showSkeleton:false}); },120);
    }
    function renderChatSkeletonRows(count=5){
      return Array.from({length:count}).map(()=>`<div class="chat-row-skeleton">
        <div class="chat-row-skeleton-avatar"></div>
        <div class="chat-row-skeleton-lines">
          <div class="chat-row-skeleton-line w1"></div>
          <div class="chat-row-skeleton-line w2"></div>
        </div>
      </div>`).join('');
    }
    async function loadChats(query='',opts={}){
      const showSkeleton=opts.showSkeleton!==false;
      const holder=document.getElementById('chat-list');
      if(!holder) return;
      if(chatsLoadInFlight){
        queuedChatsRefresh=true;
        return;
      }
      chatsLoadInFlight=true;
      const hadChats=holder.querySelectorAll('.chat-row-item').length>0;
      const prevHtml=holder.innerHTML;
      holder.querySelectorAll('.chat-row-skeleton').forEach(n=>n.remove());
      const emptyPre=document.getElementById('chat-list-empty');
      if(emptyPre) emptyPre.style.display='none';
      if(showSkeleton&&hadChats){
        holder.insertAdjacentHTML('beforeend',renderChatSkeletonRows(6));
      }
      try{
        const data=await api(`/chats?q=${encodeURIComponent(query.trim())}`);
        const items=data.items||[];
        const empty=document.getElementById('chat-list-empty');
        if(empty) empty.style.display=items.length?'none':'block';
        holder.querySelectorAll('.chat-row-item,.chat-row-skeleton').forEach(n=>n.remove());
        items.forEach(c=>usersMap.set(c.id,c));
        const html=items.map(c=>{
          const time=c.lastCreatedAt?new Date(c.lastCreatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';
          return `<button class="chat-row chat-row-item ${c.isPinned?'chat-pinned':''}" data-chat-id="${esc(c.id||'')}">
          ${c.isPinned?'<div class="chat-pin-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill="rgba(255,255,255,0.9)"><path d="M160 96C160 78.3 174.3 64 192 64L448 64C465.7 64 480 78.3 480 96C480 113.7 465.7 128 448 128L418.5 128L428.8 262.1C465.9 283.3 494.6 318.5 507 361.8L510.8 375.2C513.6 384.9 511.6 395.2 505.6 403.3C499.6 411.4 490 416 480 416L160 416C150 416 140.5 411.3 134.5 403.3C128.5 395.3 126.5 384.9 129.3 375.2L133 361.8C145.4 318.5 174 283.3 211.2 262.1L221.5 128L192 128C174.3 128 160 113.7 160 96zM288 464L352 464L352 576C352 593.7 337.7 608 320 608C302.3 608 288 593.7 288 576L288 464z"/></svg></div>':''}
          <div class="tg-avatar chat-open-avatar" data-chat-id="${esc(c.id||'')}" style="width:48px;height:48px;background:${esc(c.color||'linear-gradient(135deg,#0078FF,#005fcc)')};font-size:20px;overflow:hidden;">${c.avatarDataUrl?`<img src="${esc(c.avatarDataUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:(c.deleted||c.avatar==='⌧'?deletedAvatarMarkup(22):esc(c.avatar||'U'))}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span class="chat-row-name" style="color:#fff;font-size:16px;font-weight:600;">${esc(c.name||'Пользователь')}</span>${time?`<span style=\"color:#8E8E93;font-size:12px;flex-shrink:0;\">${esc(time)}</span>`:''}</div>
            <span class="chat-row-preview">${esc(c.preview||'')}</span>
          </div>
        </button>`;
        }).join('');
        holder.insertAdjacentHTML('beforeend',html);
        holder.querySelectorAll('.chat-row-item').forEach(bindChatRow);
        holder.querySelectorAll('.chat-open-avatar').forEach(el=>{
          const openProfile=(ev)=>{
            ev.stopPropagation();
            const u=usersMap.get(el.dataset.chatId);
            if(u) openUserProfileView(u);
            const row=el.closest('.chat-row-item');
            if(row) row.dataset.avatarTap='1';
          };
          el.addEventListener('click',openProfile);
          el.addEventListener('touchend',openProfile,{passive:false});
        });
      }catch(err){
        const stillHasChats=holder.querySelectorAll('.chat-row-item').length>0||hadChats;
        holder.querySelectorAll('.chat-row-skeleton').forEach(n=>n.remove());
        const netMsg=String(err&&err.message||'');
        const networkDown=!navigator.onLine||/failed to fetch|networkerror|network request failed|load failed/i.test(netMsg);
        if(stillHasChats&&networkDown){
          holder.insertAdjacentHTML('beforeend',renderChatSkeletonRows(6));
        }else if(!holder.querySelector('.chat-row-item')){
          holder.innerHTML=prevHtml;
        }
      }finally{
        chatsLoadInFlight=false;
        if(queuedChatsRefresh){
          queuedChatsRefresh=false;
          setTimeout(()=>loadChats('',{showSkeleton:false}),80);
        }
      }
    }
    window.reloadChatsWithSkeleton=()=>loadChats('',{showSkeleton:true});
    async function openChatWith(userId,opts={}){
      const keepScreen=opts.keepScreen===true;
      currentChatUserId=userId;
      const reqSeq=++openChatReqSeq;
      const optimisticPeer=usersMap.get(userId)||{};
      const titleFast=document.getElementById('chat-contact-name');
      if(titleFast) titleFast.textContent=optimisticPeer.name||'Чат';
      if(!keepScreen) showScreen('screen-chat');
      const data=await api(`/messages?withUserId=${encodeURIComponent(userId)}`);
      if(reqSeq!==openChatReqSeq) return;
      const peer=data.peer||usersMap.get(userId)||{};
      currentChatBlockedByPeer=!!peer.blockedByPeer;
      currentChatBlockedPeer=!!peer.blockedPeer;
      usersMap.set(userId,peer);
      const title=document.getElementById('chat-contact-name');
      if(title) title.textContent=peer.name||'Чат';
      const card=document.getElementById('chat-peer-card');
      const cardName=document.getElementById('chat-peer-name');
      const cardU=document.getElementById('chat-peer-username');
      const cardA=document.getElementById('chat-peer-avatar');
      if(card){
        card.style.display='flex';
        if(cardName) cardName.textContent=peer.name||'Пользователь';
        if(cardU) cardU.textContent=peer.username?`@${peer.username}`:'';
        if(cardA){
          if(peer.avatarDataUrl) cardA.innerHTML=`<img src="${esc(peer.avatarDataUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
          else cardA.innerHTML=(peer.deleted||peer.avatar==='⌧')?deletedAvatarMarkup(22):esc(String(peer.avatar||peer.name||'U').charAt(0).toUpperCase());
        }
      }
      renderChatMessages(data.items||[]);
      updateChatBlockedUI();
    }
    window.openChatWith=openChatWith;
    function displayNameForMessageUser(uid){
      if(me&&uid===me.id) return me.name||me.username||'Вы';
      const u=usersMap.get(uid);
      if(u) return u.name||u.username||'Пользователь';
      const t=document.getElementById('chat-contact-name');
      if(t&&t.textContent.trim()) return t.textContent.trim();
      return 'Пользователь';
    }
    function renderChatMessages(items){
      const wrap=document.getElementById('chat-messages');
      const bottom=document.getElementById('chat-bottom');
      suppressReactionAnimations=true;
      messageMap.clear();
      wrap.querySelectorAll(':scope > div').forEach(node=>{ if(node.id!=='chat-bottom') node.remove(); });
      wrap.querySelectorAll('.rt-msg').forEach(n=>n.remove());
      const rows=items.map(m=>{
        messageMap.set(m.id,m);
        const mine=me&&m.fromUserId===me.id;
        const t=new Date(m.createdAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
        const tick='<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const reply=(m.replyToMessageId&&messageMap.get(m.replyToMessageId))||null;
        let replyHtml='';
        if(reply){
          const replyMediaRaw=Array.isArray(reply.media)&&reply.media.length?String(reply.media[0]):'';
          const replyMediaSrc=(replyMediaRaw.startsWith('data:image')||replyMediaRaw.startsWith('data:video'))?replyMediaRaw:'';
          const replyText=(reply.text||'').slice(0,80)||((Array.isArray(reply.media)&&String(reply.media[0]||'').startsWith('data:audio'))?'Голосовое сообщение':'Медиа');
          const thumb=replyMediaSrc?`<div style="width:28px;height:28px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#333;">${replyMediaSrc.startsWith('data:video')?'<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;">▶</div>':`<img src="${esc(replyMediaSrc)}" style="width:100%;height:100%;object-fit:cover;">`}</div>`:'';
          replyHtml=`<div class="${mine?'msg-quote-out':'msg-quote-in'}" data-reply-id="${esc(reply.id)}" style="display:flex;align-items:center;gap:${replyMediaSrc?'7px':'0'};">${thumb}<div style="min-width:0;"><div class="msg-quote-name">${esc(displayNameForMessageUser(reply.fromUserId))}</div><div class="msg-quote-text">${esc(replyText)}</div></div></div>`;
        }
        const fwdHtml=m.forwardedFromName?`<div style="font-size:12px;color:rgba(255,255,255,0.62);margin-bottom:4px;">Переслано от <b>${esc(m.forwardedFromName)}</b></div>`:'';
        const mediaArr=(Array.isArray(m.media)?m.media:[]).map(src=>{
          const raw=String(src||'');
          if(raw.startsWith('data:audio')) return {src:raw,type:'audio',durationMs:m.voiceDurationMs||0,waveform:Array.isArray(m.voiceWaveform)?m.voiceWaveform:[]};
          return {src:raw,type:raw.startsWith('data:video')?'video':'image'};
        });
        const isVoice=mediaArr.length===1&&mediaArr[0].type==='audio';
        const listenedByMe=Array.isArray(m.listenedBy)&&me&&m.listenedBy.includes(me.id);
        const showUnreadDot=!mine&&!listenedByMe;
        const hasForwardedMedia=!!m.forwardedFromName&&mediaArr.length>0;
        const hasMediaAndText=mediaArr.length&&!!m.text;
        const hasPureMedia=mediaArr.length&&!m.text&&!replyHtml&&!isVoice;
        const rowMax=replyHtml?'calc(100% - 24px)':'78%';
        if(isVoice){
          const bubbleHtml=renderVoiceBubbleHtml({mine:!!mine,src:mediaArr[0].src,durationMs:mediaArr[0].durationMs||0,timeText:t,tickHtml:tick,waveform:mediaArr[0].waveform||[],showUnreadDot,text:m.text||'',forwardedFromName:m.forwardedFromName||'',quoteHtml:replyHtml||''});
          return `<div class="rt-msg" style="align-self:${mine?'flex-end':'flex-start'};max-width:276px;">${bubbleHtml.replace('class=\"','data-mid=\"'+esc(m.id)+'\" data-listened=\"'+(listenedByMe?'1':'0')+'\" class=\"')}</div>`;
        }
        if(hasForwardedMedia){
          const fwdHead=`<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:1px;">Переслано</div><div style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:5px;">от <b>${esc(m.forwardedFromName)}</b></div>`;
          const textPart=m.text?`<p class="${mine?'msg-text-out':'msg-text-in'}" style="padding:4px 14px 0;margin:0;">${renderRichText(m.text)}</p>`:'';
          const gridHtml=buildMediaGrid(mediaArr,m.id,'0 0 0 0',false);
          const mediaWrap=`<div style="margin:0 3px;overflow:hidden;">${gridHtml}</div>`;
          const metaStyle=m.text?'padding:0 14px 6px;':'padding:4px 14px 4px;align-self:flex-end;';
          return `<div class="rt-msg" style="align-self:${mine?'flex-end':'flex-start'};max-width:78%;"><div data-mid="${esc(m.id)}" class="${mine?'bubble-out':'bubble-in'} msg-bubble msg-fwd" style="padding:0;overflow:hidden;">${replyHtml?`<div style="padding:8px 14px 0;">${replyHtml}</div>`:''}<div style="padding:8px 14px 6px;">${fwdHead}</div>${mediaWrap}${textPart}<div class="msg-meta" style="${metaStyle}"><span class="${mine?'msg-time-out':'msg-time-in'}">${t}</span>${mine?tick:''}</div></div></div>`;
        }
        const mediaRadiusBase=mine
          ?'calc(1.4rem - 3px) calc(1.4rem - 3px) 0 calc(1.4rem - 3px)'
          :'calc(1.4rem - 3px) calc(1.4rem - 3px) calc(1.4rem - 3px) 0';
        const mediaTopRadius=replyHtml?'0':'calc(1.4rem - 3px)';
        const mediaHtml=mediaArr.length
          ? (hasPureMedia
            ? `<div style="position:relative;line-height:0;">${buildMediaGrid(mediaArr,m.id,mediaRadiusBase,false)}<div class="media-time-ovl"><span class="${mine?'msg-time-out':'msg-time-in'}">${t}</span>${mine?tick:''}</div></div>`
            : `<div style="overflow:hidden;margin-bottom:${m.text?'4px':'0'};">${buildMediaGrid(mediaArr,m.id,`${mediaTopRadius} ${mediaTopRadius} 0 0`,false)}</div>`)
          : '';
        const textHtml=m.text?`<p class="${mine?'msg-text-out':'msg-text-in'}"${hasMediaAndText?' style="padding:4px 8px 0;margin:0;"':''}>${renderRichText(m.text)}</p>`:'';
        const bubblePad=hasPureMedia?'3px':(mediaArr.length?'3px 4px 6px 4px':'');
        const bubbleStyle=bubblePad?` style="padding:${bubblePad};"`:'';
        const metaClass=hasPureMedia?'msg-meta media-meta-foot':'msg-meta';
        const metaStyle=!hasPureMedia&&mediaArr.length?' style="padding-right:4px;"':'';
        return `<div class="rt-msg" style="align-self:${mine?'flex-end':'flex-start'};max-width:${rowMax};"><div data-mid="${esc(m.id)}" class="${mine?'bubble-out':'bubble-in'} msg-bubble"${bubbleStyle}>${fwdHtml}${replyHtml}${mediaHtml}${textHtml}<div class="${metaClass}"${metaStyle}><span class="${mine?'msg-time-out':'msg-time-in'}">${t}</span>${mine?tick:''}</div></div></div>`;
      }).join('');
      bottom.insertAdjacentHTML('beforebegin',rows);
      wrap.querySelectorAll('.rt-msg .msg-bubble').forEach(bindBubble);
      wrap.querySelectorAll('.rt-msg').forEach(bindMsgRow);
      wrap.querySelectorAll('.msg-quote-out,.msg-quote-in').forEach(bindQuoteTap);
      items.forEach(m=>{
        const bubble=wrap.querySelector(`.msg-bubble[data-mid="${m.id}"]`);
        if(!bubble) return;
        const reactionState={};
        const source=m.reactions||{};
        Object.entries(source).forEach(([emoji,userIds])=>{
          const count=Array.isArray(userIds)?userIds.length:0;
          if(!count) return;
          reactionState[emoji]={count,active:!!(me&&Array.isArray(userIds)&&userIds.includes(me.id))};
        });
        reactionsData.set(bubble,reactionState);
        renderReactions(bubble);
      });
      suppressReactionAnimations=false;
      bindRichTextInteractions(wrap);
      initVoicePlayers(wrap);
      const pinned=items.find(msg=>Array.isArray(msg.pinnedBy)&&msg.pinnedBy.length>0);
      if(pinned){
        const bubble=wrap.querySelector(`.msg-bubble[data-mid="${pinned.id}"]`);
        pinnedBubble=bubble||null;
        const pinPrev=(pinned.text||((Array.isArray(pinned.media)&&String(pinned.media[0]||'').startsWith('data:audio'))?'Голосовое сообщение':'📷 Медиа'));
        document.getElementById('pinned-bar-preview').textContent=pinPrev.slice(0,60);
        document.getElementById('pinned-bar').classList.add('show');
      }else{
        unpinMessage();
      }
      enrichLinkPreviews(wrap);
      bottom.scrollIntoView({behavior:'auto'});
    }
    function bindRichTextInteractions(root){
      root.querySelectorAll('.mention-link').forEach(el=>{
        if(el.dataset.bound==='1') return;
        el.dataset.bound='1';
        el.addEventListener('click',async e=>{
          e.preventDefault();
          const username=el.dataset.username;
          if(me&&String(me.username||'').toLowerCase()===String(username||'').toLowerCase()){
            openFavorites();
            return;
          }
          try{
            const r=await api(`/users/search?q=${encodeURIComponent(username)}`);
            const user=(r.items||[]).find(u=>String(u.username||'').toLowerCase()===username.toLowerCase());
            if(!user){ alert('Пользователь не найден'); return; }
            usersMap.set(user.id,user);
            openUserProfileView(user);
          }catch(_){ alert('Пользователь не найден'); }
        });
      });
      root.querySelectorAll('.ext-link').forEach(el=>{
        if(el.dataset.bound==='1') return;
        el.dataset.bound='1';
        el.addEventListener('click',e=>{
          e.preventDefault();
          openExternalLinkModal(el.dataset.url||'');
        });
      });
    }
    function openExternalLinkModal(url){
      if(!url) return;
      pendingExternalUrl=url;
      const m=document.getElementById('ext-link-modal');
      if(m){
        m.style.display='flex';
        requestAnimationFrame(()=>m.classList.add('open'));
      }
    }
    window.openExternalLinkModal=openExternalLinkModal;
    window.closeExternalLinkModal=function(){
      const m=document.getElementById('ext-link-modal');
      if(m){
        m.classList.remove('open');
        setTimeout(()=>{ if(!m.classList.contains('open')) m.style.display='none'; },180);
      }
      pendingExternalUrl='';
    };
    window.proceedExternalLink=function(){
      if(pendingExternalUrl) window.open(pendingExternalUrl,'_blank','noopener,noreferrer');
      window.closeExternalLinkModal();
    };
    async function enrichLinkPreviews(wrap){
      const links=Array.from(wrap.querySelectorAll('.ext-link')).slice(0,20);
      for(const a of links){
        const bubble=a.closest('.msg-bubble');
        const url=a.dataset.url||'';
        if(!bubble||!url||bubble.querySelector(`.link-preview[data-url="${url}"]`)) continue;
        const fromCache=localLinkPreviewCache.get(url);
        const p=document.createElement('a');
        p.className='link-preview';
        p.dataset.url=url;
        p.href='#';
        p.style.cssText='display:block;margin-top:8px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,0.10);text-decoration:none;color:#fff;';
        p.innerHTML=fromCache
          ? `<div style="font-size:12px;opacity:.7;">${esc(fromCache.site||'Ссылка')}</div><div style="font-size:14px;font-weight:600;line-height:1.3;">${esc(fromCache.title||url)}</div>${fromCache.description?`<div style="font-size:12px;opacity:.8;line-height:1.25;margin-top:2px;">${esc(fromCache.description)}</div>`:''}`
          : `<div style="font-size:12px;opacity:.7;">Загрузка предпросмотра…</div><div style="font-size:13px;opacity:.9;">${url}</div>`;
        p.addEventListener('click',e=>{ e.preventDefault(); openExternalLinkModal(url); });
        const meta=bubble.querySelector('.msg-meta');
        const react=bubble.querySelector('.msg-reactions');
        if(react) bubble.insertBefore(p,react);
        else if(meta) bubble.insertBefore(p,meta);
        else bubble.appendChild(p);
        if(fromCache) continue;
        try{
          const data=await api(`/link-preview?url=${encodeURIComponent(url)}`);
          localLinkPreviewCache.set(url,data||{});
          p.innerHTML=`<div style="font-size:12px;opacity:.7;">${esc(data.site||'Ссылка')}</div><div style="font-size:14px;font-weight:600;line-height:1.3;">${esc(data.title||url)}</div>${data.description?`<div style="font-size:12px;opacity:.8;line-height:1.25;margin-top:2px;">${esc(data.description)}</div>`:''}`;
        }catch(_){
          localLinkPreviewCache.set(url,{url,site:'Ссылка',title:url,description:''});
          p.innerHTML=`<div style="font-size:12px;opacity:.7;">Ссылка</div><div style="font-size:13px;">${url}</div>`;
        }
      }
    }
    async function refreshMe(){
      const res=await api('/me');
      applyProfileUI(res.user);
      try{
        const s=await api('/me/sessions');
        const dc=document.getElementById('devices-count');
        if(dc) dc.textContent=String(s.count||1);
      }catch(_){}
    }
    function startRealtime(){
      if(stream) stream.close();
      if(!authToken) return;
      stream=new EventSource(`${API_BASE}/stream?token=${encodeURIComponent(authToken)}`);
      stream.addEventListener('profile',ev=>{
        try{
          const p=JSON.parse(ev.data);
          if(me&&p&&p.id===me.id) applyProfileUI(p);
          if(p&&p.id) usersMap.set(p.id,{...(usersMap.get(p.id)||{}),...p});
          if(window.__upvUserId&&p&&p.id===window.__upvUserId) openUserProfileView({...(usersMap.get(p.id)||{}),...p});
        }catch(_){}
      });
      stream.addEventListener('message',ev=>{
        try{
          const msg=JSON.parse(ev.data);
          if(currentChatUserId&&(msg.fromUserId===currentChatUserId||msg.toUserId===currentChatUserId)) scheduleOpenCurrentChat();
          scheduleChatsRefresh();
        }catch(_){}
      });
      stream.addEventListener('message_update',ev=>{
        try{
          const msg=JSON.parse(ev.data);
          if(currentChatUserId&&(msg.fromUserId===currentChatUserId||msg.toUserId===currentChatUserId)){
            const bubble=msg&&msg.id?document.querySelector(`#chat-messages .msg-bubble[data-mid="${msg.id}"]`):null;
            if(bubble&&!msg.deleted){
              const reactionState={};
              const source=msg.reactions||{};
              Object.entries(source).forEach(([emoji,userIds])=>{
                const count=Array.isArray(userIds)?userIds.length:0;
                if(!count) return;
                reactionState[emoji]={count,active:!!(me&&Array.isArray(userIds)&&userIds.includes(me.id))};
              });
              reactionsData.set(bubble,reactionState);
              renderReactions(bubble);
              const hasPinned=Array.isArray(msg.pinnedBy)&&msg.pinnedBy.length>0;
              const isCurrentPinned=pinnedBubble&&pinnedBubble.dataset&&pinnedBubble.dataset.mid===msg.id;
              if(msg.editedAt||hasPinned||isCurrentPinned) scheduleOpenCurrentChat();
            }else{
              scheduleOpenCurrentChat();
            }
          }
          scheduleChatsRefresh();
        }catch(_){}
      });
      stream.addEventListener('block_update',ev=>{
        try{
          const b=JSON.parse(ev.data);
          if(currentChatUserId&&b&&(b.targetUserId===currentChatUserId||b.byUserId===currentChatUserId)){
            if(String(b.byUserId||'')===currentChatUserId) currentChatBlockedByPeer=!!b.blocked;
            if(me&&String(b.byUserId||'')===me.id) currentChatBlockedPeer=!!b.blocked;
            updateChatBlockedUI();
          }
          scheduleChatsRefresh();
        }catch(_){}
      });
      stream.addEventListener('sessions_update',()=>{
        refreshMe();
        const dw=document.getElementById('devices-wrap');
        if(dw&&dw.classList.contains('open')) openDevicesSheet();
      });
      stream.addEventListener('chat_pin_update',()=>{
        scheduleChatsRefresh();
        if(currentChatUserId) scheduleOpenCurrentChat();
      });
      stream.addEventListener('force_logout',()=>{
        authToken='';
        localStorage.removeItem('auth_token');
        try{ stream.close(); }catch(_){}
        stream=null;
        openAuth('login');
        location.reload();
      });
    }

    const _origShowScreen=showScreen;
    window.showScreen=function(id,skipRoute){
      _origShowScreen(id);
      if(skipRoute) return;
      const route=id.replace('screen-','');
      history.replaceState(null,'',`#/${route}`);
    };
    function applyRoute(){
      const h=(location.hash||'#/list').replace(/^#\//,'');
      const target=`screen-${h}`;
      if(target==='screen-chat'&&!currentChatUserId){
        window.showScreen('screen-list',true);
        return;
      }
      if(document.getElementById(target)) window.showScreen(target,true);
    }
    window.addEventListener('hashchange',applyRoute);

    window.doSearch=function(q){
      const res=document.getElementById('search-results');
      if(searchTimer) clearTimeout(searchTimer);
      if(!q.trim()){res.innerHTML='<div style="color:#8E8E93;font-size:15px;text-align:center;padding:32px 0;">Введите имя для поиска</div>';return;}
      searchTimer=setTimeout(async ()=>{
        try{
          const data=await api(`/users/search?q=${encodeURIComponent(q.trim())}`);
          const filtered=data.items||[];
          if(!filtered.length){res.innerHTML='<div style="color:#8E8E93;font-size:15px;text-align:center;padding:32px 0;">Ничего не найдено</div>';return;}
          res.innerHTML=filtered.map(c=>`<button class="chat-row chat-row-item search-row-item" data-chat-id="${esc(c.id||'')}" style="display:flex;align-items:center;gap:12px;width:100%;border:none;cursor:pointer;text-align:left;">
            <div class="tg-avatar" style="width:48px;height:48px;background:${esc(c.color||'linear-gradient(135deg,#0078FF,#005fcc)')};font-size:20px;flex-shrink:0;overflow:hidden;">${c.avatarDataUrl?`<img src="${esc(c.avatarDataUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:(c.deleted||c.avatar==='⌧'?deletedAvatarMarkup(22):esc(c.avatar||'U'))}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#fff;font-size:16px;font-weight:600;">${esc(c.name||'Пользователь')}</span></div>
              <span style="color:#8E8E93;font-size:14px;">@${esc(c.username||'')}</span>
            </div>
          </button>`).join('');
          res.querySelectorAll('.search-row-item').forEach(el=>{
            el.addEventListener('click',async ()=>{
              const uid=el.dataset.chatId;
              if(!uid)return;
              await openChatWith(uid);
            });
          });
        }catch(e){
          res.innerHTML='<div style="color:#ff453a;font-size:15px;text-align:center;padding:32px 0;">Ошибка поиска</div>';
        }
      },200);
    };

    window.saveProfileEdit=async function(){
      const saveBtn=document.getElementById('profile-save-btn');
      const avWrap=document.getElementById('pe-avatar-circle');
      const bWrap=document.getElementById('pe-banner');
      try{
        if(saveBtn) saveBtn.classList.add('loading');
        if(avWrap&&pendingAvatarDataUrl) avWrap.classList.add('shimmer-loading');
        if(bWrap&&pendingBannerDataUrl) bWrap.classList.add('shimmer-loading');
        const name=document.getElementById('pe-name').value.trim();
        const usernameRaw=document.getElementById('pe-username').value.trim();
        const username=usernameRaw.replace(/[^a-zA-Z0-9_.-]/g,'');
        if(username!==usernameRaw){
          showTopToast('Логин: только a-z, 0-9, _, ., -',true);
          return;
        }
        if(!name||!username){
          showTopToast('Имя и username обязательны',true);
          return;
        }
        const payload={
          name,
          username,
          bio:document.getElementById('pe-bio').value.trim().slice(0,110)
        };
        const res=await api('/me',{method:'PATCH',body:JSON.stringify(payload)});
        let user=res.user;
        if(pendingAvatarDataUrl){
          const avRes=await api('/me/avatar',{method:'POST',body:JSON.stringify({dataUrl:pendingAvatarDataUrl})});
          user=avRes.user||user;
          pendingAvatarDataUrl='';
          const avWrapNow=document.getElementById('pe-avatar-circle');
          if(avWrapNow) setAvatarNode(avWrapNow,user.avatarDataUrl||'',user.name||name);
        }
        if(pendingBannerDataUrl){
          const bRes=await api('/me/banner',{method:'POST',body:JSON.stringify({dataUrl:pendingBannerDataUrl})});
          user=bRes.user||user;
          pendingBannerDataUrl='';
          const bImgNow=document.getElementById('pe-banner-img');
          if(bImgNow&&user.bannerDataUrl){ bImgNow.src=user.bannerDataUrl; bImgNow.style.display='block'; }
        }
        applyProfileUI(user);
        closeProfileEdit();
      }catch(e){ showTopToast(e.message||'Ошибка сохранения',true); }
      finally{
        if(saveBtn) saveBtn.classList.remove('loading');
        if(avWrap) avWrap.classList.remove('shimmer-loading');
        if(bWrap) bWrap.classList.remove('shimmer-loading');
      }
    };
    async function fileToDataUrl(file){
      return new Promise((resolve,reject)=>{
        const fr=new FileReader();
        fr.onload=()=>resolve(fr.result);
        fr.onerror=reject;
        fr.readAsDataURL(file);
      });
    }
    function applyPeMediaScale(){
      const b=document.getElementById('pe-banner-img');
      if(b){ b.style.transform=`scale(${peBannerScale})`; b.style.transformOrigin='center center'; }
      const a=document.querySelector('#pe-avatar-circle img');
      if(a){ a.style.transform=`scale(${peAvatarScale})`; a.style.transformOrigin='center center'; }
    }
    window.setPeBannerScale=function(v){
      peBannerScale=Math.max(1,Math.min(2.2,Number(v)||1));
      applyPeMediaScale();
    };
    window.setPeAvatarScale=function(v){
      peAvatarScale=Math.max(1,Math.min(2.2,Number(v)||1));
      applyPeMediaScale();
    };
    window.setPeAvatar=async function(input){
      if(!input.files||!input.files[0])return;
      try{
        const dataUrl=await fileToDataUrl(input.files[0]);
        pendingAvatarDataUrl=dataUrl;
        const av=document.getElementById('pe-avatar-circle');
        if(av){
          setAvatarNode(av,dataUrl,me?me.name:'');
          av.style.background='none';
        }
      }catch(e){ showTopToast(e.message||'Ошибка сохранения',true); }
      applyPeMediaScale();
      input.value='';
    };
    window.setPeBanner=async function(input){
      if(!input.files||!input.files[0])return;
      try{
        const dataUrl=await fileToDataUrl(input.files[0]);
        pendingBannerDataUrl=dataUrl;
        const bImg=document.getElementById('pe-banner-img');
        if(bImg){ bImg.src=dataUrl; bImg.style.display='block'; }
      }catch(e){ showTopToast(e.message||'Ошибка сохранения',true); }
      applyPeMediaScale();
      input.value='';
    };

    window.openPrivacy=function(){
      const wrap=document.getElementById('privacy-wrap');
      wrap.classList.add('open');
      api('/me/vpsc').then(r=>{ const el=document.getElementById('privacy-code-text'); if(el) el.textContent=r.code; }).catch(()=>{});
    };
    window.openProfileEdit=function(){
      profileJustOpened=true;
      document.getElementById('profile-edit-wrap').classList.add('open');
      setTimeout(()=>{ profileJustOpened=false; },600);
    };
    window.logoutAccount=async function(){
      try{ await api('/logout',{method:'POST'}); }catch(_){}
      if(stream) stream.close();
      stream=null;
      authToken='';
      localStorage.removeItem('auth_token');
      openAuth('login');
      loadChats();
      location.reload();
    };
    window.submitChangePassword=async function(){
      const currentPassword=document.getElementById('pwd-current').value;
      const newPassword=document.getElementById('pwd-new').value;
      const newPassword2=document.getElementById('pwd-new2').value;
      if(newPassword!==newPassword2){ alert('Пароли не совпадают'); return; }
      await api('/me/password',{method:'PATCH',body:JSON.stringify({currentPassword,newPassword})});
      document.getElementById('pwd-current').value='';
      document.getElementById('pwd-new').value='';
      document.getElementById('pwd-new2').value='';
      closePwdSheet();
    };
    window.submitDeleteAccount=async function(){
      const password=document.getElementById('del-password').value;
      try{
        await api('/me',{method:'DELETE',body:JSON.stringify({password})});
        authToken='';
        localStorage.removeItem('auth_token');
        if(stream) stream.close();
        openAuth('login');
        closeDelSheet();
      }catch(e){
        showTopToast(e.message||'Ошибка',true);
      }
    };

    document.getElementById('login-username').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('login-password').focus(); });
    document.getElementById('login-password').addEventListener('keydown',e=>{ if(e.key==='Enter') window.doLogin(); });
    document.getElementById('reg-displayname').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('reg-username').focus(); });
    document.getElementById('reg-username').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('reg-password').focus(); });
    document.getElementById('reg-password').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('reg-password2').focus(); });
    document.getElementById('reg-password2').addEventListener('keydown',e=>{ if(e.key==='Enter') window.doRegister(); });
    document.getElementById('vpsc-hidden-input').addEventListener('input',e=>{
      e.target.value=e.target.value.slice(0,6);
      updateVpscBoxes(e.target.value);
    });
    document.getElementById('vpsc-hidden-input').addEventListener('keydown',e=>{ if(e.key==='Enter') window.doVpscLogin(); });
    document.getElementById('vpsc-boxes').addEventListener('click',()=>document.getElementById('vpsc-hidden-input').focus());
    async function blobUrlToDataUrl(url){
      const res=await fetch(url);
      const blob=await res.blob();
      return await new Promise((resolve,reject)=>{
        const fr=new FileReader();
        fr.onload=()=>resolve(fr.result);
        fr.onerror=reject;
        fr.readAsDataURL(blob);
      });
    }
    function markMediaPreviewUploading(isUploading){
      const strip=document.getElementById('media-preview');
      if(!strip) return;
      strip.querySelectorAll('.media-thumb').forEach(el=>{
        if(isUploading) el.classList.add('uploading-media');
        else el.classList.remove('uploading-media');
      });
    }
    function renderPendingOutgoingMessage({ text='', media=[], replyName='', replyText='', replyMediaSrc='', replyToMessageId='' }){
      const msgs=document.getElementById('chat-messages');
      const anchor=document.getElementById('chat-bottom');
      if(!msgs||!anchor) return null;
      const now=new Date();
      const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
      const tmpMid=`pending-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const w=document.createElement('div');
      w.className='rt-msg pending-rt-msg';
      const thumbHtml=replyMediaSrc
        ?`<img src="${replyMediaSrc}" style="width:34px;height:34px;border-radius:5px;object-fit:cover;flex-shrink:0;" />`
        :`<div style="width:34px;height:34px;border-radius:5px;background:rgba(255,255,255,0.22);flex-shrink:0;"></div>`;
      const quoteHtml=replyName
        ?(replyText==='__media__'
          ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}" style="display:flex;align-items:center;gap:7px;">${thumbHtml}<div style="min-width:0;"><div class="msg-quote-name">${esc(replyName)}</div><div class="msg-quote-text">Медиа</div></div></div>`
          :replyText==='__voice__'
          ?`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyName)}</div><div class="msg-quote-text">Голосовое сообщение</div></div>`
          :`<div class="msg-quote-out" data-reply-id="${esc(replyToMessageId)}"><div class="msg-quote-name">${esc(replyName)}</div><div class="msg-quote-text">${esc(replyText)}</div></div>`)
        :'';
      w.style.cssText=`align-self:flex-end;max-width:${quoteHtml?'calc(100% - 24px)':'78%'};`;
      const safeText=renderRichText(text||'');
      const isVoice=media.length===1&&media[0]&&media[0].type==='audio';
      if(isVoice){
        const dur=media[0].durationMs||0;
        w.style.cssText='align-self:flex-end;max-width:276px;';
        w.innerHTML=renderVoiceBubbleHtml({mine:true,src:'',durationMs:dur,timeText:t,tickHtml:'',waveform:media[0].waveform||[],showUnreadDot:false,text:text||'',quoteHtml});
      }else if(media.length){
        const textPart=text?`<p class="msg-text-out" style="padding:4px 8px 0;margin:0;">${safeText}</p>`:'';
        const topBr=quoteHtml?'0':'calc(1.4rem - 3px)';
        const gridHtml=buildMediaGrid(media,tmpMid,`${topBr} ${topBr} 0 0`,true);
        const pad=quoteHtml?'10px 4px 6px 4px':'3px 4px 6px 4px';
        w.innerHTML=`<div class="bubble-out msg-bubble" style="padding:${pad};">${quoteHtml}<div style="overflow:hidden;margin-bottom:${text?'4px':'0'};">${gridHtml}</div>${textPart}<div class="msg-meta" style="padding-right:4px;"><span class="msg-time-out">${t}</span></div></div>`;
      }else{
        w.innerHTML=`<div class="bubble-out msg-bubble">${quoteHtml}<p class="msg-text-out">${safeText}</p><div class="msg-meta"><span class="msg-time-out">${t}</span></div></div>`;
      }
      msgs.insertBefore(w,anchor);
      const bubble=w.querySelector('.msg-bubble');
      if(bubble){
        bindBubble(bubble);
        bubble.querySelectorAll('.msg-quote-out').forEach(bindQuoteTap);
        bindRichTextInteractions(bubble);
        initVoicePlayers(w);
      }
      bindMsgRow(w);
      anchor.scrollIntoView({behavior:'smooth'});
      return w;
    }
    const legacySendMessage=sendMessage;
    window.sendMessage=async function(){
      if(!currentChatUserId) return;
      if(currentChatBlockedByPeer){ showTopToast('Вы были заблокированы данным пользователем',true); return; }
      const input=document.getElementById('msg-input');
      const sendBtn=document.getElementById('send-btn');
      const text=(input.value||'').trim();
      const media=(attachedMedia||[]).slice();
      if(editingBubble&&editingBubble.dataset&&editingBubble.dataset.mid){
        const editingId=editingBubble.dataset.mid;
        const payload={action:'edit',text};
        if(media.length){
          const mediaData=[];
          for(const m of media){
            if(m&&m.src) mediaData.push(await blobUrlToDataUrl(m.src));
          }
          payload.media=mediaData;
        }else if(editMediaRemoved){
          payload.media=[];
        }
        legacySendMessage();
        await api(`/messages/${encodeURIComponent(editingId)}`,{method:'PATCH',body:JSON.stringify(payload)});
        return;
      }
      if(!text&&!media.length) return;
      let pendingBubble=null;
      const replyIdToSend=replyToMessageId;
      if(sendBtn) sendBtn.disabled=true;
      markMediaPreviewUploading(true);
      if(media.length||text){
        pendingBubble=renderPendingOutgoingMessage({
          text,
          media:media.slice(),
          replyName:replyToName,
          replyText:replyToText,
          replyMediaSrc:replyToMediaSrc,
          replyToMessageId:replyIdToSend
        });
      }
      input.value='';
      dismissReply();
      clearMedia();
      try{
        const mediaData=[];
        for(const m of media){
          if(m&&m.src) mediaData.push(await blobUrlToDataUrl(m.src));
        }
        await api('/messages',{method:'POST',body:JSON.stringify({toUserId:currentChatUserId,text,media:mediaData,replyToMessageId:replyIdToSend})});
      }catch(e){
        if(pendingBubble&&pendingBubble.parentNode) pendingBubble.remove();
        throw e;
      }finally{
        markMediaPreviewUploading(false);
        if(sendBtn) sendBtn.disabled=false;
      }
    };
    async function sendVoiceMessage(voiceBlob,durationMs,waveform=[]){
      if(!currentChatUserId||!voiceBlob) return;
      const replyIdToSend=replyToMessageId;
      const pendingBubble=renderPendingOutgoingMessage({
        media:[{type:'audio',durationMs,waveform}],
        replyName:replyToName,
        replyText:replyToText,
        replyMediaSrc:replyToMediaSrc,
        replyToMessageId:replyIdToSend,
        text:''
      });
      dismissReply();
      try{
        const mediaData=await new Promise((resolve,reject)=>{
          const fr=new FileReader();
          fr.onload=()=>resolve(fr.result);
          fr.onerror=reject;
          fr.readAsDataURL(voiceBlob);
        });
        await api('/messages',{method:'POST',body:JSON.stringify({toUserId:currentChatUserId,text:'',media:[mediaData],voiceDurationMs:durationMs,voiceWaveform:waveform,replyToMessageId:replyIdToSend})});
      }catch(e){
        if(pendingBubble&&pendingBubble.parentNode) pendingBubble.remove();
        showTopToast(e.message||'Ошибка отправки',true);
      }
    }
    pendingVoiceSendFn=sendVoiceMessage;
    const doDeleteMessageLocal=doDeleteMessage;
    const addReactionLocal=addReaction;
    const doPinMessageLocal=doPinMessage;
    const unpinMessageLocal=unpinMessage;

    unpinMessage=async function(){
      const bubble=pinnedBubble;
      const mid=bubble&&bubble.dataset?bubble.dataset.mid:'';
      unpinMessageLocal();
      if(!mid) return;
      try{
        await api(`/messages/${encodeURIComponent(mid)}`,{method:'PATCH',body:JSON.stringify({action:'unpin'})});
      }catch(_){}
      if(currentChatUserId) await openChatWith(currentChatUserId,{keepScreen:true});
    };

    doDeleteMessage=async function(){
      if(!currentBubble) return closeCtxClean();
      if(!currentBubble.dataset||!currentBubble.dataset.mid){
        doDeleteMessageLocal();
        return;
      }
      const id=currentBubble.dataset.mid;
      closeCtxClean();
      await api(`/messages/${encodeURIComponent(id)}`,{method:'DELETE'});
      await openChatWith(currentChatUserId);
      await loadChats('',{showSkeleton:false});
    };
    addReaction=async function(bubble,emoji){
      if(!bubble) return;
      if(!bubble.dataset||!bubble.dataset.mid){
        addReactionLocal(bubble,emoji);
        return;
      }
      addReactionLocal(bubble,emoji);
      try{
        await api(`/messages/${encodeURIComponent(bubble.dataset.mid)}`,{method:'PATCH',body:JSON.stringify({action:'react',emoji})});
      }catch(_){}
    };
    doPinMessage=async function(){
      if(currentBubble&&currentBubble.closest('#fav-messages')){
        doPinMessageLocal();
        return;
      }
      if(!currentBubble||!currentBubble.dataset.mid) return closeCtxClean();
      const id=currentBubble.dataset.mid;
      const isPinned=pinnedBubble===currentBubble;
      closeCtxClean();
      await api(`/messages/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({action:isPinned?'unpin':'pin'})});
      await openChatWith(currentChatUserId);
    };
    const upvChatBtn=document.getElementById('upv-chat-btn');
    if(upvChatBtn){
      upvChatBtn.addEventListener('click',async ()=>{
        const uid=window.__upvUserId;
        closeUserProfileView();
        if(uid) await openChatWith(uid);
      });
    }
    function upvFindChatRow(uid){
      return Array.from(document.querySelectorAll('#chat-list .chat-row-item')).find(el=>el.dataset.chatId===uid)||null;
    }
    function setUpvPinUi(isPinned){
      const lbl=document.getElementById('upv-pin-label');
      const ico=document.getElementById('upv-pin-icon');
      if(lbl) lbl.textContent=isPinned?'Открепить':'Закрепить';
      if(ico) ico.innerHTML=isPinned?unpinSvg:pinSvg;
    }
    function openUpvCtx(){
      const uid=window.__upvUserId||'';
      if(!uid) return;
      const row=upvFindChatRow(uid);
      setUpvPinUi(!!(row&&row.classList.contains('chat-pinned')));
      const blockedLbl=document.getElementById('upv-block-label');
      if(blockedLbl) blockedLbl.textContent=currentChatBlockedPeer?'Разблокировать':'Заблокировать';
      const ov=document.getElementById('upv-ctx-overlay');
      if(!ov) return;
      ov.style.display='block';
      requestAnimationFrame(()=>ov.classList.add('open'));
    }
    window.closeUpvCtx=function(e){
      const ov=document.getElementById('upv-ctx-overlay');
      if(!ov) return;
      if(e&&e.target!==document.getElementById('upv-ctx-bg')&&e.target!==ov) return;
      ov.classList.remove('open');
      setTimeout(()=>{ if(!ov.classList.contains('open')) ov.style.display='none'; },220);
    };
    window.upvPinChat=async function(){
      const uid=window.__upvUserId||'';
      const row=upvFindChatRow(uid);
      if(row){
        currentChatListEl=row;
        row.classList.add('chat-pin-anim');
        setTimeout(()=>row.classList.remove('chat-pin-anim'),260);
        await pinChat();
        const rowAfter=upvFindChatRow(uid);
        setUpvPinUi(!!(rowAfter&&rowAfter.classList.contains('chat-pinned')));
      }else if(uid){
        try{
          await api(`/chats/${encodeURIComponent(uid)}`,{method:'PATCH',body:JSON.stringify({action:'pin'})});
          await loadChats('',{showSkeleton:false});
          setUpvPinUi(true);
        }catch(_){}
      }
      window.closeUpvCtx();
      closeUserProfileView();
    };
    window.upvDeleteChat=async function(){
      const uid=window.__upvUserId||'';
      if(!uid) return;
      window.closeUpvCtx();
      closeUserProfileView();
      await api(`/chats/${encodeURIComponent(uid)}`,{method:'DELETE'});
      if(currentChatUserId===uid){ showScreen('screen-list'); currentChatUserId=''; }
      await loadChats('',{showSkeleton:false});
    };
    window.upvToggleBlock=async function(){
      const uid=window.__upvUserId||'';
      if(!uid) return;
      const action=currentChatBlockedPeer?'unblock':'block';
      await api(`/users/${encodeURIComponent(uid)}/block`,{method:'PATCH',body:JSON.stringify({action})});
      currentChatBlockedPeer=!currentChatBlockedPeer;
      if(action==='block'){
        window.closeUpvCtx();
        closeUserProfileView();
      }else{
        const blockedLbl=document.getElementById('upv-block-label');
        if(blockedLbl) blockedLbl.textContent='Заблокировать';
        window.closeUpvCtx();
      }
      if(currentChatUserId===uid) await openChatWith(uid);
      await loadChats('',{showSkeleton:false});
    };
    const upvMoreBtn=document.getElementById('upv-more-btn');
    if(upvMoreBtn) upvMoreBtn.addEventListener('click',openUpvCtx);
    document.querySelectorAll('#profile-edit-sheet > div[style*="background:#1A1A1A"]').forEach(el=>{ el.style.flexShrink='0'; });
    const chatHeader=document.getElementById('chat-header-open-profile');
    if(chatHeader){
      chatHeader.addEventListener('click',e=>{
        if(e.target.closest('button')) return;
        if(!currentChatUserId) return;
        const u=usersMap.get(currentChatUserId);
        if(u) openUserProfileView(u);
      });
    }
    
    (function initMinMenu(){
      const trigger=document.getElementById('min-brand-trigger');
      const wrap=document.getElementById('min-menu-wrap');
      const bg=document.getElementById('min-menu-bg');
      const closeBtn=document.getElementById('min-menu-close-btn');
      const logo=document.getElementById('min-brand-logo');
      const dock=document.getElementById('min-menu-logo-dock');
      const title=document.getElementById('min-menu-title');
      const qr=document.getElementById('min-menu-qr');
      if(!trigger||!wrap||!bg||!closeBtn||!logo||!dock||!title) return;
      if(qr) qr.src=`https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(location.origin)}`;
      let lastTap=0;
      function openMenu(){
        const r=logo.getBoundingClientRect();
        const host=wrap.querySelector('#min-menu-logo-flight');
        host.style.left=r.left+'px'; host.style.top=r.top+'px';
        host.style.width=r.width+'px'; host.style.height=r.height+'px';
        host.style.backgroundImage=`url(${logo.getAttribute('src')})`;
        logo.style.opacity='0';
        logo.style.visibility='hidden';
        const slideable=document.getElementById('min-menu-slideable');
        const d=dock.getBoundingClientRect();
        const size=Math.max(d.width||124,124);
        const slideH=slideable?slideable.getBoundingClientRect().height:0;
        const targetTop=d.top-slideH;
        wrap.classList.add('open');
        setTimeout(()=>{
          host.style.width=size+'px'; host.style.height=size+'px';
          host.style.left=d.left+'px';
          host.style.top=targetTop+'px';
        },40);
      }
      function closeMenu(){
        const host=wrap.querySelector('#min-menu-logo-flight');
        const r=logo.getBoundingClientRect();
        host.style.left=r.left+'px'; host.style.top=r.top+'px';
        host.style.width=r.width+'px'; host.style.height=r.height+'px';
        setTimeout(()=>{wrap.classList.remove('open');logo.style.opacity='1';logo.style.visibility='visible';},220);
      }
      trigger.addEventListener('click',()=>{const now=Date.now(); if(now-lastTap<320) openMenu(); lastTap=now;});
      bg.addEventListener('click',closeMenu);
      closeBtn.addEventListener('click',closeMenu);
    })();

(async function initBackend(){
      applyRoute();
      if(!location.hash) history.replaceState(null,'','#/list');
      if(!authToken){ openAuth('login'); hideAppLoading(); return; }
      try{
        await refreshMe();
        startRealtime();
        await loadChats();
        hideAppLoading();
      }catch(_){
        authToken='';
        localStorage.removeItem('auth_token');
        openAuth('login');
        hideAppLoading();
      }
    })();
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
