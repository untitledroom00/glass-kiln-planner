'use strict';
const $ = id => document.getElementById(id);
const canvas = $('canvas');
const viewport = canvas.parentElement;
const mini = $('mini-properties'), miniPanel = $('mini-panel'), dimensionButton = $('dimension-label');
let miniOpen = false, miniFrame = '';
const mobilePan = {x:0,y:0};
let miniVisibleBottom = Infinity;
let touchInput = matchMedia('(pointer: coarse)').matches;
const mobileLayout = matchMedia('(max-width: 768px)');
const layerNames = ['第一层','第二层','第三层'];
const loaded = loadWorkspace();
let data = loaded.data;
let layer = 0, selected = null, zoom = 1, gesture = null, storageError = loaded.warning || '';
const history = [];
const items = () => data.layers[layer];
let selectedIds = new Set();
let copiedItems = [];
let pasteCount = 0;
const object = () => items().find(item => item.id === selected);
const iconPaths = {
  rect:'<rect x="4" y="6" width="16" height="12"/>',
  circle:'<circle cx="12" cy="12" r="7"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
  heart:'<path transform="translate(12 12)" d="'+heartPath(16,15)+'"/>',
  foot:'<path d="M5 18h14M7 18V7h10v11M5 7h14"/>'
};
function icon(kind) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="miter" aria-hidden="true">'+iconPaths[kind]+'</svg>';
}
for (const [index, name] of layerNames.entries()) {
  const button = document.createElement('button');
  button.textContent = name;
  button.onclick = () => {
    if (gesture) return;
    layer = index;
    clearSelection();
    render();
  };
  $('layers').append(button);
}
for (const [kind,{label}] of Object.entries(types)) {
  const button = document.createElement('button');
  button.id = 'tool-'+kind;
  button.title = '添加'+label;
  button.innerHTML = icon(kind)+'<span>'+label+'</span>';
  button.onclick = () => {
    if (gesture) return;
    add(kind);
  };
  $('tools').append(button);
}
function clearSelection() {
  selected=null;
  selectedIds.clear();
}
function checkpoint() {
  return {data:clone(data), layer, selected, selectedIds:new Set(selectedIds)};
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageError = '';
  } catch {
    storageError = '本地保存失败，刷新前请检查浏览器存储。';
  }
}
function finish(previous) {
  if (JSON.stringify(previous.data) !== JSON.stringify(data)) {
    history.push(previous);
    if (history.length>100) history.shift();
    save();
  }
  render();
}
function undo() {
  if (gesture) return;
  const previous = history.pop();
  if (!previous) return;
  ({data,layer,selected,selectedIds}=previous);
  save();
  render();
}
function newId() {
  return globalThis.crypto?.randomUUID?.() ?? Date.now()+'-'+Math.random();
}
function offsetCopy(source, offset = 0.5) {
  return {...source, x:round(source.x+offset), y:round(source.y+offset), id:newId()};
}
function selectedItems() {
  return items().filter(item => item.id === selected || selectedIds.has(item.id));
}
function pasteItems() {
  const previous = checkpoint();
  const offset = 0.5 * ++pasteCount;
  const copies = copiedItems.map(item => offsetCopy(item, offset));
  items().push(...copies);
  clearSelection();
  if (copies.length===1) selected=copies[0].id;
  else selectedIds=new Set(copies.map(item=>item.id));
  finish(previous);
}
function add(kind, source) {
  const previous = checkpoint();
  const {width,height} = types[kind];
  const bounds=shelfBounds(data);
  const item = source
    ? offsetCopy(source)
    : {kind,id:newId(),width,height,x:round(bounds.width/2),y:round(bounds.height/2),angle:0};
  items().push(item);
  selectedIds.clear();
  selected = item.id;
  finish(previous);
}
function remove() {
  if (gesture || (!selectedIds.size&&!object())) return;
  const ids=selectedIds.size ? selectedIds : new Set([selected]);
  const previous = checkpoint();
  data.layers[layer] = items().filter(item=>!ids.has(item.id));
  clearSelection();
  finish(previous);
}
function svg(tag, attrs) {
  const element = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [name,value] of Object.entries(attrs)) element.setAttribute(name,value);
  return element;
}
function view(board) {
  const shelf=shelfBounds(board);
  const bounds = viewport.getBoundingClientRect();
  const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
  const fitScale = 0.9 * Math.min(width/shelf.width, height/shelf.height);
  const scale = fitScale * zoom;
  const w = width/scale, h = height/scale;
  const offset=mobileLayout.matches?mobilePan:{x:0,y:0};
  canvas.setAttribute('viewBox',[(shelf.width-w)/2+offset.x,(shelf.height-h)/2+offset.y,w,h].join(' '));
  $('zoom-label').textContent = Math.round(zoom*100)+'%';
  return scale;
}
function dimensionLabel(item,scale,controlPoints) {
  const width=item.width.toFixed(1), height=item.height.toFixed(1);
  const caption=item.kind==='circle'?`Ø ${width} cm`:`${width} × ${height} cm`;
  const box=canvas.viewBox.baseVal;
  const labelWidth=(caption.length*7+26)/scale, labelHeight=24/scale;
  const clearance=10/scale, inset=4/scale;
  const points=controlPoints.map(([x,y])=>rotateVector(x,y,item.angle));
  const left=item.x+Math.min(...points.map(p=>p.x));
  const right=item.x+Math.max(...points.map(p=>p.x));
  const top=item.y+Math.min(...points.map(p=>p.y));
  const bottom=item.y+Math.max(...points.map(p=>p.y));
  const clampX=x=>Math.max(box.x+inset,Math.min(x,box.x+box.width-labelWidth-inset));
  const clampY=y=>Math.max(box.y+inset,Math.min(y,box.y+box.height-labelHeight-inset));
  const centeredX=clampX(item.x-labelWidth/2), centeredY=clampY(item.y-labelHeight/2);
  const candidates=[
    [centeredX,bottom+clearance],
    [centeredX,top-clearance-labelHeight],
    [right+clearance,centeredY],
    [left-clearance-labelWidth,centeredY]
  ];
  const [x,y]=candidates.find(([x,y])=>x===clampX(x)&&y===clampY(y))
    ?? [clampX(left-labelWidth-clearance),clampY(bottom+clearance)];
  return {caption,x:(x-box.x)*scale,y:(y-box.y)*scale};
}
function setMiniOpen(open) {
  miniOpen=open;
  miniFrame='';
  mini.classList.toggle('is-open',open);
  miniPanel.inert=!open;
  dimensionButton.setAttribute('aria-expanded',String(open));
}
function placeMini(label) {
  mini.hidden=!label;
  if (!label) {
    if (miniOpen) setMiniOpen(false);
    return;
  }
  dimensionButton.firstElementChild.textContent=label.caption;
  dimensionButton.style.left=label.x+'px';
  dimensionButton.style.top=label.y+'px';
  if (!miniOpen) return;
  const width=viewport.clientWidth;
  const height=Math.max(0,Math.min(viewport.clientHeight,miniVisibleBottom-viewport.getBoundingClientRect().top));
  const frame=width+'x'+height;
  // Keep the panel still while typing, but fit it again if the keyboard
  // or a window resize changes the available area.
  if (frame===miniFrame&&miniPanel.contains(document.activeElement)) return;
  miniFrame=frame;
  const inset=6;
  const labelBottom=label.y+dimensionButton.offsetHeight;
  const below=height-inset-labelBottom;
  const above=label.y-inset;
  const available=Math.max(0,height-2*inset);
  miniPanel.style.maxHeight=available+'px';
  const opensBelow=below>=miniPanel.offsetHeight || below>=above;
  const sideSpace=opensBelow?below:above;
  // On short screens reserve enough room for at least one editable row.
  // When space permits, keep the panel entirely on one side of the label.
  if(sideSpace>=128)miniPanel.style.maxHeight=Math.min(sideSpace,available)+'px';
  const panelWidth=miniPanel.offsetWidth, panelHeight=miniPanel.offsetHeight;
  const x=Math.max(inset,Math.min(label.x,width-panelWidth-inset));
  const targetY=opensBelow?labelBottom-1:label.y-panelHeight+1;
  const y=Math.max(inset,Math.min(targetY,height-panelHeight-inset));
  miniPanel.style.left=x+'px';
  miniPanel.style.top=y+'px';
  miniPanel.style.transformOrigin=`${Math.max(0,label.x+dimensionButton.offsetWidth/2-x)}px ${opensBelow?'top':'bottom'}`;
}

