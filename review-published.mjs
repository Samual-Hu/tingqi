import{createDraft,validateDraft,baseVersion}from'./review-core.mjs?v=20261031-opening4';
import{saveHistory}from'./review-storage.mjs?v=20261031-preserve1';

const content=d=>JSON.stringify([
 d.sentences.map(s=>[s.id,s.text,!!s.excluded]).sort(),
 d.placements.map(p=>[p.sentenceId,p.position,p.eventId]).sort(),
 d.points??{},d.annotations??[],d.treeOps??[]
]);
function coveredBySnapshot(local,snapshot,baseline){
 const words=new Map(baseline.sentences.map(s=>[s.id,s])),online=new Map(snapshot.sentences.map(s=>[s.id,s]));
 for(const s of local.sentences){const b=words.get(s.id);if(!b||s.text!==b.text||!!s.excluded!==!!b.excluded){const n=online.get(s.id);if(!n||s.text!==n.text||!!s.excluded!==!!n.excluded)return false;}}
 const placed=d=>new Map(d.placements.map(p=>[p.sentenceId,JSON.stringify([p.position,p.eventId])])),before=placed(baseline),after=placed(local),published=placed(snapshot);
 for(const id of new Set([...before.keys(),...after.keys()]))if(before.get(id)!==after.get(id)&&after.get(id)!==published.get(id))return false;
 if((local.annotations??[]).some(a=>!(snapshot.annotations??[]).some(b=>JSON.stringify(a)===JSON.stringify(b))))return false;
 for(const[k,v]of Object.entries(local.points??{}))if(JSON.stringify(v)!==JSON.stringify(snapshot.points?.[k]))return false;
 return !(local.treeOps?.length)||JSON.stringify(local.treeOps)===JSON.stringify(snapshot.treeOps);
}
// An online snapshot seeds a fresh/unedited browser only. Local human edits win.
export function adoptPublishedReview(storage,data,review){
 const saved=validateDraft(structuredClone(review),data),canonical='tingqi-review-v1:'+data.id;
 const key=canonical+':version:'+baseVersion(data),raw=storage.getItem(key)||storage.getItem(canonical);
 if(raw){let local;try{local=validateDraft(JSON.parse(raw),data);}catch{return false;}
  const baseline=createDraft(data);
  if(content(local)!==content(baseline)&&!coveredBySnapshot(local,saved,baseline))return false;
  if(local.bookmark)saved.bookmark=local.bookmark;
 }
 saved.onlineSnapshotRevision=data.publishedReview?.revision;
 storage.setItem(key,JSON.stringify(saved));return true;
}
export async function loadPublishedReview(storage,data,{notice=()=>{}}={}){
 const meta=data.publishedReview;if(!meta)return;
 if(meta.baseVersion!==baseVersion(data))throw Error('线上审核备份与当前棋谱不符，未覆盖本机修改');
 if(!/^data\/review-snapshots\/[A-Za-z0-9_.-]+\.json$/.test(meta.url))throw Error('线上审核备份地址无效');
 const response=await fetch(meta.url,{cache:'no-store'});if(!response.ok)throw Error('线上审核备份暂不可读');
 const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==meta.sha256)throw Error('线上审核备份校验失败，未覆盖本机修改');
 const review=validateDraft(JSON.parse(new TextDecoder().decode(bytes)),data);
 data.onlineReviewDraft=review;
 if(adoptPublishedReview(storage,data,review)){
  await saveHistory({raw:JSON.stringify(review),caseId:data.id,reason:'published-human-snapshot'}).catch(()=>{});
  notice('已载入线上保存的人工修改。');
 }
}
