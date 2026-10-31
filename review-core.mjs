// User-owned review drafts; source data and provenance remain immutable.
import{buildReviewTree,allTreeEvents,pathTo}from'./review-tree.mjs?v=20261025-treefix8';
export const positionKey=e=>e.userNode?`t:${e.treeNodeId}`:e.branch&&e.step?`b:${e.branch}:${e.step}`:`m:${e.displayMove??e.move??0}`;
export const sgfPoint=p=>p?String.fromCharCode(97+p[0],97+p[1]):'';
export const coordinate=p=>p?'ABCDEFGHJKLMNOPQRST'[p[0]]+(19-p[1]):'pass';
export function baseVersion(data){
 const raw=JSON.stringify([data.id,data.mainline,data.events.map(e=>[e.id,e.text,e.branch,e.step,e.suggestedPoint]),data.reviewSentences]);
 let n=2166136261;for(let i=0;i<raw.length;i++)n=Math.imul(n^raw.charCodeAt(i),16777619);return(n>>>0).toString(16);
}
export function createDraft(data){
 const sentences=[],placements=[];
 if(data.reviewSentences){for(const s of data.reviewSentences)sentences.push({...s,originalText:s.originalText??s.text});}
 else for(const e of data.events){if(!e.text)continue;const id='note:'+e.id;
  sentences.push({id,text:e.text,originalText:e.textVerbatim??e.text,textEn:e.textEn??'',baselineText:e.text,sourceIds:e.sources??[],section:'commentary'});
  placements.push({sentenceId:id,position:positionKey(e),eventId:e.id});
 }
 return{version:1,caseId:data.id,baseVersion:baseVersion(data),sentences,placements,points:{},annotations:[],humanReview:'in_progress',trainingEligible:false};
}
export function validateDraft(d,data){
 if(d?.version!==1||d.caseId!==data.id||d.baseVersion!==baseVersion(data))throw Error('整理稿与当前棋局版本不匹配；原稿保留，请使用对应版本。');
 const original=createDraft(data),source=new Map(original.sentences.map(s=>[s.id,s]));
 if(d.treeOps!==undefined&&!Array.isArray(d.treeOps))throw Error('棋谱修改记录无效');
 const tree=buildReviewTree(data,d.treeOps??[]),ids=new Set(),events=new Map(allTreeEvents(data,d,tree).map(e=>[e.id,e]));
 if(!Array.isArray(d.sentences)||!Array.isArray(d.placements))throw Error('整理稿句子不完整');
 for(const s of d.sentences){const old=source.get(s.id);const added=s.userAdded===true&&s.id.startsWith('user:')&&events.has(s.id.slice(5))&&s.originalText===''&&JSON.stringify(s.sourceIds??[])==='[]';if((!old&&!added)||ids.has(s.id)||typeof s.text!=='string'||s.text.length>20000||old&&(s.originalText!==old.originalText||JSON.stringify(s.sourceIds??[])!==JSON.stringify(old.sourceIds??[])))throw Error('句子或来源记录无效');ids.add(s.id);}
 if([...source.keys()].some(id=>!ids.has(id)))throw Error('整理稿句子不完整');
 if(d.bookmark&&!events.has(d.bookmark.eventId))throw Error('审阅位置无效');
 if(d.reviewedEventIds&&(!Array.isArray(d.reviewedEventIds)||new Set(d.reviewedEventIds).size!==d.reviewedEventIds.length||d.reviewedEventIds.some(id=>!events.has(id))))throw Error('审核记录无效');
 const assigned=new Set();for(const p of d.placements){if(!ids.has(p.sentenceId)||assigned.has(p.sentenceId)||!events.has(p.eventId)||positionKey(events.get(p.eventId))!==p.position)throw Error('归属记录无效');assigned.add(p.sentenceId);}
 const keys=new Set([...events.values()].map(positionKey));
 const annotationIds=new Set();
 if(d.annotations!==undefined&&!Array.isArray(d.annotations))throw Error('棋盘标注格式无效');
 for(const a of d.annotations??[]){const e=events.get(a.eventId);if(!e||!['circle','triangle','square','label'].includes(a.shape)||typeof a.id!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(a.id)||annotationIds.has(a.id)||!Array.isArray(a.point)||a.point.length!==2||a.point.some(n=>!Number.isInteger(n)||n<0||n>18)||a.shape==='label'&&!/^[A-Z]{1,2}$/.test(a.label??''))throw Error('棋盘标注无效');annotationIds.add(a.id);if(a.anchor&&(typeof a.anchor.quote!=='string'||!a.anchor.quote||a.anchor.quote.length>2000||!Number.isInteger(a.anchor.start)||a.anchor.start<0))throw Error('文字关联无效');}
 for(const [key,v] of Object.entries(d.points??{})){if(!keys.has(key)||!Array.isArray(v.point)||v.point.length!==2||v.point.some(n=>!Number.isInteger(n)||n<0||n>18)||!['B','W'].includes(v.color))throw Error('落点记录无效');const e=[...events.values()].find(e=>positionKey(e)===key);if(e.board[v.point[1]*19+v.point[0]]!=='.')throw Error('提示点不能放到已有棋子上');}
 d.humanReview='in_progress';d.trainingEligible=false;return d;
}
export function assign(d,id,e){if(!d.sentences.some(s=>s.id===id&&!s.excluded))throw Error('句子不可用');const affected=new Set([e.id,...d.placements.filter(p=>p.sentenceId===id).map(p=>p.eventId)]);d.reviewedEventIds=(d.reviewedEventIds??[]).filter(id=>!affected.has(id));d.placements=d.placements.filter(p=>p.sentenceId!==id);d.placements.push({sentenceId:id,position:positionKey(e),eventId:e.id});}
export function detach(d,id){const affected=new Set(d.placements.filter(p=>p.sentenceId===id).map(p=>p.eventId));d.reviewedEventIds=(d.reviewedEventIds??[]).filter(id=>!affected.has(id));d.placements=d.placements.filter(p=>p.sentenceId!==id);}
export function notesAt(d,e){const byId=new Map(d.sentences.map(s=>[s.id,s]));return d.placements.filter(p=>p.position===positionKey(e)).map(p=>byId.get(p.sentenceId)).filter(Boolean);}
export function effectiveEvent(d,e){
 const result={...e},ids=d.placements.filter(p=>p.eventId===e.id).map(p=>p.sentenceId),notes=ids.map(id=>d.sentences.find(s=>s.id===id)).filter(Boolean);
 result.text=notes.map(s=>s.text).join('');result.textEn=notes.map(s=>s.text===(s.baselineText??s.originalText)?s.textEn??'':'').join('');
 if(result.text&&!result.textEn)result.textEn='Translation pending review.';
 result.annotations=(d.annotations??[]).filter(a=>a.eventId===e.id).map(a=>({...a,anchorStatus:resolveAnchor(a,result.text)?'linked':a.anchor?'needs_review':'unlinked'}));
 const point=d.points[positionKey(e)];if(point){result.suggestedPoint=point.point;result.suggestedColor=point.color;result.color=point.color;result.coordinate=coordinate(point.point);result.kind='pointer';result.last=null;result.marks=[];}
 return result;
}
// SGF review selects a position, which may have several source utterances/events.
export function effectivePositionEvent(d,e){
 const result=effectiveEvent(d,e),keys=new Set(e.reviewPositionKeys??[positionKey(e)]),occurrence=e.reviewEventIds&&new Set(e.reviewEventIds),placed=d.placements.filter(p=>keys.has(p.position)&&(!occurrence||occurrence.has(p.eventId))),byId=new Map(d.sentences.map(s=>[s.id,s])),notes=placed.map(p=>byId.get(p.sentenceId)).filter(Boolean),eventIds=new Set(placed.map(p=>p.eventId));
 result.text=notes.map(s=>s.text).join('');
 result.textEn=notes.map(s=>s.text===(s.baselineText??s.originalText)?s.textEn??'':'').join('');
 result.annotations=(d.annotations??[]).filter(a=>eventIds.has(a.eventId)||a.eventId===e.id).map(a=>({...a,anchorStatus:resolveAnchor(a,result.text)?'linked':a.anchor?'needs_review':'unlinked'}));
 return result;
}
// A later return to the same board is a new spoken occurrence, not an early
// append to the first visit. Only adjacent clauses belong in one screen.
export function lectureOccurrence(events,e){
 const index=events.findIndex(x=>x.id===e.id);if(index<0)return[e.id];
 const same=x=>x.kind!=='transition'&&positionKey(x)===positionKey(e)&&x.board===e.board&&JSON.stringify(x.suggestedPoint??null)===JSON.stringify(e.suggestedPoint??null);
 let start=index,end=index;while(start>0&&same(events[start-1]))start--;while(end+1<events.length&&same(events[end+1]))end++;
 return events.slice(start,end+1).map(x=>x.id);
}
export function resolveAnchor(annotation,text){
 const a=annotation.anchor;if(!a)return null;
 if(text.slice(a.start,a.start+a.quote.length)===a.quote)return{start:a.start,end:a.start+a.quote.length,quote:a.quote};
 const first=text.indexOf(a.quote);return first>=0&&text.indexOf(a.quote,first+1)<0?{start:first,end:first+a.quote.length,quote:a.quote}:null;
}
export function addAnnotation(d,e,{point,shape='circle',label,anchor=null}){
 if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isInteger(n)||n<0||n>18))throw Error('标注坐标无效');
 if(!['circle','triangle','square','label'].includes(shape)||shape==='label'&&!/^[A-Z]{1,2}$/.test(label??''))throw Error('标注类型无效');
 if(anchor&&(typeof anchor.quote!=='string'||!anchor.quote||anchor.quote.length>2000||!Number.isInteger(anchor.start)||anchor.start<0))throw Error('文字关联无效，请重新选词');
 d.annotations??=[];const text=effectiveEvent(d,e).text;
 if(anchor&&!resolveAnchor({anchor},text))throw Error('选中的原话已变化，请重新选词');
 const old=d.annotations.find(a=>a.eventId===e.id&&a.point.join(',')===point.join(','));
 if(old){old.shape=shape;old.label=label;old.anchor=anchor;old.updatedAt=new Date().toISOString();return old;}
 const a={id:'mark:'+e.id+':'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),eventId:e.id,point:[...point],coordinate:coordinate(point),shape,label,anchor,origin:'human_annotation',createdAt:new Date().toISOString()};
 d.annotations.push(a);return a;
}
export function groundedText(d,e){
 const text=effectiveEvent(d,e).text,groups=new Map();
 for(const a of d.annotations??[]){if(a.eventId!==e.id)continue;const span=resolveAnchor(a,text);if(!span)continue;const key=span.start+':'+span.end;if(!groups.has(key))groups.set(key,{...span,points:new Set()});groups.get(key).points.add(coordinate(a.point));}
 let result=text;for(const s of [...groups.values()].sort((a,b)=>b.end-a.end))result=result.slice(0,s.end)+'（'+[...s.points].join('、')+'）'+result.slice(s.end);
 return result;
}
export function toggleAnnotation(d,e,options){
 const text=effectiveEvent(d,e).text,old=(d.annotations??[]).find(a=>a.eventId===e.id&&a.point.join(',')===options.point.join(','));
 const sameAnchor=old&&old.anchor?.quote===options.anchor?.quote&&(!old.anchor||resolveAnchor(old,text)?.start===resolveAnchor({anchor:options.anchor},text)?.start);
 if(sameAnchor){d.annotations=d.annotations.filter(a=>a.id!==old.id);return false;}
 addAnnotation(d,e,{...options,shape:'triangle'});return true;
}
export function exportTrainingCandidates(data,draft){
 validateDraft(draft,data);
 const tree=buildReviewTree(data,draft.treeOps??[]);
 return allTreeEvents(data,draft,tree).filter(e=>!e.deletedFromTree&&effectiveEvent(draft,e).text).map(e=>{
  const shown=effectiveEvent(draft,e),ps=draft.placements.filter(p=>p.eventId===e.id),notes=ps.map(p=>draft.sentences.find(s=>s.id===p.sentenceId));
  const path=pathTo(tree,e.treeNodeId).filter(n=>n.parent),history=path.filter(n=>n.mainMove!==null).map(n=>({move:n.mainMove,color:n.color,sgfPoint:sgfPoint(n.point)})),variation=path.filter(n=>n.mainMove===null).map((n,i)=>({step:i+1,color:n.color,point:n.point,coordinate:coordinate(n.point),kind:n.pointer?'candidate':'move'}));
  const references=shown.annotations.map(a=>({id:a.id,point:a.point,coordinate:coordinate(a.point),sgfPoint:sgfPoint(a.point),stoneColor:({'b':'B','w':'W'})[e.board[a.point[1]*19+a.point[0]]]??null,shape:a.shape,label:a.label,quote:a.anchor?.quote??null,span:resolveAnchor(a,shown.text),status:a.anchorStatus,origin:a.origin}));
  const groups=new Map();for(const r of references){const key=r.span?r.span.start+':'+r.span.end:r.id;if(!groups.has(key))groups.set(key,{quote:r.quote,span:r.span,status:r.status,coordinates:[],points:[],annotationIds:[]});const g=groups.get(key);g.coordinates.push(r.coordinate);g.points.push(r.point);g.annotationIds.push(r.id);}
  return{version:1,gameGroup:data.gameGroup??data.id,eventId:e.id,position:positionKey(e),input:{board:e.board,displayMove:e.displayMove,mainlineHistory:history,variationHistory:variation},target:{text:shown.text,textGrounded:groundedText(draft,e),references,referenceGroups:[...groups.values()]},provenance:{textVerbatim:notes.map(n=>n.originalText).join(''),utterances:notes.map(n=>({id:n.id,textVerbatim:n.originalText,text:n.text,sourceIds:n.sourceIds??[]})),sourceUtteranceIds:[...new Set(notes.flatMap(n=>n.sourceIds??[]))],source:data.sources,baseVersion:draft.baseVersion},humanReview:'pending',trainingEligible:false};
 });
}
const escape=s=>String(s).replaceAll('\\','\\\\').replaceAll(']','\\]').replace(/\r\n?/g,'\n');
export function exportSgf(data,draft){
 validateDraft(draft,data);const tree=buildReviewTree(data,draft.treeOps??[]),events=allTreeEvents(data,draft,tree),eventMap=new Map(events.map(e=>[e.id,e]));
 const result=tree.mainlineChanged?'':(({'黑中盘胜':'B+R','白中盘胜':'W+R'})[data.result]??data.result);
 const root={props:`GM[1]FF[4]CA[UTF-8]SZ[19]AP[Tingqi:review]PB[${escape(data.black)}]PW[${escape(data.white)}]DT[${escape(data.date)}]KM[${data.komi??6.5}]RE[${escape(result)}]XTE[false]`,children:[]},targets=new Map([[tree.rootId,root]]);
 function build(id){const src=tree.nodes[id];if(src.deleted)return null;const n={props:src.pointer?`MA[${sgfPoint(src.point)}]`:`${src.color}[${sgfPoint(src.point)}]`,children:[]};targets.set(id,n);n.children=src.children.map(build).filter(Boolean);return n;}
 root.children=tree.nodes[tree.rootId].children.map(build).filter(Boolean);
 const notes=new Map(),unmapped=[];
 for(const p of draft.placements){const sentence=draft.sentences.find(s=>s.id===p.sentenceId);if(!sentence?.text||sentence.excluded)continue;const e=eventMap.get(p.eventId),target=e&&!e.deletedFromTree?targets.get(e.treeNodeId):null;if(!target){unmapped.push({sentenceId:sentence.id,text:sentence.text,sourceIds:sentence.sourceIds??[],previousEventId:p.eventId});continue;}if(!notes.has(target))notes.set(target,[]);notes.get(target).push(sentence.text);}
 for(const [n,texts]of notes)n.props+=`C[${escape(texts.join('\n'))}]`;
 if(unmapped.length)root.props+=`XUN[${escape(JSON.stringify(unmapped))}]`;
 for(const [key,p]of Object.entries(draft.points??{})){const e=events.find(e=>positionKey(e)===key);if(!e||e.deletedFromTree)continue;const n=targets.get(e.treeNodeId);if(n)n.props+=`MA[${sgfPoint(p.point)}]`;}
 const visual=new Map();for(const a of draft.annotations??[]){const e=eventMap.get(a.eventId),node=e&&!e.deletedFromTree?targets.get(e.treeNodeId):null;if(!node)continue;if(!visual.has(node))visual.set(node,{CR:new Set(),TR:new Set(),SQ:new Set(),LB:new Set(),XG:[]});const props=visual.get(node),prop=({circle:'CR',triangle:'TR',square:'SQ',label:'LB'})[a.shape];props[prop].add(sgfPoint(a.point)+(a.shape==='label'?':'+a.label:''));props.XG.push(JSON.stringify({eventId:e.id,point:a.point,quote:a.anchor?.quote??null,anchorStatus:resolveAnchor(a,effectiveEvent(draft,e).text)?'linked':a.anchor?'needs_review':'unlinked'}));}
 for(const [node,props]of visual)for(const [key,values]of Object.entries(props))if(values.size||values.length)node.props+=key+[...values].map(v=>'['+escape(v)+']').join('');
 const encode=n=>';'+n.props+(n.children.length===1?encode(n.children[0]):n.children.map(c=>'('+encode(c)+')').join(''));
 return '('+encode(root)+')';
}
