import{createDraft,validateDraft,positionKey,assign,detach,notesAt,effectiveEvent,effectivePositionEvent,exportSgf,coordinate,toggleAnnotation,resolveAnchor,exportTrainingCandidates}from'./review-core.mjs?v=20261031-content2';
import{createTreeEditor}from'./review-tree-editor.mjs?v=20261025-layout1';
import{openDraftStore,saveHistory,installHistoryMenu}from'./review-storage.mjs?v=20261031-preserve1';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createReviewEditor({data,current,navigate,stop,refresh,notice}){
 const host=document.getElementById('review-editor'),toggle=document.getElementById('review-toggle');
 let draft=createDraft(data),enabled=false,placing=false,query='',filter='unassigned',limit=50,undo=[],redo=[],storageError=false;
 let marking=false,pendingAnchor=null,markEventId=null;
 let treeEditor=null;
 function displayEvent(e=current()){const shown=treeEditor?.projectRaw(e)??e;return effectivePositionEvent(draft,shown);}
 let store=null,historyTimer=null;
 function archive(record){const write=()=>saveHistory(record).catch(()=>notice('自动历史备份失败，请用“备份修改”另存。'));if(record.reason==='edit'){clearTimeout(historyTimer);historyTimer=setTimeout(write,500);}else void write();}
 try{store=openDraftStore(localStorage,data,{archive,conflict:()=>notice('另一个标签页已有更新：双方版本均已保留，当前修改另存。')});draft=store.draft;if(store.blocked)notice('旧版人工稿已保留，未用新发布内容覆盖；请在“⋯”中备份旧版修改。');}catch(e){storageError=true;notice('无法读取保存的稿件：'+e.message);}
 for(const a of draft.annotations??[])if(a.shape!=='triangle'){a.previousVisualShape??=a.shape;if(a.label)a.previousVisualLabel??=a.label;a.shape='triangle';delete a.label;}
 const toolbar=el('div',undefined,'review-toolbar'),position=el('select');position.setAttribute('aria-label','选择实战或变化局面');
 const positions=new Map();data.events.forEach((e,i)=>{const k=positionKey(e);if(!positions.has(k)&&((!e.branch&&e.kind==='main')||e.branch&&e.step||e.kind==='start'))positions.set(k,{event:e,index:i});});
 for(const[k,{event:e}]of positions){const o=el('option',e.branch?`实战${e.displayMove}后 · ${e.branch} 第${e.step}手 · ${e.color} ${e.coordinate}`:`实战 第${e.displayMove}手`);o.value=k;position.append(o);}
 position.addEventListener('change',()=>navigate(positions.get(position.value).index));toolbar.append(position);
 const pointButton=el('button','改提示点');pointButton.type='button';pointButton.onclick=()=>{placing=!placing;pointButton.textContent=placing?'请点棋盘交叉点':'改提示点';pointButton.setAttribute('aria-pressed',String(placing));};toolbar.append(pointButton);
 const side=el('select');side.setAttribute('aria-label','提示点颜色');side.innerHTML='<option value="B">黑</option><option value="W">白</option>';toolbar.append(side);
 const source=el('div',undefined,'review-source'),sourceLink=el('a','打开原视频 ↗');sourceLink.target='_blank';sourceLink.rel='noopener';sourceLink.href=data.sources.video||'#';
 source.append(sourceLink);const local=el('label','或选择本地原视频 '),mediaInput=el('input');mediaInput.type='file';mediaInput.accept='video/*';local.append(mediaInput);source.append(local);
 const video=el('video');video.controls=true;video.hidden=true;video.preload='metadata';let mediaUrl;
 mediaInput.onchange=()=>{if(!mediaInput.files[0])return;if(mediaUrl)URL.revokeObjectURL(mediaUrl);mediaUrl=URL.createObjectURL(mediaInput.files[0]);video.src=mediaUrl;video.hidden=false;notice('视频仅在本机打开，不上传。');};source.append(video);
 const heading=el('div',undefined,'review-heading'),title=el('strong','当前局面注释'),count=el('span');heading.append(title,count);
 const assigned=el('div',undefined,'review-current');const search=el('input');search.type='search';search.placeholder='搜索备选原话';search.setAttribute('aria-label','搜索备选原话');
 const filters=el('select');filters.setAttribute('aria-label','句子筛选');filters.innerHTML='<option value="unassigned">待匹配</option><option value="all">全部句子</option><option value="framing">开场与收尾</option><option value="excluded">已排除</option>';
 const finder=el('div',undefined,'review-finder');finder.append(search,filters);const pool=el('div',undefined,'review-pool');
 const footer=el('div',undefined,'review-footer'),status=el('span','修改仅保存在此浏览器，导出后可跨电脑继续。','review-status');
 function button(text,action){const b=el('button',text);b.type='button';b.onclick=action;footer.append(b);return b;}
 function persist(){try{if(!store)throw Error('保存未初始化');store.save(draft);storageError=false;status.textContent='已保存到此浏览器';}catch{if(!storageError)notice('浏览器保存失败，请用右上角“⋯ → 备份修改”保存。');storageError=true;status.textContent='浏览器保存失败，请立即备份修改';}}
 function commit(fn){undo.push(JSON.stringify(draft));if(undo.length>40)undo.shift();redo=[];fn();draft.updatedAt=new Date().toISOString();persist();refresh();render();}
 const comment=document.getElementById('comment'),progress=document.getElementById('review-progress');
 const progressText=el('span');progress.append(progressText);progress.title='修改和当前局面自动保存在此浏览器，重新打开本局会回到上次位置。';
 document.getElementById('backup-review').onclick=()=>{download((data.slug||data.id)+'.review.json',JSON.stringify(draft,null,2),'application/json');notice('已下载修改备份；换电脑时可用“恢复修改备份”。');};
 installHistoryMenu({data,store,download,notice,restore:recovered=>commit(()=>draft=structuredClone(recovered))});
 function savePosition(){if(markEventId!==current().id){marking=false;pendingAnchor=null;markEventId=current().id;}draft.bookmark={eventId:current().id,hash:location.hash,savedAt:new Date().toISOString()};try{if(!store)throw Error('保存未初始化');store.saveBookmark(draft.bookmark);}catch{storageError=true;}renderProgress();}
 function renderProgress(){progressText.textContent=storageError?'未保存，请备份修改':'已自动保存在此浏览器';}
 let editing=null;
 window.addEventListener('storage',event=>{if(!store||event.key!==store.key||!event.newValue)return;if(editing){archive({raw:event.newValue,reason:'concurrent-edit',caseId:data.id});notice('其他标签页有修改，已保留对方版本；当前改字另存避免覆盖。');return;}try{const next=store.adoptExternal(event);if(next){draft=next;refresh();render();}}catch{notice('其他标签页版本不同，当前稿保留。');}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&draft.updatedAt)void saveHistory({raw:JSON.stringify(draft),caseId:data.id,reason:'page-hidden'}).catch(()=>{});});
 comment.onfocus=()=>{stop();editing={event:treeEditor.projectRaw(current()),grouped:true,before:JSON.stringify(draft)};if(!displayEvent().text)comment.textContent='';};
 comment.oninput=()=>{if(!editing)return;const e=editing.event,text=comment.innerText.replace(/\r\n?/g,'\n');const placements=draft.placements.filter(p=>editing.grouped?p.position===positionKey(e):p.eventId===e.id);const notes=placements.map(p=>draft.sentences.find(s=>s.id===p.sentenceId));
  if(notes.length){notes[0].text=text;for(const s of notes.slice(1))s.text='';}
  else{const id='user:'+e.id;let s=draft.sentences.find(s=>s.id===id);if(!s){s={id,text,originalText:'',sourceIds:[],section:'commentary',userAdded:true};draft.sentences.push(s);}s.text=text;assign(draft,id,e);}
  draft.reviewedEventIds=(draft.reviewedEventIds??[]).filter(id=>id!==e.id);draft.updatedAt=new Date().toISOString();persist();renderProgress();renderAnnotations();
 };
 comment.onblur=()=>{if(editing&&editing.before!==JSON.stringify(draft)){undo.push(editing.before);redo=[];}editing=null;refresh();};
 const annotationButton=el('button','标注');annotationButton.type='button';annotationButton.setAttribute('aria-label','标注棋盘与解说');progress.before(annotationButton);
 const markBar=el('div',undefined,'annotation-tools'),anchorLabel=el('span'),markList=el('div',undefined,'annotation-list');markBar.hidden=true;markList.hidden=true;comment.before(markBar);comment.after(markList);
 markBar.append(anchorLabel);
 annotationButton.onmousedown=ev=>ev.preventDefault();annotationButton.onclick=()=>{marking=!marking;markEventId=current().id;if(!marking)pendingAnchor=null;else if(!pendingAnchor){const groups=new Map();for(const a of draft.annotations??[]){if(a.eventId!==current().id)continue;const span=resolveAnchor(a,displayEvent().text);if(span)groups.set(span.start+':'+span.end,a.anchor);}if(groups.size===1)pendingAnchor=[...groups.values()][0];}refresh();};
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&marking){marking=false;pendingAnchor=null;refresh();ev.preventDefault();}});
 function captureSelection(){
  const selection=window.getSelection();if(!selection||selection.isCollapsed||comment.contentEditable==='false')return;
  const range=selection.getRangeAt(0);if(!comment.contains(range.startContainer)||!comment.contains(range.endContainer))return;
  const quote=selection.toString().trim();if(!quote||quote.length>2000)return;const text=displayEvent().text,before=range.cloneRange();before.selectNodeContents(comment);before.setEnd(range.startContainer,range.startOffset);
  let start=before.toString().length;if(text.slice(start,start+quote.length)!==quote){start=text.indexOf(quote);if(start<0||text.indexOf(quote,start+1)>=0)return;}
  if(pendingAnchor?.start===start&&pendingAnchor.quote===quote&&markEventId===current().id)return;
  pendingAnchor={quote,start};markEventId=current().id;marking=true;refresh();
 }
 comment.addEventListener('pointerup',captureSelection);comment.addEventListener('keyup',captureSelection);
 function renderAnnotations(){
  const shown=displayEvent(),annotations=shown.annotations??[];markBar.hidden=!marking;annotationButton.setAttribute('aria-pressed',String(marking));annotationButton.textContent=marking?'完成标注':'标注';annotationButton.setAttribute('aria-label',marking?'完成标注':'标注棋盘与解说');anchorLabel.textContent=(pendingAnchor?'“'+pendingAnchor.quote+'” · ':'')+'连续点击棋盘可多选，再点同一点取消；完成后点“完成标注”或直接下一步。';
  markList.replaceChildren();markList.hidden=!annotations.length;
  const groups=new Map();for(const a of annotations){const span=resolveAnchor(a,shown.text),key=span?span.start+':'+span.end:a.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
  for(const group of groups.values()){const a=group[0],chip=el('span',undefined,'annotation-chip'),label=el('span',(a.anchor?'“'+a.anchor.quote+'” → ':'')+(a.anchorStatus==='needs_review'?'请重新关联原话 · ':a.anchorStatus==='unlinked'?'未关联原话 · ':''));if(a.anchorStatus==='linked'){label.title='点击继续标注这一组棋子';label.style.cursor='pointer';label.onmousedown=ev=>ev.preventDefault();label.onclick=()=>{pendingAnchor=a.anchor;marking=true;markEventId=current().id;refresh();};}chip.append(label);for(const point of group){chip.append(el('span',coordinate(point.point)));const remove=el('button','×');remove.type='button';remove.setAttribute('aria-label','删除'+coordinate(point.point)+'标注');remove.onclick=()=>commit(()=>draft.annotations=draft.annotations.filter(n=>n.id!==point.id));chip.append(remove);}markList.append(chip);}
 }
 document.getElementById('candidate-export').onclick=()=>{try{const rows=exportTrainingCandidates(data,draft);download((data.slug||data.id)+'.candidates.jsonl',rows.map(r=>JSON.stringify(r)).join('\n')+'\n','application/x-ndjson');notice('已导出包含文字关联和坐标的待审候选，尚未批准训练。');}catch(e){notice('未导出：'+e.message);}};
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
 const undoButton=button('撤销',()=>{if(!undo.length)return;redo.push(JSON.stringify(draft));draft=JSON.parse(undo.pop());persist();refresh();render();});
 const redoButton=button('重做',()=>{if(!redo.length)return;undo.push(JSON.stringify(draft));draft=JSON.parse(redo.pop());persist();refresh();render();});
 button('导出整理稿',()=>download((data.slug||data.id)+'.review.json',JSON.stringify(draft,null,2),'application/json'));
 const importInput=el('input');importInput.type='file';importInput.accept='.json';importInput.hidden=true;button('导入',()=>importInput.click());
 document.getElementById('restore-review').onclick=()=>importInput.click();
 importInput.onchange=async()=>{try{if(!importInput.files[0])return;const next=validateDraft(JSON.parse(await importInput.files[0].text()),data);commit(()=>draft=next);notice('整理稿已导入，原始发布版本未被覆盖。');}catch(e){notice('未导入：'+e.message);}importInput.value='';};
 button('导出注释谱',()=>{try{download((data.slug||data.id)+'.review.sgf',exportSgf(data,draft),'application/x-go-sgf');}catch(e){notice('未导出：'+e.message);}});
 host.append(toolbar,source,heading,assigned,finder,pool,footer,status,importInput);
 search.oninput=()=>{query=search.value;limit=50;renderPool();};filters.onchange=()=>{filter=filters.value;limit=50;renderPool();};
 function seek(s){const sec=s.globalStart??s.start;if(!Number.isFinite(sec))return;if(mediaUrl){video.currentTime=sec;video.play().catch(()=>{});}else{const url=new URL(data.sources.video);url.searchParams.set('t',Math.max(0,Math.floor(sec))+'s');window.open(url.href,'_blank','noopener');}}
 function card(s,isAssigned){
  const card=el('article',undefined,'review-card'),text=el('textarea');text.value=s.text;text.rows=2;text.setAttribute('aria-label','编辑句子 '+s.id);
  let before;
  text.onfocus=()=>{before=JSON.stringify(draft);};
  text.oninput=()=>{s.text=text.value;const affected=new Set(draft.placements.filter(p=>p.sentenceId===s.id).map(p=>p.eventId));draft.reviewedEventIds=(draft.reviewedEventIds??[]).filter(id=>!affected.has(id));draft.updatedAt=new Date().toISOString();persist();renderProgress();};
  text.onchange=()=>{if(before&&before!==JSON.stringify(draft)){undo.push(before);redo=[];undoButton.disabled=false;redoButton.disabled=true;}};card.append(text);
  const tools=el('div',undefined,'review-card-tools');const action=el('button',isAssigned?'退回备选':'放入当前注释');action.type='button';action.onclick=()=>{const value=text.value;commit(()=>{s.text=value;if(isAssigned)detach(draft,s.id);else{ s.excluded=false;assign(draft,s.id,current());}});};tools.append(action);
  const time=el('button',s.sourceTimeUncertain?'本段 ↗':Number.isFinite(s.globalStart)?'约 '+Math.floor(s.globalStart/60)+':'+String(Math.floor(s.globalStart%60)).padStart(2,'0')+' ↗':'原文');time.type='button';time.onclick=()=>{if(Number.isFinite(s.globalStart))seek(s);else notice(s.originalText);};tools.append(time);
  if(!isAssigned){const excluded=el('button',s.excluded?'恢复':'排除');excluded.type='button';excluded.onclick=()=>commit(()=>{s.excluded=!s.excluded;if(s.excluded)detach(draft,s.id);});tools.append(excluded);}
  card.append(tools);return card;
 }
 function renderPool(){pool.replaceChildren();const placed=new Set(draft.placements.map(p=>p.sentenceId));let candidates=draft.sentences.filter(s=>{
   if(query&&!s.text.includes(query))return false;if(filter==='excluded')return s.excluded;if(s.excluded)return false;
   if(filter==='framing')return s.section==='framing';if(filter==='all')return true;return !placed.has(s.id)&&s.section!=='framing';
  });count.textContent=`待匹配 ${draft.sentences.filter(s=>!s.excluded&&s.section!=='framing'&&!placed.has(s.id)).length}`;
  for(const s of candidates.slice(0,limit))pool.append(card(s,false));if(!candidates.length)pool.append(el('p',filter==='unassigned'?'暂无待匹配句子，可切换“全部句子”重新归属。':'没有符合条件的句子。','review-empty'));
  if(candidates.length>limit){const more=el('button','显示更多句子');more.type='button';more.onclick=()=>{limit+=50;renderPool();};pool.append(more);}
 }
 function render(){renderProgress();renderAnnotations();treeEditor?.render();if(!enabled)return;const e=current();position.value=positionKey(e);side.value=draft.points[positionKey(e)]?.color??e.suggestedColor??e.color??'B';
  title.textContent=e.branch?`${e.branch} · 第${e.step}手的注释`:`实战第${e.displayMove}手的注释`;assigned.replaceChildren();if(e.pointReview==='user_disputed'&&!draft.points[positionKey(e)])assigned.append(el('p','此提示点已被指出有误，请用“改提示点”修正。','review-empty'));const notes=notesAt(draft,e);for(const s of notes)assigned.append(card(s,true));if(!notes.length)assigned.append(el('p','点击下方句子，归入这个局面。','review-empty'));undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;renderPool();
 }
 const dialog=document.getElementById('review-tools-dialog');
 toggle.onclick=()=>{enabled=true;host.hidden=false;toggle.closest('details').open=false;dialog.showModal();render();};
 document.getElementById('close-review-tools').onclick=()=>{placing=false;dialog.close();};
 dialog.addEventListener('close',()=>{if(!placing)enabled=false;toggle.setAttribute('aria-pressed','false');});
 pointButton.addEventListener('click',()=>{if(placing){dialog.close();enabled=true;notice('点击棋盘修正提示点。');}});
 document.getElementById('board').addEventListener('pointerdown',ev=>{if(marking||treeEditor?.editingBoard)ev.preventDefault();});
 document.getElementById('board').addEventListener('click',ev=>{if(!placing&&!marking&&!treeEditor?.editingBoard)return;const svg=ev.target.closest('svg');if(!svg)return;const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;const local=p.matrixTransform(svg.getScreenCTM().inverse());const x=Math.round((local.x-40)/30),y=Math.round((local.y-40)/30);
  if(x<0||x>18||y<0||y>18||Math.hypot(local.x-40-x*30,local.y-40-y*30)>16)return;
  if(marking){try{commit(()=>toggleAnnotation(draft,current(),{point:[x,y],anchor:pendingAnchor}));}catch(e){notice(e.message);}return;}
  if(treeEditor?.clickPoint([x,y]))return;
  if(current().board[y*19+x]!=='.'){notice('该处已有棋子，请选择空交叉点。');return;}
  commit(()=>{draft.points[positionKey(current())]={point:[x,y],color:side.value};draft.reviewedEventIds=(draft.reviewedEventIds??[]).filter(id=>id!==current().id);});placing=false;pointButton.textContent='改提示点';pointButton.setAttribute('aria-pressed','false');notice('提示点已改为'+coordinate([x,y]));
 });
 document.getElementById('board').addEventListener('contextmenu',ev=>{
  ev.preventDefault();
  ev.stopPropagation();
  const svg=ev.target.closest('svg');if(!svg)return;
  const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;
  const local=p.matrixTransform(svg.getScreenCTM().inverse());
  const x=Math.round((local.x-40)/30),y=Math.round((local.y-40)/30);
  if(x<0||x>18||y<0||y>18||Math.hypot(local.x-40-x*30,local.y-40-y*30)>16)return;
  treeEditor?.onBoardContextMenu(ev,[x,y]);
 });
 window.addEventListener('pagehide',()=>{if(mediaUrl)URL.revokeObjectURL(mediaUrl);});
 treeEditor=createTreeEditor({data,draft:()=>draft,commit,refresh,persist,remember:savePosition,current,notice,navigate,stopOtherModes:()=>{marking=false;pendingAnchor=null;placing=false;},undo:()=>undoButton.click(),redo:()=>redoButton.click(),canUndo:()=>!!undo.length,canRedo:()=>!!redo.length,orphanCard:s=>card(s,false)});
 document.getElementById('sgf-download').onclick=ev=>{ev.preventDefault();try{download((data.slug||data.id)+'.review.sgf',exportSgf(data,draft),'application/x-go-sgf');}catch(e){notice(e.message);}};
 return{get enabled(){return enabled;},get marking(){return marking;},get editingBoard(){return treeEditor.editingBoard;},get mainlineChanged(){return treeEditor.mainlineChanged;},get treeSelected(){return treeEditor.selected;},stepTree:d=>treeEditor.step(d),canStepTree:d=>treeEditor.canStep(d),viewEvent:e=>treeEditor.viewEvent(e),sourceNavigation:()=>treeEditor.reset(),sourceDeleted:e=>false,effective:displayEvent,render,rememberCurrent:savePosition,resumeIndex(hash){const b=draft.bookmark;if(!b)return -1;const e=data.events.find(e=>e.id===b.eventId);if(!e)return -1;return !hash||hash===b.hash||!b.hash&&hash==='#'+(e.move||e.displayMove)?data.events.indexOf(e):-1;},get draft(){return draft;}};
}
