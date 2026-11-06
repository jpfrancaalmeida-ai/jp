const test=require('node:test');
const assert=require('node:assert/strict');
const{AssetReader}=require('../asset-reader.js');
const doc=(id,songId)=>({name:'projects/p/databases/(default)/documents/songVoices/'+id,fields:{songId:{stringValue:songId},chunkCount:{integerValue:'8'},uploadComplete:{booleanValue:true},tipo:{stringValue:'Tenor'}}});
test('consulta pública lê documentos paginados sem depender do transporte do SDK',async()=>{
 const urls=[];const reader=new AssetReader({projectId:'p',fetcher:async url=>{urls.push(url);return{ok:true,json:async()=>urls.length===1?{documents:[doc('a','song1')],nextPageToken:'next'}:{documents:[doc('b','song2')]}};}});
 const items=await reader.list('songVoices');assert.equal(items.length,2);assert.equal(items[0].chunkCount,8);assert.equal(items[0].documentBacked,true);assert(urls[1].includes('pageToken=next'));
});
test('consulta de uma música filtra IDs e não mistura áudios de outro repertório',async()=>{
 const reader=new AssetReader({projectId:'p',fetcher:async()=>({ok:true,json:async()=>({documents:[doc('a','song1'),doc('b','song2')]})})});
 const items=await reader.list('songVoices',{songId:'song2'});assert.deepEqual(items.map(item=>item.id),['b']);
});
test('falha HTTP usa a leitura do SDK sem tratar erro como lista vazia',async()=>{
 const reader=new AssetReader({projectId:'p',fetcher:async()=>({ok:false,status:503})});
 const fallback=[{id:'voice',songId:'s'}];assert.deepEqual(await reader.list('songVoices',{sdkRead:async()=>fallback}),fallback);
 await assert.rejects(reader.list('songVoices',{sdkRead:async()=>{throw Error('offline');}}),/offline/);
});
test('consulta autenticada mantém o token apenas no cabeçalho do Firebase',async()=>{
 let request;const reader=new AssetReader({projectId:'p',fetcher:async(url,options)=>{request={url,options};return{ok:true,json:async()=>({})};}});
 assert.deepEqual(await reader.list('songVoices',{token:'test-token'}),[]);assert.equal(request.options.headers.Authorization,'Bearer test-token');assert(!request.url.includes('test-token'));
});
test('fragmentos de áudio podem ser lidos sem streaming do SDK e preservam a ordem informada',async()=>{
 let target;const reader=new AssetReader({projectId:'p',fetcher:async url=>{target=url;return{ok:true,json:async()=>({documents:[{name:'projects/p/databases/(default)/documents/songVoices/v/chunks/0000',fields:{index:{integerValue:'0'},data:{stringValue:'YWJj'}}}]})};}});
 const chunks=await reader.list('songVoices',{assetId:'v'});assert(target.includes('/songVoices/v/chunks?'));assert.equal(chunks[0].index,0);assert.equal(chunks[0].data,'YWJj');
});
