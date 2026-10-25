// User-owned review drafts; source data and provenance remain immutable.
export const positionKey=e=>e.branch&&e.step?`b:${e.branch}:${e.step}`:`m:${e.displayMove??e.move??0}`;
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
 return{version:1,caseId:data.id,baseVersion:baseVersion(data),sentences,placements,points:{},humanReview:'in_progress',trainingEligible:false};
}
export function validateDraft(d,data){
 if(d?.version!==1||d.caseId!==data.id||d.baseVersion!==baseVersion(data))throw Error('整理稿与当前棋局版本不匹配；原稿保留，请使用对应版本。');
 const original=createDraft(data),source=new Map(original.sentences.map(s=>[s.id,s]));
 const ids=new Set(),events=new Map(data.events.map(e=>[e.id,e]));
 if(!Array.isArray(d.sentences)||!Array.isArray(d.placements))throw Error('整理稿句子不完整');
 for(const s of d.sentences){const old=source.get(s.id);const added=s.userAdded===true&&s.id.startsWith('user:')&&events.has(s.id.slice(5))&&s.originalText===''&&JSON.stringify(s.sourceIds??[])==='[]';if((!old&&!added)||ids.has(s.id)||typeof s.text!=='string'||s.text.length>20000||old&&(s.originalText!==old.originalText||JSON.stringify(s.sourceIds??[])!==JSON.stringify(old.sourceIds??[])))throw Error('句子或来源记录无效');ids.add(s.id);}
 if([...source.keys()].some(id=>!ids.has(id)))throw Error('整理稿句子不完整');
 if(d.bookmark&&!events.has(d.bookmark.eventId))throw Error('审阅位置无效');
 if(d.reviewedEventIds&&(!Array.isArray(d.reviewedEventIds)||new Set(d.reviewedEventIds).size!==d.reviewedEventIds.length||d.reviewedEventIds.some(id=>!events.has(id))))throw Error('审核记录无效');
 const assigned=new Set();for(const p of d.placements){if(!ids.has(p.sentenceId)||assigned.has(p.sentenceId)||!events.has(p.eventId)||positionKey(events.get(p.eventId))!==p.position)throw Error('归属记录无效');assigned.add(p.sentenceId);}
 const keys=new Set(data.events.map(positionKey));
 for(const [key,v] of Object.entries(d.points??{})){if(!keys.has(key)||!Array.isArray(v.point)||v.point.length!==2||v.point.some(n=>!Number.isInteger(n)||n<0||n>18)||!['B','W'].includes(v.color))throw Error('落点记录无效');const e=data.events.find(e=>positionKey(e)===key);if(e.board[v.point[1]*19+v.point[0]]!=='.')throw Error('提示点不能放到已有棋子上');}
 d.humanReview='in_progress';d.trainingEligible=false;return d;
}
export function assign(d,id,e){if(!d.sentences.some(s=>s.id===id&&!s.excluded))throw Error('句子不可用');const affected=new Set([e.id,...d.placements.filter(p=>p.sentenceId===id).map(p=>p.eventId)]);d.reviewedEventIds=(d.reviewedEventIds??[]).filter(id=>!affected.has(id));d.placements=d.placements.filter(p=>p.sentenceId!==id);d.placements.push({sentenceId:id,position:positionKey(e),eventId:e.id});}
export function detach(d,id){const affected=new Set(d.placements.filter(p=>p.sentenceId===id).map(p=>p.eventId));d.reviewedEventIds=(d.reviewedEventIds??[]).filter(id=>!affected.has(id));d.placements=d.placements.filter(p=>p.sentenceId!==id);}
export function notesAt(d,e){const byId=new Map(d.sentences.map(s=>[s.id,s]));return d.placements.filter(p=>p.position===positionKey(e)).map(p=>byId.get(p.sentenceId)).filter(Boolean);}
export function effectiveEvent(d,e){
 const result={...e},ids=d.placements.filter(p=>p.eventId===e.id).map(p=>p.sentenceId),notes=ids.map(id=>d.sentences.find(s=>s.id===id)).filter(Boolean);
 result.text=notes.map(s=>s.text).join('');result.textEn=notes.map(s=>s.text===(s.baselineText??s.originalText)?s.textEn??'':'').join('');
 if(result.text&&!result.textEn)result.textEn='Translation pending review.';
 const point=d.points[positionKey(e)];if(point){result.suggestedPoint=point.point;result.suggestedColor=point.color;result.color=point.color;result.coordinate=coordinate(point.point);result.kind='pointer';result.last=null;result.marks=[];}
 return result;
}
const escape=s=>String(s).replaceAll('\\','\\\\').replaceAll(']','\\]').replace(/\r\n?/g,'\n');
export function exportSgf(data,draft){
 validateDraft(draft,data);
 const result=({'黑中盘胜':'B+R','白中盘胜':'W+R'})[data.result]??data.result;
 const root={props:`GM[1]FF[4]CA[UTF-8]SZ[19]AP[Tingqi:review]PB[${escape(data.black)}]PW[${escape(data.white)}]DT[${escape(data.date)}]KM[${data.komi??6.5}]RE[${escape(result)}]`,children:[]};
 const main=[root],targets=new Map([['m:0',root]]);let prev=root;
 for(const move of data.mainline){const node={props:`${move.color}[${move.sgf_point}]`,children:[]};prev.children.push(node);main.push(node);targets.set('m:'+move.move_number,node);prev=node;}
 const branches=new Map();
 for(const e of data.events){if(!e.branch||!e.step)continue;if(!branches.has(e.branch))branches.set(e.branch,new Map());branches.get(e.branch).set(e.step,e);}
 for(const [branch,steps] of branches){let parent=main[steps.values().next().value.displayMove];
  if(!parent)throw Error('未知变化父节点');
  for(const [step,e] of [...steps].sort((a,b)=>a[0]-b[0])){const correction=draft.points[positionKey(e)];const point=e.suggestedPoint?(correction?.point??e.suggestedPoint):e.last;
   const color=e.suggestedPoint?(correction?.color??e.suggestedColor):e.color;if(!['B','W'].includes(color)||!point)throw Error('变化缺少已证实落点');
   const node={props:`${color}[${sgfPoint(point)}]`,children:[]};parent.children.push(node);targets.set(`b:${branch}:${step}`,node);parent=node;
  }
 }
 for(const [key,p] of Object.entries(draft.points)){const e=data.events.find(e=>positionKey(e)===key);if(e.suggestedPoint)continue;const node=targets.get(key);if(node)node.props+=`MA[${sgfPoint(p.point)}]`;}
 const grouped=new Map();for(const placement of draft.placements){const s=draft.sentences.find(s=>s.id===placement.sentenceId);if(!s?.text||s.excluded)continue;const n=targets.get(placement.position);if(!n)throw Error('注释目标不存在');if(!grouped.has(n))grouped.set(n,[]);grouped.get(n).push(s.text);}
 for(const [n,texts] of grouped)n.props+=`C[${escape(texts.join('\n'))}]`;
 // A first empty child protects the real mainline when variations start after resignation.
 if(main.at(-1).children.length)main.at(-1).children.unshift({props:'',children:[]});
 const encode=n=>';'+n.props+(n.children.length===1?encode(n.children[0]):n.children.map(c=>'('+encode(c)+')').join(''));
 return '('+encode(root)+')';
}
