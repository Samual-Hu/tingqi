import {buildReviewTree, projectTreeEvent, pathTo, branchRoot, toCoordinate} from './review-tree.mjs?v=20261025-treefix8';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };

export function createTreeEditor({data, draft, commit, refresh, persist, remember, current, notice, navigate, stopOtherModes, undo, redo, canUndo, canRedo, orphanCard}) {
 let cacheKey = null, cache = null, editMode = null, lastFocus = null;

 function tree() {
  const key = JSON.stringify(draft().treeOps ?? []);
  if (key !== cacheKey) {
   cache = buildReviewTree(data, draft().treeOps ?? []);
   cacheKey = key;
  }
  return cache;
 }

 function activeId(raw = current()) {
  const t = tree();
  let id = draft().treeSelection ?? raw.treeNodeId ?? t.eventNodes[raw.id];
  while (id && t.nodes[id]?.deleted) id = t.nodes[id].parent;
  return id ?? t.rootId;
 }

 function viewEvent(raw) {
  const t = tree(), id = activeId(raw);
  return projectTreeEvent(data, t, id, raw.id) ?? raw;
 }

 function select(id) {
  if (!tree().nodes[id] || tree().nodes[id].deleted) return;
  draft().treeSelection = id;
  const n = tree().nodes[id];
  const evId = n?.eventIds?.find(eid => {
   const idx = data.events.findIndex(e => e.id === eid);
   return idx >= 0 && !tree().nodes[tree().eventNodes[eid]]?.deleted;
  }) ?? n?.eventIds?.[0];
  const idx = evId ? data.events.findIndex(e => e.id === evId) : -1;
  if (idx >= 0 && navigate) {
   navigate(idx);
   return;
  }
  const e = projectTreeEvent(data, tree(), id);
  const url = new URL(location.href);
  url.hash = String(e.move || e.displayMove || 0);
  history.replaceState(null, '', url);
  remember();
  persist();
  refresh();
 }

 function apply(op, nextId) {
  try {
   buildReviewTree(data, [...(draft().treeOps ?? []), op]);
   commit(() => {
    draft().treeOps = [...(draft().treeOps ?? []), op];
    draft().treeSelection = nextId;
   });
   remember();
  } catch (e) {
   notice(e.message);
  }
 }

 const host = el('section', undefined, 'variation-tree'), heading = el('div', undefined, 'tree-heading');
 host.id = 'variation-tree';
 host.setAttribute('aria-label', '可编辑棋谱分支树');

 const titleGroup = el('div', undefined, 'tree-title-group');
 titleGroup.append(el('strong', '棋谱分支与变化'));
 const hint = el('span', '💡 棋盘或分支图上右键点击任意一手，直接弹出删除菜单', 'tree-hint');
 titleGroup.append(hint);
 heading.append(titleGroup);

 const actions = el('div', undefined, 'tree-actions');
 function button(label, fn, parent = actions) {
  const b = el('button', label);
  b.type = 'button';
  b.onclick = fn;
  parent.append(b);
  return b;
 }

 const draw = button('摆变化', () => { stopOtherModes(); editMode = editMode === 'add' ? null : 'add'; refresh(); });
 const replace = button('改此手', () => { stopOtherModes(); editMode = editMode === 'replace' ? null : 'replace'; refresh(); });
 const delBtn = button('删除此手及后续', () => remove(false));
 delBtn.className = 'tree-btn-delete';
 delBtn.title = '删除当前选中的手及后续着手（也可直接在棋盘或分支图中右键点击任意一手）';

 const del = el('details', undefined, 'tree-delete'), summary = el('summary', '更多删除');
 del.append(summary);
 actions.append(del);
 button('删除所在分支', () => remove(true), del);
 button('恢复全部被删分支', () => { commit(() => { draft().treeOps = (draft().treeOps ?? []).filter(op => op.type !== 'remove'); delete draft().treeSelection; delete draft().treePreferredEvent; }); notice('已恢复所有被删分支，完整变化已重现'); }, del);

 const back = button('↶ 撤销', undo);
 back.title = '撤销棋谱修改';
 back.setAttribute('aria-label', '撤销棋谱修改');

 const forward = button('↷ 重做', redo);
 forward.title = '重做棋谱修改';
 forward.setAttribute('aria-label', '重做棋谱修改');

 heading.append(actions);
 const status = el('p', undefined, 'tree-status'), diagram = el('div', undefined, 'tree-diagram'), related = el('div', undefined, 'tree-related'), orphans = el('details', undefined, 'tree-orphans');
 diagram.setAttribute('aria-label', '点击节点选择局面，右键删除该手及后续，可滚动查看全谱');

 const orphanTitle = el('summary');
 orphans.append(orphanTitle);
 const orphanList = el('div');
 orphans.append(orphanList);
 host.append(heading, status, diagram, related, orphans);

 const filler = document.getElementById('segment-detail');
 filler.hidden = true;
 const panel = filler.closest('.lecture-panel');
 panel.insertBefore(host, panel.querySelector('.analysis'));

 // Context Menu DOM
 const menu = el('div', undefined, 'tingqi-context-menu');
 menu.hidden = true;
 document.body.append(menu);

 function hideMenu() {
  menu.hidden = true;
  menu.replaceChildren();
 }

 document.addEventListener('click', ev => {
  if (!menu.contains(ev.target)) hideMenu();
 });
 document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') hideMenu();
 });
 window.addEventListener('scroll', hideMenu, true);

 function showContextMenu(ev, targetInfo) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!targetInfo) return;

  const { nodeId, node, isVariation, stepNumber, color, coord } = targetInfo;
  if (!node || !node.parent || nodeId === tree().rootId) {
   notice('不能删除棋谱起点');
   hideMenu();
   return;
  }

  menu.replaceChildren();

  const colorName = color === 'B' ? '黑' : color === 'W' ? '白' : '';
  const stoneIcon = color === 'B' ? '⚫' : '⚪';
  const label = isVariation
   ? `${stoneIcon} 变化第 ${stepNumber} 手 (${colorName} ${coord})`
   : `${stoneIcon} 实战第 ${stepNumber} 手 (${colorName} ${coord})`;

  const header = el('div', label, 'menu-header');
  menu.append(header);

  const deleteBtn = el('button', `🗑️ 删除此手及后续着手`, 'menu-item delete-btn');
  deleteBtn.type = 'button';
  deleteBtn.onclick = () => {
   hideMenu();
   remove(false, nodeId);
  };
  menu.append(deleteBtn);

  if (canUndo()) {
   const undoBtn = el('button', `↶ 撤销上一修改`, 'menu-item');
   undoBtn.type = 'button';
   undoBtn.onclick = () => {
    hideMenu();
    undo();
   };
   menu.append(undoBtn);
  }

  const cancelBtn = el('button', `✕ 取消`, 'menu-item');
  cancelBtn.type = 'button';
  cancelBtn.onclick = hideMenu;
  menu.append(cancelBtn);

  menu.hidden = false;

  const x = Math.min(window.innerWidth - 220, Math.max(10, ev.clientX));
  const y = Math.min(window.innerHeight - 150, Math.max(10, ev.clientY));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
 }

 function remove(branch, targetNodeId = null) {
  const t = tree(), id = targetNodeId ?? (branch ? branchRoot(t, activeId()) : activeId()), n = t.nodes[id];
  if (!n?.parent || id === t.rootId) {
   notice('不能删除棋谱起点');
   return;
  }
  if (branch && n.mainMove !== null) {
   notice('请先选择一个变化分支；实战可用“删除此手及后续”。');
   return;
  }
  del.open = false;
  editMode = null;
  const isMain = n.mainMove !== null;
  const stepInVar = pathTo(t, id).filter(x => x.mainMove === null).length;
  const desc = isMain
   ? ('实战第 ' + n.mainMove + ' 手')
   : ('变化第 ' + stepInVar + ' 手 (' + (n.color === 'B' ? '黑' : '白') + ' ' + (n.point ? toCoordinate(n.point) : '') + ')');
  const parentId = n.parent;
  apply({type: 'remove', nodeId: id}, parentId);
  if (navigate && parentId) {
   const parentNode = tree().nodes[parentId];
   const parentEvId = parentNode?.eventIds?.find(eid => {
    const idx = data.events.findIndex(e => e.id === eid);
    return idx >= 0 && !tree().nodes[tree().eventNodes[eid]]?.deleted;
   }) ?? parentNode?.eventIds?.[0];
   const parentIdx = parentEvId ? data.events.findIndex(e => e.id === parentEvId) : -1;
   if (parentIdx >= 0) {
    navigate(parentIdx);
   }
  }
  notice('已删除' + desc + '及后续着手（原话保留在待重新归属中，点击“↶ 撤销”可恢复）');
 }

 function resolveBoardNode(point) {
  const t = tree();
  const e = current();
  const [x, y] = point;

  // 1. Check if the clicked point is one of the variation marks on the current board
  if (e.branch && e.marks?.length) {
   const mark = e.marks.find(m => m.point && m.point[0] === x && m.point[1] === y);
   if (mark) {
    const stepEvent = data.events.find(ev => ev.branch === e.branch && ev.step === mark.number);
    const nodeId = stepEvent && t.eventNodes[stepEvent.id];
    const node = nodeId && t.nodes[nodeId];
    if (node && !node.deleted) {
     return {
      nodeId,
      node,
      isVariation: true,
      stepNumber: mark.number,
      color: node.color || stepEvent.color,
      coord: toCoordinate(point)
     };
    }
   }
  }

  // 2. Check the active path (from root to currently active node or current event node)
  const curEventNodeId = t.eventNodes[e.id] ?? e.treeNodeId ?? activeId();
  const path = pathTo(t, curEventNodeId);
  const pathMatch = [...path].reverse().find(n =>
   !n.deleted && n.parent && n.id !== t.rootId &&
   n.point && n.point[0] === x && n.point[1] === y
  );
  if (pathMatch) {
   const isMain = pathMatch.mainMove !== null;
   const stepInVar = pathTo(t, pathMatch.id).filter(n => n.mainMove === null).length;
   return {
    nodeId: pathMatch.id,
    node: pathMatch,
    isVariation: !isMain,
    stepNumber: isMain ? pathMatch.mainMove : stepInVar,
    color: pathMatch.color,
    coord: toCoordinate(point)
   };
  }

  // 3. Check mainline moves up to current displayMove
  const displayMove = e.displayMove ?? e.move ?? data.moveCount;
  for (let m = displayMove; m >= 1; m--) {
   const move = data.mainline[m - 1];
   if (!move?.sgf_point) continue;
   const mx = move.sgf_point.charCodeAt(0) - 97;
   const my = move.sgf_point.charCodeAt(1) - 97;
   if (mx === x && my === y) {
    const nodeId = 'm:' + m;
    const node = t.nodes[nodeId];
    if (node && !node.deleted) {
     return {
      nodeId,
      node,
      isVariation: false,
      stepNumber: m,
      color: move.color,
      coord: toCoordinate(point)
     };
    }
   }
  }

  return null;
 }

 function onBoardContextMenu(ev, point) {
  const target = resolveBoardNode(point);
  if (!target) {
   notice('该处无棋子或无需删除');
   return;
  }
  showContextMenu(ev, target);
 }

 function clickPoint(point) {
  if (!editMode) return false;
  const t = tree(), id = activeId(), n = t.nodes[id];
  if (editMode === 'replace') {
   editMode = null;
   apply({type: 'replace', nodeId: id, point}, id);
   return true;
  }
  const last = pathTo(t, id).filter(n => !n.pointer).at(-1), color = last.color === 'B' ? 'W' : 'B';
  const existing = n.children.map(id => t.nodes[id]).find(c => !c.deleted && !c.pointer && c.color === color && c.point?.join(',') === point.join(','));
  if (existing) {
   select(existing.id);
   return true;
  }
  const child = 'u:' + crypto.randomUUID();
  apply({type: 'add', id: child, parentId: id, color, point}, child);
  return true;
 }

 function render() {
  const t = tree(), id = activeId(), n = t.nodes[id];
  draw.textContent = editMode === 'add' ? '结束摆棋' : '摆变化';
  draw.setAttribute('aria-pressed', String(editMode === 'add'));
  replace.textContent = editMode === 'replace' ? '点击正确落点' : '改此手';
  replace.disabled = !n.parent;
  delBtn.disabled = !n.parent || id === t.rootId;
  back.disabled = !canUndo();
  forward.disabled = !canRedo();

  status.textContent = editMode === 'add'
   ? '点击棋盘继续落子，自动提子、交替黑白；再次点击“结束摆棋”退出。'
   : editMode === 'replace'
   ? '点击棋盘上的正确落点；后续着手冲突时会阻止修改。'
   : n.problem ?? '';
  status.hidden = !status.textContent;

  // 1. Assign depth to all non-deleted nodes
  const depths = new Map();
  let maxDepth = 0;
  function assignDepths(nodeId, d) {
   const node = t.nodes[nodeId];
   if (!node || node.deleted) return;
   depths.set(nodeId, d);
   if (d > maxDepth) maxDepth = d;
   for (const childId of node.children) {
    if (!t.nodes[childId]?.deleted) assignDepths(childId, d + 1);
   }
  }
  assignDepths(t.rootId, 0);

  // 2. Assign compact rows: mainline is row 0; branches reuse rows when intervals don't overlap
  const rowAssignments = new Map();
  const rowIntervals = new Map([[0, [[0, maxDepth + 1]]]]);
  let maxRow = 0;

  for (const [nodeId, d] of depths) {
   if (t.nodes[nodeId].mainMove !== null) rowAssignments.set(nodeId, 0);
  }

  function getStrand(startId) {
   const strand = [];
   let cur = startId;
   while (cur && !t.nodes[cur]?.deleted && t.nodes[cur]?.mainMove === null) {
    strand.push(cur);
    const validChildren = t.nodes[cur].children.filter(id => !t.nodes[id]?.deleted);
    cur = validChildren.length ? validChildren[0] : null;
   }
   return strand;
  }

  function allocateStrandRow(strand, minRow) {
   const startD = depths.get(strand[0]);
   const endD = depths.get(strand[strand.length - 1]);
   let r = minRow;
   while (true) {
    const intervals = rowIntervals.get(r) || [];
    const collision = intervals.some(([s, e]) => !(endD + 1 < s || startD - 1 > e));
    if (!collision) {
     for (const id of strand) rowAssignments.set(id, r);
     intervals.push([startD, endD]);
     rowIntervals.set(r, intervals);
     if (r > maxRow) maxRow = r;
     return r;
    }
    r++;
   }
  }

  function layoutBranches(parentId) {
   const pNode = t.nodes[parentId];
   if (!pNode || pNode.deleted) return;
   const parentRow = rowAssignments.get(parentId) ?? 0;
   const validChildren = pNode.children.filter(id => !t.nodes[id]?.deleted);

   for (let i = 0; i < validChildren.length; i++) {
    const childId = validChildren[i];
    const childNode = t.nodes[childId];
    if (childNode.mainMove !== null) {
     layoutBranches(childId);
     continue;
    }
    if (rowAssignments.has(childId)) {
     layoutBranches(childId);
     continue;
    }
    const strand = getStrand(childId);
    const minRow = (pNode.mainMove !== null) ? 1 : (parentRow + 1);
    allocateStrandRow(strand, minRow);
    for (const strandNodeId of strand) {
     layoutBranches(strandNodeId);
    }
   }
  }
  layoutBranches(t.rootId);

  for (const [nodeId, d] of depths) {
   if (!rowAssignments.has(nodeId)) {
    const p = t.nodes[nodeId]?.parent;
    const pr = (p && rowAssignments.get(p)) || 0;
    rowAssignments.set(nodeId, pr + 1);
    if (pr + 1 > maxRow) maxRow = pr + 1;
   }
  }

  // 3. Compute SVG coordinates
  const positions = new Map();
  for (const [nodeId, d] of depths) {
   const r = rowAssignments.get(nodeId) ?? 0;
   positions.set(nodeId, {
    x: 28 + d * 52,
    y: 24 + r * 44
   });
  }
  const width = (maxDepth + 1) * 52 + 40;
  const height = (maxRow + 1) * 44 + 32;

  // 4. Build connecting lines
  let linesMain = '', linesBranch = '';
  for (const [nodeId, p] of positions) {
   const node = t.nodes[nodeId];
   if (node.parent && positions.has(node.parent)) {
    const parent = positions.get(node.parent);
    if (parent.y === p.y) {
     const d = 'M' + parent.x + ' ' + parent.y + 'H' + p.x;
     if (node.mainMove !== null) linesMain += '<path d="' + d + '"/>';
     else linesBranch += '<path d="' + d + '"/>';
    } else {
     const midX = p.x - 26;
     const d = 'M' + parent.x + ' ' + parent.y + 'H' + midX + 'V' + p.y + 'H' + p.x;
     linesBranch += '<path d="' + d + '"/>';
    }
   }
  }

  // 5. Build node circles and labels
  let dots = '';
  for (const [nodeId, p] of positions) {
   const node = t.nodes[nodeId];
   const isMain = node.mainMove !== null;
   const isRoot = nodeId === t.rootId;
   const isCurrent = nodeId === id;
   const variation = pathTo(t, nodeId).filter(n => n.mainMove === null).length;
   const label = isRoot ? '起' : (isMain ? node.mainMove : variation);
   const coord = node.parent ? toCoordinate(node.point) : '起点';
   const colorName = node.color === 'B' ? '黑' : node.color === 'W' ? '白' : '';
   const aria = (isMain ? '实战' + node.mainMove : isRoot ? '起点' : '变化' + variation) + ' ' + colorName + ' ' + coord;
   const tip = isRoot
    ? '棋谱起点'
    : (isMain ? `实战 第${node.mainMove}手 · ${colorName} ${coord}\n左键切换局面 · 右键删除此手及后续`
             : `变化 第${variation}手 · ${colorName} ${coord}\n左键切换局面 · 右键删除此手及后续`);
   const stoneFill = isRoot ? '#e6ece5' : (node.color === 'B' ? '#252e2e' : '#fffefa');
   const stoneStroke = isCurrent ? '#c35c35' : (isRoot ? '#8b978d' : (node.color === 'B' ? '#141b1c' : '#a8b0a7'));
   const strokeWidth = isCurrent ? 2.5 : 1;
   const textFill = isRoot ? '#3b4a41' : (node.color === 'B' ? '#fffdf6' : '#252e2e');
   const activeHalo = isCurrent
    ? `<circle cx="${p.x}" cy="${p.y}" r="17" fill="none" stroke="#c35c35" stroke-width="2.2" stroke-dasharray="3 2" opacity="0.9"/>`
    : '';

   dots += `<g role="button" tabindex="0" data-tree-node="${nodeId}" aria-label="${aria}"${isCurrent ? ' aria-current="true"' : ''}>`
    + `<title>${tip}</title>`
    + activeHalo
    + `<circle class="node-stone" cx="${p.x}" cy="${p.y}" r="12" fill="${stoneFill}" stroke="${stoneStroke}" stroke-width="${strokeWidth}"/>`
    + `<text x="${p.x}" y="${p.y + 4}" fill="${textFill}" text-anchor="middle" font-size="${String(label).length > 2 ? 8.5 : 10}" font-weight="500">${label}</text>`
    + `<text x="${p.x}" y="${p.y + 22}" text-anchor="middle" font-size="8.5" fill="#757c74">${coord}</text>`
    + `</g>`;
  }

  diagram.innerHTML = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
   + '<g fill="none" stroke="#7e9686" stroke-width="2">' + linesMain + '</g>'
   + '<g fill="none" stroke="#aab5a8" stroke-width="1.6">' + linesBranch + '</g>'
   + dots + '</svg>';

  if (lastFocus !== id) {
   const p = positions.get(id);
   if (p) {
    diagram.scrollLeft = Math.max(0, p.x - diagram.clientWidth * 0.45);
    diagram.scrollTop = Math.max(0, p.y - diagram.clientHeight / 2);
   }
   lastFocus = id;
  }

  related.replaceChildren();
  const explanations = n.eventIds.map(id => data.events.find(e => e.id === id)).filter(e => e?.text);
  if (explanations.length > 1) {
   related.append(el('span', '相关解说：'));
   for (const [i, e] of explanations.entries()) {
    button(String(i + 1), () => {
     draft().treeSelection = id;
     draft().treePreferredEvent = e.id;
     remember();
     refresh();
    }, related);
   }
  }

  const parked = draft().placements.filter(p => t.nodes[t.eventNodes[p.eventId]]?.deleted);
  orphanTitle.textContent = '待重新归属的原话 · ' + parked.length;
  orphans.hidden = !parked.length;
  if (orphans.open) {
   orphanList.replaceChildren();
   for (const p of parked) {
    const sentence = draft().sentences.find(s => s.id === p.sentenceId);
    if (sentence) orphanList.append(orphanCard(sentence));
   }
  }
 }

 diagram.onclick = ev => {
  const node = ev.target.closest('[data-tree-node]');
  if (node) select(node.dataset.treeNode);
 };

 diagram.oncontextmenu = ev => {
  ev.preventDefault();
  ev.stopPropagation();
  const nodeEl = ev.target.closest('[data-tree-node]');
  if (!nodeEl) return;
  const nodeId = nodeEl.dataset.treeNode;
  const t = tree(), node = t.nodes[nodeId];
  if (!node) return;
  const isMain = node.mainMove !== null;
  const isRoot = nodeId === t.rootId;
  const stepInVar = pathTo(t, nodeId).filter(n => n.mainMove === null).length;
  showContextMenu(ev, {
   nodeId,
   node,
   isVariation: !isMain && !isRoot,
   stepNumber: isRoot ? 0 : (isMain ? node.mainMove : stepInVar),
   color: node.color,
   coord: node.point ? toCoordinate(node.point) : '起点'
  });
 };

 diagram.onkeydown = ev => {
  if (ev.key === 'Enter' || ev.key === ' ') {
   const n = ev.target.closest('[data-tree-node]');
   if (n) {
    ev.preventDefault();
    select(n.dataset.treeNode);
   }
  }
 };

 orphans.ontoggle = () => {
  if (orphans.open) render();
 };

 return {
  tree,
  render,
  clickPoint,
  onBoardContextMenu,
  projectRaw(raw) {
   const t = tree();
   const nodeId = (raw === current() ? (draft().treeSelection ?? raw.treeNodeId ?? t.eventNodes[raw.id]) : (raw.treeNodeId ?? t.eventNodes[raw.id]));
   if (nodeId && !t.nodes[nodeId]?.deleted) {
    const proj = projectTreeEvent(data, t, nodeId, raw.id);
    if (proj) return proj;
   }
   return raw;
  },
  viewEvent(raw) {
   return projectTreeEvent(data, tree(), activeId(raw), draft().treePreferredEvent ?? raw.id) ?? raw;
  },
  reset() {
   draft().treeSelection = null;
   delete draft().treePreferredEvent;
   editMode = null;
  },
  get editingBoard() { return !!editMode; },
  get mainlineChanged() { return tree().mainlineChanged; },
  get selected() { return !!draft().treeSelection; },
  step(direction) {
   const t = tree(), n = t.nodes[activeId()], id = direction < 0 ? n.parent : n.children.find(id => !t.nodes[id].deleted);
   if (id) select(id);
  },
  canStep(direction) {
   const t = tree(), n = t.nodes[activeId()];
   return direction < 0 ? !!n.parent : n.children.some(id => !t.nodes[id].deleted);
  }
 };
}
