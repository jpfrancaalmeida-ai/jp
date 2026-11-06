const test=require('node:test'),assert=require('node:assert/strict');
const {applyClassifications,filterSongs,groupSongs,hasCompleteKit}=require('../repertoire.js');
test('classification merge changes only selected fields and retains new / unclassified songs',()=>{
 const original=[{id:'1',title:'Vida aos Sepulcros',category:'musica',tags:['old'],streamLinks:[{url:'original'}],extra:{keep:true}},{id:'2',title:'Hino',category:'hino'},{id:'new',title:'Nova música',chordLink:'new'}];const backup=structuredClone(original);
 const result=applyClassifications(original,[{id:'1',repertoireFrequency:'frequent',worshipStyle:'adoracao'}]);
 assert.deepEqual(original,backup);assert.equal(result.length,3);assert.deepEqual(result[0],{...original[0],repertoireFrequency:'frequent',worshipStyle:'adoracao'});assert.deepEqual(result.slice(1),original.slice(1));
});
test('missing, duplicated or incomplete classifications are rejected before any mutation',()=>{
 const original=[{id:'1',title:'Música'}];const good={id:'1',repertoireFrequency:'occasional',worshipStyle:'celebracao'};
 assert.throws(()=>applyClassifications(original,[{...good,id:'missing'}]));assert.throws(()=>applyClassifications(original,[good,good]));assert.throws(()=>applyClassifications(original,[{...good,worshipStyle:''}]));assert.deepEqual(original,[{id:'1',title:'Música'}]);
});
test('each song belongs to exactly one group; unclassified songs remain visible',()=>{
 const songs=[{id:1,repertoireFrequency:'frequent'},{id:2,repertoireFrequency:'occasional'},{id:3},{id:4,repertoireFrequency:'unknown'}];const groups=groupSongs(songs);assert.deepEqual(groups.frequent.map(s=>s.id),[1]);assert.deepEqual(groups.occasional.map(s=>s.id),[2]);assert.deepEqual(groups.unclassified.map(s=>s.id),[3,4]);assert.equal(Object.values(groups).flat().length,songs.length);
});
test('search includes occasional songs, ignores accents and combines category, key and style',()=>{
 const songs=[{id:1,title:'A Ele A Glória',artist:'Cantora',category:'musica',tom:'F#',worshipStyle:'adoracao',repertoireFrequency:'occasional'},{id:2,title:'Glória',category:'hino',tom:'F#',worshipStyle:'adoracao'}];
 assert.deepEqual(filterSongs(songs,{query:'ele a gloria',key:'F#',style:'adoracao'}).map(s=>s.id),[1]);assert.equal(filterSongs(songs,{query:'cantora',style:'celebracao'}).length,0);assert.deepEqual(filterSongs(songs,{category:'hino'}).map(s=>s.id),[2]);
});
test('kit badge requires every distinct role; duplicates and incomplete uploads do not qualify',()=>{
 const roles=['Solista','Tenor','Contralto','Soprano','Instrumental','Metronomo'];const voices=roles.map(tipo=>({tipo}));assert(hasCompleteKit(voices));assert(hasCompleteKit([...voices,{tipo:'Barítono'}]));assert(!hasCompleteKit(voices.filter(v=>v.tipo!=='Solista')));assert(!hasCompleteKit([...voices.filter(v=>v.tipo!=='Instrumental'),{tipo:'Tenor'},{tipo:'Soprano'}]));assert(!hasCompleteKit(voices.map(v=>v.tipo==='Metronomo'?{...v,uploadComplete:false}:v)));assert(!hasCompleteKit([]));
});
