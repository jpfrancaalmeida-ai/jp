(function(root){
'use strict';
class VoiceMixer {
 constructor(tracks,options={}) {
  this.options=options;this.tracks=tracks.map(t=>({...t,volume:options.saved?.tracks?.[t.id]?.volume??80,solo:options.saved?.tracks?.[t.id]?.solo??false,muted:options.saved?.tracks?.[t.id]?.muted??false}));
  this.position=options.saved?.time||0;this.masterVolume=options.saved?.masterVolume??80;this.pitch=options.saved?.pitch||0;
  this.onUpdate=options.onUpdate||(()=>{});this.onError=options.onError||(()=>{});this.generation=0;this.playing=false;this.started=false;this.preparing=false;this.destroyed=false;this.abort=new AbortController();
  this.applyVolumes();this.timer=setInterval(()=>this.update(),150);
 }
 get ready(){return this.tracks.length>0&&this.tracks.every(t=>t.buffer||t.url);}
 get metadataReady(){return this.tracks.length>0&&this.tracks.every(t=>t.buffer);}
 get loadedCount(){return this.tracks.filter(t=>t.buffer).length;}
 get duration(){return Math.max(0,...this.tracks.map(t=>t.buffer?.duration||0));}
 get time(){return Math.min(this.duration||Infinity,this.position+(this.started?Math.max(0,this.context.currentTime-this.scheduledAt):0));}
 get buffering(){return this.preparing;}
 ensureContext(){
  if(this.context)return;
  const Context=root.AudioContext||root.webkitAudioContext;
  if(!Context&&!this.options.contextFactory)throw Error('Este navegador não oferece mixagem de áudio.');
  const ctx=this.context=this.options.contextFactory?this.options.contextFactory():new Context({sampleRate:44100,latencyHint:'interactive'});
  this.bus=ctx.createGain();this.gate=ctx.createGain();this.master=ctx.createGain();
  // Constant headroom prevents clipping without pumping as voices enter or leave.
  this.bus.gain.value=1/this.tracks.length;this.gate.gain.value=0;
  this.bus.connect(this.gate);this.gate.connect(this.master);this.master.connect(ctx.destination);
  for(const t of this.tracks){t.gain=ctx.createGain();t.gain.connect(this.bus);}this.applyVolumes();
  ctx.onstatechange=()=>{if(this.started&&ctx.state!=='running'&&!this.destroyed){this.pause();this.onError('Áudio interrompido pelo dispositivo. Toque em Reproduzir para continuar.');}};
 }
 async prepare(){
  if(this.metadataReady)return;if(this.preparePromise)return this.preparePromise;
  this.preparePromise=(async()=>{
   // Sequential decoding limits temporary memory on phones. Never start a partial mix.
   for(const t of this.tracks){
    if(this.destroyed)return;if(t.buffer)continue;t.loading=true;t.error=null;this.update();
    try{const response=await (this.options.fetch||root.fetch.bind(root))(t.url,{signal:this.abort.signal});if(!response.ok)throw Error('HTTP '+response.status);const bytes=await response.arrayBuffer();if(this.destroyed)return;const buffer=await this.context.decodeAudioData(bytes);if(this.destroyed)return;t.buffer=buffer;}
    catch(error){t.error=error;throw Error('Não foi possível preparar todas as pistas. Toque em Reproduzir para tentar novamente.');}
    finally{t.loading=false;this.update();}
   }
  })();
  try{await this.preparePromise;}finally{this.preparePromise=null;}
 }
 applyVolumes(){const solo=this.tracks.some(t=>t.solo);for(const t of this.tracks){t.effectiveMuted=t.muted||(solo&&!t.solo);if(t.gain)t.gain.gain.setTargetAtTime(t.effectiveMuted?0:t.volume/100,this.context.currentTime,.005);}if(this.master)this.master.gain.setTargetAtTime(this.masterVolume/100,this.context.currentTime,.005);}
 setMasterVolume(v){this.masterVolume=Math.max(0,Math.min(100,Number(v)||0));this.applyVolumes();this.update();}
 setTrackVolume(id,v){const t=this.tracks.find(t=>t.id===id);if(t){t.volume=Math.max(0,Math.min(100,Number(v)||0));this.applyVolumes();this.update();}}
 toggleSolo(id){const t=this.tracks.find(t=>t.id===id);if(t){t.solo=!t.solo;this.applyVolumes();this.update();}}
 toggleMute(id){const t=this.tracks.find(t=>t.id===id);if(t){t.muted=!t.muted;this.applyVolumes();this.update();}}
 async routePitch(value,generation){
  let processor=null;
  if(value){if(!this.options.createPitchProcessor)throw Error('O transpositor ainda está carregando. Tente novamente.');processor=await this.options.createPitchProcessor(this.context);processor.pitchSemitones.setValueAtTime(value,this.context.currentTime);}
  if(this.destroyed||generation!==this.generation){processor?.disconnect();processor?.port?.close();return false;}
  this.bus.disconnect();this.processor?.disconnect();this.processor?.port?.close();this.processor=processor;
  if(processor){this.bus.connect(processor);processor.connect(this.gate);}else this.bus.connect(this.gate);return true;
 }
 async play(){
  if(this.destroyed||this.playing||!this.ready)return;
  const generation=++this.generation;this.playing=true;this.preparing=true;this.update();
  try{
   this.ensureContext();
   // Unlock the single device synchronously in the user's original tap (iOS).
   const unlocked=this.context.resume();await unlocked;await this.prepare();
   if(this.destroyed||generation!==this.generation)return;
   if(!await this.routePitch(this.pitch,generation))return;
   if(this.position>=this.duration)this.position=0;
   const when=this.context.currentTime+.06;this.scheduledAt=when;this.preparing=false;this.started=true;
   this.gate.gain.cancelScheduledValues(this.context.currentTime);this.gate.gain.setValueAtTime(0,this.context.currentTime);this.gate.gain.setValueAtTime(1,when);
   const active=this.tracks.filter(t=>t.buffer.duration>this.position);
   for(const t of active){
    const source=this.context.createBufferSource();source.buffer=t.buffer;source.connect(t.gain);t.source=source;
    source.onended=()=>{if(this.destroyed||generation!==this.generation)return;t.source=null;source.disconnect();if(active.every(track=>!track.source)){this.position=this.duration;this.started=false;this.playing=false;this.gate.gain.value=0;this.update();}};
    source.start(when,this.position);
   }
   this.update();
  }catch(error){if(!this.destroyed&&generation===this.generation){this.pause();this.onError(error.message||'Não foi possível iniciar a mixagem.');}}
 }
 pause(){this.position=this.time;this.generation++;this.playing=false;this.started=false;this.preparing=false;if(this.gate){this.gate.gain.cancelScheduledValues(this.context.currentTime);this.gate.gain.setValueAtTime(0,this.context.currentTime);}for(const t of this.tracks){if(t.source){t.source.onended=null;try{t.source.stop();}catch(_error){}t.source.disconnect();t.source=null;}}this.update();}
 toggle(){return this.playing?this.pause():this.play();}
 seek(v){const resume=this.playing;this.pause();this.position=Math.max(0,Math.min(this.duration,Number(v)||0));this.update();if(resume&&this.position<this.duration)return this.play();}
 async setPitch(v){const next=Math.max(-6,Math.min(6,Number(v)||0)),previous=this.pitch,resume=this.playing;this.pause();this.pitch=next;try{if(this.context&&!resume&&!await this.routePitch(next,this.generation))return;this.update();if(resume)return this.play();}catch(error){this.pitch=previous;this.onError(error.message);if(resume)return this.play();}}
 snapshot(){return {time:this.time,masterVolume:this.masterVolume,pitch:this.pitch,tracks:Object.fromEntries(this.tracks.map(t=>[t.id,{volume:t.volume,solo:t.solo,muted:t.muted}]))};}
 update(){if(!this.destroyed)this.onUpdate(this);}
 destroy(){if(this.destroyed)return;this.pause();this.destroyed=true;clearInterval(this.timer);this.abort.abort();this.processor?.disconnect();this.processor?.port?.close();for(const t of this.tracks){t.gain?.disconnect();t.buffer=null;}this.bus?.disconnect();this.gate?.disconnect();this.master?.disconnect();if(this.context){this.context.onstatechange=null;void this.context.close().catch(()=>{});}}
}
root.PibuVoiceMixer=VoiceMixer;if(typeof module!=='undefined'&&module.exports)module.exports=VoiceMixer;
})(typeof window!=='undefined'?window:globalThis);
