(()=>{
 'use strict';
 const $=id=>document.getElementById(id);let mode='idle',machines=[],sessions=[],selected=null,panes=[null,null,null,null],expanded=-1,focused=0,lastActivity=Date.now(),idleSeconds=120,authPromise=null,confirmSession=null,connected=false;
 const terminals=new Map();let messageTimer;
 function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').hidden=true,6500);}
 async function authenticate(){
  if(authPromise)return authPromise;
  authPromise=fetch('/api/session',{method:'POST',credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('Private Tailscale identity required');const d=await r.json();idleSeconds=d.idle_seconds;return d;}).finally(()=>authPromise=null);return authPromise;
 }
 async function api(path,options={},retry=true){
  const r=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  if(r.status===401&&retry){await authenticate();return api(path,options,false);}
  if(!r.ok)throw Error((await r.text()).slice(0,160));return r.json();
 }
 const pct=v=>typeof v==='number'?v.toFixed(0)+'%':'—';
 const icons={compute:'<rect x="12" y="5" width="40" height="54" rx="3"/><path d="M20 17h24M20 29h24M20 41h24"/><circle cx="22" cy="50" r="2"/>',gpu:'<rect x="5" y="14" width="54" height="36" rx="3"/><circle cx="23" cy="32" r="10"/><circle cx="46" cy="32" r="8"/><path d="M13 51v8M22 51v8M31 51v8"/>',storage:'<rect x="7" y="8" width="50" height="15" rx="2"/><rect x="7" y="27" width="50" height="15" rx="2"/><rect x="7" y="46" width="50" height="15" rx="2"/><path d="M15 16h24M15 35h24M15 54h24"/>',workstation:'<rect x="5" y="7" width="54" height="39" rx="3"/><path d="M32 47v10M18 59h28M13 37h38"/>',windows:'<path d="M7 12l22-3v22H7zM34 8l23-3v26H34zM7 36h22v22L7 55zM34 36h23v27l-23-4z"/>'};
 function icon(name){const div=document.createElement('div');div.className='icon';div.innerHTML='<svg viewBox="0 0 64 68" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'+(icons[name]||icons.compute)+'</svg>';return div;}
 function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
 function show(next){mode=next;for(const id of ['idle','machines','detail','console','status'])$(id).hidden=id!==next;document.querySelectorAll('nav button').forEach(b=>{if(b.dataset.mode===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(next==='console')requestAnimationFrame(fitAll);lastActivity=Date.now();}
 function renderMachines(){
  $('tiles').replaceChildren();$('status-list').replaceChildren();
  for(const m of machines){
   const b=el('button','tile');b.dataset.machine=m.id;b.append(icon(m.icon),el('h2','',m.name),el('div','role',m.role),el('div','state '+m.state,m.state.toUpperCase()));
   const readings=el('div','readings');for(const [name,val] of [['CPU',m.sample?.cpu],['RAM',m.sample?.ram],['GPU',m.sample?.gpu?.utilisation]]){const r=el('span','',name+' ');r.append(el('b','',pct(val)));readings.append(r);}b.append(readings,el('div','hint','REVEAL NODE CONTROLS →'));b.onclick=()=>detail(m.id);$('tiles').append(b);
   const row=el('div','status-row');row.append(el('strong','',m.name),el('div','state '+m.state,m.state.toUpperCase()),el('p','',m.reason));$('status-list').append(row);
  }
  if(mode==='detail'&&selected)detail(selected,false);
 }
 function detail(id,navigate=true){
  selected=id;const m=machines.find(m=>m.id===id);if(!m)return;$('detail-name').textContent=m.name.toUpperCase();$('detail-summary').replaceChildren();
  for(const [name,value] of [['CONNECTION',m.state.toUpperCase()],['CPU',pct(m.sample?.cpu)],['RAM',pct(m.sample?.ram)],['ROOT STORAGE',pct(m.sample?.storage)],['OS',m.sample?.os||m.os],['UPTIME',m.sample?Math.floor(m.sample.uptime_seconds/3600)+' h':'Unknown'],['TEMPERATURE',m.sample?.temperature_c!=null?m.sample.temperature_c.toFixed(0)+' °C':'Unavailable'],['NETWORK',m.sample?Math.round(m.sample.network_bytes_second/1024)+' KB/s':'Unknown']]){const box=el('div','',name);box.append(el('b','',value));$('detail-summary').append(box);}
  $('detail-actions').replaceChildren();for(const kind of m.capabilities){const b=el('button','',kind.toUpperCase());b.dataset.action=kind;b.onclick=async()=>{try{if(kind==='terminal')await openTerminal(m.id);else if(kind==='status')$('detail-output').textContent=JSON.stringify(m.sample||{state:m.state,reason:m.reason,description:m.description},null,2);else{const d=await api('/api/machines/'+m.id+'/'+kind);$('detail-output').textContent=d.output;}}catch(e){notify(e.message);}};$('detail-actions').append(b);}
  if(navigate){$('detail-output').textContent=m.reason+(m.description?'\n'+m.description:'');show('detail');}
 }
 async function refresh(){
  try{[machines,sessions]=await Promise.all([api('/api/machines'),api('/api/sessions')]);connected=true;$('connection').textContent='PRIVATE LINK / LIVE';renderMachines();renderResume();}
  catch(e){connected=false;$('connection').textContent='LINK LOST / RETRYING';for(const m of machines){m.state='unknown';m.reason='Controller connection lost';m.sample=null;}renderMachines();}
 }
 function renderResume(){const select=$('resume');select.replaceChildren(el('option','','Select session'));select.firstChild.value='';for(const s of sessions.filter(s=>s.state!=='terminated')){const o=el('option','',(machines.find(m=>m.id===s.machine)?.name||s.machine)+' / '+s.id.slice(0,6)+' / '+s.state);o.value=s.id;select.append(o);}}
 function saveLayout(){localStorage.setItem('wopr-layout',JSON.stringify(panes.map(p=>p?.id||null)));$('session-count').textContent=panes.filter(Boolean).length+' / 4';}
 async function openTerminal(mid,slot=WoprState.nextFree(panes)){
  if(slot<0){notify('Four panes occupied. Detach a pane to replace it; its shell remains resumable.');show('console');return;}
  const s=await api('/api/sessions',{method:'POST',body:JSON.stringify({machine:mid})});await assign(s,slot);await refresh();
 }
 async function assign(s,slot){
  if(panes[slot]&&panes[slot].id!==s.id){notify('Detach this pane first');return;}
  const existing=panes.findIndex(p=>p?.id===s.id);if(existing>=0){show('console');expand(existing);return;}
  panes=WoprState.place(panes,slot,s);saveLayout();renderPanes();show('console');connect(s,slot);
 }
 function renderPanes(){
  const grid=$('panes');grid.replaceChildren();
  panes.forEach((s,i)=>{
   const pane=el('section','pane');pane.dataset.slot=i;
   if(!s){const empty=el('div','empty-pane');empty.append(el('p','','CHANNEL '+(i+1)+' / UNASSIGNED'));const select=el('select');select.setAttribute('aria-label','Machine for channel '+(i+1));for(const m of machines.filter(m=>m.capabilities.includes('terminal'))){const o=el('option','',m.name);o.value=m.id;select.append(o);}const add=el('button','','OPEN TERMINAL');add.onclick=()=>openTerminal(select.value,i).catch(e=>notify(e.message));empty.append(select,add);pane.append(empty);}
   else{
    const head=el('div','pane-head'),name=machines.find(m=>m.id===s.machine)?.name||s.machine;head.append(el('span','label',name.toUpperCase()),el('span','session-state',terminals.get(s.id)?.state||s.state));
    for(const [label,fn,title] of [['↗',()=>expand(i),'Expand terminal'],['↻',()=>connect(s,i,true),'Reconnect'],['−',()=>detach(i),'Detach pane; preserve shell'],['×',()=>askTerminate(s),'Terminate shell with confirmation']]){const b=el('button','',label);b.title=title;b.setAttribute('aria-label',title+' '+name);b.onclick=fn;head.append(b);}pane.append(head);
    let t=terminals.get(s.id);if(!t){const container=el('div','terminal');const term=new Terminal({cursorBlink:true,fontSize:14,scrollback:5000,theme:{background:'#090e0c',foreground:'#dfedcf',cursor:'#ffc13e'},allowProposedApi:false});const fit=new FitAddon.FitAddon();term.loadAddon(fit);t={term,fit,container,ws:null,state:s.state,retry:0,reconnectTimer:null,replaying:false};terminals.set(s.id,t);term.open(container);term.onData(data=>{lastActivity=Date.now();if(!t.replaying&&t.ws?.readyState===1)t.ws.send(JSON.stringify({type:'input',data}));});term.onResize(size=>{if(t.ws?.readyState===1)t.ws.send(JSON.stringify({type:'resize',...size}));});container.addEventListener('pointerdown',()=>{focused=i;document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('selected',Number(p.dataset.slot)===i));if(expanded<0)expand(i);});}
    pane.append(t.container);
   }
   grid.append(pane);
  });applyExpanded();requestAnimationFrame(fitAll);
 }
 function applyExpanded(){$('panes').classList.toggle('expanded',expanded>=0);document.querySelectorAll('.pane').forEach((p,i)=>p.classList.toggle('expanded-pane',i===expanded));$('grid').disabled=expanded<0;}
 function expand(i){expanded=i;focused=i;applyExpanded();fitAll();panes[i]&&terminals.get(panes[i].id)?.term.focus();}
 function fitAll(){for(const [sid,t] of terminals){const i=panes.findIndex(p=>p?.id===sid);if(mode==='console'&&i>=0&&(expanded<0||expanded===i)){try{t.fit.fit();}catch{}}}}
 function setState(s,t,state){t.state=state;const i=panes.findIndex(p=>p?.id===s.id);const badge=document.querySelector('.pane[data-slot="'+i+'"] .session-state');if(badge)badge.textContent=state.toUpperCase();}
 async function connect(s,i,force=false){
  const t=terminals.get(s.id);if(!t)return;if(!force&&t.ws&&(t.ws.readyState===0||t.ws.readyState===1))return;
  clearTimeout(t.reconnectTimer);if(t.ws){t.ws.onclose=null;t.ws.close();}setState(s,t,'connecting');
  try{
   const {ticket}=await api('/api/sessions/'+s.id+'/ticket',{method:'POST',body:'{}'});const ws=new WebSocket(location.origin.replace('https:','wss:')+'/ws',['wopr',ticket]);t.ws=ws;
   ws.onopen=()=>{t.retry=0;t.term.reset();setState(s,t,'active');fitAll();ws.send(JSON.stringify({type:'resize',cols:t.term.cols,rows:t.term.rows}));};
   ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==='output')t.term.write(d.data);if(d.type==='replay'){t.replaying=true;t.term.write(d.data,()=>t.replaying=false);}if(d.type==='state'){setState(s,t,d.state);if(d.state==='terminated')s.state='terminated';}};
   ws.onclose=()=>{if(s.state==='terminated'){setState(s,t,'terminated');return;}setState(s,t,'disconnected');if(panes.some(p=>p?.id===s.id)){t.retry++;t.reconnectTimer=setTimeout(()=>connect(s,i),Math.min(30000,1000*2**Math.min(t.retry,5)));}};
   ws.onerror=()=>setState(s,t,'disconnected');
  }catch(e){setState(s,t,'disconnected');notify(e.message);if(!/terminated|410/.test(e.message)&&panes.some(p=>p?.id===s.id))t.reconnectTimer=setTimeout(()=>connect(s,i),10000);}
 }
 function detach(i){const s=panes[i];if(s){const t=terminals.get(s.id);if(t){clearTimeout(t.reconnectTimer);if(t.ws){t.ws.onclose=null;t.ws.close();}t.state='resumable';}}panes[i]=null;expanded=-1;saveLayout();renderPanes();refresh();}
 function askTerminate(s){confirmSession=s;$('confirm').showModal();}
 $('terminate-confirm').onclick=async()=>{const s=confirmSession;$('confirm').close();if(!s||!WoprState.canTerminate(true))return;try{await api('/api/sessions/'+s.id+'/terminate',{method:'POST',body:JSON.stringify({confirm:'TERMINATE '+s.id})});const i=panes.findIndex(p=>p?.id===s.id);if(i>=0)detach(i);notify('WOPR session terminated');}catch(e){notify(e.message);}};
 $('cancel').onclick=()=>{$('confirm').close();confirmSession=null;};
 $('resume').onchange=()=>{const s=sessions.find(s=>s.id===$('resume').value),slot=WoprState.nextFree(panes);if(s&&slot>=0)assign(s,slot);else if(s)notify('Detach a pane to resume another session');};
 $('grid').onclick=()=>{expanded=-1;applyExpanded();fitAll();};$('back').onclick=()=>show('machines');$('wake').onclick=()=>show('machines');
 $('keyboard').onclick=()=>{show('console');const s=panes[focused]||panes.find(Boolean);if(s)terminals.get(s.id)?.term.focus();else notify('Open a terminal first');};
 document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.mode));
 ['pointerdown','keydown','touchstart'].forEach(event=>document.addEventListener(event,()=>lastActivity=Date.now(),{passive:true}));
 setInterval(()=>{if(mode!=='idle'&&!$('confirm').open&&WoprState.idleDue(lastActivity,Date.now(),idleSeconds))show('idle');},1000);
 addEventListener('resize',fitAll);visualViewport?.addEventListener('resize',()=>{document.body.style.height=visualViewport.height+'px';fitAll();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();panes.forEach((s,i)=>{if(s)connect(s,i);});}});addEventListener('online',()=>{refresh();panes.forEach((s,i)=>{if(s)connect(s,i);});});
 addEventListener('offline',()=>{connected=false;$('connection').textContent='LINK LOST / OFFLINE';for(const m of machines){m.state='unknown';m.reason='Network unavailable';m.sample=null;}renderMachines();for(const t of terminals.values())t.ws?.close();});
 async function init(){try{await authenticate();const frame=document.querySelector('#idle iframe');frame.src=frame.dataset.src;await refresh();const saved=JSON.parse(localStorage.getItem('wopr-layout')||'[]');saved.slice(0,4).forEach((sid,i)=>{const s=sessions.find(s=>s.id===sid&&s.state!=='terminated');if(s)panes[i]=s;});saveLayout();renderPanes();panes.forEach((s,i)=>{if(s)connect(s,i);});}catch(e){$('connection').textContent='PRIVATE ACCESS REQUIRED';notify(e.message);}}
 init();setInterval(refresh,15000);
})();
