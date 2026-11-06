const test=require('node:test');
const assert=require('node:assert/strict');
const Mixer=require('../voice-mixer.js');
class Param {constructor(){this.value=1;}setValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}cancelScheduledValues(){}}
class Node {constructor(){this.gain=new Param();this.connections=[];}connect(n){this.connections.push(n);}disconnect(){this.connections=[];}}
class Context {
 constructor(){this.currentTime=10;this.state='running';this.destination={};this.sources=[];this.events=[];}
 createGain(){return new Node();}
 createBufferSource(){const n=new Node();n.start=(when,offset)=>{n.startArgs=[when,offset];this.events.push('start');};n.stop=()=>n.stopped=true;this.sources.push(n);return n;}
 async resume(){this.events.push('resume');}
 async close(){this.closed=true;}
 async decodeAudioData(){this.events.push('decode');return {duration:180};}
}
function fixture(t,durations=[180,180,180],options={}){const context=new Context();let contexts=0;const mixer=new Mixer(durations.map((duration,i)=>({id:String(i),buffer:{duration}})),{contextFactory:()=>{contexts++;return context;},...options});t.after(()=>mixer.destroy());return {mixer,context,contexts:()=>contexts};}
test('one device and exactly one start time / offset for every track',async t=>{
 const {mixer,context,contexts}=fixture(t);await mixer.play();assert.equal(contexts(),1);assert.deepEqual(context.sources.map(n=>n.startArgs),[[10.06,0],[10.06,0],[10.06,0]]);context.currentTime=53.06;mixer.update();assert.equal(mixer.time,43);assert.equal(context.sources.length,3);
});
test('pause/resume and seek restart the entire project at a shared offset',async t=>{
 const {mixer,context}=fixture(t);await mixer.play();context.currentTime=30.06;mixer.pause();assert.equal(mixer.time,20);assert(context.sources.every(s=>s.stopped));await mixer.play();assert(context.sources.slice(3).every(s=>s.startArgs[1]===20));await mixer.seek(70);assert(context.sources.slice(6).every(s=>s.startArgs[1]===70));
});
test('solo, multiple solos, mute and volume affect gains without touching sources',async t=>{
 const {mixer,context}=fixture(t);await mixer.play();mixer.setTrackVolume('0',65);mixer.toggleSolo('0');assert.deepEqual(mixer.tracks.map(t=>t.gain.gain.value),[.65,0,0]);mixer.toggleSolo('1');mixer.toggleMute('0');assert.deepEqual(mixer.tracks.map(t=>t.gain.gain.value),[0,.8,0]);mixer.setMasterVolume(40);assert.equal(mixer.master.gain.value,.4);assert.equal(context.sources.length,3);assert(context.sources.every(s=>!s.stopped));mixer.toggleSolo('0');mixer.toggleSolo('1');assert.deepEqual(mixer.tracks.map(t=>t.gain.gain.value),[0,.8,.8]);
});
test('unlock occurs in first tap; all decodes must finish before any track starts',async t=>{
 const context=new Context();let release;context.decodeAudioData=()=>new Promise(resolve=>{release=()=>resolve({duration:50});});
 const mixer=new Mixer([{id:'a',url:'a'},{id:'b',buffer:{duration:50}}],{contextFactory:()=>context,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)})});t.after(()=>mixer.destroy());const pending=mixer.play();assert.deepEqual(context.events,['resume']);await new Promise(setImmediate);assert.equal(context.sources.length,0);release();await pending;assert.equal(context.sources.length,2);assert.deepEqual(context.sources[0].startArgs,context.sources[1].startArgs);
});
test('failed decode never plays partial mix, retry retains successfully decoded tracks',async t=>{
 const {mixer,context}=fixture(t);mixer.tracks[1].buffer=null;mixer.tracks[1].url='b';let fail=true;let error='';mixer.onError=m=>error=m;mixer.options.fetch=async()=>{if(fail)throw Error('network');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};};await mixer.play();assert.equal(context.sources.length,0);assert(!mixer.playing);assert(error.includes('todas as pistas'));fail=false;await mixer.play();assert.equal(context.sources.length,3);
});
test('cancel loading cannot start stale playback and can resume a prepared project',async t=>{
 const {mixer,context}=fixture(t);let release;context.resume=()=>new Promise(resolve=>release=resolve);const pending=mixer.play();mixer.pause();release();await pending;assert.equal(context.sources.length,0);context.resume=async()=>{};await mixer.play();assert.equal(context.sources.length,3);
});
test('closing during decode releases buffers and prevents sound',async t=>{
 const {mixer,context}=fixture(t);mixer.tracks[0].buffer=null;mixer.tracks[0].url='a';let release;context.decodeAudioData=()=>new Promise(resolve=>release=()=>resolve({duration:20}));mixer.options.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});const pending=mixer.play();await new Promise(setImmediate);mixer.destroy();release();await pending;assert.equal(context.sources.length,0);assert(context.closed);assert(mixer.tracks.every(t=>!t.buffer));
});
test('shorter tracks end independently; longest track determines project end',async t=>{
 const {mixer,context}=fixture(t,[100,180]);await mixer.play();context.sources[0].onended();assert(mixer.playing);context.sources[1].onended();assert(!mixer.playing);assert.equal(mixer.time,180);await mixer.play();assert.equal(context.sources.at(-1).startArgs[1],0);
});
test('one pitch processor handles the summed project; seeking replaces stale processor',async t=>{
 let created=0;const nodes=[];const {mixer}=fixture(t,[180,180,180],{createPitchProcessor:async()=>{created++;const n=new Node();n.pitchSemitones=new Param();nodes.push(n);return n;}});mixer.pitch=2;await mixer.play();assert.equal(created,1);assert.equal(mixer.bus.connections[0],nodes[0]);assert.equal(nodes[0].pitchSemitones.value,2);assert(mixer.tracks.every(t=>t.gain.connections[0]===mixer.bus));await mixer.seek(20);assert.equal(created,2);assert.equal(nodes[0].connections.length,0);
});
test('device interruption pauses the whole project at its clock position',async t=>{
 const {mixer,context}=fixture(t);await mixer.play();context.currentTime=35.06;context.state='interrupted';context.onstatechange();assert(!mixer.playing);assert(Math.abs(mixer.time-25)<1e-9);assert(context.sources.every(s=>s.stopped));
});
test('snapshot preserves project position, volumes, solo and mute',async t=>{
 const {mixer}=fixture(t);mixer.seek(20);mixer.toggleSolo('0');mixer.toggleMute('1');mixer.setTrackVolume('2',55);const restored=fixture(t,[180,180,180],{saved:mixer.snapshot()}).mixer;assert.equal(restored.time,20);assert(restored.tracks[0].solo);assert(restored.tracks[1].muted);assert.equal(restored.tracks[2].volume,55);
});
