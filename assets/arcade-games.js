  // Self-running arcade simulations. Scoring is awarded only by game events.
export function createArcadeSimulation() {
    let seed=71839;
    const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const towards=(v,target,speed)=>v+clamp(target-v,-speed,speed);
    const common=()=>({score:0,highScore:0,level:1,lives:3,t:0,fx:[],events:{},earned:0,invuln:0,intermission:0,gameOver:0});
    function burst(g,x,y,color,text=''){g.fx.push({x,y,color,text,age:0,ttl:text?.8:.45});}
    function award(g,points,event,x,y,color){g.score+=points;g.earned+=points;g.events[event]=(g.events[event]||0)+1;if(color)burst(g,x,y,color,String(points));}
    function damage(g,x,y){if(g.invuln)return;g.lives--;g.events.deaths=(g.events.deaths||0)+1;g.invuln=2;burst(g,x,y,'#ff728e');if(g.lives===0){g.gameOver=1.8;g.highScore=Math.max(g.highScore,g.score);}}
    function tick(g,dt){g.t+=dt;g.invuln=Math.max(0,g.invuln-dt);g.fx.forEach(f=>f.age+=dt);g.fx=g.fx.filter(f=>f.age<f.ttl);}
    function firstStep(start,neighbors,accept){const q=[start],seen=new Set(q),first=new Map();for(let k=0;k<q.length;k++){const v=q[k];if(accept(v))return first.get(v)??v;for(const n of neighbors(v))if(!seen.has(n)){seen.add(n);first.set(n,first.get(v)??n);q.push(n);}}return start;}
    function distances(start,neighbors){const d=new Map([[start,0]]),q=[start];for(let k=0;k<q.length;k++)for(const n of neighbors(q[k]))if(!d.has(n)){d.set(n,d.get(q[k])+1);q.push(n);}return d;}

    const invaders=Object.assign(common(),{player:256,aliens:[],bullets:[],bombs:[],shields:[],ox:0,oy:0,dir:1,march:0,fire:0,enemyFire:1,ufo:null,ufoClock:7,kills:0});
    function invaderWave(){const g=invaders;g.aliens=[];for(let r=0;r<4;r++)for(let c=0;c<7;c++)g.aliens.push({r,c,alive:true});g.ox=0;g.oy=0;g.dir=1;g.march=0;g.bullets=[];g.bombs=[];g.player=256;g.fire=.25;g.enemyFire=1;g.shields=[];[104,256,408].forEach(cx=>{for(let y=0;y<4;y++)for(let x=0;x<8;x++)if(!(y===0&&(x===0||x===7))&&!(y>1&&x>2&&x<5))g.shields.push({x:cx-24+x*6,y:368+y*6});});}
    const alienPos=(g,a)=>({x:76+a.c*56+g.ox,y:110+a.r*44+g.oy});
    function updateInvaders(dt){const g=invaders;tick(g,dt);if(g.intermission){g.intermission-=dt;if(g.intermission<=0){g.intermission=0;g.level++;invaderWave();}return;}
      let living=g.aliens.filter(a=>a.alive);const period=.12+.26*living.length/28;
      g.march+=dt;if(g.march>=period){g.march-=period;g.ox+=g.dir*8;const xs=living.map(a=>alienPos(g,a).x);if(Math.max(...xs)>461||Math.min(...xs)<49){g.dir*=-1;g.ox+=g.dir*8;g.oy+=13;}}
      const targets=living.filter(a=>!living.some(b=>b.c===a.c&&b.r>a.r));
      const a=targets.sort((a,b)=>Math.abs(alienPos(g,a).x-g.player)-Math.abs(alienPos(g,b).x-g.player))[0];
      if(a){const p=alienPos(g,a),travel=(425-p.y)/520;let aim=p.x+g.dir*8/period*travel;
        const danger=g.bombs.find(b=>b.y>315&&Math.abs(b.x-g.player)<19);if(danger)aim=g.player+(g.player<256?42:-42);
        g.player=towards(g.player,clamp(aim,35,477),215*dt);g.fire-=dt;
        if(g.fire<=0&&Math.abs(g.player-aim)<15&&g.bullets.length<2){g.bullets.push({x:g.player,y:420});g.fire=.32;}}
      g.enemyFire-=dt;if(g.enemyFire<=0&&targets.length){const p=alienPos(g,targets[Math.floor(rnd()*targets.length)]);g.bombs.push({x:p.x,y:p.y+15});g.enemyFire=.72+rnd()*.7;}
      g.ufoClock-=dt;if(g.ufoClock<=0&&!g.ufo){g.ufo={x:-30};g.ufoClock=12;}if(g.ufo){g.ufo.x+=74*dt;if(g.ufo.x>550)g.ufo=null;}
      for(const b of g.bullets){const old=b.y;b.y-=520*dt;const shield=g.shields.find(s=>Math.abs(s.x+3-b.x)<4&&s.y<=old&&s.y+6>=b.y);if(shield){g.shields=g.shields.filter(s=>Math.hypot(s.x-shield.x,s.y-shield.y)>7);b.dead=true;continue;}
        const hit=living.find(a=>{const p=alienPos(g,a);return a.alive&&Math.abs(p.x-b.x)<18&&p.y+13>=b.y&&p.y-13<=old;});
        if(hit){hit.alive=false;b.dead=true;g.kills++;const p=alienPos(g,hit);burst(g,p.x,p.y,'#b7faff');award(g,(4-hit.r)*10,'alien',p.x,p.y,'#76edff');}
        else if(g.ufo&&Math.abs(g.ufo.x-b.x)<22&&b.y<89&&old>70){award(g,200,'ufo',g.ufo.x,80,'#ff88bc');g.ufo=null;b.dead=true;}}
      for(const b of g.bombs){const old=b.y;b.y+=155*dt;const hit=g.shields.find(s=>Math.abs(s.x+3-b.x)<5&&s.y+6>=old&&s.y<=b.y);if(hit){g.shields=g.shields.filter(s=>Math.hypot(s.x-hit.x,s.y-hit.y)>11);b.dead=true;burst(g,b.x,b.y,'#95dca7');}if(Math.abs(b.x-g.player)<17&&b.y>=423&&old<445){damage(g,g.player,432);b.dead=true;}}
      g.bullets=g.bullets.filter(b=>!b.dead&&b.y>65);g.bombs=g.bombs.filter(b=>!b.dead&&b.y<459);
      living=g.aliens.filter(a=>a.alive);if(!living.length)g.intermission=1.5;
      else if(living.some(a=>alienPos(g,a).y>354)){damage(g,g.player,430);g.intermission=1.5;}
    }
    invaderWave();

    const maze=[
      '#####################',
      '#o........#........o#',
      '#.###.###.#.###.###.#',
      '#.###.###.#.###.###.#',
      '#...................#',
      '#.###.#.#####.#.###.#',
      '#.....#...#...#.....#',
      '#####.### # ###.#####',
      '____#.#       #.#____',
      '#####.# ##=## #.#####',
      '     .  #   #  .     ',
      '#####.# ##### #.#####',
      '____#.#       #.#____',
      '#####.# ##### #.#####',
      '#.........#.........#',
      '#.###.###.#.###.###.#',
      '#o..#..... .....#..o#',
      '###.#.#.#####.#.#.###',
      '#.....#...#...#.....#',
      '#.#######.#.#######.#',
      '#...................#',
      '#####################'
    ];
    const mw=21,mh=maze.length;
    const coords=k=>({x:k%mw,y:Math.floor(k/mw)});
    function mazeNeighbors(k,ghost=false){const {x,y}=coords(k),out=[];for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const nx=(x+dx+mw)%mw,ny=y+dy;if(ny<0||ny>=mh||Math.abs(nx-x)>1&&y!==10)continue;const c=maze[ny][nx];if(c!=='#'&&c!=='_'&&(c!=='='||ghost))out.push(ny*mw+nx);}return out;}
    const pacGraph=k=>mazeNeighbors(k,false),ghostGraph=k=>mazeNeighbors(k,true);
    const actor=k=>({cell:k,next:null,progress:0,...coords(k),dx:1,dy:0,previous:null});
    const pacman=Object.assign(common(),{maze,pellets:new Map(),pac:null,ghosts:[],power:0,combo:0,death:0,visits:new Map(),eaten:0});
    function pacActors(){const g=pacman;g.pac=actor(16*mw+10);g.ghosts=[{color:'#ff667b',home:10*mw+10,cell:8*mw+10},{color:'#ffb7e6',home:10*mw+9,cell:10*mw+9},{color:'#70f1ff',home:10*mw+11,cell:10*mw+11},{color:'#ffb667',home:10*mw+10,cell:10*mw+10}].map((a,i)=>({...a,...actor(a.cell),mode:'chase',wait:i*.7}));g.power=0;g.combo=0;g.invuln=1;}
    function pacWave(){const g=pacman;g.pellets.clear();maze.forEach((row,y)=>[...row].forEach((c,x)=>{if(c==='.'||c==='o')g.pellets.set(y*mw+x,c==='o'?50:10);}));g.visits.clear();g.death=0;pacActors();}
    function moveActor(a,speed,dt,choose,onEnter=()=>{}){let budget=speed*dt;for(let guard=0;budget>0&&guard<8;guard++){if(a.next===null){const n=choose(a);if(n===a.cell||n===undefined)return;a.next=n;a.progress=0;const p=coords(a.cell),q=coords(n);a.dx=clamp(q.x-p.x,-1,1);if(Math.abs(q.x-p.x)>1)a.dx=q.x>p.x?-1:1;a.dy=q.y-p.y;}
        const d=Math.min(budget,1-a.progress);a.progress+=d;budget-=d;const p=coords(a.cell);a.x=(p.x+a.dx*a.progress+mw)%mw;a.y=p.y+a.dy*a.progress;
        if(a.progress>=1-1e-8){a.previous=a.cell;a.cell=a.next;a.next=null;Object.assign(a,coords(a.cell));onEnter(a);}}}
    function choosePac(a){const g=pacman,ns=pacGraph(a.cell),threats=g.ghosts.filter(h=>h.mode!=='eyes'&&h.wait<=0).map(h=>({h,d:distances(h.next??h.cell,pacGraph)}));let best=ns[0],value=Infinity;
      for(const n of ns){const d=distances(n,pacGraph);let food=Infinity;for(const k of g.pellets.keys())food=Math.min(food,d.get(k)??Infinity);let cost=food+(g.visits.get(n)||0)*.035+(n===a.previous?.18:0);
        for(const {h,d:gd} of threats){const range=gd.get(n)??30;if(g.power>1.4&&h.mode!=='eyes'){if(range<8)cost=Math.min(cost,range-11);}else if(range<5)cost+=(5-range)**2*4;}
        if(g.pellets.get(n)===50&&g.power<1)cost-=2;
        if(cost<value){value=cost;best=n;}}
      return best;}
    function chooseGhost(a,i){const g=pacman;if(a.mode==='eyes')return firstStep(a.cell,ghostGraph,k=>k===a.home);
      let target=g.pac.next??g.pac.cell;const pc=coords(target);
      if(i===1){const tx=clamp(pc.x+g.pac.dx*3,0,20),ty=clamp(pc.y+g.pac.dy*3,0,mh-1),k=ty*mw+tx;if(ghostGraph(k).length&&maze[ty][tx]!=='#')target=k;}
      if(i===3&&Math.hypot(a.x-g.pac.x,a.y-g.pac.y)<4&&g.power<=0)target=20*mw+1;
      const d=distances(target,ghostGraph);let ns=ghostGraph(a.cell).filter(n=>n!==a.previous);if(!ns.length)ns=ghostGraph(a.cell);
      ns.sort((p,q)=>g.power>0?(d.get(q)??999)-(d.get(p)??999):(d.get(p)??999)-(d.get(q)??999));return ns[0]??a.cell;}
    function updatePacman(dt){const g=pacman;tick(g,dt);g.power=Math.max(0,g.power-dt);
      if(g.intermission){g.intermission-=dt;if(g.intermission<=0){g.intermission=0;g.level++;pacWave();}return;}
      if(g.death>0){g.death-=dt;if(g.death<=0)pacActors();return;}
      moveActor(g.pac,5.4,dt,choosePac,a=>{g.visits.set(a.cell,(g.visits.get(a.cell)||0)+1);const p=g.pellets.get(a.cell);if(p){g.pellets.delete(a.cell);g.eaten++;award(g,p,p===50?'powerPellet':'dot');if(p===50){g.power=7;g.combo=0;}}});
      g.ghosts.forEach((a,i)=>{if(a.wait>0){a.wait-=dt;return;}if(a.mode==='eyes'&&a.cell===a.home){a.mode='chase';a.wait=.65;return;}moveActor(a,a.mode==='eyes'?9:g.power>0?2.85:4.05+i*.08,dt,b=>chooseGhost(b,i));const dx=Math.min(Math.abs(a.x-g.pac.x),mw-Math.abs(a.x-g.pac.x));if(Math.hypot(dx,a.y-g.pac.y)<.66&&a.mode!=='eyes'){if(g.power>0){a.mode='eyes';award(g,200*2**Math.min(g.combo++,3),'ghost',72+(a.x+.5)*17.5,65+(a.y+.5)*17.5,'#dcfaff');}else if(!g.invuln){damage(g,72+(g.pac.x+.5)*17.5,65+(g.pac.y+.5)*17.5);g.death=1.35;}}});
      if(!g.pellets.size)g.intermission=1.5;
    }
    pacWave();

    const bomberman=Object.assign(common(),{grid:[],player:null,enemies:[],bombs:[],flames:[],cooldown:0,kills:0});
    const bw=13,bh=11;
    const bomberXY=k=>({x:k%bw,y:Math.floor(k/bw)});
    const bomberActor=k=>({cell:k,next:null,progress:0,...bomberXY(k)});
    function bomberWave(){const g=bomberman;g.grid=Array.from({length:bw*bh},(_,k)=>{const {x,y}=bomberXY(k);return !x||!y||x===12||y===10||x%2===0&&y%2===0?1:rnd()<.39?2:0;});[14,15,16,29,42,27,24,23,37,118,119,105,128,127,115].forEach(k=>g.grid[k]=0);g.grid[17]=2;g.grid[40]=2;g.player=bomberActor(14);g.enemies=[24,118,128].map((k,i)=>({...bomberActor(k),alive:true,color:['#ff958a','#e9baff','#ffc962'][i]}));g.bombs=[];g.flames=[];g.cooldown=.3;}
    function bomberNeighbors(k){const {x,y}=bomberXY(k);return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([x,y])=>x>=0&&x<bw&&y>=0&&y<bh).map(([x,y])=>y*bw+x).filter(n=>bomberman.grid[n]===0&&!bomberman.bombs.some(b=>b.cell===n)&&!bomberman.flames.some(f=>f.cell===n));}
    function blastCells(k){const g=bomberman,{x,y}=bomberXY(k),out=[k];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])for(let n=1;n<=3;n++){const xx=x+dx*n,yy=y+dy*n,key=yy*bw+xx;if(xx<0||xx>=bw||yy<0||yy>=bh||g.grid[key]===1)break;out.push(key);if(g.grid[key]===2)break;}return out;}
    function bomberMove(a,speed,dt,choose){let budget=dt*speed;for(let i=0;budget>0&&i<5;i++){if(a.next===null){const n=choose(a);if(n===a.cell||n===undefined)return;a.next=n;a.progress=0;}const d=Math.min(budget,1-a.progress);budget-=d;a.progress+=d;const p=bomberXY(a.cell),q=bomberXY(a.next);a.x=p.x+(q.x-p.x)*a.progress;a.y=p.y+(q.y-p.y)*a.progress;if(a.progress>=1-1e-8){a.cell=a.next;a.next=null;Object.assign(a,bomberXY(a.cell));}}}
    function updateBomberman(dt){const g=bomberman;tick(g,dt);g.cooldown-=dt;if(g.intermission){g.intermission-=dt;if(g.intermission<=0){g.intermission=0;g.level++;bomberWave();}return;}
      const danger=new Set(g.bombs.flatMap(b=>blastCells(b.cell)).concat(g.flames.map(f=>f.cell)));
      const useful=k=>{const blast=new Set(blastCells(k));return [...blast].some(n=>g.grid[n]===2||g.enemies.some(e=>e.alive&&e.cell===n))&&firstStep(k,bomberNeighbors,n=>!blast.has(n))!==k;};
      const choose=a=>{if(danger.has(a.cell))return firstStep(a.cell,bomberNeighbors,k=>!danger.has(k));if(g.bombs.length)return a.cell;return firstStep(a.cell,bomberNeighbors,useful);};
      bomberMove(g.player,3.7,dt,choose);
      if(g.player.next===null&&!g.bombs.length&&!g.flames.length&&g.cooldown<=0&&useful(g.player.cell)){g.bombs.push({cell:g.player.cell,age:0});g.cooldown=2.6;}
      for(const e of g.enemies.filter(e=>e.alive))bomberMove(e,1.6,dt,a=>{const ns=bomberNeighbors(a.cell).filter(n=>!danger.has(n));if(!ns.length)return a.cell;return ns[Math.floor(rnd()*ns.length)];});
      for(const b of g.bombs){b.age+=dt;if(b.age>=2.15||g.flames.some(f=>f.cell===b.cell)){b.dead=true;const cells=blastCells(b.cell);for(const k of cells){g.flames.push({cell:k,age:0});if(g.grid[k]===2){g.grid[k]=0;const p=bomberXY(k);award(g,50,'brick',61+(p.x+.5)*30,86+(p.y+.5)*30,'#96ffc1');}}}}
      g.bombs=g.bombs.filter(b=>!b.dead);for(const f of g.flames)f.age+=dt;g.flames=g.flames.filter(f=>f.age<.65);
      const hot=new Set(g.flames.map(f=>f.cell));for(const e of g.enemies)if(e.alive&&(hot.has(e.cell)||hot.has(e.next))){e.alive=false;g.kills++;award(g,200,'enemy',61+(e.x+.5)*30,86+(e.y+.5)*30,'#ffd79b');}
      if((hot.has(g.player.cell)||hot.has(g.player.next))&&!g.invuln){damage(g,61+(g.player.x+.5)*30,86+(g.player.y+.5)*30);g.player=bomberActor(14);}
      if(!g.enemies.some(e=>e.alive)||!g.grid.includes(2))g.intermission=1.8;
    }
    bomberWave();

    const tempest=Object.assign(common(),{lane:0,enemies:[],shots:[],spawn:.1,fire:0,spawned:0});
    const polar=(lane,depth)=>{const a=(lane+.5)/16*Math.PI*2,r=42+depth*139;return {x:256+Math.cos(a)*r,y:265+Math.sin(a)*r,a,r};};
    const laneDiff=(a,b)=>((a-b+24)%16)-8;
    function updateTempest(dt){const g=tempest;tick(g,dt);if(g.intermission){g.intermission-=dt;if(g.intermission<=0){g.intermission=0;g.level++;g.spawned=0;g.spawn=.2;}return;}
      g.spawn-=dt;if(g.spawn<=0&&g.spawned<16){g.enemies.push({lane:Math.floor(rnd()*16),depth:0,kind:g.spawned%3});g.spawn=.6+rnd()*.45;g.spawned++;}
      const target=g.enemies.slice().sort((a,b)=>b.depth-a.depth)[0];if(target)g.lane=(g.lane+clamp(laneDiff(target.lane,g.lane),-11*dt,11*dt)+16)%16;
      g.fire-=dt;if(target&&Math.abs(laneDiff(target.lane,g.lane))<.22&&g.fire<=0){g.shots.push({lane:target.lane,depth:1});g.fire=.23;}
      for(const e of g.enemies){e.depth+=dt*(.125+g.level*.006);if(e.depth>1){e.dead=true;damage(g,polar(e.lane,1).x,polar(e.lane,1).y);}}
      for(const b of g.shots){const old=b.depth;b.depth-=dt*2;const hit=g.enemies.find(e=>!e.dead&&e.lane===b.lane&&e.depth>=b.depth-.045&&e.depth<=old+.045);if(hit){hit.dead=true;b.dead=true;const p=polar(hit.lane,hit.depth);award(g,150,'flipper',p.x,p.y,'#ffb8fc');burst(g,p.x,p.y,'#ffd17e');}}
      g.enemies=g.enemies.filter(e=>!e.dead);g.shots=g.shots.filter(b=>!b.dead&&b.depth>0);if(g.spawned===16&&!g.enemies.length)g.intermission=1.5;
    }

    const donkeyKong=Object.assign(common(),{mario:{x:70,row:0,jump:0,vy:0,climb:0},barrels:[],spawn:.8,rescues:0});
    const platformY=(row,x)=>425-row*71+(x-256)/217*(row%2?-1:1)*12;
    const ladders=[410,98,410,145];
    function updateKong(dt){const g=donkeyKong;tick(g,dt);if(g.intermission){g.intermission-=dt;if(g.intermission<=0){g.intermission=0;g.level++;g.mario={x:70,row:0,jump:0,vy:0,climb:0};g.barrels=[];g.spawn=.2;}return;}
      g.spawn-=dt;if(g.spawn<=0){g.barrels.push({x:107,row:4,dir:1,fall:0,angle:0,awarded:false});g.spawn=2.55+rnd()*.5;}
      const m=g.mario;
      for(const b of g.barrels){b.angle+=dt*b.dir*7;if(b.fall){b.fall+=dt*1.6;if(b.fall>=1){b.fall=0;b.row--;b.dir*=-1;if(b.row<0)b.dead=true;}}else{b.x+=b.dir*(91+g.level*3)*dt;if(b.x>463||b.x<49){b.x=clamp(b.x,49,463);b.fall=.001;}}}
      if(m.climb){m.climb+=dt*.67;if(m.climb>=1){if(g.barrels.some(b=>b.row===m.row+1&&Math.abs(b.x-m.x)<45))m.climb=.99;else{m.climb=0;m.row++;}}}
      else {const target=m.row<4?ladders[m.row]:427,dir=Math.sign(target-m.x);
        const threat=g.barrels.find(b=>b.row===m.row&&!b.fall&&Math.abs(b.x-m.x)<53&&(b.x-m.x)*(b.dir*(91+g.level*3)-dir*62)<0);
        if(threat&&m.jump===0)m.vy=300;
        if(!m.jump&&!m.vy)m.x=towards(m.x,target,62*dt);
        if(m.vy||m.jump){m.jump+=m.vy*dt;m.vy-=700*dt;if(m.jump<=0){m.jump=0;m.vy=0;}}
        if(Math.abs(m.x-target)<1&&!m.jump){if(m.row<4)m.climb=.001;else{g.rescues++;award(g,1000,'rescue',427,112,'#ffc1e4');g.intermission=2;}}
      }
      for(const b of g.barrels){if(b.row===m.row&&!b.fall&&!m.climb&&Math.abs(b.x-m.x)<17){if(m.jump>23&&!b.awarded){award(g,100,'jump',m.x,platformY(m.row,m.x)-m.jump-30,'#ffe5aa');b.awarded=true;}else if(m.jump<20&&!g.invuln){damage(g,m.x,platformY(m.row,m.x)-18);g.mario={x:70,row:0,jump:0,vy:0,climb:0};}}}
      g.barrels=g.barrels.filter(b=>!b.dead);
    }

    const centipede=Object.assign(common(),{segments:[],history:[],head:{x:0,y:0},dir:1,down:1,move:0,mushrooms:[],shots:[],player:256,fire:0,spider:{x:35,y:407,alive:true,wait:0},kills:0});
    const centXY=p=>({x:46+p.x*20,y:90+p.y*20});
    function centWave(){const g=centipede;g.head={x:11,y:0};g.dir=1;g.down=1;g.move=0;g.segments=Array.from({length:12},(_,id)=>({id}));g.history=Array.from({length:20},(_,i)=>({x:11-i,y:0}));g.shots=[];g.mushrooms=Array.from({length:28},()=>({x:Math.floor(rnd()*22),y:3+Math.floor(rnd()*11),hp:3}));}
    function updateCentipede(dt){const g=centipede;tick(g,dt);if(g.intermission){g.intermission-=dt;if(g.intermission<=0){g.intermission=0;g.level++;centWave();}return;}
      g.move+=dt;const period=Math.max(.085,.155-g.level*.004);if(g.move>=period){g.move-=period;let x=g.head.x+g.dir,y=g.head.y;if(x<0||x>21||g.mushrooms.some(m=>m.x===x&&m.y===y)){x=g.head.x;y+=g.down;g.dir*=-1;if(y>=14)g.down=-1;if(y<=11&&g.down<0)g.down=1;}g.head={x,y};g.history.unshift({...g.head});g.history.length=24;}
      const phase=g.move/period;const targets=g.segments.map((s,i)=>{const a=centXY(g.history[i]),b=centXY(g.history[i+1]);return {s,i,x:b.x+(a.x-b.x)*phase,y:b.y+(a.y-b.y)*phase};}).sort((a,b)=>b.y-a.y);
      const target=targets[0];if(target){const lead=g.dir*(425-target.y)/570*20/period;g.player=towards(g.player,clamp(target.x+lead,38,474),250*dt);}
      g.fire-=dt;if(g.fire<=0){g.shots.push({x:g.player,y:421});g.fire=.13;}
      for(const b of g.shots){const old=b.y;b.y-=570*dt;const mushroom=g.mushrooms.find(m=>{const p=centXY(m);return Math.abs(p.x-b.x)<8&&p.y+9>=b.y&&p.y-7<=old;});if(mushroom){b.dead=true;mushroom.hp--;if(mushroom.hp===0)award(g,1,'mushroom');continue;}
        const hit=targets.find(p=>!p.s.dead&&Math.abs(p.x-b.x)<11&&p.y+10>=b.y&&p.y-10<=old);if(hit){hit.s.dead=true;b.dead=true;g.kills++;const cell=g.history[hit.i];g.mushrooms.push({...cell,hp:3});award(g,hit.i===0?100:10,'segment',hit.x,hit.y,'#c8ffab');burst(g,hit.x,hit.y,'#b7ff7e');}
        if(g.spider.alive&&Math.abs(b.x-g.spider.x)<17&&b.y<=g.spider.y+10&&old>=g.spider.y-10){b.dead=true;g.spider.alive=false;g.spider.wait=5;award(g,300,'spider',g.spider.x,g.spider.y,'#ff9bd8');}}
      g.segments=g.segments.filter(s=>!s.dead);g.mushrooms=g.mushrooms.filter(m=>m.hp>0);g.shots=g.shots.filter(b=>!b.dead&&b.y>64);
      const sp=g.spider;if(sp.alive){sp.x=256+Math.sin(g.t*.85)*212;sp.y=415+Math.sin(g.t*3.1)*24;if(Math.hypot(sp.x-g.player,sp.y-434)<19)damage(g,g.player,433);}else{sp.wait-=dt;if(sp.wait<=0)sp.alive=true;}
      if(!g.segments.length)g.intermission=1.5;
    }
    centWave();
    const games=[invaders,pacman,bomberman,tempest,donkeyKong,centipede];
    const updates=[updateInvaders,updatePacman,updateBomberman,updateTempest,updateKong,updateCentipede];
    const restart=[invaderWave,pacWave,bomberWave,()=>{Object.assign(tempest,{lane:0,enemies:[],shots:[],spawn:.1,fire:0,spawned:0});},()=>{Object.assign(donkeyKong,{mario:{x:70,row:0,jump:0,vy:0,climb:0},barrels:[],spawn:.8});},centWave];
    function step(dt){games.forEach((g,i)=>{if(g.gameOver>0){tick(g,dt);g.gameOver-=dt;if(g.gameOver<=0){g.gameOver=0;g.score=0;g.earned=0;g.lives=3;g.level=1;g.intermission=0;restart[i]();}}else updates[i](dt);});}
    return {games,step,alienPos,polar,platformY,ladders,centXY,mazeNeighbors,mazeWidth:mw,mazeHeight:mh};
  }
