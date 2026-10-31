import{validateDraft,baseVersion}from'./review-core.mjs?v=20261031-opening4';
const sessions=new Map();
export const localReviewSession=data=>sessions.get(data.id);
export async function prepareLocalReview(storage,data){
 if(!['127.0.0.1','localhost'].includes(location.hostname))return;
 const config=await fetch('/api/review/config').then(r=>r.json());
 if(config.service!=='tingqi-local-review')throw Error('本地审核服务未连接，尚未保存到项目文件');
 const version=baseVersion(data),key='tingqi-review-v1:'+data.id+':version:'+version;
 const response=await fetch('/api/review/'+data.id+'?version='+version).then(r=>r.json());
 let revision=response.revision,queue=Promise.resolve(),timer=null,pending=null,failed=false,generation=0,savedGeneration=0;
 const pendingKey=key+':file-pending',existing=storage.getItem(key);let local,pendingRecord;try{const raw=storage.getItem(pendingKey);pendingRecord=raw&&JSON.parse(raw);local=pendingRecord&&validateDraft(pendingRecord.draft??pendingRecord,data);}catch{}
 if(response.draft&&!local){
  const saved=validateDraft(response.draft,data);
  if(existing&&existing!==JSON.stringify(saved))storage.setItem(key+':before-file-load:'+Date.now(),existing);
  storage.setItem(key,JSON.stringify(saved));
 }
 const notify=()=>window.dispatchEvent(new Event('tingqi-file-save'));
 const session={status:response.revision?'已保存到项目文件':'项目文件保存已连接',save(draft){
  pending=structuredClone(draft);generation++;storage.setItem(pendingKey,JSON.stringify({draft:pending,expectedRevision:revision}));
  session.status='正在保存到项目文件…';notify();clearTimeout(timer);timer=setTimeout(flush,350);
 },get pending(){return generation!==savedGeneration||failed;}};
 function flush(){const saved=pending,serial=generation;if(!saved||failed)return;pending=null;
  queue=queue.then(async()=>{
   if(failed)throw Error('Previous save failed');
   const res=await fetch('/api/review/save',{method:'POST',headers:{'Content-Type':'application/json','X-Tingqi-Token':config.token},body:JSON.stringify({draft:saved,expectedRevision:revision})});
   const answer=await res.json();if(!res.ok)throw Error(answer.error||'写入失败');revision=answer.revision;savedGeneration=serial;
   if(serial===generation){storage.removeItem(pendingKey);session.status='已保存到项目文件';}
  }).catch(()=>{failed=true;session.status='项目文件保存失败，本机草稿仍保留；请保留本页';}).finally(notify);
 }
 window.addEventListener('beforeunload',e=>{if(session.pending){e.preventDefault();e.returnValue='修改尚未写入项目文件';}});
 sessions.set(data.id,session);
 // This also writes the imported online seed once, without user export/import.
 if(local){storage.setItem(key,JSON.stringify(local));
  if(pendingRecord.expectedRevision!==revision){failed=true;session.status='项目文件已有另一版修改；本机未保存稿已保留，未覆盖文件';}
  else session.save(local);
 }
 else if(response.draft&&!response.revision)session.save(response.draft);
}
