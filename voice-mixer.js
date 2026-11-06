(function(root){
  'use strict';
  class VoiceMixer {
    constructor(tracks, options={}) {
      this.tracks=tracks.map(track=>({...track,volume:options.saved?.tracks?.[track.id]?.volume??80,solo:options.saved?.tracks?.[track.id]?.solo??false,muted:options.saved?.tracks?.[track.id]?.muted??false}));
      this.time=options.saved?.time||0;
      this.masterVolume=options.saved?.masterVolume??80;
      this.pitch=options.saved?.pitch||0;
      this.onUpdate=options.onUpdate||(()=>{});
      this.onError=options.onError||(()=>{});
      this.applyPitch=options.applyPitch;
      this.playing=false;this.buffering=false;this.destroyed=false;this.generation=0;this.listeners=[];
      for(const track of this.tracks){
        this.listen(track.audio,'loadedmetadata',()=>{this.align(track);if(this.pitch&&this.applyPitch)void this.applyPitch(track.audio,track.id,this.pitch).catch(error=>this.onError(error.message));this.update();});
        this.listen(track.audio,'canplay',()=>this.tick());
        this.listen(track.audio,'waiting',()=>this.waitForTracks());
        this.listen(track.audio,'ended',()=>this.tick());
        this.listen(track.audio,'error',()=>{this.pause();this.onError('Uma faixa não pôde ser carregada. Feche e abra as vozes para tentar novamente.');});
        this.align(track);
      }
      this.applyVolumes();
      if(this.pitch&&this.applyPitch)this.available.filter(t=>t.audio.readyState>=1).forEach(t=>{void this.applyPitch(t.audio,t.id,this.pitch).catch(error=>this.onError(error.message));});
      this.timer=setInterval(()=>this.tick(),150);
      this.update();
    }
    listen(audio,event,handler){audio.addEventListener(event,handler);this.listeners.push([audio,event,handler]);}
    get available(){return this.tracks.filter(t=>t.audio.getAttribute('src')&&!t.audio.error);}
    get duration(){return Math.max(0,...this.available.map(t=>Number.isFinite(t.audio.duration)?t.audio.duration:0));}
    get ready(){return this.available.length>0&&this.available.every(t=>t.audio.readyState>=1);}
    get master(){return this.available.reduce((best,t)=>!best||t.audio.duration>best.audio.duration?t:best,null);}
    align(track){if(track.audio.readyState>=1){try{const target=Math.min(this.time,Number.isFinite(track.audio.duration)?track.audio.duration:this.time);if(Math.abs(track.audio.currentTime-target)>.015)track.audio.currentTime=target;}catch(_error){}}}
    applyVolumes(){
      const solo=this.tracks.some(t=>t.solo);
      this.tracks.forEach(t=>{t.audio.volume=(t.volume/100)*(this.masterVolume/100);t.audio.muted=t.muted||(solo&&!t.solo);});
    }
    setMasterVolume(value){this.masterVolume=Math.max(0,Math.min(100,Number(value)||0));this.applyVolumes();this.update();}
    setTrackVolume(id,value){const track=this.tracks.find(t=>t.id===id);if(!track)return;track.volume=Math.max(0,Math.min(100,Number(value)||0));this.applyVolumes();this.update();}
    toggleSolo(id){const track=this.tracks.find(t=>t.id===id);if(!track)return;track.solo=!track.solo;this.applyVolumes();this.update();}
    toggleMute(id){const track=this.tracks.find(t=>t.id===id);if(!track)return;track.muted=!track.muted;this.applyVolumes();this.update();}
    async play(){
      if(this.destroyed||!this.ready)return;
      const generation=++this.generation;
      if(this.duration&&this.time>=this.duration-.03)this.time=0;
      this.playing=true;this.buffering=false;
      this.tracks.forEach(t=>this.align(t));
      const targets=this.available.filter(t=>!Number.isFinite(t.audio.duration)||this.time<t.audio.duration-.02);
      this.update();
      const results=await Promise.allSettled(targets.map(t=>t.audio.play()));
      if(this.destroyed||generation!==this.generation){if(!this.playing)this.tracks.forEach(t=>t.audio.pause());return;}
      if(results.some(r=>r.status==='rejected')){this.pause();this.onError('Não foi possível iniciar todas as faixas. Toque em Reproduzir para tentar novamente.');return;}
      this.update();
    }
    pause(){
      this.generation++;
      if(this.playing&&!this.buffering&&this.master)this.time=this.master.audio.currentTime;
      this.playing=false;this.buffering=false;this.tracks.forEach(t=>t.audio.pause());this.update();
    }
    toggle(){return this.playing?this.pause():this.play();}
    seek(value){
      const wasPlaying=this.playing;
      this.generation++;this.tracks.forEach(t=>t.audio.pause());
      this.time=Math.max(0,Math.min(this.duration,Number(value)||0));
      this.playing=false;this.buffering=false;this.tracks.forEach(t=>this.align(t));this.update();
      if(wasPlaying&&this.time<this.duration)return this.play();
    }
    waitForTracks(){
      if(!this.playing||this.buffering||this.destroyed)return;
      if(this.master)this.time=this.master.audio.currentTime;
      this.generation++;this.buffering=true;this.tracks.forEach(t=>t.audio.pause());this.update();
    }
    tick(){
      if(this.destroyed)return;
      if(this.buffering){
        if(this.available.every(t=>t.audio.readyState>=3||this.time>=t.audio.duration)){this.buffering=false;void this.play();}
        return;
      }
      if(this.playing&&this.master){
        this.time=this.master.audio.currentTime;
        if(this.master.audio.ended||this.time>=this.duration-.02){this.pause();this.time=this.duration;this.update();return;}
        this.available.forEach(t=>{if(t!==this.master&&!t.audio.ended&&Math.abs(t.audio.currentTime-this.time)>.08)this.align(t);});
      }
      this.update();
    }
    async setPitch(value){
      const next=Math.max(-6,Math.min(6,Number(value)||0));
      const previous=this.pitch;
      if(!this.applyPitch||!this.available.length)return;
      try{await Promise.all(this.available.map(t=>this.applyPitch(t.audio,t.id,next)));if(this.destroyed)return;this.pitch=next;this.update();}
      catch(error){if(this.destroyed)return;await Promise.allSettled(this.available.map(t=>this.applyPitch(t.audio,t.id,previous)));this.onError(error.message||'Não foi possível mudar o tom.');}
    }
    snapshot(){return {time:this.time,masterVolume:this.masterVolume,pitch:this.pitch,tracks:Object.fromEntries(this.tracks.map(t=>[t.id,{volume:t.volume,solo:t.solo,muted:t.muted}]))};}
    update(){if(!this.destroyed)this.onUpdate(this);}
    destroy(){if(this.destroyed)return;this.pause();this.destroyed=true;clearInterval(this.timer);this.listeners.forEach(([audio,event,handler])=>audio.removeEventListener(event,handler));}
  }
  root.PibuVoiceMixer=VoiceMixer;
  if(typeof module!=='undefined'&&module.exports)module.exports=VoiceMixer;
})(typeof window!=='undefined'?window:globalThis);
