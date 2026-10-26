// Editable Go trees. Source events stay immutable; reversible operations form the draft.
export const toSgf=p=>p?String.fromCharCode(97+p[0],97+p[1]):'';
export const toCoordinate=p=>p?'ABCDEFGHJKLMNOPQRST'[p[0]]+(19-p[1]):'pass';
const neighbors=i=>[i%19?i-1:-1,i%19<18?i+1:-1,i>=19?i-19:-1,i<342?i+19:-1].filter(n=>n>=0);
function group(board,start){const color=board[start],stones=new Set([start]),liberties=new Set(),queue=[start];while(queue.length){for(const n of neighbors(queue.pop())){if(board[n]==='.')liberties.add(n);else if(board[n]===color&&!stones.has(n)){stones.add(n);queue.push(n);}}}return{stones,liberties};}
export function playMove(position,color,point,koBoard=null){
 if(!['B','W'].includes(color))throw Error('棋子颜色无效');
 if(point===null)return position;
 if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isInteger(n)||n<0||n>18))throw Error('坐标超出棋盘');
 const board=[...position],index=point[1]*19+point[0],stone=color.toLowerCase(),other=stone==='b'?'w':'b';
 if(board[index]!=='.')throw Error('该处已有棋子');board[index]=stone;
 for(const n of neighbors(index))if(board[n]===other){const g=group(board,n);if(!g.liberties.size)for(const p of g.stones)board[p]='.';}
 if(!group(board,index).liberties.size)throw Error('该着手没有气，不能自杀');
 const next=board.join('');if(koBoard&&next===koBoard)throw Error('不能立即回提劫');return next;
}
export function buildReviewTree(data,operations=[]){
 const nodes={},eventNodes={},rootId='m:0',mainNodes=[rootId];let serial=0;
 const setup=data.events.find(e=>e.kind==='start')?.board??'.'.repeat(361);
 nodes[rootId]={id:rootId,parent:null,children:[],mainMove:0,board:setup,color:null,point:null,eventIds:[]};
 function add(parentId,color,point,{id,mainMove=null,sourceEvent=null,user=false}={}){
  const parent=nodes[parentId];if(!parent||parent.deleted)throw Error('父局面已删除');
  const pointer=sourceEvent?.kind==='pointer';
  const existing=parent.children.map(id=>nodes[id]).find(n=>!n.deleted&&!!n.pointer===pointer&&n.color===color&&toSgf(n.point)===toSgf(point));
  if(existing){if(sourceEvent&&!existing.eventIds.includes(sourceEvent.id))existing.eventIds.push(sourceEvent.id);return existing;}
  const node={id:id??'v:'+serial++,parent:parentId,children:[],color,point:point&&[...point],mainMove,eventIds:sourceEvent?[sourceEvent.id]:[],user,pointer};
  try{node.board=pointer?parent.board:playMove(parent.board,color,point,nodes[parent.parent]?.board);}catch(error){if(!sourceEvent)throw error;node.board=sourceEvent.board;node.problem='原稿着手待核：'+error.message;}
  nodes[node.id]=node;parent.children.push(node.id);return node;
 }
 for(const move of data.mainline){const p=move.sgf_point?[move.sgf_point.charCodeAt(0)-97,move.sgf_point.charCodeAt(1)-97]:null;
  const event=data.events.find(e=>!e.branch&&e.kind==='main'&&e.displayMove===move.move_number);
  const n=add(mainNodes.at(-1),move.color,p,{id:'m:'+move.move_number,mainMove:move.move_number,sourceEvent:event});mainNodes.push(n.id);
 }
 const branchSteps=new Map();
 for(const e of data.events)if(e.branch&&e.step>0){if(!branchSteps.has(e.branch))branchSteps.set(e.branch,new Map());const steps=branchSteps.get(e.branch);if(!steps.has(e.step)||e.text)steps.set(e.step,e);}
 const branchNodes=new Map();
 for(const [branch,steps] of branchSteps){const ordered=[...steps].sort((a,b)=>a[0]-b[0]);let parent=mainNodes[ordered[0][1].displayMove];if(!parent)continue;const ids=new Map();
  for(const [step,e] of ordered){const p=e.last??e.suggestedPoint??null;const n=add(parent,e.color||e.suggestedColor,p,{sourceEvent:e});ids.set(step,n.id);parent=n.id;}branchNodes.set(branch,ids);
 }
 for(const e of data.events){const id=e.branch&&e.step>0?branchNodes.get(e.branch)?.get(e.step):mainNodes[e.displayMove??e.move??0];if(id){eventNodes[e.id]=id;if(!nodes[id].eventIds.includes(e.id))nodes[id].eventIds.push(e.id);}}
 const tree={nodes,eventNodes,rootId,mainNodes,mainlineChanged:false};
 function remove(id){const n=nodes[id];n.deleted=true;if(n.mainMove!==null)tree.mainlineChanged=true;for(const child of n.children)remove(child);}
 function replay(id){const n=nodes[id];if(n.deleted)return;const parent=nodes[n.parent];n.board=n.pointer?parent.board:playMove(parent.board,n.color,n.point,nodes[parent.parent]?.board);delete n.problem;for(const c of n.children)replay(c);}
 for(const op of operations){
  if(op.type==='remove'){if(op.nodeId===rootId||!nodes[op.nodeId]||nodes[op.nodeId].deleted)throw Error('删除目标无效');remove(op.nodeId);}
  else if(op.type==='add'){
   if(typeof op.id!=='string'||!/^u:[a-zA-Z0-9_-]+$/.test(op.id)||nodes[op.id])throw Error('新节点编号无效');const parent=nodes[op.parentId];
   const mainMove=parent?.mainMove!==null&&parent?.mainMove!==undefined&&!parent.children.some(id=>!nodes[id].deleted&&nodes[id].mainMove!==null)?parent.mainMove+1:null;
   const n=add(op.parentId,op.color,op.point,{id:op.id,mainMove,user:true});if(n.id!==op.id)throw Error('已有相同着手，请选择原节点');eventNodes['user-node:'+n.id]=n.id;n.eventIds.push('user-node:'+n.id);if(mainMove!==null)tree.mainlineChanged=true;
  }else if(op.type==='replace'){
   const n=nodes[op.nodeId];if(!n||n.deleted||n.id===rootId)throw Error('修改目标无效');
   if(nodes[n.parent].children.some(id=>id!==n.id&&!nodes[id].deleted&&nodes[id].color===n.color&&toSgf(nodes[id].point)===toSgf(op.point)))throw Error('已有相同着手，请删除错误节点后选择正确分支');
   n.point=op.point;try{replay(n.id);}catch(e){throw Error('后续着手发生冲突：'+e.message+'。请先删除冲突的后续分支。');}if(n.mainMove!==null)tree.mainlineChanged=true;
  }else throw Error('未知棋谱修改');
 }
 return tree;
}
export function pathTo(tree,id){const path=[];for(let n=tree.nodes[id];n;n=tree.nodes[n.parent])path.unshift(n);return path;}
export function branchRoot(tree,id){let node=tree.nodes[id];while(node?.parent&&node.mainMove===null){const parent=tree.nodes[node.parent],children=parent.children.filter(id=>!tree.nodes[id].deleted);if(parent.mainMove!==null||children.length>1)break;node=parent;}return node?.id;}
export function projectTreeEvent(data,tree,nodeId,preferredId=null){
 const node=tree.nodes[nodeId];if(!node||node.deleted)return null;
 const source=data.events.find(e=>e.id===preferredId&&node.eventIds.includes(e.id))??data.events.find(e=>node.eventIds.includes(e.id)&&e.text)??data.events.find(e=>node.eventIds.includes(e.id));
 const path=pathTo(tree,nodeId),main=path.filter(n=>n.mainMove!==null).at(-1),variation=path.slice(path.indexOf(main)+1);
 const synthetic=!source,id=source?.id??'user-node:'+node.id;
 const actual=source?.kind==='main'||source?.kind==='variation';
 return{...(source??{}),id,userNode:synthetic,treeNodeId:nodeId,sourceBoard:source?.board,board:node.board,
  color:source?.color||node.color||'B',last:source&&!actual?source.last:node.point,coordinate:actual||!source?toCoordinate(node.point):source.coordinate,kind:source?.kind??(variation.length?'variation':node.mainMove===0?'start':'main'),suggestedPoint:source?.kind==='pointer'?node.point:source?.suggestedPoint,
  move:source?.move??(variation.length?main.mainMove+1:node.mainMove),displayMove:source?.displayMove??(variation.length?main.mainMove:node.mainMove),
  branch:source?source.branch:(variation.length?'edit-'+variation[0].id.replaceAll(':','-'):null),step:source?source.step:(variation.length||undefined),branchLength:source?.branchLength??variation.length,
  marks:variation.map((n,i)=>({point:n.point,number:i+1})).filter(m=>m.point&&node.board[m.point[1]*19+m.point[0]]!=='.'),text:source?.text??'',textEn:source?.textEn??'',problem:node.problem};
}
export function allTreeEvents(data,draft,tree=buildReviewTree(data,draft.treeOps??[])){
 const events=data.events.map(e=>projectTreeEvent(data,tree,tree.eventNodes[e.id],e.id)??{...e,treeNodeId:tree.eventNodes[e.id],deletedFromTree:true});
 for(const n of Object.values(tree.nodes))if(n.user){const e=projectTreeEvent(data,tree,n.id);events.push(e??{id:'user-node:'+n.id,userNode:true,treeNodeId:n.id,deletedFromTree:true,board:n.board,color:n.color,last:n.point,displayMove:n.mainMove??0,move:n.mainMove??0,kind:'variation',text:''});}
 return events;
}
