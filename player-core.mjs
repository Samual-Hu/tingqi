export function formatTime(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
export function indexAtTime(events,time){let lo=0,hi=events.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(events[mid].start<=time)lo=mid;else hi=mid-1;}return lo;}
export function chapterForMove(data,move){const n=Math.max(1,Math.min(data.moveCount,Math.round(move)));return Number(data.chapters[String(n)]??data.firstMain[String(n)]??0);}
export function curveMoveAtX(x,width,count=183,padding=30){const inner=Math.max(1,width-padding*2);return Math.max(1,Math.min(count,Math.round((x-padding)/inner*count)));}
export function scoreLabel(score){return score>=0?'黑领先 '+score.toFixed(1)+' 目':'白领先 '+Math.abs(score).toFixed(1)+' 目';}

// Keep source events intact. Only omit silent, already-shown branch prefixes or dead-end duplicate attempts.
export function repeatedPrefixIndices(events,textOf=e=>e.text){
 const skipped=new Set();
 // Position-level comments also project onto the synthetic reset event.
 // That does not turn a silent reset into another lecture step.
 events.forEach((e,i)=>{if(e.kind==='transition'&&!e.text?.trim())skipped.add(i);});

 const segments=[];
 let curSeg=null;
 events.forEach((e,i)=>{
  if(!e.branch){
   if(curSeg){segments.push(curSeg);curSeg=null;}
   return;
  }
  if(e.step===0||(curSeg&&curSeg.branch!==e.branch)){
   if(curSeg)segments.push(curSeg);
   curSeg={branch:e.branch,displayMove:e.displayMove,events:[{e,index:i}]};
  }else{
   if(!curSeg)curSeg={branch:e.branch,displayMove:e.displayMove,events:[]};
   curSeg.events.push({e,index:i});
  }
 });
 if(curSeg)segments.push(curSeg);

 for(let s=1;s<segments.length;s++){
  const prev=segments[s-1],curr=segments[s];
  if(prev.branch===curr.branch&&prev.displayMove===curr.displayMove){
   const prevSteps=prev.events.filter(x=>x.e.step>0);
   const currSteps=curr.events.filter(x=>x.e.step>0);
   let matchCount=0;
   while(matchCount<prevSteps.length&&matchCount<currSteps.length&&prevSteps[matchCount].e.board===currSteps[matchCount].e.board&&prevSteps[matchCount].e.color===currSteps[matchCount].e.color&&prevSteps[matchCount].e.coordinate===currSteps[matchCount].e.coordinate){
    matchCount++;
   }
   if(matchCount>0){
    if(currSteps.length>prevSteps.length){
     const firstCurrText=currSteps.find(x=>textOf(x.e)?.trim())?.e.step??(matchCount+1);
     prevSteps.forEach(x=>{
      if(x.e.step>=firstCurrText&&!textOf(x.e)?.trim())skipped.add(x.index);
     });
     curr.events.forEach(x=>{
      if(x.e.step===0&&!textOf(x.e)?.trim())skipped.add(x.index);
      else if(x.e.step>0&&x.e.step<firstCurrText&&!textOf(x.e)?.trim())skipped.add(x.index);
     });
    }else{
     curr.events.forEach(x=>{
      if(x.e.step===0&&!textOf(x.e)?.trim())skipped.add(x.index);
      else if(x.e.step>0&&x.e.step<=matchCount&&!textOf(x.e)?.trim())skipped.add(x.index);
     });
    }
   }
  }
 }

 const seenBoardsByMove=new Map(),seenBranchesByMove=new Map();
 segments.forEach(seg=>{
  const moveKey=String(seg.displayMove);
  if(!seenBoardsByMove.has(moveKey)){
   seenBoardsByMove.set(moveKey,new Set());
   seenBranchesByMove.set(moveKey,new Set());
  }
  const seenBoards=seenBoardsByMove.get(moveKey);
  const seenBranches=seenBranchesByMove.get(moveKey);
  const steps=seg.events.filter(x=>x.e.step>0);
  const firstCommentedStep=steps.find(x=>textOf(x.e)?.trim())?.e.step;
  const hasPriorBranches=seenBranches.size>0||seenBoards.size>0;

  steps.forEach(x=>{
   const isSilent=!textOf(x.e)?.trim();
   if(isSilent){
    if(seenBoards.has(x.e.board)){
     skipped.add(x.index);
    }else if(firstCommentedStep&&x.e.step<firstCommentedStep&&hasPriorBranches){
     skipped.add(x.index);
    }
   }
   seenBoards.add(x.e.board);
  });
  if(seg.branch)seenBranches.add(seg.branch);
 });

 return skipped;
}

export function adjacentEvent(events,index,direction,skipped){
 let next=index+direction;while(next>=0&&next<events.length&&skipped.has(next))next+=direction;
 return Math.max(0,Math.min(events.length-1,next));
}
