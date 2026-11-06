import { SoundTouchNode } from './vendor/soundtouch/SoundTouchNode.js';
const registrations=new WeakMap();
async function createBus(context){
 if(!context.audioWorklet)throw new Error('Este navegador não oferece transposição de áudio em tempo real.');
 if(!registrations.has(context)){
  const url=new URL('./vendor/soundtouch/soundtouch-processor.js',import.meta.url);
  registrations.set(context,SoundTouchNode.register(context,url).catch(error=>{registrations.delete(context);throw error;}));
 }
 await registrations.get(context);
 return new SoundTouchNode({context});
}
window.PibuTransposer={createBus};
