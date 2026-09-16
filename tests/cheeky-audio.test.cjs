const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  const window = { AudioContext: function() {}, speechSynthesis: { cancel() {} } };
  const document = { hidden: false, body: { classList: { add() {}, remove() {} } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/cheeky-audio.js'),'utf8'), {window,document,setTimeout,clearTimeout,setInterval,clearInterval,CheekyClips:{down:[0,.1]}});
  const Audio = window.CheekyAudio; Audio.route = () => ({nodes:[],oscillators:[]});
  let resume, starts=0;
  const audio = new Audio(() => {});
  audio.context = { state:'suspended', resume:()=>new Promise(resolve=>{resume=()=>{audio.context.state='running';resolve();};}), createBufferSource:()=>({disconnect(){},stop(){},start(){starts++;queueMicrotask(()=>this.onended?.());}}) };
  audio.master = {}; audio.prepare = ()=>Promise.resolve({});
  return {audio,resume:()=>resume(),starts:()=>starts};
}
test('cached recordings wait for audio to resume after Stop and Start',async()=>{
  const h=setup();h.audio.unlock();const spoken=h.audio.say('down',null,true,true);
  await Promise.resolve();await Promise.resolve();assert.equal(h.starts(),0);
  h.resume();assert.equal(await spoken,true);assert.equal(h.starts(),1);
});
test('Stop while audio resume is pending prevents stale buffered playback',async()=>{
  const h=setup();h.audio.unlock();const spoken=h.audio.say('down',null,true,true);
  h.audio.stop();h.resume();assert.equal(await spoken,false);
  await Promise.resolve();await Promise.resolve();assert.equal(h.starts(),0);assert.equal(h.audio.busy,false);
});
