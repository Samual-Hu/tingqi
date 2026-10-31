import {chapterForMove,curveMoveAtX,scoreLabel,repeatedPrefixIndices,adjacentEvent} from './player-core.mjs?v=20261031-return1';
import {loadPublishedReview} from './review-published.mjs?v=20261031-return1';
import {createReviewEditor} from './review-editor.mjs?v=20261031-return1';
import {migrateStoredReview} from './review-migration.mjs?v=20261031-opening3';
const $=id=>document.getElementById(id);
document.querySelector('.lecture-panel').append(document.querySelector('.analysis'));
document.querySelector('.tools-menu-content').addEventListener('click',event=>{if(event.target.closest('a,button'))document.querySelector('.tools-menu').open=false;});
const appBase=new URL('./',import.meta.url);
const routeParts=location.pathname.slice(appBase.pathname.length).split('/').filter(Boolean);
let language=routeParts.includes('en')||new URL(location.href).searchParams.get('lang')==='en'?'en':'zh';
function caseUrl(item,lang=language,hash=''){const url=new URL(item.slug+'/'+(lang==='en'?'en/':''),appBase);url.hash=hash;return url;}
const t=(zh,en)=>language==='en'?en:zh;
let data,selectedCase,index=0,editor=null;
let skipped=new Set();
const reviewPositionKey=e=>(e.branch&&e.step?[e.branch,e.step]:[null,e.displayMove??e.move??0]).join(':')+JSON.stringify(e.suggestedPoint??null);
function rebuildTimeline(){
 skipped=repeatedPrefixIndices(data.events,e=>{const shown=editor?editor.effective(e):e;return language==='en'?shown.textEn:shown.text;});
 for(let i=1;i<data.events.length;i++)if(reviewPositionKey(data.events[i])===reviewPositionKey(data.events[i-1]))skipped.add(i);
}
function setLanguage(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';$('language').value=language;
 $('source-button').textContent=t('关于本局 ↗','About this game ↗');
 $('previous').setAttribute('aria-label',t('上一步','Previous'));$('next').setAttribute('aria-label',t('下一步','Next'));
 $('key-heading').textContent=t('从关键手看起','Explore key moves');$('key-hint').textContent=t('点击直接跳转','Click to jump');
 $('mode-score').textContent=t('目差','Score');$('mode-winrate').textContent=t('胜率','Win rate');
 $('analysis-hint').textContent=t('点击曲线或手数，查看对应讲解','Click the chart to read a move’s commentary');
 $('sgf-download').textContent=t('下载中文注释谱 ↓','Download English SGF ↓');
 if(selectedCase)$('sgf-download').href=language==='en'?selectedCase.sgf.replace(/\.sgf$/,'.en.sgf'):selectedCase.sgf;
 if(data){rebuildTimeline();renderKeyMoves();render();}
}
let selectedTopic=null;
let mode='score';
const plot={padding:46,width:1100,top:18,bottom:180,min:0,max:100};
function current(){return data.events[index];}
function stop(){}
function say(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').hidden=true;},4200);}
let noticeTimer=0;
function moveTo(next){
 index=Math.max(0,Math.min(data.events.length-1,next));
 history.replaceState(null,'',caseUrl(selectedCase,language,String(current().move||current().displayMove||0)));
 editor?.sourceNavigation?.();
 editor?.rememberCurrent();render();
}
function jumpMove(move){
 const n=Math.max(1,Math.min(data.moveCount,Math.round(move)));
 selectedTopic=n;moveTo(chapterForMove(data,n));
}
function boardSvg(e){
 const N=19,start=40,gap=30;
 const box=$('board').getBoundingClientRect(),scale=620/Math.max(180,Math.min(box.width,box.height));
 const coordFont=Math.max(12,9*scale),markFont=Math.max(12,8*scale);
 $('board').style.setProperty('--board-coord-size',coordFont+'px');
 let grid='',coords='',stones='',stars='';
 if(e.suggestedPoint){const x=start+e.suggestedPoint[0]*gap,y=start+e.suggestedPoint[1]*gap;stones+='<circle class="candidate-point" cx="'+x+'" cy="'+y+'" r="11" fill="none" stroke="#bb613c" stroke-width="2.5"/><path d="M'+(x-5)+' '+y+'h10M'+x+' '+(y-5)+'v10" stroke="#bb613c" stroke-width="1.6"/>';}
 for(let n=0;n<N;n++){
   const p=start+n*gap;
   grid+='<path d="M40 '+p+'H580M'+p+' 40V580"/>';
   const letter='ABCDEFGHJKLMNOPQRST'[n];
   coords+='<text x="'+p+'" y="25">'+letter+'</text><text x="'+p+'" y="604">'+letter+'</text><text x="21" y="'+(p+4)+'">'+(19-n)+'</text><text x="599" y="'+(p+4)+'">'+(19-n)+'</text>';
 }
 for(const row of [3,9,15])for(const col of [3,9,15])stars+='<circle cx="'+(start+col*gap)+'" cy="'+(start+row*gap)+'" r="2.6"/>';
 const marks=new Map((e.marks||[]).map(m=>[m.point.join(','),m]));
 for(let n=0;n<361;n++){
   const color=e.board[n];if(color!== 'b'&&color!=='w')continue;
   const col=n%19,row=Math.floor(n/19),x=start+col*gap,y=start+row*gap;
   stones+='<circle cx="'+x+'" cy="'+(y+1.2)+'" r="13.3" fill="#3b2a15" opacity=".13"/><circle cx="'+x+'" cy="'+y+'" r="13.15" fill="url(#stone-'+color+')" stroke="'+(color==='b'?'#141b1c':'#d2cabc')+'" stroke-width=".6"/>';
   const mark=marks.get(col+','+row);
   if(mark)stones+='<text x="'+x+'" y="'+(y+markFont*.34)+'" fill="'+(color==='b'?'#f7f5e9':'#33413b')+'" font-size="'+markFont+'" text-anchor="middle" font-family="system-ui" font-weight="500">'+mark.number+'</text>';
   else if(e.last&&e.last[0]===col&&e.last[1]===row)stones+='<circle cx="'+x+'" cy="'+y+'" r="5" fill="none" stroke="'+(color==='b'?'#f4f0db':'#335d51')+'" stroke-width="1.5"/>';
 }
 for(const a of e.annotations??[]){const x=start+a.point[0]*gap,y=start+a.point[1]*gap,stroke=' stroke="#c14e2e" stroke-width="2.4" fill="none"';
  if(a.shape==='circle')stones+='<circle cx="'+x+'" cy="'+y+'" r="11"'+stroke+'/>';
  else if(a.shape==='triangle')stones+='<path d="M'+x+' '+(y-12)+'L'+(x+11)+' '+(y+8)+'H'+(x-11)+'Z"'+stroke+'/>';
  else if(a.shape==='square')stones+='<rect x="'+(x-10)+'" y="'+(y-10)+'" width="20" height="20"'+stroke+'/>';
  else stones+='<text x="'+x+'" y="'+(y+5)+'" text-anchor="middle" font-size="15" font-weight="700" fill="#bd4c2d" stroke="#fffaf1" stroke-width=".8" paint-order="stroke">'+a.label+'</text>';
 }
 if(editor?.marking)for(let n=0;n<361;n++){const x=n%19,y=Math.floor(n/19),name='ABCDEFGHJKLMNOPQRST'[x]+(19-y),color=e.board[n]==='w'?'白棋':e.board[n]==='b'?'黑棋':'空点';stones+='<circle data-mark-point="'+x+','+y+'" role="button" aria-label="标注 '+name+' '+color+'" cx="'+(start+x*gap)+'" cy="'+(start+y*gap)+'" r="14" fill="transparent" style="cursor:crosshair;pointer-events:all"/>';}
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 620" role="img" aria-label="只读棋盘，实战第'+e.displayMove+'手'+(e.branch?'，变化第'+e.step+'手':'')+'" data-segment="'+e.id+'" data-topic="'+e.move+'" data-position="'+e.displayMove+'"><defs><linearGradient id="wood" x2=".9" y2="1"><stop stop-color="#e8c78d"/><stop offset=".5" stop-color="#e6c38b"/><stop offset="1" stop-color="#dbb579"/></linearGradient><radialGradient id="stone-b" cx="32%" cy="24%" r="80%"><stop stop-color="#565e5e"/><stop offset=".45" stop-color="#242d2f"/><stop offset="1" stop-color="#0d1418"/></radialGradient><radialGradient id="stone-w" cx="34%" cy="26%" r="82%"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#faf9f3"/><stop offset="1" stop-color="#dedbd0"/></radialGradient><pattern id="grain" width="43" height="37" patternUnits="userSpaceOnUse"><path d="M2 0q2 11 0 37M12 0q-2 14 1 37M29 0q3 21 0 37M40 0q-3 17 0 37" fill="none" stroke="#735029" stroke-width=".4" opacity=".06"/></pattern></defs><rect x="10" y="11" width="600" height="600" rx="7" fill="#4d3515" opacity=".08"/><rect x="10" y="8" width="600" height="600" rx="7" fill="url(#wood)"/><rect x="10" y="8" width="600" height="600" rx="7" fill="url(#grain)"/><g stroke="#795d35" stroke-width=".8" fill="none" opacity=".85">'+grid+'</g><g fill="#765d37">'+stars+'</g><g fill="#927345" font-size="11" font-family="system-ui" text-anchor="middle">'+coords+'</g>'+stones+'</svg>';
}
function render(){
 const e=editor?editor.effective(current()):current(),side=e.color==='B'?'黑':'白';
 if(selectedTopic&&(e.kind==='review'||e.kind==='finish'||e.kind==='main'&&e.move>selectedTopic))selectedTopic=null;
 $('board').innerHTML=boardSvg(e);
 $('board-move').textContent=e.branch?'以实战 '+e.displayMove+' 手为起点':e.displayMove+' / '+data.moveCount;
 $('board-context').textContent=e.branch?'讲解变化 '+e.branch.slice(1).replace(/^0/,''):e.kind==='review'?'终局回顾':e.kind==='context'?'实战 '+e.displayMove+' · 回看 '+e.move:e.label||'实战';
 const isVariation=!!e.branch;
 $('segment-badge').textContent=isVariation?'变化':e.kind==='review'?'回顾':e.kind==='context'?'局面':e.kind==='start'?'准备开始':e.kind==='finish'?'终局':'实战';
 $('segment-badge').classList.toggle('variation',isVariation);
 $('segment-label').textContent=isVariation?side+' '+e.coordinate+' · 变化 '+e.step+' / '+e.branchLength:e.move?'第'+e.move+'手 · '+side+' '+e.coordinate:'按讲解顺序';
 let text=language==='en'?e.textEn:e.text;
 if(!text)text=e.kind==='start'?t('用上一步、下一步查看实战与变化；点击文字即可修改。','Follow the commentary through the game and its variations.'):e.kind==='finish'?t('这一盘讲解已结束。','End of this lecture.'):e.kind==='transition'?t(e.label||'切换变化','Switching position'):t('这一手没有单独解说。','No separate comment on this move.');
 if(document.activeElement!==$('comment'))$('comment').textContent=text;
 $('comment').contentEditable=language==='zh'?'plaintext-only':'false';
 $('comment').style.color=e.text?'':'#8d958c';
 $('segment-detail').textContent=e.kind==='start'?'用上一步、下一步或方向键查看讲解。':isVariation?'对应实战第'+e.move+'手的比较变化。图表始终显示实战曲线。':e.kind==='context'?(e.displayMove===e.move?'这一阶段的局面讲解。':'当前棋盘是第'+e.displayMove+'手，讲解指向第'+e.move+'手。'):e.kind==='finish'?'可以点击目差曲线，重新查看任意一手。':e.kind==='review'?'按讲解顺序回看这手棋。':'';
 $('previous').disabled=index===0;$('next').disabled=index===data.events.length-1;
 if(selectedTopic&&e.move!==selectedTopic&&e.kind==='main')$('segment-detail').textContent='正在播放第'+selectedTopic+'手的完整讲解，先看相关局面。';
 if(language==='en'){
  $('board-context').textContent=e.branch?'Variation '+e.branch:e.kind==='review'?'Review':'Game';
  $('board-move').textContent=e.branch?'From game move '+e.displayMove:e.displayMove+' / '+data.moveCount;
  $('segment-badge').textContent=isVariation?'Variation':e.kind==='review'?'Review':e.kind==='context'?'Position':e.kind==='start'?'Ready':e.kind==='finish'?'Finished':'Game';
  $('segment-label').textContent=isVariation?(e.color==='B'?'Black':'White')+' '+e.coordinate+' · '+e.step+' / '+e.branchLength:e.move?'Move '+e.move+' · '+(e.color==='B'?'Black':'White')+' '+e.coordinate:'Lecture order';
  $('segment-detail').textContent=isVariation?'Comparison for game move '+e.move+'. The chart always shows the actual game.':e.kind==='context'&&e.displayMove!==e.move?'Showing move '+e.displayMove+'; discussing move '+e.move+'.':e.kind==='review'?'Returning to an earlier move in lecture order.':'';
 }
 document.querySelectorAll('#key-moves button').forEach(b=>b.classList.toggle('active',Number(b.dataset.move)===(selectedTopic??e.move)));
 if(e.kind==='pointer'){$('board-context').textContent=t('落点比较','Candidate point');$('segment-badge').textContent=t('落点比较','Candidate point');$('segment-label').textContent=(language==='en'?(e.color==='B'?'Black':'White'):side)+' '+e.coordinate;$('segment-detail').textContent=t('讲解所指的候选落点，棋盘保持在比较前的局面。','The highlighted point is a suggestion; the board remains at the position being discussed.');}
 renderChart();editor?.render();
}
function renderKeyMoves(){
 $('key-moves').innerHTML=data.keyMoves.map(m=>'<button type="button" data-move="'+m.move+'" aria-label="'+t('查看第'+m.move+'手讲解','Read commentary for move '+m.move)+'"><span class="key-primary"><i class="stone-dot '+(m.color==='B'?'black':'white')+'"></i>'+m.move+' <span>· '+m.coordinate+'</span></span><span class="key-loss">'+(Number.isFinite(m.pointsLoss)&&m.pointsLoss>=.05?'−'+m.pointsLoss.toFixed(1)+t('目',' pts'):t('看这一手','Read move'))+'</span></button>').join('');
 document.querySelectorAll('#key-moves button').forEach(button=>button.addEventListener('click',()=>jumpMove(Number(button.dataset.move))));
}
function pointX(n){return plot.padding+n/data.moveCount*(plot.width-plot.padding*2);}
function pointY(value){return plot.bottom-(value-plot.min)/(plot.max-plot.min)*(plot.bottom-plot.top);}
function renderChart(){
 if(!data)return;
 const svg=$('chart');plot.width=Math.max(240,svg.clientWidth||1100);plot.height=Math.max(100,Math.round(svg.clientHeight||210));plot.top=18;plot.bottom=plot.height-30;
 if(!data.curve?.length){
   const n=Math.max(1,current().move||1),x=pointX(n);
   const ticks=[...new Set([1,...Array.from({length:Math.floor(data.moveCount/30)},(_,i)=>(i+1)*30),data.moveCount])];
   const center=Math.round(plot.height/2);
   svg.innerHTML='<path class="chart-grid" d="M'+plot.padding+' '+center+'H'+(plot.width-plot.padding)+'"/>'+ticks.map(m=>'<text class="chart-axis-label" text-anchor="middle" x="'+pointX(m)+'" y="'+(plot.height-6)+'">'+m+'</text>').join('')+data.keyMoves.map(m=>'<circle class="chart-loss" cx="'+pointX(m.move)+'" cy="'+center+'" r="3.4" data-move="'+m.move+'"><title>第'+m.move+'手的讲解</title></circle>').join('')+'<text class="chart-axis-label" text-anchor="middle" x="'+plot.width/2+'" y="35">暂无可复用的形势曲线 · 可按手数跳转</text><path class="chart-cursor" d="M'+x+' '+(center-20)+'V'+(plot.bottom+6)+'"/><circle class="chart-current" cx="'+x+'" cy="'+center+'" r="4.2"/>';
   svg.setAttribute('viewBox','0 0 '+plot.width+' '+plot.height);svg.setAttribute('aria-valuenow',String(n));svg.setAttribute('aria-valuetext','第'+n+'手');
   $('chart-heading').textContent='实战手数';$('evaluation').textContent='第'+n+'手';
   document.querySelector('.chart-modes').hidden=true;
   return;
 }
 document.querySelector('.chart-modes').hidden=false;
 const values=data.curve.map(p=>mode==='score'?p.black_score_lead_points:p.black_winrate_percent);
 plot.min=mode==='score'?Math.min(-3,Math.floor(Math.min(...values)*1.2)):0;
 plot.max=mode==='score'?Math.max(10,Math.ceil(Math.max(...values)*1.08/10)*10):100;
 const coords=data.curve.map((p,i)=>[pointX(p.move_number),pointY(values[i])]);
 const d=coords.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' ');
 const zero=pointY(mode==='score'?0:50),n=Math.max(1,current().move||1),active=data.curve[n-1];
 const currentX=pointX(n),currentY=pointY(values[n-1]);
 let markup='<defs><linearGradient id="curve-fill" x2="0" y2="1"><stop stop-color="#2d6662" stop-opacity=".15"/><stop offset="1" stop-color="#2d6662" stop-opacity=".02"/></linearGradient></defs>';
 const firstTick=Math.ceil(plot.min/10)*10,tickValues=mode==='score'?Array.from({length:Math.floor((plot.max-firstTick)/10)+1},(_,i)=>firstTick+i*10):[0,25,50,75,100];
 for(const value of tickValues){const y=pointY(value),label=mode==='score'?(value===0?'0':value>0?'黑+'+value:'白+'+Math.abs(value)):value+'%';markup+='<path class="chart-grid" d="M'+plot.padding+' '+y+'H'+(plot.width-plot.padding)+'"/><text class="chart-axis-label" x="0" y="'+(y+4)+'">'+label+'</text>';}
 markup+='<path d="'+d+'L'+coords.at(-1)[0]+' '+zero+'L'+coords[0][0]+' '+zero+'Z" fill="url(#curve-fill)"/><path class="chart-line" d="'+d+'"/>';
 for(const move of [...new Set([1,...Array.from({length:Math.floor(data.moveCount/30)},(_,i)=>(i+1)*30),data.moveCount])])markup+='<text class="chart-axis-label" text-anchor="middle" x="'+pointX(move)+'" y="'+(plot.height-6)+'">'+move+'</text>';
 for(const m of data.keyMoves){
   const p=data.curve[m.move-1],v=mode==='score'?p.black_score_lead_points:p.black_winrate_percent;
   markup+='<circle class="chart-loss" cx="'+pointX(m.move)+'" cy="'+pointY(v)+'" r="3.4" data-move="'+m.move+'"><title>'+t('第'+m.move+'手','Move '+m.move)+' '+m.coordinate+(Number.isFinite(m.pointsLoss)?t('，损失'+m.pointsLoss+'目',', loss '+m.pointsLoss+' pts'):'')+'</title></circle>';}
 markup+='<path class="chart-cursor" d="M'+currentX+' 8V'+(plot.bottom+6)+'"/><circle class="chart-current" cx="'+currentX+'" cy="'+currentY+'" r="4.2"/>';
 svg.innerHTML=markup;svg.setAttribute('viewBox','0 0 '+plot.width+' '+plot.height);
 svg.setAttribute('aria-valuenow',String(n));svg.setAttribute('aria-valuetext','第'+n+'手，'+(mode==='score'?scoreLabel(active.black_score_lead_points):'黑方胜率'+active.black_winrate_percent.toFixed(1)+'%'));
 $('chart-heading').textContent=mode==='score'?t('整局目差','Game score lead'):t('整局胜率','Game win rate');
 $('evaluation').textContent=current().move?(mode==='score'?t(scoreLabel(active.black_score_lead_points),(active.black_score_lead_points>=0?'Black +':'White +')+Math.abs(active.black_score_lead_points).toFixed(1)+' pts'):t('黑方 ','Black ')+active.black_winrate_percent.toFixed(1)+'%'):t('黑方视角','Black’s perspective');
 $('mode-score').setAttribute('aria-pressed',String(mode==='score'));$('mode-winrate').setAttribute('aria-pressed',String(mode==='winrate'));
}
function chartMove(event){
 const tagged=event.target.closest('[data-move]');
 if(tagged)return Number(tagged.dataset.move);
 const rect=$('chart').getBoundingClientRect();
 return curveMoveAtX(event.clientX-rect.left,rect.width,data.moveCount,plot.padding);
}
function hoverChart(event){
 const n=chartMove(event),m=data.curve[n-1],ref=data.mainline[n-1],rect=$('chart-wrap').getBoundingClientRect();
 const tooltip=$('chart-tooltip');
 tooltip.textContent=t('第'+n+'手 · '+(ref.color==='B'?'黑':'白'),'Move '+n+' · '+(ref.color==='B'?'Black':'White'))+' '+ref.coordinate+'\n'+(m?t(scoreLabel(m.black_score_lead_points),(m.black_score_lead_points>=0?'Black +':'White +')+Math.abs(m.black_score_lead_points).toFixed(1)+' pts')+t(' · 黑方胜率 ',' · Black win rate ')+m.black_winrate_percent.toFixed(1)+'%':t('点击查看对应讲解','Click to read the commentary'));
 tooltip.style.whiteSpace='pre-line';tooltip.hidden=false;
 tooltip.style.left=Math.min(rect.width-tooltip.offsetWidth-2,Math.max(0,event.clientX-rect.left-tooltip.offsetWidth/2))+'px';
}
$('previous').addEventListener('click',()=>{selectedTopic=null;moveTo(adjacentEvent(data.events,index,-1,skipped));});
$('next').addEventListener('click',()=>{selectedTopic=null;moveTo(adjacentEvent(data.events,index,1,skipped));});
$('language').addEventListener('change',()=>{language=$('language').value;history.replaceState(null,'',caseUrl(selectedCase,language,location.hash));setLanguage();});
$('chart').addEventListener('click',event=>{if(data)jumpMove(chartMove(event));});
$('chart').addEventListener('pointermove',event=>{if(data)hoverChart(event);});
$('chart').addEventListener('pointerleave',()=>{$('chart-tooltip').hidden=true;});
$('chart').addEventListener('keydown',event=>{
 if(!data)return;let n=current().move||1;
 if(event.key==='ArrowRight')n++;else if(event.key==='ArrowLeft')n--;else if(event.key==='Home')n=1;else if(event.key==='End')n=data.moveCount;else return;
 event.preventDefault();jumpMove(n,false);
});
$('mode-score').addEventListener('click',()=>{mode='score';renderChart();});
$('mode-winrate').addEventListener('click',()=>{mode='winrate';renderChart();});
$('source-button').addEventListener('click',()=>$('source-dialog').showModal());
$('close-source').addEventListener('click',()=>$('source-dialog').close());
$('source-dialog').addEventListener('click',event=>{if(event.target===$('source-dialog')){const r=$('source-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('source-dialog').close();}});
document.addEventListener('keydown',event=>{
 if(!data||$('source-dialog').open||$('review-tools-dialog').open||document.querySelector('.tools-menu').open||event.target.closest('input,textarea,select,[contenteditable],[role=slider]'))return;
 if(event.key==='ArrowRight'){event.preventDefault();moveTo(adjacentEvent(data.events,index,1,skipped));}
 else if(event.key==='ArrowLeft'){event.preventDefault();moveTo(adjacentEvent(data.events,index,-1,skipped));}
});
new ResizeObserver(()=>renderChart()).observe($('chart-wrap'));
new ResizeObserver(()=>{if(data)$('board').innerHTML=boardSvg(editor?editor.effective(current()):current());}).observe($('board'));
window.addEventListener('hashchange',()=>{const match=location.hash.match(/^#(?:move=)?(\d+)$/);if(data&&match){selectedTopic=Number(match[1]);moveTo(chapterForMove(data,selectedTopic),false);}});
try{
 const libraryResponse=await fetch('data/cases.json',{cache:'no-store'});if(!libraryResponse.ok)throw new Error('cases');
 const library=await libraryResponse.json();
 const requested=new URL(location.href).searchParams.get('case')||routeParts[0]||library.defaultCase;
 const selected=library.cases.find(c=>c.id===requested||c.slug===requested);
 if(!selected)throw new Error('Unknown lecture case');
 selectedCase=selected;
 const selector=$('case-select');selector.replaceChildren();
 for(const item of library.cases){const option=document.createElement('option');option.value=item.id;option.textContent=item.title;option.selected=item.id===selected.id;selector.append(option);}
 selector.addEventListener('change',()=>{location.href=caseUrl(library.cases.find(c=>c.id===selector.value)).href;});
 const response=await fetch(selected.data,{cache:'no-store'});if(!response.ok)throw new Error('data');
 data=await response.json();
 await migrateStoredReview(localStorage,data,{notice:say});
 try{await loadPublishedReview(localStorage,data,{notice:say});}catch(e){say(e.message);}
 const hasEnglish=selected.languages?.includes('en')??data.translation?.status==='complete';
 $('language').hidden=!hasEnglish;if(!hasEnglish)language='zh';
 editor=createReviewEditor({data,current,navigate:i=>moveTo(i,false),stop,refresh:()=>{rebuildTimeline();render();},notice:say});
 document.title='听棋 · '+data.black+'与'+data.white;
 $('black-name').textContent=data.black;$('white-name').textContent=data.white;
 $('game-event').textContent=data.event;$('game-date').textContent=data.date.replaceAll('-','.');
 $('game-result').textContent=data.result+' · '+data.moveCount+'手'+(data.komiVerified===false?' · 贴目待核实':Number.isFinite(data.komi)?' · 黑贴'+data.komi+'目':'');
 $('chart').setAttribute('aria-valuemax',String(data.moveCount));
 $('analysis-description').textContent=data.sources.analysisDescription||(data.curve?.length?'Kifubara已有的KataGo分析，b18网络，每手2,500次访问。图表为黑方视角，正目差表示黑棋领先。':'暂无与本局逐手核对的公开分析数据。下方按实战手数跳转，不显示估算胜率。');
 $('analysis-credit').textContent=data.curve?.length?'实战手数 · KataGo / '+(data.sources.visits||2500)+' visits':'实战手数 · 原话讲解';
 $('analysis-hint').textContent=data.curve?.length?'点击曲线，查看这一手的讲解':'点击手数，查看这一手的讲解';
 for(const [id,url] of [['analysis-source',data.sources.analysis],['game-source',data.sources.game],['lecture-source',data.sources.video],['sgf-download',selected.sgf]]){const link=$(id);link.hidden=!url;if(url)link.href=url;}
 $('coverage').textContent=data.moveCount+'手实战、'+data.annotationCount+'段原话、'+data.variationCount+'条已核对变化。'+data.sources.coverage;
 setLanguage();
 const match=location.hash.match(/^#(?:move=)?(\d+)$/);
 const resume=editor.resumeIndex(location.hash);
 if(resume>=0)index=resume;else if(match){selectedTopic=Number(match[1]);index=chapterForMove(data,selectedTopic);}
 history.replaceState(null,'',caseUrl(selected,language,String(current().move||current().displayMove||0)));editor.rememberCurrent();render();
 $('video-link').href=data.sources.video||'#';$('video-link').hidden=!data.sources.video;
}catch(error){
 $('board').innerHTML='<p class="loading" role="alert">棋局暂时未能打开，请刷新重试。</p>';
 $('comment').textContent='暂时未能载入这盘讲棋。';
 $('segment-detail').textContent='请检查网络后刷新页面。';
 console.error('Lecture loading failed',error);
}
