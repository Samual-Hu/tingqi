import{createDraft,validateDraft,baseVersion}from'./review-core.mjs?v=20261025-treefix8';

export function openDraftStore(storage,data,{archive=()=>{},conflict=()=>{}}={}){
 const canonical='tingqi-review-v1:'+data.id,versionKey=canonical+':version:'+baseVersion(data);
 const legacy=storage.getItem(canonical);
 let key=versionKey,raw=storage.getItem(versionKey)||legacy,draft=createDraft(data),blocked=null;
 if(raw){try{draft=validateDraft(JSON.parse(raw),data);}catch{blocked=raw;archive({raw,reason:'incompatible-version',caseId:data.id});}}
 if(blocked&&storage.getItem(versionKey)===blocked)key=versionKey+':preserved:'+Date.now();
 if(legacy)archive({raw:legacy,reason:'legacy-preserved',caseId:data.id});
 if(raw&&!blocked&&!storage.getItem(key))storage.setItem(key,raw);
 let lastRaw=storage.getItem(key);const bookmarkKey=versionKey+':bookmark';
 try{const b=JSON.parse(storage.getItem(bookmarkKey));if(b&&data.events.some(e=>e.id===b.eventId))draft.bookmark=b;}catch{}
 return{draft,blocked,get key(){return key;},bookmarkKey,
  save(value){
   const latest=storage.getItem(key);
   if(latest!==lastRaw){
    if(latest)archive({raw:latest,reason:'concurrent-tab',caseId:data.id});
    key=versionKey+':concurrent:'+Date.now()+':'+Math.random().toString(36).slice(2);conflict();
   }
   const next=JSON.stringify(value);storage.setItem(key,next);lastRaw=next;archive({raw:next,reason:'edit',caseId:data.id});return key;
  },
  saveBookmark(bookmark){storage.setItem(bookmarkKey,JSON.stringify(bookmark));},
  adoptExternal(event){if(event.key!==key||!event.newValue)return null;const next=validateDraft(JSON.parse(event.newValue),data);lastRaw=event.newValue;return next;}
 };
}
function openHistory(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open('tingqi-review-history',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('snapshots',{keyPath:'id'}).createIndex('caseId','caseId');
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
export async function saveHistory(record){
 const value=JSON.parse(record.raw),revision=value.updatedAt||value.baseVersion||'unknown',db=await openHistory();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');
  tx.objectStore('snapshots').put({...record,id:record.caseId+':'+(value.baseVersion||'unknown')+':'+revision,savedAt:new Date().toISOString(),baseVersion:value.baseVersion});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
export async function readHistory(caseId){
 const db=await openHistory();try{return await new Promise((resolve,reject)=>{
  const r=db.transaction('snapshots').objectStore('snapshots').index('caseId').getAll(caseId);
  r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));r.onerror=()=>reject(r.error);
 });}finally{db.close();}
}
export function installHistoryMenu({data,store,download,restore,notice}){
 const menu=document.getElementById('backup-review').parentElement;
 const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;menu.append(b);};
 if(store?.blocked)button('备份未迁移的旧版修改',()=>download(data.id+'.previous.review.json',store.blocked,'application/json'));
 if(data.onlineReviewDraft){
  button('下载线上审核备份',()=>download(data.id+'.online.review.json',JSON.stringify(data.onlineReviewDraft,null,2),'application/json'));
  button('恢复线上审核备份',()=>{restore(structuredClone(data.onlineReviewDraft));notice('已恢复线上审核备份；原本机版本仍在自动备份中。');});
 }
 button('恢复自动备份',async()=>{try{
  const records=await readHistory(data.id),dialog=document.createElement('dialog');dialog.setAttribute('aria-label','自动备份历史');
  dialog.style.cssText='max-width:680px;width:90vw;max-height:80vh;overflow:auto;padding:20px';
  const h=document.createElement('h2');h.textContent='自动备份历史';dialog.append(h);
  const p=document.createElement('p');p.textContent=records.length?'备份保存在此浏览器。不同发布版本的旧稿可下载保全，不会强行覆盖当前棋局。':'尚无自动历史备份。';dialog.append(p);
  for(const record of records){const row=document.createElement('p');row.textContent=new Date(record.savedAt).toLocaleString()+' · '+record.baseVersion+' ';
   const get=document.createElement('button');get.textContent='下载备份';get.onclick=()=>download(data.id+'.'+record.savedAt.replace(/[:.]/g,'-')+'.review.json',record.raw,'application/json');row.append(get);
   try{const recovered=validateDraft(JSON.parse(record.raw),data),b=document.createElement('button');b.textContent='恢复这一版';b.onclick=()=>{restore(recovered);dialog.close();dialog.remove();};row.append(b);}catch{}
   dialog.append(row);
  }
  const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(close);document.body.append(dialog);dialog.showModal();
 }catch(e){notice('读取自动备份失败：'+e.message);}});
}
