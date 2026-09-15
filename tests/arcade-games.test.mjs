import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcadeSimulation } from '../assets/arcade-games.js';

test('an invader hit removes that alien and awards its row value', () => {
  const sim=createArcadeSimulation(),g=sim.games[0];
  let hit=null;
  for(let f=0;f<600&&!hit;f++){
    const before=g.aliens.filter(a=>a.alive);
    sim.step(1/60);
    hit=before.find(a=>!a.alive);
  }
  assert.ok(hit,'the autoplay cannon should land a shot within ten seconds');
  assert.equal(g.aliens.filter(a=>a.alive).length,27);
  assert.equal(g.score,(4-hit.r)*10);
  assert.ok(g.fx.some(f=>!f.text),'the hit should produce an explosion');
});

test('Pac-Man eats maze pellets while every actor follows walkable corridors', () => {
  const sim=createArcadeSimulation(),g=sim.games[1],initial=new Map(g.pellets);
  const starts=g.ghosts.map(a=>a.cell);
  for(let f=0;f<300;f++){
    sim.step(1/60);
    for(const a of [g.pac,...g.ghosts]){
      const ch=g.maze[Math.floor(a.cell/21)][a.cell%21];
      assert.ok(ch!=='#'&&ch!=='_');
      if(a.next!==null)assert.ok(sim.mazeNeighbors(a.cell,a!==g.pac).includes(a.next));
    }
  }
  assert.ok(g.pellets.size<initial.size);
  assert.ok(g.ghosts.some((a,i)=>a.cell!==starts[i]));
  const eaten=[...initial].filter(([k])=>!g.pellets.has(k));
  assert.equal(g.score,eaten.reduce((sum,[,value])=>sum+value,0));
});

test('all six demos complete gameplay events and keep their state bounded', () => {
  const sim=createArcadeSimulation();
  let frightened=false,clearedMaze=false;
  for(let f=0;f<60*180;f++){
    sim.step(1/60);
    frightened ||= sim.games[1].power>0;
    clearedMaze ||= sim.games[1].level>1;
    for(const g of sim.games){assert.ok(Number.isFinite(g.score));assert.ok(g.lives>=0&&g.lives<=3);assert.ok(g.fx.length<100);}
  }
  assert.ok(frightened&&clearedMaze);
  assert.ok(sim.games[0].events.alien>28);
  assert.ok(sim.games[1].events.ghost>0);
  assert.ok(sim.games[2].events.brick>0&&sim.games[2].events.enemy>0);
  assert.ok(sim.games[3].events.flipper>16);
  assert.ok(sim.games[4].events.jump>0&&sim.games[4].events.rescue>0);
  assert.ok(sim.games[5].events.segment>12);
});
