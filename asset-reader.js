(function(root){
  'use strict';
  function decode(value){
    if('stringValue'in value)return value.stringValue;
    if('integerValue'in value)return Number(value.integerValue);
    if('doubleValue'in value)return value.doubleValue;
    if('booleanValue'in value)return value.booleanValue;
    if('nullValue'in value)return null;
    if('timestampValue'in value)return value.timestampValue;
    if('arrayValue'in value)return(value.arrayValue.values||[]).map(decode);
    if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decode(item)]));
    return undefined;
  }
  function deadline(promise,milliseconds){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('A consulta demorou mais que o esperado.')),milliseconds);})]).finally(()=>clearTimeout(timer));}
  class AssetReader{
    constructor({projectId,fetcher=root.fetch.bind(root),timeout=12000}){this.projectId=projectId;this.fetcher=fetcher;this.timeout=timeout;}
    async list(collection,{songId,assetId,token,sdkRead}={}){
      if(!['songVoices','songMaterials'].includes(collection))throw new Error('Coleção inválida.');
      try{
        const documents=[];let pageToken;
        do{
          const suffix=assetId?'/'+encodeURIComponent(assetId)+'/chunks':'';
          const url=new URL(`https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${collection}${suffix}`);
          url.searchParams.set('pageSize','300');
          if(pageToken)url.searchParams.set('pageToken',pageToken);
          const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeout);
          let page;
          try{
            const response=await this.fetcher(url.toString(),{signal:controller.signal,headers:token?{Authorization:'Bearer '+token}:{},cache:'no-store'});
            if(!response.ok)throw new Error('Não foi possível consultar os áudios ('+response.status+').');
            page=await response.json();
          }finally{clearTimeout(timer);}
          for(const doc of page.documents||[]){
            const data=Object.fromEntries(Object.entries(doc.fields||{}).map(([key,value])=>[key,decode(value)]));
            if(!songId||data.songId===songId)documents.push({id:doc.name.split('/').pop(),...data,documentBacked:true});
          }
          pageToken=page.nextPageToken;
        }while(pageToken);
        return documents;
      }catch(error){
        if(!sdkRead)throw error;
        return deadline(Promise.resolve().then(sdkRead),this.timeout);
      }
    }
  }
  root.PibuAssetReader=AssetReader;
  if(typeof module!=='undefined'&&module.exports)module.exports={AssetReader,decode};
})(typeof window!=='undefined'?window:globalThis);
