(function(root){
  'use strict';
  const frequencyLabels={frequent:'Mais tocadas',occasional:'Ocasionais'};
  const styleLabels={celebracao:'Celebração',adoracao:'Adoração'};
  const requiredVoices=['melodia','tenor','contralto','soprano','instrumental','metronomo'];
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function hasCompleteKit(voices=[]){
    const roles=new Set(voices.filter(voice=>voice.uploadComplete!==false).map(voice=>{const type=normalize(voice.tipo);return type==='solista'?'melodia':type;}));
    return requiredVoices.every(role=>roles.has(role));
  }
  function filterSongs(songs,{category='musica',query='',key='',style=''}={}){
    const search=normalize(query);
    return songs.filter(song=>(song.category||'musica')===category&&(!search||normalize(song.title).includes(search)||normalize(song.artist).includes(search))&&(!key||song.tom===key)&&(!style||song.worshipStyle===style)).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
  }
  function groupSongs(songs){
    return {frequent:songs.filter(song=>song.repertoireFrequency==='frequent'),occasional:songs.filter(song=>song.repertoireFrequency==='occasional'),unclassified:songs.filter(song=>!Object.hasOwn(frequencyLabels,song.repertoireFrequency))};
  }
  function applyClassifications(songs,selections){
    const knownIds=new Set(songs.map(song=>song.id)),changes=new Map();
    for(const item of selections){
      if(!knownIds.has(item.id))throw Error('Música selecionada ausente do catálogo: '+item.id);
      if(changes.has(item.id))throw Error('Seleção duplicada: '+item.id);
      if(!Object.hasOwn(frequencyLabels,item.repertoireFrequency)||!Object.hasOwn(styleLabels,item.worshipStyle))throw Error('Classificação inválida: '+item.id);
      changes.set(item.id,item);
    }
    return songs.map(song=>{const selected=changes.get(song.id);return selected?{...song,repertoireFrequency:selected.repertoireFrequency,worshipStyle:selected.worshipStyle}:song;});
  }
  const api={frequencyLabels,styleLabels,hasCompleteKit,filterSongs,groupSongs,applyClassifications};
  root.PibuRepertoire=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
