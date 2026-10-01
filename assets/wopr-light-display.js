(()=>{
 const array=document.getElementById('array');
 let cols=innerWidth<600?22:32, rows=6, leds=[],tick=0,pattern=0,running=true,timer=null,rate=210,metricLabels=[];
 let serverMode=new URLSearchParams(location.search).get('mode')!=='lights';
 let cycleMs=0,lastFrame=performance.now(),health=null,healthPoll=null,fetching=false;
 const status=document.getElementById('health-status');
 const metricNames=['CPU','RAM','Swap','Root disk','Data disk','GPU'];
 const machines=[['H','hpubuntu'],['S','Sentinel'],['C','cottageserver'],['A','macomarchy'],['M','MSI']];
 const rack=document.getElementById('machines');
 let touchDetails=false;
 array.addEventListener('pointerover',e=>{if(e.pointerType!=='touch'&&e.target.closest('.led'))rack.classList.add('open');});
 array.addEventListener('pointerout',e=>{if(!touchDetails&&document.activeElement!==array&&!e.relatedTarget?.closest?.('.led'))rack.classList.remove('open');});
 array.addEventListener('focus',()=>rack.classList.add('open'));
 array.addEventListener('blur',()=>{if(!touchDetails)rack.classList.remove('open');});
 document.addEventListener('pointerdown',e=>{
   if(e.pointerType==='touch'&&e.target.closest('.led')){touchDetails=!touchDetails;rack.classList.toggle('open',touchDetails);}
   else if(!array.contains(e.target)){touchDetails=false;rack.classList.remove('open');}
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){touchDetails=false;rack.classList.remove('open');}});
 const machineRows=machines.map(([id,name])=>{
   const row=document.createElement('div');row.className='machine';
   const lamp=document.createElement('i');lamp.className='machine-lamp';lamp.setAttribute('aria-hidden','true');
   const label=document.createElement('strong');label.textContent=name;
   const state=document.createElement('span');state.className='machine-state';
   const readings=document.createElement('span');readings.className='machine-readings';
   row.append(lamp,label,state,readings);rack.append(row);return {id,row,state,readings};
 });
 function machineSample(id){return health?.servers?health.servers[id]:(id==='H'?health:null);}
 function drawMachines(){
   machineRows.forEach(({id,row,state,readings})=>{
     const sample=machineSample(id),age=sample?Date.now()/1000-sample.sampled_at:Infinity;
     const fresh=age>=-5&&age<=35;
     const available=fresh&&sample.values.some(v=>v!==null);
     row.dataset.state=available?'live':'unknown';
     state.textContent=available?'LIVE SAMPLE':sample&&!fresh?'STALE / UNKNOWN':'UNAVAILABLE / UNKNOWN';
     readings.textContent=available?metricNames.map((name,i)=>name+' '+(sample.values[i]===null?'N/A':sample.values[i].toFixed(1)+'%')).join(' · '):'No current telemetry';
   });
 }
 const segments=[{id:'H',start:5000,end:10000},{id:'S',start:10000,end:15000},{id:'C',start:20000,end:25000}];
 const letters={H:['10001','10001','11111','10001','10001','10001'],S:['01111','10000','01110','00001','00001','11110'],C:['01111','10000','10000','10000','10000','01111']};
 const currentSegment=()=>serverMode?segments.find(s=>cycleMs%25000>=s.start&&cycleMs%25000<s.end):null;
 function drawLetter(segment){
   status.hidden=true;array.dataset.phase=segment.id+'-letter';array.setAttribute('aria-label',segment.id+' server identifier');
   metricLabels.forEach(el=>el.hidden=true);
   const left=0;
   for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)set(row*cols+col,col>=left&&col<left+10&&letters[segment.id][Math.floor(row/2)][Math.floor((col-left)/2)]==='1',{hex:'#ffc13e'});
 }
 function validSample(data){return data&&Number.isFinite(data.sampled_at)&&Array.isArray(data.values)&&data.values.length===6&&data.values.every(v=>v===null||(Number.isFinite(v)&&v>=0&&v<=100));}

 function validHealth(data){
   return data&&data.version===1&&validSample(data)&&(!data.servers||['H','S','C'].every(id=>data.servers[id]===null||validSample(data.servers[id])));
 }
 async function fetchHealth(){
   if(fetching)return;fetching=true;
   try{
     const response=await fetch('/wopr-health.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});
     if(!response.ok)throw new Error('unavailable');
     const data=await response.json();if(!validHealth(data))throw new Error('invalid');health=data;
   }catch{health=null;}finally{fetching=false;drawMachines();}
 }
 function configureMode(){
   document.getElementById('mode').textContent=serverMode?'WOPR':'Server';
   document.getElementById('mode').setAttribute('aria-pressed',String(serverMode));
   clearInterval(healthPoll);healthPoll=null;
   fetchHealth();healthPoll=setInterval(fetchHealth,10000);
 }
 function drawHealth(segment){
   array.dataset.phase=segment.id+'-bars';
   const sample=machineSample(segment.id);
   const age=sample?Date.now()/1000-sample.sampled_at:Infinity;
   const fresh=age>=-5&&age<=35;
   status.hidden=false;
   const values=fresh?sample.values:Array(6).fill(null);
   status.textContent=machines.find(([id])=>id===segment.id)[1]+' · '+(fresh?'Live readings':'Server data unavailable or stale');
   const descriptions=metricNames.map((name,i)=>name+': '+(values[i]===null?'unavailable':values[i].toFixed(1)+'%'));
   array.setAttribute('aria-label',segment.id+' · '+descriptions.join(' · '));
   metricLabels.forEach((el,i)=>{el.hidden=false;el.textContent=descriptions[i];});
   for(let row=0;row<rows;row++){
     const value=values[Math.floor(row/2)],filled=value===null?0:Math.round((cols-12)*value/100);
     const color=value===null?'#ff341c':value>=90?'#ff341c':value>=75?'#ffc13e':'#b6ef84';
     for(let col=0;col<cols;col++){
       if(col<10)set(row*cols+col,letters[segment.id][Math.floor(row/2)][Math.floor(col/2)]==='1',{hex:'#ffc13e'});
       else if(col<12)set(row*cols+col,false,{hex:color});
       else set(row*cols+col,row%2===1&&(value===null?Math.floor(cycleMs/700)%2===0:col-12<filled),{hex:color});
     }
   }
 }
 const hues=[
  {hex:'#ff341c',weight:38},{hex:'#ff5121',weight:20},{hex:'#ff7928',weight:17},
  {hex:'#ffc13e',weight:12},{hex:'#ffe96b',weight:7},{hex:'#efffc2',weight:4},{hex:'#b6ef84',weight:2}
 ];
 const pick=()=>{let n=Math.random()*100;for(const c of hues){n-=c.weight;if(n<0)return c}return hues[0]};
 function makeGrid(){
   const server=!!currentSegment();
   cols=innerWidth<600?(server?32:22):(server?48:32);
   rows=server?12:6;
   array.classList.toggle('server-view',server);array.replaceChildren();leds=[];metricLabels=[];
   array.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';
   array.style.gridTemplateRows='repeat('+rows+',minmax(0,1fr))';
   for(let i=0;i<cols*rows;i++){
     const row=Math.floor(i/cols),col=i%cols,el=document.createElement('i');el.className='led';el.setAttribute('aria-hidden','true');
     el.style.gridRow=String(row+1);el.style.gridColumn=String(col+1);
     if(server&&col>=12&&row%2===0)el.style.visibility='hidden';
     array.appendChild(el);leds.push(el);
   }
   if(server)metricNames.forEach((name,i)=>{
     const label=document.createElement('div');label.className='metric-label';label.hidden=true;label.setAttribute('aria-hidden','true');
     label.style.gridRow=String(i*2+1);label.style.gridColumn='13 / -1';array.appendChild(label);metricLabels.push(label);
   });
 }
 function set(i,on,color){
   const el=leds[i];if(!el)return;
   if(on){el.classList.add('on');el.style.setProperty('--glow',color.hex)}
   else{el.classList.remove('on');el.style.removeProperty('--glow')}
 }
 function draw(){
   drawMachines();
   const now=performance.now();if(running)cycleMs+=now-lastFrame;lastFrame=now;
   const segment=currentSegment();
   const expected=innerWidth<600?(segment?32:22):(segment?48:32);
   if(cols!==expected)makeGrid();
   if(segment){drawHealth(segment);return;}
   array.dataset.phase='wopr';
   status.hidden=true;
   array.setAttribute('aria-label','Animated WOPR indicator lights');
   tick++;
   const phase=tick;
   for(let i=0;i<leds.length;i++){
     const row=Math.floor(i/cols),col=i%cols;
     let on,color=pick();
     const chance=[.72,.61,.65,.57,.68,.54][row]||.6;
     if(pattern===0){
       on=Math.random()<chance;
       if((col+phase*(row%2?2:1))%11<2)on=true;
     }else if(pattern===1){
       const sweep=(phase*2+row*4)%cols;
       on=Math.random()<.24||Math.abs(col-sweep)<2;
       if(Math.abs(col-sweep)<2)color=hues[(row+phase)%4];
     }else if(pattern===2){
       on=Math.random()<.36;
       if(Math.random()<.12)on=true;
     }else{
       const band=(col+Math.floor(phase/2)+row*3)%17;
       on=Math.random()<.35||band<3;
       if(band<3)color=hues[(row+Math.floor(phase/3))%5];
     }
     if(on&&Math.random()<.08)color=hues[4+Math.floor(Math.random()*3)];
     set(i,on,color);
   }
 }
 function start(){lastFrame=performance.now();clearInterval(timer);timer=setInterval(draw,rate);draw()}
 document.getElementById('toggle').addEventListener('click',e=>{
   running=!running;e.currentTarget.textContent=running?'Pause':'Resume';
   if(running)start();else clearInterval(timer);
 });
 document.getElementById('mode').addEventListener('click',()=>{serverMode=!serverMode;cycleMs=0;lastFrame=performance.now();configureMode();if(running)draw();else{status.hidden=true;}});
 document.getElementById('next').addEventListener('click',()=>{pattern=(pattern+1)%4;if(running)draw()});
 document.getElementById('speed').addEventListener('input',e=>{rate=Number(e.target.value);if(running)start()});
 document.getElementById('full').addEventListener('click',async()=>{
   try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}
 });
 let hideTimer;
 addEventListener('pointermove',()=>{const c=document.getElementById('controls');c.classList.add('show');clearTimeout(hideTimer);hideTimer=setTimeout(()=>c.classList.remove('show'),2600)});
 addEventListener('resize',()=>{makeGrid();draw()});
 configureMode();makeGrid();start();
})();
