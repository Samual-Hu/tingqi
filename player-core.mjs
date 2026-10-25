export function formatTime(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
export function indexAtTime(events,time){let lo=0,hi=events.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(events[mid].start<=time)lo=mid;else hi=mid-1;}return lo;}
export function chapterForMove(data,move){const n=Math.max(1,Math.min(data.moveCount,Math.round(move)));return Number(data.chapters[String(n)]??data.firstMain[String(n)]??0);}
export function curveMoveAtX(x,width,count=183,padding=30){const inner=Math.max(1,width-padding*2);return Math.max(1,Math.min(count,Math.round((x-padding)/inner*count)));}
export function scoreLabel(score){return score>=0?'黑领先 '+score.toFixed(1)+' 目':'白领先 '+Math.abs(score).toFixed(1)+' 目';}

// Keep source events intact. Only omit silent, already-shown branch prefixes.
export function repeatedPrefixIndices(events,textOf=e=>e.text){
 const skipped=new Set();let previous=null;
 events.forEach((e,i)=>{if(e.kind==='transition'&&!textOf(e)?.trim())skipped.add(i);});
 for(let i=0;i<events.length;){
  const e=events[i];if(!e.branch){previous=null;i++;continue;}
  let end=i+1;while(end<events.length&&events[end].branch===e.branch)end++;
  const block=events.slice(i,end),steps=block.filter(n=>n.step>0);
  if(previous&&previous.base===e.displayMove){
   let matched=0;
   for(const step of steps){const old=previous.steps.get(step.step);
    if(!old||old.board!==step.board||old.color!==step.color||old.coordinate!==step.coordinate||textOf(step)?.trim())break;
    skipped.add(i+block.indexOf(step));matched++;
   }
   if(matched&&e.step===0&&!textOf(e)?.trim())skipped.add(i);
  }
  previous={base:e.displayMove,steps:new Map(steps.map(s=>[s.step,s]))};i=end;
 }
 return skipped;
}
export function adjacentEvent(events,index,direction,skipped){
 let next=index+direction;while(next>=0&&next<events.length&&skipped.has(next))next+=direction;
 return Math.max(0,Math.min(events.length-1,next));
}

