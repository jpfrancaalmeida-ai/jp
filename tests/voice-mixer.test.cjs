const test=require('node:test');
const assert=require('node:assert/strict');
const VoiceMixer=require('../voice-mixer.js');
class Audio extends EventTarget{
 constructor(duration=180){super();this.duration=duration;this.currentTime=0;this.readyState=4;this.paused=true;this.ended=false;this.volume=1;this.muted=false;this.error=null;this.src='audio.mp3';}
 getAttribute(name){return name==='src'?this.src:null;}
 async play(){if(this.rejectPlay)throw Error('play failed');this.paused=false;}
 pause(){this.paused=true;}
}
function fixture(t,durations=[180,180,180]){const audios=durations.map(d=>new Audio(d));const mixer=new VoiceMixer(audios.map((audio,index)=>({id:String(index),audio})));t.after(()=>mixer.destroy());return{mixer,audios};}
test('celular que só carrega metadados após o toque consegue iniciar o áudio',async t=>{
 const{mixer,audios}=fixture(t);audios.forEach(audio=>{audio.readyState=0;audio.duration=NaN;});assert.equal(mixer.ready,true);assert.equal(mixer.metadataReady,false);await mixer.play();assert(audios.every(audio=>!audio.paused));audios[0].dispatchEvent(new Event('waiting'));assert.equal(mixer.buffering,false);audios.forEach(audio=>{audio.readyState=4;audio.duration=180;audio.dispatchEvent(new Event('loadedmetadata'));});assert.equal(mixer.metadataReady,true);assert.equal(mixer.playing,true);
});
test('pausar e retomar preserva a posição de todas as faixas',async t=>{
 const{mixer,audios}=fixture(t);await mixer.play();audios.forEach(a=>a.currentTime=43);mixer.tick();mixer.pause();assert.equal(mixer.time,43);await mixer.play();assert(audios.every(a=>a.currentTime===43&&!a.paused));
});
test('buscar move faixas pausadas e em reprodução para o mesmo instante',async t=>{
 const{mixer,audios}=fixture(t);mixer.seek(70);assert(audios.every(a=>a.currentTime===70&&a.paused));await mixer.play();await mixer.seek(25);assert(audios.every(a=>a.currentTime===25&&!a.paused));
});
test('solo combina seleções, mute tem prioridade e o volume anterior é preservado',async t=>{
 const{mixer,audios}=fixture(t);await mixer.play();audios.forEach(a=>a.currentTime=36);mixer.setTrackVolume('0',65);mixer.toggleSolo('0');assert.deepEqual(audios.map(a=>a.muted),[false,true,true]);mixer.toggleSolo('1');assert.deepEqual(audios.map(a=>a.muted),[false,false,true]);mixer.toggleMute('0');assert(audios[0].muted);mixer.toggleSolo('0');mixer.toggleSolo('1');assert.deepEqual(audios.map(a=>a.muted),[true,false,false]);mixer.toggleMute('0');assert.equal(audios[0].volume,.65*.8);assert(audios.every(a=>!a.paused&&a.currentTime===36));
});
test('volume geral multiplica os volumes individuais e aceita zero',t=>{
 const{mixer,audios}=fixture(t);mixer.setTrackVolume('1',50);mixer.setMasterVolume(40);assert.equal(audios[1].volume,.2);mixer.setTrackVolume('0',0);assert.equal(audios[0].volume,0);mixer.setMasterVolume(0);assert(audios.every(a=>a.volume===0));
});
test('corrige deriva e usa a maior duração sem cortar a última faixa',async t=>{
 const{mixer,audios}=fixture(t,[178,180]);assert.equal(mixer.duration,180);await mixer.play();audios[1].currentTime=80;audios[0].currentTime=79.7;mixer.tick();assert.equal(audios[0].currentTime,80);audios[1].currentTime=180;audios[1].ended=true;mixer.tick();assert.equal(mixer.time,180);assert(!mixer.playing);await mixer.play();assert(audios.every(a=>a.currentTime===0));
});
test('uma falha no início pausa todas, em vez de deixar uma mixagem parcial',async t=>{
 const{mixer,audios}=fixture(t);audios[1].rejectPlay=true;let message='';mixer.onError=m=>message=m;await mixer.play();assert(!mixer.playing);assert(audios.every(a=>a.paused));assert(message.includes('todas as faixas'));
});
test('buffering pausa o conjunto e retoma alinhado quando todas estão prontas',async t=>{
 const{mixer,audios}=fixture(t);await mixer.play();audios.forEach(a=>a.currentTime=50);audios[1].readyState=2;audios[1].dispatchEvent(new Event('waiting'));assert(mixer.buffering);assert(audios.every(a=>a.paused));audios[1].readyState=4;mixer.tick();await Promise.resolve();assert(!mixer.buffering);assert(audios.every(a=>!a.paused&&a.currentTime===50));
});
test('retomar faixas já alinhadas não inicia buscas que causariam buffering em ciclo',async t=>{
 const{mixer,audios}=fixture(t);let seeks=0;for(const audio of audios){let position=0;Object.defineProperty(audio,'currentTime',{get:()=>position,set:value=>{position=value;seeks++;}});}await mixer.play();assert.equal(seeks,0);mixer.waitForTracks();mixer.tick();await Promise.resolve();assert.equal(seeks,0);assert(audios.every(a=>!a.paused));
});
test('destruir durante play pendente impede áudio depois de fechar o modal',async t=>{
 const{mixer,audios}=fixture(t);let release;audios[0].play=()=>new Promise(resolve=>{release=()=>{audios[0].paused=false;resolve();};});const pending=mixer.play();mixer.destroy();release();await pending;assert(audios.every(a=>a.paused));
});
test('transposição é aplicada a todas sem mudar posição, e restaura se falhar',async t=>{
 const{mixer,audios}=fixture(t);const applied=new Map();mixer.applyPitch=async(_audio,id,value)=>{if(id==='1'&&value===3)throw Error('pitch failed');applied.set(id,value);};audios.forEach(a=>a.currentTime=20);await mixer.setPitch(2);assert.equal(mixer.pitch,2);assert.deepEqual([...applied.values()],[2,2,2]);await mixer.setPitch(3);assert.equal(mixer.pitch,2);assert.deepEqual([...applied.values()],[2,2,2]);assert(audios.every(a=>a.currentTime===20));
});
test('snapshot restaura volumes, solo, mute e posição ao editar uma faixa',t=>{
 const{mixer}=fixture(t);mixer.seek(20);mixer.toggleSolo('0');mixer.toggleMute('1');mixer.setTrackVolume('2',55);const saved=mixer.snapshot();const audios=[new Audio(),new Audio(),new Audio()];const restored=new VoiceMixer(audios.map((audio,i)=>({id:String(i),audio})),{saved});t.after(()=>restored.destroy());assert.equal(restored.time,20);assert(audios.every(a=>a.currentTime===20));assert.equal(restored.tracks[2].volume,55);assert(restored.tracks[0].solo);assert(restored.tracks[1].muted);
});
