'use strict';
const STORAGE_KEY = 'glass-kiln-planner-e4-workspace-v1';
const DEFAULT_CLEARANCE = {pieceGap:0.5,edgeGap:1};
const fresh = () => ({width:18, height:18, shape:"rect", diameter:18, ...DEFAULT_CLEARANCE, layers:[[],[],[]]});
const clone = value => JSON.parse(JSON.stringify(value));
const positive = value => Number.isFinite(value) && value > 0;
const round = value => Math.round(value * 1000) / 1000;
const normalizeAngle = value => ((value % 360) + 360) % 360;
const types = {
  rect:{label:'矩形', fill:'var(--rect-fill)', stroke:'var(--rect-stroke)', width:4, height:3},
  circle:{label:'圆形', fill:'var(--circle-fill)', stroke:'var(--circle-stroke)', width:3, height:3},
  ellipse:{label:'椭圆形', fill:'var(--ellipse-fill)', stroke:'var(--ellipse-stroke)', width:5, height:3},
  heart:{label:'爱心', fill:'var(--circle-fill)', stroke:'var(--circle-stroke)', width:4, height:3.75},
  foot:{label:'马脚', fill:'var(--foot-fill)', stroke:'var(--foot-stroke)', width:3, height:3}
};
function validWorkspace(value) {
  if (!value || !positive(value.width) || !positive(value.height) || !Array.isArray(value.layers) || value.layers.length !== 3) return false;
  const ids = new Set();
  return value.layers.every(layer => Array.isArray(layer) && layer.every(object => {
    if (!object || !Object.hasOwn(types, object.kind) || typeof object.id !== 'string' || ids.has(object.id) ||
        !positive(object.width) || !positive(object.height) || ![object.x, object.y, object.angle].every(Number.isFinite)) return false;
    ids.add(object.id);
    return object.kind !== 'circle' || object.width === object.height;
  }));
}
function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {data:fresh()};
    const data = JSON.parse(raw);
    if (validWorkspace(data)) {
      data.shape = data.shape==='circle' && positive(data.diameter) ? 'circle' : 'rect';
      if (!positive(data.diameter)) data.diameter=18;
      for (const [key,fallback] of Object.entries(DEFAULT_CLEARANCE)) {
        if (!Number.isFinite(data[key]) || data[key]<0) data[key]=fallback;
      }
      return {data};
    }
    return {data:fresh(), warning:'本地排版数据格式无效。'};
  } catch {
    return {data:fresh(), warning:'无法读取本地排版。'};
  }
}
function rotateVector(x, y, angle) {
  const radians = angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return {x:x*c-y*s, y:x*s+y*c};
}
// Maximum distance from the shelf center to the exact object outline.
function radialExtent(object, radius) {
  if (object.kind==='heart') return Math.max(...heartPolygon(object).map(p=>Math.hypot(p.x-radius,p.y-radius)));
  const center=rotateVector(object.x-radius,object.y-radius,-object.angle);
  let x=Math.abs(center.x), y=Math.abs(center.y);
  let a=object.width/2, b=object.height/2;
  if (object.kind==='rect'||object.kind==='foot') return Math.hypot(x+a,y+b);
  if (a===b) return Math.hypot(x,y)+a;
  if (b>a) { [a,b]=[b,a]; [x,y]=[y,x]; }

  // Maximize distance on the ellipse in the quadrant facing away from the shelf center.
  // The multiplier above the largest squared axis gives a monotone root.
  const difference=(a-b)*(a+b);
  // Quarter turns can leave a tiny floating-point residue on the symmetry axis.
  if (x<1e-10) x=0;
  const p=a*x, q=b*y;
  if (p===0 && q<=difference) {
    const v=q/difference;
    return Math.hypot(a*Math.sqrt(1-v*v),y+b*v);
  }
  let low=0, high=Math.hypot(p,q);
  for (let i=0;i<96;i++) {
    const mid=(low+high)/2;
    if (mid===low||mid===high) break;
    if (Math.hypot(p/mid,q/(mid+difference))>1) low=mid;
    else high=mid;
  }
  return Math.hypot(x+a*(p/high),y+b*(q/(high+difference)));
}
function shelfBounds(board) {
  return board.shape==='circle' ? {width:board.diameter,height:board.diameter} : board;
}
function outside(object, board) {
  if (board.shape==='circle') {
    const radius=board.diameter/2;
    return radialExtent(object,radius)>radius+1e-7;
  }
  if (object.kind==='heart') return heartPolygon(object).some(p=>
    p.x<-1e-8||p.y<-1e-8||p.x>board.width+1e-8||p.y>board.height+1e-8);
  const w=object.width/2, h=object.height/2;
  const {x:c,y:s}=rotateVector(1,0,object.angle);
  const curved=object.kind==='ellipse'||object.kind==='circle';
  const dx=curved?Math.hypot(w*c,h*s):Math.abs(w*c)+Math.abs(h*s);
  const dy=curved?Math.hypot(w*s,h*c):Math.abs(w*s)+Math.abs(h*c);
  const e=1e-8;
  return object.x-dx < -e || object.y-dy < -e || object.x+dx > board.width+e || object.y+dy > board.height+e;
}
