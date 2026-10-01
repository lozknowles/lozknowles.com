(()=>{
 const array=document.getElementById('array');
 let cols=innerWidth<600?22:32, rows=6, leds=[],tick=0,pattern=0,running=true,timer=null,rate=210;
 const hues=[
  {hex:'#ff341c',weight:38},{hex:'#ff5121',weight:20},{hex:'#ff7928',weight:17},
  {hex:'#ffc13e',weight:12},{hex:'#ffe96b',weight:7},{hex:'#efffc2',weight:4},{hex:'#b6ef84',weight:2}
 ];
 const pick=()=>{let n=Math.random()*100;for(const c of hues){n-=c.weight;if(n<0)return c}return hues[0]};
 function makeGrid(){
   cols=innerWidth<600?22:32;array.replaceChildren();leds=[];
   array.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';
   for(let i=0;i<cols*rows;i++){const el=document.createElement('i');el.className='led';el.setAttribute('aria-hidden','true');array.appendChild(el);leds.push(el)}
 }
 function set(i,on,color){
   const el=leds[i];if(!el)return;
   if(on){el.classList.add('on');el.style.setProperty('--glow',color.hex)}
   else{el.classList.remove('on');el.style.removeProperty('--glow')}
 }
 function draw(){
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
 function start(){clearInterval(timer);timer=setInterval(draw,rate);draw()}
 document.getElementById('toggle').addEventListener('click',e=>{
   running=!running;e.currentTarget.textContent=running?'Pause':'Resume';
   if(running)start();else clearInterval(timer);
 });
 document.getElementById('next').addEventListener('click',()=>{pattern=(pattern+1)%4;if(running)draw()});
 document.getElementById('speed').addEventListener('input',e=>{rate=Number(e.target.value);if(running)start()});
 document.getElementById('full').addEventListener('click',async()=>{
   try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}
 });
 let hideTimer;
 addEventListener('pointermove',()=>{const c=document.getElementById('controls');c.classList.add('show');clearTimeout(hideTimer);hideTimer=setTimeout(()=>c.classList.remove('show'),2600)});
 addEventListener('resize',()=>{const old=cols;makeGrid();if(old!==cols)draw()});
 makeGrid();start();
})();