// Inline the fallback SVG path so directional cursors also work on file://.
const rotationCursorArc = 'M12.1596 9.1942C16.6983 10.1158 20.1896 12.7389 20.1896 16.0000S16.6983 21.8842 12.1596 22.8058';
const rotationCursorTips = 'M14.8915 7.9890L12.1596 9.1942L14.2369 11.3653 M14.2369 20.6347L12.1596 22.8058L14.8915 24.0110';
const rotationCursorCache = new Map();
function rotationCursor(degrees) {
  const angle=normalizeAngle(Math.round(degrees));
  if (!rotationCursorCache.has(angle)) {
    const icon=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <g transform="rotate(${angle} 16 16)" fill="none" stroke-width="0.95" stroke-linecap="round" stroke-linejoin="round">
        <path d="${rotationCursorArc}" stroke="#000000"/>
        <path d="${rotationCursorTips}" stroke="#000000"/>
      </g>
    </svg>`;
    rotationCursorCache.set(angle,`url("data:image/svg+xml,${encodeURIComponent(icon)}") 16 16`);
  }
  return rotationCursorCache.get(angle);
}

function addRotationZones(group,w,h,scale,directions,angle) {
  const inner=7/scale, outer=23/scale;
  for (const x of [-1,1]) {
    for (const y of [-1,1]) {
      // Keep both arms outside the outline, with space between rotation and resize.
      // On tiny shapes the arms stop before they can reach an adjacent resize handle.
      const hasCorner=directions.some(([hx,hy])=>hx===x&&hy===y);
      const armX=hasCorner?Math.max(0,Math.min(w-inner,10/scale)):0;
      const armY=hasCorner?Math.max(0,Math.min(h-inner,10/scale)):0;
      const points=[[-armX,inner],[inner,inner],[inner,-armY],[outer,-armY],
        [outer,outer],[-armX,outer]].map(([dx,dy])=>[x*(w+dx),y*(h+dy)].join(','));
      const cornerAngle=Math.atan2(y,x)*180/Math.PI;
      const zone=svg('polygon',{points:points.join(' '),class:'rotation-zone',fill:'transparent',
        'data-rotate':'true','data-corner-angle':cornerAngle});
      zone.style.setProperty('--corner-cursor',rotationCursor(angle+cornerAngle));
      group.prepend(zone);
    }
  }
}
function addRotationHandle(group,item,scale,w,h,controls,addHit) {
  const box=canvas.viewBox.baseVal, offset=46/scale;
  const margin=22*(Math.abs(Math.cos(item.angle*Math.PI/180))+Math.abs(Math.sin(item.angle*Math.PI/180)))/scale;
  const localControls=[...controls,[0,0]];
  // Try each side before clamping, so an edge does not hide the touch target.
  for (const [edgeX,edgeY,dx,dy] of [[0,-h,0,-1],[w,0,1,0],[0,h,0,1],[-w,0,-1,0]]) {
    const candidate=rotateVector(edgeX+dx*offset,edgeY+dy*offset,item.angle);
    const worldX=Math.max(box.x+margin,Math.min(box.x+box.width-margin,item.x+candidate.x));
    const worldY=Math.max(box.y+margin,Math.min(box.y+box.height-margin,item.y+candidate.y));
    const {x,y}=rotateVector(worldX-item.x,worldY-item.y,-item.angle);
    // Hit squares share the same local axes as the selected object.
    if (localControls.some(([cx,cy])=>Math.abs(x-cx)<44/scale&&Math.abs(y-cy)<44/scale)) continue;
    controls.push([x,y]);
    const anchorX=dx*item.width/2, anchorY=dy*item.height/2;
    const stroke='var(--accent)';
    group.append(svg('line',{x1:anchorX,y1:anchorY,x2:x,y2:y,stroke,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
    addHit(x,y,{'data-rotate':'true'});
    const icon=svg('g',{transform:`translate(${x} ${y}) scale(${1/scale})`,'pointer-events':'none'});
    icon.append(svg('circle',{r:10,fill:'var(--white)',stroke}));
    icon.append(svg('path',{d:'M5 -2 A5 5 0 1 0 4 3 M1 -2 H5 V-6',fill:'none',stroke,'stroke-linecap':'round','stroke-linejoin':'round'}));
    group.append(icon);
    return;
  }
}

function selectionBounds(item) {
  if (item.kind==='heart') {
    const points=heartPolygon(item);
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
      top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  }
  const shape=outline(item);
  const x=shape.support(1,0).x, y=shape.support(0,1).y;
  return {left:item.x-x,right:item.x+x,top:item.y-y,bottom:item.y+y};
}
function selectionRect(bounds,className) {
  const {left,right,top,bottom}=bounds;
  return svg('rect',{class:className,x:left,y:top,width:right-left,height:bottom-top});
}
function marqueeBounds(start,end) {
  return {left:Math.min(start.x,end.x),right:Math.max(start.x,end.x),
    top:Math.min(start.y,end.y),bottom:Math.max(start.y,end.y)};
}
function paint() {
  $('undo-action').disabled = history.length===0;
  const board = $('shelf-dialog').open ? {...data,...readClearance()} : data;
  const scale = view(board);
  if (gesture?.rotation?.snap) {
    canvas.style.setProperty('--active-rotation-cursor',
      rotationCursor(object().angle+gesture.rotation.cornerAngle));
  }
  const roundShelf = board.shape==='circle';
  const size = roundShelf ? `Ø ${board.diameter} cm` : `${board.width} × ${board.height} cm`;
  $('shelf-size').textContent=size;
  $('stage-title').textContent=layerNames[layer]+(roundShelf ? ' · '+size : '');
  const radius=board.diameter/2;
  const shelfShape=(className,gap)=>roundShelf
    ? svg('circle',{class:className,cx:radius,cy:radius,r:radius-gap})
    : svg('rect',{class:className,x:gap,y:gap,width:board.width-2*gap,height:board.height-2*gap});
  const nodes = [shelfShape('board',0)];
  const bounds=shelfBounds(board);
  const usable = board.edgeGap*2<Math.min(bounds.width,bounds.height);
  if (usable) nodes.push(shelfShape('safe-area',board.edgeGap));
  const conflicts=clearanceConflicts(items(),board);
  const thinObjectTargets = [];
  const shelfNodeCount = nodes.length;
  let sizeLabel=null;
  // Keep the selected object above its neighbours while editing.
  for (const item of [...items().filter(item=>item.id!==selected), ...items().filter(item=>item.id===selected)]) {
    const group = svg('g',{transform:`translate(${item.x} ${item.y}) rotate(${item.angle})`});
    const w=item.width/2,h=item.height/2, type=types[item.kind];
    const ellipse=item.kind==='circle'||item.kind==='ellipse';
    const tag=item.kind==='heart'?'path':ellipse?'ellipse':'rect';
    const geometry=tag==='path'?{d:heartPath(item.width,item.height)}:ellipse?{cx:0,cy:0,rx:w,ry:h}:{x:-w,y:-h,width:item.width,height:item.height};
    // Place touch-only targets below all visible objects and controls so they
    // catch otherwise empty taps without blocking the actual object outlines.
    if (touchInput && Math.min(item.width,item.height)*scale < 12) {
      const targetGroup=svg('g',{transform:group.getAttribute('transform')});
      targetGroup.append(svg(tag,{...geometry,'data-object':item.id,class:'thin-object-hit',
        fill:'none',stroke:'transparent','stroke-width':24,'pointer-events':'stroke',
        'vector-effect':'non-scaling-stroke'}));
      thinObjectTargets.push(targetGroup);
    }
    const overflow=outside(item,board), conflict=conflicts.has(item.id);
    group.append(svg(tag,{...geometry,class:'object','data-object':item.id,
      fill:type.fill,stroke:overflow||conflict?'var(--error)':type.stroke,'stroke-width':overflow||conflict?2:1,
      'stroke-dasharray':overflow?'5 3':'none','vector-effect':'non-scaling-stroke'}));
    if (item.id===selected) {
      group.append(svg('rect',{class:conflict?'outline conflict':'outline',x:-w,y:-h,width:item.width,height:item.height}));
      const directions = item.kind==='rect'||item.kind==='foot'||item.kind==='heart'
        ? [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
        : [[-1,0],[1,0],[0,-1],[0,1]];
      const size = 9/scale;
      const touch = touchInput;
      const handleW=touch?Math.max(w,46/scale):w;
      const handleH=touch?Math.max(h,46/scale):h;
      const addHit=(x,y,attributes)=>{
        const hit=svg('rect',{...attributes,class:'touch-handle',x:x-22/scale,y:y-22/scale,width:44/scale,height:44/scale,fill:'transparent'});
        group.append(hit);
      };
      for (const [x,y] of directions) {
        if(touch) addHit(x*handleW,y*handleH,{'data-hx':x,'data-hy':y});
        group.append(svg('rect',{class:'handle','data-hx':x,'data-hy':y,x:x*handleW-size/2,y:y*handleH-size/2,
          width:size,height:size,fill:'var(--white)',stroke:'var(--accent)','vector-effect':'non-scaling-stroke'}));
      }
      const controls=directions.map(([x,y])=>[x*handleW,y*handleH]);
      if(touch) {
        addRotationHandle(group,item,scale,handleW,handleH,controls,addHit);
      } else {
        addRotationZones(group,w,h,scale,directions,item.angle);
      }
      if(mobileLayout.matches) sizeLabel=dimensionLabel(item,scale,controls);
    }
    nodes.push(group);
  }
  if (selectedIds.size>1) {
    const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
    for (const item of items()) {
      if (!selectedIds.has(item.id)) continue;
      const edge=selectionBounds(item);
      bounds.left=Math.min(bounds.left,edge.left);
      bounds.right=Math.max(bounds.right,edge.right);
      bounds.top=Math.min(bounds.top,edge.top);
      bounds.bottom=Math.max(bounds.bottom,edge.bottom);
    }
    nodes.push(selectionRect(bounds,'group-outline'));
  }
  if (gesture?.marquee?.bounds) nodes.push(selectionRect(gesture.marquee.bounds,'marquee-outline'));
  nodes.splice(shelfNodeCount,0,...thinObjectTargets);
  canvas.replaceChildren(...nodes);
  placeMini(sizeLabel);
  $('notice').textContent=storageError;
  const warning=$('clearance-warning');
  const selectedWarnings=[...(conflicts.get(selected)??[])];
  warning.hidden=!selectedWarnings.length;
  warning.textContent=selectedWarnings.join(' ');
  const settingsWarning=$('clearance-setting-warning');
  settingsWarning.hidden=usable;
  settingsWarning.textContent=usable?'':'边缘间距过大，棚板没有可用区域。';
}
const positionFields=[['x','X (cm)'],['y','Y (cm)']];
function fieldSpec(item) {
  if (item.kind==='circle') return [['width','直径 (cm)'],...positionFields,['angle','旋转角度 (°)']];
  const labels=item.kind==='ellipse'?['长轴 (cm)','短轴 (cm)']:['长度 (cm)','宽度 (cm)'];
  const positions=item.kind==='rect'?[['x','X坐标 (cm)'],['y','Y坐标 (cm)']]:positionFields;
  const fields=[['width',labels[0]],['height',labels[1]],...positions];
  fields.push(['angle','旋转角度 (°)']);
  return fields;
}
function syncFields() {
  const item = object();
  if (!item) return;
  for (const [key] of fieldSpec(item)) $('value-'+key).value = round(item[key]);
}
function renderProperties() {
  const item = object();
  $('delete-action').disabled = !item;
  $('empty').hidden = Boolean(item);
  $('properties').hidden = !item;
  $('field-error').textContent = '';
  if (!item) return;
  $('object-name').textContent = types[item.kind].label;
  const fields = fieldSpec(item).map(([key,label]) => {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.id = 'value-'+key;
    input.type = 'number';
    input.inputMode = 'decimal';
    input.step = 'any';
    input.required = true;
    if (key==='width'||key==='height') input.min='0.001';
    if (key==='angle') { input.min='0'; input.max='360'; }
    input.value = round(item[key]);
    input.addEventListener('change',()=>editField(key,input));
    input.addEventListener('input',()=>{if(mobileLayout.matches)editField(key,input,true);});
    wrapper.append(input);
    return wrapper;
  });
  $('fields').replaceChildren(...fields);
}
function editField(key,input,keepTyping=false) {
  const item = object();
  if (!item || gesture) return;
  const value = input.valueAsNumber;
  let error = '';
  if (input.value==='' || !Number.isSafeInteger(Math.round(value*1000))) error='请输入有效数值。';
  else if ((key==='width'||key==='height')&&round(value)<=0) error='尺寸须至少为 0.001 cm。';
  else if (key==='angle'&&(value<0||value>360)) {
    error='请输入 0–360° 的角度。';
  } else if (item.kind==='ellipse'&&((key==='width'&&round(value)<item.height)||(key==='height'&&round(value)>item.width))) {
    error='长轴必须大于或等于短轴。';
  }
  input.toggleAttribute('aria-invalid',Boolean(error));
  if (error) input.setAttribute('aria-invalid','true');
  $('field-error').textContent = error;
  if (error) return;
  const previous = checkpoint();
  item[key] = key==='angle'?normalizeAngle(round(value)):round(value);
  if (item.kind==='circle'&&key==='width') item.height=item.width;
  if (JSON.stringify(previous.data)!==JSON.stringify(data)) {
    history.push(previous);
    if (history.length>100) history.shift();
    save();
  }
  if(!keepTyping)input.value = item[key];
  paint();
}
function render() {
  Array.from($('layers').children).forEach((button,index)=>button.setAttribute('aria-pressed',String(index===layer)));
  renderProperties();
  paint();
}
function point(event) {
  return new DOMPoint(event.clientX,event.clientY).matrixTransform(canvas.getScreenCTM().inverse());
}
function usePointerControls(event) {
  const touch=event.pointerType==='touch'||event.pointerType==='pen';
  if (touchInput===touch || gesture) return;
  touchInput=touch;
  if (selected!==null) paint();
}
canvas.addEventListener('pointermove',usePointerControls);
canvas.addEventListener('pointerdown',event=>{
  if (event.button!==0 || gesture) return;
  const previousMode=touchInput;
  usePointerControls(event);
  // On hybrid devices the first press can switch controls before any hover event.
  const target=event.isTrusted&&previousMode!==touchInput
    ? document.elementFromPoint(event.clientX,event.clientY)??canvas
    : event.target;
  const handle=target.closest('[data-hx]');
  const hit=target.closest('[data-object]');
  const touch=event.pointerType==='touch'||event.pointerType==='pen';
  const rotation=!handle && target.closest(touch?'.touch-handle[data-rotate]':'.rotation-zone');
  if (isTextEditing(document.activeElement)) document.activeElement.blur();
  if (touch||rotation) event.preventDefault();
  else canvas.focus?.({preventScroll:true});
  if (!handle&&!hit&&!rotation) {
    if (event.pointerType==='mouse'&&(target===canvas||target.matches('.board'))) {
      gesture={id:event.pointerId,start:point(event),marquee:{x:event.clientX,y:event.clientY}};
      if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (selected===null&&!selectedIds.size) return;
    clearSelection();
    render();
    return;
  }
  if (hit) {
    selectedIds.clear();
    selected=hit.dataset.object;
  }
  const item=object();
  if (!item) return;
  const start=point(event);
  gesture={id:event.pointerId,start,original:{...item},previous:checkpoint(),
    rotation:rotation?{startAngle:Math.atan2(start.y-item.y,start.x-item.x),
      degrees:item.angle,snap:!touch,cornerAngle:Number(rotation.dataset.cornerAngle)}:null,
    axes:handle?[Number(handle.dataset.hx),Number(handle.dataset.hy)]:null};
  canvas.classList.toggle('rotating',Boolean(rotation&&!touch));
  if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
  render();
});
function resizeFromAnchor(item, original, [hx,hy], dx, dy) {
  const minimum = 0.001;
  const local = rotateVector(dx,dy,-original.angle);
  let {width,height} = original;
  if (original.kind==='ellipse') {
    const axisSize = hx ? width : height;
    const delta = hx ? hx*local.x : hy*local.y;
    // Both axes use the pointer-down dimensions and the same scale.
    const scale = Math.max(minimum/Math.min(width,height),1+delta/axisSize);
    width *= scale;
    height *= scale;
  } else if (original.kind==='circle') {
    const delta = hx ? hx*local.x : hy*local.y;
    width=height=Math.max(minimum,round(width+delta));
  } else {
    if (hx) width=Math.max(minimum,round(width+hx*local.x));
    if (hy) height=Math.max(minimum,round(height+hy*local.y));
  }
  // Move half the accepted size change along each dragged local axis.
  // The opposite edge or corner stays at its original world position.
  const shift=rotateVector(hx*(width-original.width)/2,hy*(height-original.height)/2,original.angle);
  Object.assign(item,{width,height,x:original.x+shift.x,y:original.y+shift.y});
}
function applyRotation(shift) {
  const {degrees,snap}=gesture.rotation;
  object().angle=normalizeAngle(round(shift&&snap?Math.round(degrees/15)*15:degrees));
}
for (const type of ['keydown','keyup']) {
  window.addEventListener(type,event=>{
    if (event.key!=='Shift'||!gesture?.rotation?.snap) return;
    applyRotation(event.shiftKey);
    paint();
    syncFields();
  });
}
canvas.addEventListener('pointermove',event=>{
  if (gesture?.id!==event.pointerId) return;
  if (gesture.marquee) {
    const {marquee,start}=gesture;
    if (!marquee.bounds&&Math.hypot(event.clientX-marquee.x,event.clientY-marquee.y)<3) return;
    marquee.bounds=marqueeBounds(start,point(event));
    paint();
    return;
  }
  if (miniOpen) setMiniOpen(false);
  const p=point(event), {start,original,axes}=gesture;
  const dx=p.x-start.x,dy=p.y-start.y;
  const item=object();
  if (gesture.rotation) {
    if (Math.hypot(p.x-original.x,p.y-original.y)<1e-9) return;
    const rotation=gesture.rotation;
    const endAngle=Math.atan2(p.y-original.y,p.x-original.x);
    rotation.degrees=original.angle+(endAngle-rotation.startAngle)*180/Math.PI;
    applyRotation(event.shiftKey);
  } else if (!axes) {
    item.x=round(original.x+dx);
    item.y=round(original.y+dy);
  } else {
    resizeFromAnchor(item,original,axes,dx,dy);
  }
  paint();
  syncFields();
});
canvas.addEventListener('pointerup',event=>{
  if (gesture?.id!==event.pointerId) return;
  const {previous,marquee,start}=gesture;
  gesture=null;
  if (marquee) {
    const changed=selected!==null||selectedIds.size>0;
    clearSelection();
    if (marquee.bounds||Math.hypot(event.clientX-marquee.x,event.clientY-marquee.y)>=3) {
      const area=marqueeBounds(start,point(event));
      for (const item of items()) {
        const edge=selectionBounds(item);
        if (edge.left>=area.left&&edge.right<=area.right&&edge.top>=area.top&&edge.bottom<=area.bottom) {
          selectedIds.add(item.id);
        }
      }
      if (selectedIds.size===1) {
        [selected]=selectedIds;
        selectedIds.clear();
      }
      render();
    } else if (changed) render();
    return;
  }
  canvas.classList.remove('rotating');
  finish(previous);
});
function cancelGesture(event) {
  if (gesture?.id!==event.pointerId) return;
  if (gesture.previous) ({data,layer,selected,selectedIds}=gesture.previous);
  gesture=null;
  canvas.classList.remove('rotating');
  render();
}
canvas.addEventListener('pointercancel',cancelGesture);
canvas.addEventListener('lostpointercapture',cancelGesture);
window.addEventListener('blur',()=>{if(gesture)cancelGesture({pointerId:gesture.id});});
$('properties').onsubmit = event => {
  event.preventDefault();
  const input=document.activeElement;
  if (input?.id.startsWith('value-')) editField(input.id.slice(6),input);
};
$('copy').onclick = () => { const item=object(); if (!gesture&&item) add(item.kind,item); };
$('delete-action').onclick = remove;
$('remove').onclick = remove;
const aboutDialog = $('about-dialog');
const aboutTrigger = $('about-trigger');
aboutTrigger.onclick = () => {
  if (!gesture && !aboutDialog.open) {
    aboutDialog.showModal();
    aboutDialog.querySelector('.about-content').scrollTop = 0;
  }
};
$('about-close').onclick = () => aboutDialog.close();
let aboutBackdropPress = false;
aboutDialog.addEventListener('pointerdown', event => {
  aboutBackdropPress = event.target === aboutDialog;
});
aboutDialog.addEventListener('click', event => {
  if (aboutBackdropPress && event.target === aboutDialog) aboutDialog.close();
  aboutBackdropPress = false;
});
aboutDialog.addEventListener('close', () => {
  aboutBackdropPress = false;
  if (!aboutDialog.open) aboutTrigger.focus({preventScroll:true});
});
function isTextEditing(element) {
  return element?.matches?.('input, textarea, select') || element?.isContentEditable;
}
const arrowDirections = {
  ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1]
};
window.addEventListener('keydown',event=>{
  if (event.defaultPrevented || event.isComposing || gesture || aboutDialog.open || $('shelf-dialog').open ||
      isTextEditing(document.activeElement) || event.composedPath().some(isTextEditing)) return;
  if (event.key==='Backspace'||event.key==='Delete') {
    if (event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||(!object()&&!selectedIds.size)) return;
    event.preventDefault();
    remove();
    return;
  }
  if (event.metaKey!==event.ctrlKey && !event.altKey && !event.shiftKey) {
    switch (event.key.toLowerCase()) {
      case 'z':
        if (history.length) {
          event.preventDefault();
          undo();
        }
        return;
      case 'c': {
        if (window.getSelection()?.isCollapsed===false) return;
        const selection = selectedItems();
        if (!selection.length) return;
        event.preventDefault();
        copiedItems = clone(selection);
        pasteCount = 0;
        return;
      }
      case 'v':
        if (!copiedItems.length) return;
        event.preventDefault();
        if (!event.repeat) pasteItems();
        return;
    }
  }
  if (event.metaKey || event.ctrlKey || event.altKey ||
      !Object.hasOwn(arrowDirections,event.key)) return;
  const selection = selectedItems();
  if (!selection.length) return;
  event.preventDefault();
  const previous = checkpoint();
  const [dx,dy] = arrowDirections[event.key];
  const step = event.shiftKey ? 1 : 0.1;
  for (const item of selection) {
    if (dx) item.x=round(item.x+dx*step);
    if (dy) item.y=round(item.y+dy*step);
  }
  finish(previous);
}, {capture:true});
const shelfDialog = $('shelf-dialog');
let shelfClearancePreview = false;
$('settings').onclick=()=>{
  $('shelf-shape').value=data.shape;
  $('shelf-diameter').value=data.diameter;
  updateShelfFields();
  $('shelf-width').value=data.width;
  $('shelf-height').value=data.height;
  $('piece-gap').value=data.pieceGap.toFixed(1);
  $('edge-gap').value=data.edgeGap.toFixed(1);
  $('shelf-error').textContent='';
  shelfDialog.showModal();
  paint();
};
const clearanceInputs=[$('piece-gap'),$('edge-gap')];
function readClearance() {
  if (clearanceInputs.some(input=>!input.checkValidity()||!Number.isSafeInteger(Math.round(input.valueAsNumber*10)))) return null;
  return {pieceGap:Math.round(clearanceInputs[0].valueAsNumber*10)/10,edgeGap:Math.round(clearanceInputs[1].valueAsNumber*10)/10};
}
function updateShelfFields() {
  const circle=$('shelf-shape').value==='circle';
  $('rect-dimensions').hidden=circle;
  $('circle-dimensions').hidden=!circle;
}
function readShelf() {
  const shape=$('shelf-shape').value;
  const fields=shape==='circle' ? [['diameter','shelf-diameter']] :
    [['width','shelf-width'],['height','shelf-height']];
  const values={shape};
  for (const [key,id] of fields) {
    const input=$(id);
    const tenths=Math.round(input.valueAsNumber*10);
    if (!input.checkValidity()||!Number.isSafeInteger(tenths)) return null;
    values[key]=tenths/10;
  }
  return values;
}
$('shelf-form').addEventListener('input',event=>{
  updateShelfFields();
  $('shelf-error').textContent='';
  if (clearanceInputs.includes(event.target)) {
    shelfClearancePreview = true;
    paint();
  }
});
shelfDialog.addEventListener('close',()=>{
  if (shelfDialog.open) return;
  if (shelfClearancePreview) {
    shelfClearancePreview = false;
    paint();
  }
  $('settings').focus({preventScroll:true});
});
$('cancel-settings').onclick=()=>shelfDialog.close();
$('shelf-form').onsubmit=event=>{
  event.preventDefault();
  const shelf=readShelf(), clearance=readClearance();
  if (!shelf||!clearance) {
    $('shelf-error').textContent=!shelf ? '请输入大于 0 的尺寸，最多一位小数。' :
      '间距须为非负数，最多一位小数。';
    return;
  }
  const previous=checkpoint();
  Object.assign(data,shelf,clearance);
  shelfClearancePreview = false;
  shelfDialog.close();
  finish(previous);
};
function setZoom(value) {
  if (gesture) return;
  zoom=Math.max(0.15,Math.min(5,value));
  paint();
}
$('zoom-out').onclick=()=>setZoom(zoom/1.25);
$('zoom-in').onclick=()=>setZoom(zoom*1.25);
$('fit').onclick=()=>{if(!gesture){mobilePan.x=mobilePan.y=0;setZoom(1);}};
$('undo-action').onclick=undo;
dimensionButton.onclick=()=>{setMiniOpen(!miniOpen);paint();};
$('mini-close').onclick=()=>{setMiniOpen(false);paint();dimensionButton.focus({preventScroll:true});};
new ResizeObserver(paint).observe(viewport);
render();
