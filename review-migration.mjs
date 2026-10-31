import{createDraft,validateDraft,baseVersion,positionKey,notesAt}from'./review-core.mjs?v=20261031-content2';
import{buildReviewTree}from'./review-tree.mjs?v=20261025-treefix8';
import{saveHistory}from'./review-storage.mjs?v=20261031-preserve1';

const sourceKey=s=>JSON.stringify([s.originalText,s.sourceIds??[]]);
const boardKey=e=>positionKey(e)+'|'+e.board;
const gameMoves=d=>JSON.stringify(d.mainline.map(m=>[m.color,m.sgf_point]));
const shape=d=>JSON.stringify(Object.values(buildReviewTree(d).nodes).map(n=>[n.id,n.parent,n.color,n.point,n.mainMove]));

// Carry only human changes, not the obsolete machine alignment being repaired.
export function migrateReviewDraft(oldData,data,saved){
 if(oldData.id!==data.id||gameMoves(oldData)!==gameMoves(data))throw Error('实战棋谱不同，禁止自动迁移人工稿');
 const old=validateDraft(structuredClone(saved),oldData),baseline=createDraft(oldData),next=createDraft(data),conflicts=[];
 const sources=new Map();for(const s of next.sentences){const key=sourceKey(s);sources.set(key,[...(sources.get(key)??[]),s]);}
 const oldDefault=new Map(baseline.placements.map(p=>[p.sentenceId,p])),oldPlaced=new Map(old.placements.map(p=>[p.sentenceId,p]));
 const oldWords=new Map(baseline.sentences.map(s=>[s.id,s.text]));
 const oldEvents=new Map(oldData.events.map(e=>[e.id,e])),newByBoard=new Map();
 for(const e of data.events){const k=boardKey(e);if(!newByBoard.has(k)||!newByBoard.get(k).text&&e.text)newByBoard.set(k,e);}
 const changedPositions=new Set();
 for(const e of oldData.events){const notes=notesAt(old,e);if(notes.map(s=>s.text).join('')!==notes.map(s=>oldWords.get(s.id)??'').join(''))changedPositions.add(positionKey(e));}
 const destination=eventId=>{const e=oldEvents.get(eventId);return e&&newByBoard.get(boardKey(e));};
 for(const position of changedPositions){
  const event=oldData.events.find(e=>positionKey(e)===position),dest=event&&destination(event.id),notes=event?notesAt(old,event):[];
  if(!dest||notes.some(s=>!s.userAdded&&(sources.get(sourceKey(s))??[]).length!==1)){conflicts.push('position:'+position);continue;}
  const ids=new Set(next.placements.filter(p=>p.position===positionKey(dest)).map(p=>p.sentenceId));
  for(const s of next.sentences)if(ids.has(s.id))s.text='';
 }
 let carried=0;
 for(const s of old.sentences){
  const placement=oldPlaced.get(s.id),original=oldDefault.get(s.id),positionChanged=JSON.stringify(placement&&[placement.position])!==JSON.stringify(original&&[original.position]);
  const edited=placement?changedPositions.has(placement.position):s.text!==(s.baselineText??s.originalText);
  if(!edited&&!positionChanged&&!s.excluded&&!s.userAdded)continue;
  let target;
  if(s.userAdded){const e=placement&&destination(placement.eventId);if(!e){conflicts.push(s.id);continue;}target={...s,id:'user:'+e.id,originalText:'',sourceIds:[]};if(next.sentences.some(n=>n.id===target.id)){conflicts.push(s.id);continue;}next.sentences.push(target);}
  else{const matches=sources.get(sourceKey(s))??[];if(matches.length!==1){conflicts.push(s.id);continue;}target=matches[0];}
  target.text=s.text;if(s.excluded)target.excluded=true;
  if(placement){const e=destination(placement.eventId);if(!e){conflicts.push(s.id);continue;}next.placements=next.placements.filter(p=>p.sentenceId!==target.id);next.placements.push({sentenceId:target.id,position:positionKey(e),eventId:e.id});}
  else next.placements=next.placements.filter(p=>p.sentenceId!==target.id);
  carried++;
 }
 for(const a of old.annotations??[]){const e=destination(a.eventId);if(e)next.annotations.push({...a,eventId:e.id});else conflicts.push('annotation:'+a.id);}
 for(const[k,v]of Object.entries(old.points??{})){const e=oldData.events.find(e=>positionKey(e)===k),n=e&&newByBoard.get(boardKey(e));if(n)next.points[positionKey(n)]=structuredClone(v);else conflicts.push('point:'+k);}
 if(old.treeOps?.length){if(shape(oldData)===shape(data)){next.treeOps=structuredClone(old.treeOps);next.treeSelection=old.treeSelection;}else conflicts.push('treeOps');}
 if(old.bookmark){const e=destination(old.bookmark.eventId);if(e)next.bookmark={...old.bookmark,eventId:e.id};}
 next.updatedAt=old.updatedAt??new Date().toISOString();next.migratedFrom=old.baseVersion;next.migrationConflicts=conflicts;
 validateDraft(next,data);return{draft:next,carried,conflicts};
}

export async function migrateStoredReview(storage,data,{notice=()=>{}}={}){
 const canonical='tingqi-review-v1:'+data.id,destination=canonical+':version:'+baseVersion(data);
 if(storage.getItem(destination))return;
 for(const from of data.reviewMigration?.from??[]){
  const raw=storage.getItem(canonical+':version:'+from.baseVersion)||storage.getItem(canonical);if(!raw)continue;
  let saved;try{saved=JSON.parse(raw);}catch{continue;}if(saved.baseVersion!==from.baseVersion)continue;
  try{
   if(!/^data\/review-bases\/[A-Za-z0-9_.-]+\.json$/.test(from.url))throw Error('迁移基线地址无效');
   const response=await fetch(from.url,{cache:'no-store'});if(!response.ok)throw Error('旧版对照稿暂不可读');
   const oldData=await response.json();if(baseVersion(oldData)!==from.baseVersion)throw Error('旧版对照稿校验不符');
   const result=migrateReviewDraft(oldData,data,saved);
   // The old keys remain intact even if IndexedDB is unavailable.
   await saveHistory({raw,caseId:data.id,reason:'before-publication-migration'}).catch(()=>{});
   storage.setItem(destination,JSON.stringify(result.draft));
   if(result.carried||saved.annotations?.length)notice('已保留人工修改并接到新版棋局。'+(result.conflicts.length?'部分内容需从自动备份中继续核对。':''));
   return result;
  }catch(e){notice('旧人工稿保留，未强行覆盖：'+e.message);return;}
 }
}
