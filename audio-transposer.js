import { SoundTouchNode } from './vendor/soundtouch/SoundTouchNode.js';

const controllers = new Map();
let audioContext = null;
let registerPromise = null;

function context(){
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if(!AudioContextClass) throw new Error('Este navegador não oferece transposição de áudio em tempo real.');
  if(!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

async function ensureRegistered(ctx){
  if(!ctx.audioWorklet) throw new Error('Este navegador não oferece transposição de áudio em tempo real.');
  if(!registerPromise){
    const processorUrl = new URL('./vendor/soundtouch/soundtouch-processor.js', import.meta.url);
    registerPromise = SoundTouchNode.register(ctx, processorUrl).catch(error=>{
      registerPromise = null;
      throw error;
    });
  }
  await registerPromise;
}

async function controllerFor(audio, id){
  const existing = controllers.get(id);
  if(existing?.audio === audio) return existing;
  if(existing) destroy(id);

  const ctx = context();
  await ensureRegistered(ctx);
  const source = ctx.createMediaElementSource(audio);
  const processor = new SoundTouchNode({context:ctx});
  source.connect(processor);
  processor.connect(ctx.destination);
  audio.preservesPitch = false;
  audio.addEventListener('play', ()=>ctx.resume(), {passive:true});
  const controller = {audio, source, processor};
  controllers.set(id, controller);
  return controller;
}

async function setPitch(audio, id, semitones){
  const value = Math.max(-6, Math.min(6, Number(semitones)||0));
  const ctx = context();
  await ctx.resume();
  const controller = await controllerFor(audio,id);
  controller.processor.pitchSemitones.setValueAtTime(value,ctx.currentTime);
}

function destroy(id){
  const controller = controllers.get(id);
  if(!controller) return;
  try{ controller.source.disconnect(); }catch(_error){}
  try{ controller.processor.disconnect(); }catch(_error){}
  controllers.delete(id);
}

function disposeWithin(root){
  if(!root) return;
  root.querySelectorAll('audio[data-transposer-id]').forEach(audio=>destroy(audio.dataset.transposerId));
}

window.PibuTransposer = {setPitch, disposeWithin};
