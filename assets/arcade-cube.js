import * as THREE from './three-0.160.0.module.min.js';
import { createArcadeSimulation } from './arcade-games.js?v=20260915-cube-1';

(() => {
  const root = document.getElementById('arcade');
  const stage = document.getElementById('arcade-stage');
  const status = document.getElementById('player-status');
  const orbitButton = root.querySelector('[data-cube-orbit]');
  const buttons = Array.from(document.querySelectorAll('[data-cube-face]'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const T=THREE;
  let renderer;
  try { renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'}); }
  catch(e) { document.getElementById('load-message').textContent='The arcade cube needs WebGL. Try another browser or enable hardware acceleration.'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  renderer.setClearColor(0x000000,0);
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('role','img');
  renderer.domElement.setAttribute('aria-label','A shiny, tiled glass cube with moving arcade scenes on its faces.');
  const scene=new T.Scene();
  const camera=new T.PerspectiveCamera(37,1,.1,100);
  const cube=new T.Group(); scene.add(cube);
  cube.rotation.set(.36,-.52,-.06);
  const state={tint:'#a5ddff',glass:'Smoked',glow:1,drift:1,codeOpacity:.32};
  let orbit=!reduced.matches,selected=-1,target=null,drag=null,visible=true,time=0,last=0,raf=0,lastTexture=-1;
  const labels=['Invaders','Pac-Man','Space Bike','Tempest','Donkey Kong','Centipede'];
  const colors=['#70eaff','#ed85ff','#91ffb7','#ffd077','#a5adff','#ff8ba8'];
  const sceneLights=[new T.AmbientLight(0x93b7ff,1.5),new T.DirectionalLight(0xe0f7ff,4),new T.DirectionalLight(0xe780ff,3)];
  sceneLights[1].position.set(-4,6,5); sceneLights[2].position.set(4,0,-2); sceneLights.forEach(l=>scene.add(l));
  const envCanvas=document.createElement('canvas'); envCanvas.width=1024; envCanvas.height=512;
  const ec=envCanvas.getContext('2d'); ec.fillStyle='#040711';ec.fillRect(0,0,1024,512);
  const envGrad=ec.createLinearGradient(0,0,0,512);envGrad.addColorStop(0,'#455675');envGrad.addColorStop(.5,'#090f20');envGrad.addColorStop(1,'#020307');ec.fillStyle=envGrad;ec.fillRect(0,0,1024,512);
  ec.shadowBlur=24;ec.shadowColor='#a1e4ff';ec.fillStyle='#d9f4ff';ec.fillRect(80,50,38,320);ec.fillRect(535,12,260,24);
  ec.shadowColor='#e6a2ff';ec.fillStyle='#c0a4fa';ec.fillRect(770,90,52,250);ec.shadowBlur=0;
  const envTexture=new T.CanvasTexture(envCanvas);envTexture.mapping=T.EquirectangularReflectionMapping;envTexture.colorSpace=T.SRGBColorSpace;
  const pmrem=new T.PMREMGenerator(renderer);const envTarget=pmrem.fromEquirectangular(envTexture);scene.environment=envTarget.texture;envTexture.dispose();pmrem.dispose();
  const sh=new T.Shape();const s=.432,r=.075;
  sh.moveTo(-s+r,-s);sh.lineTo(s-r,-s);sh.quadraticCurveTo(s,-s,s,-s+r);sh.lineTo(s,s-r);sh.quadraticCurveTo(s,s,s-r,s);sh.lineTo(-s+r,s);sh.quadraticCurveTo(-s,s,-s,s-r);sh.lineTo(-s,-s+r);sh.quadraticCurveTo(-s,-s,-s+r,-s);
  const geo=new T.ExtrudeGeometry(sh,{depth:.83,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.047,bevelThickness:.05,curveSegments:4});geo.translate(0,0,-.415);
  const glass=new T.MeshPhysicalMaterial({color:state.tint,metalness:.12,roughness:.13,transmission:.45,thickness:.45,ior:1.46,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.8,transparent:true,opacity:.98});
  const core=new T.Mesh(new T.BoxGeometry(2.55,2.55,2.55),new T.MeshStandardMaterial({color:0x040b14,roughness:.3,metalness:.55}));cube.add(core);
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z){const m=new T.Mesh(geo,glass);m.position.set(x,y,z);cube.add(m);}
  const faces=[],allScreenMaterials=[],edgeMaterials=[];
  const faceRotations=[[0,0,0],[0,Math.PI/2,0],[0,Math.PI,0],[0,-Math.PI/2,0],[-Math.PI/2,0,0],[Math.PI/2,0,0]];
  function addLine(points,color,opacity){const g=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));const m=new T.LineBasicMaterial({color,transparent:true,opacity,toneMapped:false});edgeMaterials.push(m);return new T.Line(g,m);}
  for(let f=0;f<6;f++){
    const group=new T.Group();group.rotation.set(...faceRotations[f]);cube.add(group);
    const cv=document.createElement('canvas');cv.width=512;cv.height=512;const ctx=cv.getContext('2d');
    const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;tex.minFilter=T.LinearFilter;tex.magFilter=T.LinearFilter;tex.generateMipmaps=false;
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const pg=new T.PlaneGeometry(.9,.9);const uv=pg.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,(col+uv.getX(i))/3,(2-row+uv.getY(i))/3);
      const mat=new T.MeshBasicMaterial({map:tex,transparent:true,opacity:.91,toneMapped:false});allScreenMaterials.push(mat);
      const p=new T.Mesh(pg,mat);p.position.set(col-1,1-row,1.485);p.userData.face=f;group.add(p);
      const outline=addLine([[-.464,-.464,0],[.464,-.464,0],[.464,.464,0],[-.464,.464,0],[-.464,-.464,0]],colors[f],.56);
      outline.position.set(col-1,1-row,1.497);group.add(outline);
      const sheen=new T.Mesh(new T.PlaneGeometry(.90,.12),new T.MeshBasicMaterial({color:0xecfaff,transparent:true,opacity:.027,depthWrite:false}));sheen.position.set(col-1,1-row+.32,1.49);group.add(sheen);
    }
    faces.push({group,canvas:cv,ctx,tex,normal:new T.Vector3(0,0,1).applyQuaternion(group.quaternion),color:colors[f]});
  }
  const ring=new T.Mesh(new T.TorusGeometry(2.06,.006,8,100),new T.MeshBasicMaterial({color:0x52d3ff,transparent:true,opacity:.3,toneMapped:false}));ring.rotation.x=1.22;ring.position.y=-2.15;scene.add(ring);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;const gc=glowCanvas.getContext('2d');const gg=gc.createRadialGradient(64,64,0,64,64,64);gg.addColorStop(0,'rgba(41,147,255,.32)');gg.addColorStop(.4,'rgba(36,80,220,.08)');gg.addColorStop(1,'rgba(10,20,60,0)');gc.fillStyle=gg;gc.fillRect(0,0,128,128);
  const floor=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));floor.position.set(0,-2.1,-.4);floor.scale.set(5.5,1.1,1);scene.add(floor);
  const dustPositions=[];for(let i=0;i<65;i++){const a=i*2.39996;dustPositions.push(Math.sin(a)*(2.8+(i%7)*.45),Math.cos(a*1.43)*2.5,Math.sin(a*.7)*3-2);}
  const dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.Float32BufferAttribute(dustPositions,3));const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0x779ab4,size:.019,transparent:true,opacity:.4}));scene.add(dust);
  // Original illustrative routines, using the instruction sets documented by:
  // https://www.zilog.com/docs/z80/z80cpu_um.pdf
  // https://www.westerndesigncenter.com/wdc/documentation/w65c02s.pdf
  // https://www.nxp.com/docs/en/reference-manual/M68000PRM.pdf
  const codeBlocks=[
    {cpu:'Z80',name:'ATTRIBUTE ROW',color:'#83dae0',lines:['PAINT_ROW:','  LD HL,5800h','  LD B,32','  LD A,47h','NEXT_ATTR:','  LD (HL),A','  INC HL','  DJNZ NEXT_ATTR','  RET']},
    {cpu:'6502',name:'CLEAR SCREEN',color:'#cab3f6',lines:['CLEAR_SCREEN:','  LDX #$00','  LDA #$20','CLEAR_CHAR:','  STA $0400,X','  STA $0500,X','  STA $0600,X','  STA $0700,X','  INX','  BNE CLEAR_CHAR','  RTS']},
    {cpu:'68000',name:'CLEAR BUFFER',color:'#dfc59e',lines:['CLEAR_BUFFER:','  LEA $20000,A0','  MOVEQ #0,D0','  MOVE.W #255,D1','CLEAR_LONG:','  MOVE.L D0,(A0)+','  DBRA D1,CLEAR_LONG','  RTS']},
    {cpu:'Z80',name:'COPY SPRITE',color:'#83dae0',lines:['COPY_SPRITE:','  LD HL,6000h','  LD DE,4000h','  LD BC,0020h','  LDIR','  RET']},
    {cpu:'6502',name:'COPY BITMAP',color:'#cab3f6',lines:['COPY_BITMAP:','  LDY #$3F','COPY_BYTE:','  LDA $3000,Y','  STA $2000,Y','  DEY','  BPL COPY_BYTE','  RTS']},
    {cpu:'68000',name:'BLIT WORDS',color:'#dfc59e',lines:['COPY_WORDS:','  LEA $21000,A0','  LEA $22000,A1','  MOVEQ #31,D0','COPY_NEXT:','  MOVE.W (A0)+,(A1)+','  DBRA D0,COPY_NEXT','  RTS']},
    {cpu:'Z80',name:'XOR PIXELS',color:'#83dae0',lines:['XOR_ROW:','  LD HL,4000h','  LD B,32','NEXT_PIXEL:','  LD A,(HL)','  XOR 0FFh','  LD (HL),A','  INC HL','  DJNZ NEXT_PIXEL','  RET']},
    {cpu:'6502',name:'SCROLL CHARACTERS',color:'#cab3f6',lines:['SCROLL_ROW:','  LDX #$00','SHIFT_CHAR:','  LDA $0401,X','  STA $0400,X','  INX','  CPX #$27','  BNE SHIFT_CHAR','  LDA #$20','  STA $0427','  RTS']},
    {cpu:'68000',name:'ROTATE PATTERN',color:'#dfc59e',lines:['ROTATE_PATTERN:','  LEA $20000,A0','  MOVEQ #15,D1','NEXT_PATTERN:','  MOVE.W (A0),D0','  ROL.W #1,D0','  MOVE.W D0,(A0)+','  DBRA D1,NEXT_PATTERN','  RTS']},
    {cpu:'Z80',name:'ADD TO SCORE',color:'#83dae0',lines:['ADD_SCORE:','  LD HL,(8000h)','  LD DE,0010h','  ADD HL,DE','  LD (8000h),HL','  RET']},
    {cpu:'6502',name:'16-BIT SCORE',color:'#cab3f6',lines:['ADD_SCORE:','  CLC','  LDA $C000','  ADC #$0A','  STA $C000','  LDA $C001','  ADC #$00','  STA $C001','  RTS']},
    {cpu:'68000',name:'MOVE SPRITE',color:'#dfc59e',lines:['MOVE_SPRITE:','  LEA $23000,A0','  MOVE.W (A0),D0','  ADDQ.W #2,D0','  ANDI.W #$01FF,D0','  MOVE.W D0,(A0)','  RTS']}
  ];
  const codeOrbit=new T.Group();scene.add(codeOrbit);codeOrbit.rotation.set(-.08,.4,.20);
  const codeMaterials=[];
  codeBlocks.forEach((block,i)=>{
    const cv=document.createElement('canvas');cv.width=420;cv.height=384;
    const c=cv.getContext('2d');c.clearRect(0,0,420,384);c.textBaseline='top';
    c.fillStyle=block.color;c.font='500 18px monospace';c.fillText('; '+block.cpu+' / '+block.name,18,12);
    c.font='500 24px monospace';block.lines.forEach((s,j)=>{c.fillStyle=s.endsWith(':')?'#e8dcff':block.color;c.fillText(s,18,46+j*28);});
    const map=new T.CanvasTexture(cv);map.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshBasicMaterial({map,transparent:true,opacity:.2,depthWrite:false,toneMapped:false,side:T.FrontSide});codeMaterials.push(material);
    const radius=2.7,width=2.4,height=1.65,geometry=new T.PlaneGeometry(width,height,24,1),pos=geometry.attributes.position;
    for(let k=0;k<pos.count;k++){const a=pos.getX(k)/radius;pos.setXYZ(k,Math.sin(a)*radius,pos.getY(k),radius*(Math.cos(a)-1));}geometry.computeVertexNormals();
    const angle=i*.86,mesh=new T.Mesh(geometry,material);mesh.rotation.y=angle;mesh.position.set(Math.sin(angle)*radius,(i-5.5)*.275,Math.cos(angle)*radius);codeOrbit.add(mesh);
  });


  let arcade=createArcadeSimulation();
  const pixelSprites={
    squid:['00011000','00111100','01111110','11011011','11111111','00100100','01011010','10100101'],
    crab:['00100000100','00010001000','00111111100','01101110110','11111111111','10111111101','10100000101','00011011000'],
    octopus:['0001111000','0111111110','1111111111','1100110011','1111111111','0011001100','0110110110','1100000011'],
    ship:['00000100000','00001110000','00001110000','01111111110','11111111111','11111111111'],
    mario:['000RRRR00','00RRRRRR0','000SSS000','00SSSSSS0','000SSS000','00RRBR000','0RRRBRRR0','SSBBBBBSS','00BBBBB00','00BB0BB00','0CCC0CCC0'],
    kong:['000BBBBBB000','00BBBBBBBB00','0BBBSSSSBBB0','BBBSBSSBSBBB','BBBBSSSSBBBB','0BBBSSSSBBB0','BBBSSSSSSBBB','BBBSSSSSSBBB','BB0SSSSSS0BB','BB0BBBBBB0BB','000BB00BB000','00BBB00BBB00'],
    bomber:['0000PP0000','000WWWW000','00WWWWWW00','00WSSSSW00','00WSBBSW00','00WWWWWW00','000VVVV000','0WWVVVVWW0','000VVVV000','000W00W000','00PP00PP00']
  };
  function pixels(c,s,x,y,size,palette){c.shadowBlur=0;for(let r=0;r<s.length;r++)for(let k=0;k<s[r].length;k++){const ch=s[r][k];if(ch==='0')continue;c.fillStyle=typeof palette==='string'?palette:palette[ch]||'#fff';c.fillRect(Math.round(x+k*size),Math.round(y+r*size),Math.ceil(size),Math.ceil(size));}}
  function line(c,pts){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();}
  function base(face,title,g){const c=face.ctx;c.globalAlpha=1;c.shadowBlur=0;c.clearRect(0,0,512,512);const gr=c.createLinearGradient(0,0,512,512);gr.addColorStop(0,'#0b1324');gr.addColorStop(1,'#02050e');c.fillStyle=gr;c.fillRect(0,0,512,512);
    c.fillStyle=face.color;c.font='500 17px monospace';c.textAlign='left';c.fillText(title,25,31);c.fillStyle='#edfaff';c.font='500 22px monospace';c.textAlign='right';c.fillText(String(g.score).padStart(6,'0'),485,32);c.textAlign='left';c.fillStyle='#9aabc1';c.font='500 12px monospace';c.fillText('SCORE',433,49);c.strokeStyle=face.color+'55';c.lineWidth=1;line(c,[[25,56],[487,56]]);
    c.font='500 13px monospace';c.fillStyle='#b4c6d8';c.fillText('LIVES',26,485);for(let i=0;i<g.lives;i++){c.fillStyle=face.color;c.fillRect(76+i*15,475,10,8);}c.textAlign='right';c.fillText('WAVE '+String(g.level).padStart(2,'0')+' / DEMO',486,485);c.textAlign='left';c.shadowColor=face.color;c.fillStyle=face.color;c.strokeStyle=face.color;return c;}
  function effects(c,g){for(const f of g.fx){const p=f.age/f.ttl;c.save();c.globalAlpha=1-p;c.fillStyle=f.color;c.strokeStyle=f.color;c.shadowColor=f.color;c.shadowBlur=7;if(f.text){c.font='500 15px monospace';c.textAlign='center';c.fillText(f.text,f.x,f.y-f.age*32);}else{c.lineWidth=2;for(let i=0;i<9;i++){const a=i*Math.PI*2/9,r=4+p*25;line(c,[[f.x+Math.cos(a)*r*.5,f.y+Math.sin(a)*r*.5],[f.x+Math.cos(a)*r,f.y+Math.sin(a)*r]]);}c.fillStyle='#fff';c.fillRect(f.x-3,f.y-3,6,6);}c.restore();}}
  function waveBanner(c,g){if(!g.intermission&&!g.gameOver)return;c.fillStyle='rgba(2,4,13,.72)';c.fillRect(65,221,382,58);c.fillStyle='#f4f8ff';c.font='500 22px monospace';c.textAlign='center';c.fillText(g.gameOver?'GAME OVER':'NEXT WAVE',256,257);c.textAlign='left';}
  function invaders(face){const g=arcade.games[0],c=base(face,'SPACE INVADERS',g);c.shadowBlur=0;
    for(const a of g.aliens.filter(a=>a.alive)){const p=arcade.alienPos(g,a),sprite=a.r===0?pixelSprites.squid:a.r<3?pixelSprites.crab:pixelSprites.octopus;let rows=sprite;if(Math.floor(g.t*3)%2)rows=sprite.map((r,i)=>i>=6?r.split('').reverse().join(''):r);pixels(c,rows,p.x-sprite[0].length*1.5,p.y-12,3,['#d7fbfb','#a0eaff','#a0eaff','#b1ffbc'][a.r]);}
    if(g.ufo){pixels(c,['00001111110000','00111111111100','01101101101110','11111111111111','00111001110000'],g.ufo.x-21,73,3,'#ff7daa');}
    c.fillStyle='#a0ffc2';g.shields.forEach(s=>c.fillRect(s.x,s.y,6,6));
    c.shadowBlur=8;c.shadowColor='#cbffff';c.fillStyle='#d5ffff';g.bullets.forEach(b=>c.fillRect(b.x-1.5,b.y-10,3,13));c.shadowColor='#ff9dba';c.strokeStyle='#ff9dba';c.lineWidth=2;g.bombs.forEach(b=>line(c,[[b.x-2,b.y-7],[b.x+2,b.y-3],[b.x-2,b.y+1],[b.x+2,b.y+6]]));
    if(!g.invuln||Math.floor(g.t*12)%2)pixels(c,pixelSprites.ship,g.player-16.5,424,3,'#bdffc8');c.strokeStyle='#7ec799';c.lineWidth=2;line(c,[[26,453],[486,453]]);effects(c,g);waveBanner(c,g);
  }
  function pacman(face){const g=arcade.games[1],c=base(face,'PAC-MAN',g),cell=17.5,ox=72,oy=65;
    c.lineWidth=2;c.lineJoin='round';c.lineCap='round';c.fillStyle='#081332';c.strokeStyle='#4f64ff';c.shadowColor='#3c5df7';c.shadowBlur=3;
    const wall=(x,y)=>g.maze[y]?.[x]==='#';g.maze.forEach((row,y)=>[...row].forEach((v,x)=>{const px=ox+x*cell,py=oy+y*cell;if(v==='#'){c.fillRect(px,py,cell,cell);if(!wall(x-1,y))line(c,[[px+1,py],[px+1,py+cell]]);if(!wall(x+1,y))line(c,[[px+cell-1,py],[px+cell-1,py+cell]]);if(!wall(x,y-1))line(c,[[px,py+1],[px+cell,py+1]]);if(!wall(x,y+1))line(c,[[px,py+cell-1],[px+cell,py+cell-1]]);}else if(v==='='){c.save();c.strokeStyle='#ffb3dc';line(c,[[px,py+cell/2],[px+cell,py+cell/2]]);c.restore();}}));
    c.shadowBlur=0;for(const [k,value] of g.pellets){const x=ox+(k%21+.5)*cell,y=oy+(Math.floor(k/21)+.5)*cell;c.fillStyle='#ffddb5';if(value===50){c.globalAlpha=.68+.32*Math.sin(g.t*5)**2;c.beginPath();c.arc(x,y,4.3,0,Math.PI*2);c.fill();c.globalAlpha=1;}else c.fillRect(x-1.35,y-1.35,2.7,2.7);}
    const p=g.pac;c.save();c.translate(ox+(p.x+.5)*cell,oy+(p.y+.5)*cell);c.rotate(Math.atan2(p.dy,p.dx));c.fillStyle='#ffe84f';c.shadowColor='#ffe354';c.shadowBlur=8;const bite=g.death?Math.min(Math.PI,g.death<1.15?(1-g.death/1.15)*Math.PI:.2):.10+Math.abs(Math.sin(g.t*13))*.65;c.beginPath();c.moveTo(0,0);c.arc(0,0,7.7,bite,Math.PI*2-bite);c.closePath();c.fill();c.restore();
    for(const a of g.ghosts){const x=ox+(a.x+.5)*cell,y=oy+(a.y+.5)*cell,scared=g.power>0&&a.mode!=='eyes';c.save();c.translate(x,y);c.shadowBlur=3;c.shadowColor=scared?'#516aff':a.color;c.fillStyle=scared?(g.power<2&&Math.floor(g.t*6)%2?'#ecf1ff':'#344ad8'):a.color;if(a.mode!=='eyes'){c.beginPath();c.arc(0,-1,7.5,Math.PI,0);c.lineTo(7.5,7);for(let i=3;i>=0;i--)c.lineTo(-7.5+i*5,Math.sin(i+g.t*12)>0?4:7);c.closePath();c.fill();}c.shadowBlur=0;if(scared){c.fillStyle='#ffeec9';c.fillRect(-4,-2,2,2);c.fillRect(2,-2,2,2);c.strokeStyle='#ffeec9';c.lineWidth=1;line(c,[[-4,4],[-2,2],[0,4],[2,2],[4,4]]);}else{c.fillStyle='#fff';c.beginPath();c.ellipse(-3,-2,2.6,3.4,0,0,Math.PI*2);c.ellipse(3,-2,2.6,3.4,0,0,Math.PI*2);c.fill();c.fillStyle='#234ab4';c.fillRect(-4+a.dx,-3+a.dy,2.5,3);c.fillRect(2+a.dx,-3+a.dy,2.5,3);}c.restore();}
    effects(c,g);waveBanner(c,g);
  }
  const bikeVideo=document.createElement('video');
  bikeVideo.className='cube-gameplay-source';
  bikeVideo.muted=true;
  bikeVideo.defaultMuted=true;
  bikeVideo.loop=true;
  bikeVideo.playsInline=true;
  bikeVideo.preload='metadata';
  bikeVideo.setAttribute('muted','');
  bikeVideo.setAttribute('playsinline','');
  bikeVideo.setAttribute('aria-hidden','true');
  bikeVideo.tabIndex=-1;
  bikeVideo.src='/assets/videos/space-bike-gameplay-v1.mp4';
  stage.appendChild(bikeVideo);
  const bikePoster=new Image();
  bikePoster.src='/assets/space-bike-gameplay.jpg';
  let mediaPending=false,mediaBlocked=false,disposed=false;
  function refreshMediaFrame(){if(!disposed){lastTexture=-1;start();}}
  function syncMedia(){
    const shouldPlay=playing&&visible&&!document.hidden&&!disposed;
    if(!shouldPlay){bikeVideo.pause();return;}
    if(!bikeVideo.paused||mediaPending||mediaBlocked||bikeVideo.error)return;
    mediaPending=true;
    bikeVideo.play().then(()=>{
      // A play request can finish after Pause or after the page leaves view.
      if(!playing||!visible||document.hidden||disposed)bikeVideo.pause();
    }).catch(error=>{
      if(error.name!=='AbortError'){
        mediaBlocked=true;
        if(selected===2)status.textContent='Press Play to start the Space Bike gameplay.';
      }
    }).finally(()=>{
      mediaPending=false;
      if(playing&&visible&&!document.hidden&&!disposed&&!mediaBlocked&&!bikeVideo.error&&bikeVideo.paused)syncMedia();
    });
  }
  bikeVideo.addEventListener('loadeddata',refreshMediaFrame);
  bikeVideo.addEventListener('seeked',refreshMediaFrame);
  bikeVideo.addEventListener('error',()=>{
    refreshMediaFrame();
    if(selected===2)status.textContent='Space Bike video is unavailable. Showing a gameplay still.';
  });
  bikePoster.addEventListener('load',refreshMediaFrame);
  function spaceBike(face){
    const c=face.ctx;
    c.globalAlpha=1;c.shadowBlur=0;c.textAlign='left';
    c.fillStyle='#03080b';c.fillRect(0,0,512,512);
    c.fillStyle=face.color;c.font='500 21px monospace';c.fillText('SPACE BIKE',24,37);
    c.textAlign='right';c.font='500 13px monospace';c.fillText('COMMODORE 64',488,35);
    c.strokeStyle=face.color+'55';c.lineWidth=1;line(c,[[24,55],[488,55]]);
    const source=bikeVideo.readyState>=2&&!bikeVideo.seeking?bikeVideo:bikePoster;
    if(source===bikeVideo||bikePoster.naturalWidth){
      c.imageSmoothingEnabled=false;
      c.drawImage(source,0,96,512,320);
      c.imageSmoothingEnabled=true;
    }
    c.textAlign='left';c.fillStyle='#d6f5e5';c.font='500 15px monospace';
    c.fillText('WRITTEN BY LAWRENCE KNOWLES',24,455);
    c.fillStyle='#9aabc1';c.font='500 12px monospace';
    c.fillText(bikeVideo.error?'GAMEPLAY STILL':'ORIGINAL GAMEPLAY',24,482);
    c.textAlign='right';c.fillText('6502 / C64',488,482);c.textAlign='left';
  }
  function tempest(face){const g=arcade.games[3],c=base(face,'TEMPEST',g);c.strokeStyle='#4388ed';c.shadowColor='#3979ff';c.shadowBlur=4;c.lineWidth=1.5;
    for(let layer=0;layer<5;layer++){const depth=layer/4,pts=[];for(let i=0;i<=16;i++){const p=arcade.polar(i-.5,depth);pts.push([p.x,p.y]);}line(c,pts);}for(let i=0;i<16;i++){const a=arcade.polar(i-.5,0),b=arcade.polar(i-.5,1);line(c,[[a.x,a.y],[b.x,b.y]]);}
    for(const e of g.enemies){const p=arcade.polar(e.lane,e.depth);c.save();c.translate(p.x,p.y);c.rotate(p.a+Math.sin(g.t*7+e.lane)*.4);c.strokeStyle=e.kind?'#ef8dff':'#99ffb5';c.shadowColor=c.strokeStyle;c.lineWidth=2.5;line(c,[[-6,-10],[7,0],[-6,10],[0,0],[-6,-10]]);c.restore();}
    c.strokeStyle='#fff6a9';c.shadowColor='#ffe071';c.lineWidth=3;for(const b of g.shots){const p=arcade.polar(b.lane,b.depth),q=arcade.polar(b.lane,b.depth+.07);line(c,[[p.x,p.y],[q.x,q.y]]);}
    const p=arcade.polar(g.lane,1);c.save();c.translate(p.x,p.y);c.rotate(p.a);c.strokeStyle='#ffe088';c.shadowColor='#ffd46b';c.shadowBlur=10;c.lineWidth=3.5;line(c,[[-6,-17],[8,-12],[-5,0],[8,12],[-6,17]]);c.restore();effects(c,g);waveBanner(c,g);
  }
  function donkeyKong(face){const g=arcade.games[4],c=base(face,'DONKEY KONG',g);c.lineCap='butt';c.shadowBlur=3;
    for(let row=0;row<5;row++){c.strokeStyle='#e174a4';c.shadowColor='#e174a4';c.lineWidth=4;line(c,[[36,arcade.platformY(row,36)],[477,arcade.platformY(row,477)]]);c.lineWidth=1.5;for(let x=39;x<461;x+=22)line(c,[[x,arcade.platformY(row,x)],[x+11,arcade.platformY(row,x+11)+8],[x+22,arcade.platformY(row,x+22)]]);}
    for(let row=0;row<4;row++){const x=arcade.ladders[row],bottom=arcade.platformY(row,x),top=arcade.platformY(row+1,x);c.strokeStyle='#77d7ea';c.shadowColor='#72d7ff';c.lineWidth=2;line(c,[[x-8,bottom],[x-8,top]]);line(c,[[x+8,bottom],[x+8,top]]);for(let y=top+5;y<bottom;y+=9)line(c,[[x-8,y],[x+8,y]]);}
    pixels(c,pixelSprites.kong,64,87,3.9,{B:'#ad805c',S:'#f6c89b'});c.fillStyle='#ffc6e5';c.fillRect(426,97,10,11);c.fillStyle='#f18bbb';c.fillRect(423,108,16,20);c.fillStyle='#ffd8a3';c.fillRect(423,93,15,5);
    for(const b of g.barrels){const y=arcade.platformY(b.row,b.x)-10+(b.fall?b.fall*(arcade.platformY(b.row-1,b.x)-arcade.platformY(b.row,b.x)):0);c.save();c.translate(b.x,y);c.rotate(b.angle);c.strokeStyle='#e7bb83';c.shadowColor='#f7c69b';c.lineWidth=2;c.beginPath();c.ellipse(0,0,9,8,0,0,Math.PI*2);c.stroke();line(c,[[-4,-6],[-4,6]]);line(c,[[4,-6],[4,6]]);line(c,[[-8,0],[8,0]]);c.restore();}
    const m=g.mario;let y=arcade.platformY(m.row,m.x)-m.jump;if(m.climb)y+=(arcade.platformY(m.row+1,m.x)-y)*m.climb;if(!g.invuln||Math.floor(g.t*10)%2)pixels(c,pixelSprites.mario,m.x-10,y-27,2.4,{R:'#f97a84',S:'#ffdaad',B:'#7cb8ff',C:'#c3dcff'});effects(c,g);waveBanner(c,g);
  }
  function centipede(face){const g=arcade.games[5],c=base(face,'CENTIPEDE',g);c.shadowBlur=3;
    for(const m of g.mushrooms){const p=arcade.centXY(m);c.fillStyle=m.hp===3?'#ed88d3':m.hp===2?'#b386cd':'#706ca8';c.shadowColor=c.fillStyle;c.beginPath();c.arc(p.x,p.y,8,Math.PI,0);c.fill();c.fillRect(p.x-2,p.y,5,7);c.fillStyle='#0a0e25';c.fillRect(p.x-4,p.y-5,2,3);c.fillRect(p.x+2,p.y-5,2,3);}
    const phase=g.move/Math.max(.085,.155-g.level*.004);for(let i=g.segments.length-1;i>=0;i--){const a=arcade.centXY(g.history[i]),b=arcade.centXY(g.history[i+1]),x=b.x+(a.x-b.x)*phase,y=b.y+(a.y-b.y)*phase;c.fillStyle=i?'#adf792':'#f3fdb2';c.shadowColor='#bcff85';c.shadowBlur=5;c.beginPath();c.ellipse(x,y,8.7,8,0,0,Math.PI*2);c.fill();c.strokeStyle='#d1ffa6';c.lineWidth=1.3;line(c,[[x-5,y+6],[x-7,y+10+(i%2?1:-1)*Math.sin(g.t*15)]]);line(c,[[x+5,y+6],[x+7,y+10]]);if(!i){c.fillStyle='#173b28';c.fillRect(x-4,y-4,2,3);c.fillRect(x+3,y-4,2,3);}}
    if(g.spider.alive){const s=g.spider;c.save();c.translate(s.x,s.y);c.strokeStyle='#f9b1e0';c.shadowColor='#f58dd9';c.lineWidth=2;for(let i=0;i<3;i++){const dy=-8+i*8;line(c,[[-3,0],[-13,dy+Math.sin(g.t*15+i)*3],[-20,dy+5]]);line(c,[[3,0],[13,dy-Math.sin(g.t*15+i)*3],[20,dy+5]]);}c.fillStyle='#f6c0ea';c.beginPath();c.ellipse(0,0,8,6,0,0,Math.PI*2);c.fill();c.restore();}
    c.fillStyle='#bafaff';c.shadowColor='#86f4ff';c.shadowBlur=7;g.shots.forEach(b=>c.fillRect(b.x-1,b.y-9,2,12));if(!g.invuln||Math.floor(g.t*10)%2){c.beginPath();c.moveTo(g.player,424);c.lineTo(g.player+13,440);c.lineTo(g.player,435);c.lineTo(g.player-13,440);c.closePath();c.fill();}effects(c,g);waveBanner(c,g);
  }
  const drawGames=[invaders,pacman,spaceBike,tempest,donkeyKong,centipede];
  function renderTextures(){faces.forEach((f,i)=>{drawGames[i](f);f.tex.needsUpdate=true;});}

  function sync(){codeMaterials.forEach(m=>m.opacity=state.codeOpacity);glass.color.set(state.tint);glass.transmission=state.glass==='Clear'?.8:.45;glass.roughness=state.glass==='Clear'?.08:.13;edgeMaterials.forEach(m=>m.opacity=Math.min(.9,.56*state.glow));allScreenMaterials.forEach(m=>m.color.setScalar(state.glow));renderer.render(scene,camera);}
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(0,0,Math.max(7.8,6.5/camera.aspect));camera.updateProjectionMatrix();renderer.render(scene,camera);}
  const ro=new ResizeObserver(resize);ro.observe(stage);
  const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncMedia();if(visible)start();});io.observe(stage);
  // Release speed is retained until Pause, Reset, or a face selection.
  function releaseVelocity(samples,previous={x:0,y:.22}){
    if(samples.length<2)return {...previous};
    const end=samples[samples.length-1];
    const index=samples.findIndex(s=>s.t>=end.t-140);
    const start=samples[Math.min(Math.max(0,index),samples.length-2)];
    const dt=Math.max(.016,(end.t-start.t)/1000);
    let x=(end.y-start.y)*.007/dt,y=(end.x-start.x)*.007/dt;
    const length=Math.hypot(x,y);
    if(length<.015)return {...previous};
    const scale=Math.max(.09,Math.min(1.45,length))/length;
    return {x:x*scale,y:y*scale};
  }
  let spin={x:0,y:.22},accumulator=0,lastSummary=-1,playing=!reduced.matches;
  const axisX=new T.Vector3(1,0,0),axisY=new T.Vector3(0,1,0);
  const playButton=document.getElementById('play-toggle');
  const resetButton=document.getElementById('replay');
  const fullButton=document.getElementById('fullscreen');
  const chapterLabel=document.getElementById('chapter-label');
  const screenState=document.getElementById('screen-state');
  function rotateBy(x,y){cube.rotateOnWorldAxis(axisY,y);cube.rotateOnWorldAxis(axisX,x);}
  function updateButtons(){
    orbitButton.textContent=orbit&&playing?'Pause rotation':'Rotate cube';
    orbitButton.setAttribute('aria-pressed',String(orbit&&playing));
    playButton.innerHTML=playing?'<span aria-hidden="true">Ⅱ</span> Pause':'<span aria-hidden="true">▶</span> Play';
    playButton.setAttribute('aria-pressed',String(playing));
    root.dataset.rotation=orbit&&playing?'spinning':'paused';
    screenState.textContent=playing?'DEMO MODE':'PAUSED';
    chapterLabel.textContent=selected<0?'3D / ARCADE CUBE':String(selected+1).padStart(2,'0')+' / '+labels[selected].toUpperCase();
    buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));
    syncMedia();
  }
  function selectFace(i){selected=i;orbit=false;playing=true;target=faces[i].group.quaternion.clone().invert();mediaBlocked=false;status.textContent=(i===2?'Space Bike · original C64 gameplay.':labels[i]+' · animated demo.')+' Flick the cube to keep it spinning.';if(reduced.matches){cube.quaternion.copy(target);target=null;}updateButtons();start();}
  buttons.forEach((b,i)=>b.addEventListener('click',()=>selectFace(i)));
  function togglePlay(){mediaBlocked=false;playing=!playing;if(playing){if(time===0&&selected<0)orbit=true;status.textContent='Six games, six faces. Flick to spin, or choose a game below.';}else status.textContent='Paused. Press Play or Space to continue.';updateButtons();start();}
  playButton.addEventListener('click',togglePlay);
  orbitButton.addEventListener('click',()=>{orbit=!(orbit&&playing);target=null;if(orbit){playing=true;selected=-1;status.textContent='Spinning freely. Drag to change direction.';}else status.textContent='Rotation paused. The games keep playing.';updateButtons();start();});
  function reset(){mediaBlocked=false;bikeVideo.currentTime=0;arcade=createArcadeSimulation();time=0;lastTexture=-1;lastSummary=-1;accumulator=0;spin={x:0,y:.22};cube.rotation.set(.36,-.52,-.06);cube.position.y=0;target=null;selected=-1;orbit=true;playing=true;status.textContent='A fresh start. Six games, six faces.';updateButtons();start();}
  resetButton.addEventListener('click',reset);
  fullButton.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{status.textContent='Full screen is unavailable in this browser.';}});
  document.addEventListener('fullscreenchange',()=>{fullButton.textContent=document.fullscreenElement?'Exit full screen':'Full screen';resize();});
  stage.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();togglePlay();}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();selectFace((selected+(e.key==='ArrowRight'?1:-1)+6)%6);}});
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();
  stage.addEventListener('pointerdown',e=>{if(e.button!==0||drag)return;drag={id:e.pointerId,lastX:e.clientX,lastY:e.clientY,moved:0,wasOrbit:orbit,samples:[{x:e.clientX,y:e.clientY,t:e.timeStamp}]};orbit=false;renderer.domElement.setPointerCapture(e.pointerId);});
  stage.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.lastX=e.clientX;drag.lastY=e.clientY;drag.moved+=Math.abs(dx)+Math.abs(dy);drag.samples.push({x:e.clientX,y:e.clientY,t:e.timeStamp});if(drag.samples.length>16)drag.samples.shift();if(drag.moved>5){target=null;selected=-1;playing=true;rotateBy(dy*.007,dx*.007);status.textContent='Release to keep spinning.';updateButtons();start();}});
  function release(e){if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
    if(d.moved<6){const b=stage.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(cube.children,true).find(h=>Number.isInteger(h.object.userData.face));if(hit){selectFace(hit.object.userData.face);return;}orbit=d.wasOrbit;}
    else{spin=releaseVelocity(d.samples,spin);orbit=true;playing=true;target=null;selected=-1;status.textContent='Spinning freely. Choose a game to bring its face forward.';}
    updateButtons();start();
  }
  stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.id){orbit=drag.wasOrbit;drag=null;updateButtons();start();}});
  function frame(now){raf=0;if(!root.isConnected){cleanup();return;}if(!visible||document.hidden)return;const dt=Math.min((now-last)/1000||0,.1);last=now;
    if(playing){time+=dt;accumulator+=dt;while(accumulator>=1/60){arcade.step(1/60);accumulator-=1/60;}}
    if(target){cube.quaternion.slerp(target,Math.min(1,dt*6));if(cube.quaternion.angleTo(target)<.002){cube.quaternion.copy(target);target=null;}}else if(playing&&orbit&&!drag){rotateBy(spin.x*dt*state.drift,spin.y*dt*state.drift);cube.position.y=Math.sin(time*.8)*.035;}
    codeOrbit.rotation.y=.4-time*.075;
    if(time-lastTexture>1/24||lastTexture<0){renderTextures();lastTexture=time;}
    if(time-lastSummary>1||lastSummary<0){renderer.domElement.setAttribute('aria-label','Neon glass arcade cube. '+labels.map((name,i)=>i===2?name+': original C64 gameplay'+(bikeVideo.error?' still':' video'):name+': score '+arcade.games[i].score).join('. ')+'.');lastSummary=time;}
    renderer.render(scene,camera);if(playing||target)raf=requestAnimationFrame(frame);
  }
  function start(){if(!raf&&visible&&!document.hidden){last=performance.now();raf=requestAnimationFrame(frame);}}
  function motionChange(){if(reduced.matches){orbit=false;playing=false;target=null;}updateButtons();start();}
  [playButton,orbitButton,resetButton,fullButton,...buttons].forEach(b=>b.disabled=false);
  if(!document.fullscreenEnabled)fullButton.hidden=true;
  document.getElementById('load-message').hidden=true;
  status.textContent=reduced.matches?'Press Play to start the arcade cube.':'Six games, six faces. Flick to spin, or choose a game below.';

  function visibilityChange(){syncMedia();if(!document.hidden)start();}
  reduced.addEventListener('change',motionChange);document.addEventListener('visibilitychange',visibilityChange);
  function cleanup(){disposed=true;bikeVideo.pause();bikeVideo.removeAttribute('src');bikeVideo.load();bikeVideo.remove();cancelAnimationFrame(raf);ro.disconnect();io.disconnect();reduced.removeEventListener('change',motionChange);document.removeEventListener('visibilitychange',visibilityChange);const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{ms.add(m);if(m.map)ts.add(m.map);});}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());envTarget.dispose();renderer.dispose();}
  renderTextures();resize();sync();updateButtons();start();
})();
