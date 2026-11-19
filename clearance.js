'use strict';

const CLEARANCE_EPS = 1e-7;
function outline(item) {
  const angle = item.angle * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  const a = item.width / 2, b = item.height / 2;
  const rectangle = item.kind === 'rect' || item.kind === 'foot';
  return {
    item,
    support(nx, ny) {
      const u = nx*c + ny*s, v = -nx*s + ny*c;
      const radius = Math.hypot(a*u,b*v);
      const x = rectangle ? (u >= 0 ? a : -a) : a*(a*u/radius);
      const y = rectangle ? (v >= 0 ? b : -b) : b*(b*v/radius);
      return {x:x*c-y*s,y:x*s+y*c};
    }
  };
}
function pairConflict(left, right, gap) {
  if (left.item.kind==='heart'||right.item.kind==='heart') return conflictWithHeart(left.item,right.item,gap);
  const dx = right.item.x-left.item.x, dy = right.item.y-left.item.y;
  const limit = gap-CLEARANCE_EPS;
  if (left.item.kind==='circle' && right.item.kind==='circle') {
    return Math.hypot(dx,dy)-left.item.width/2-right.item.width/2 < limit;
  }
  // For centrally symmetric convex outlines the largest signed gap over
  // unit normals is their Euclidean separation, or negative penetration.
  function witness(nx,ny) {
    const a=left.support(nx,ny), b=right.support(nx,ny);
    return {x:dx-a.x-b.x,y:dy-a.y-b.y};
  }
  const angle = Math.atan2(dy,dx);
  for (const t of [0,Math.PI/2,Math.PI,3*Math.PI/2,angle]) {
    const nx=Math.cos(t), ny=Math.sin(t), p=witness(nx,ny);
    if (p.x*nx+p.y*ny>=limit) return false;
  }
  const intervals = [[0,Math.PI],[Math.PI,2*Math.PI]];
  while (intervals.length) {
    const [lo,hi]=intervals.pop(), mid=(lo+hi)/2;
    const p=witness(Math.cos(mid),Math.sin(mid));
    const project=t=>p.x*Math.cos(t)+p.y*Math.sin(t);
    const lower=project(mid);
    if (lower>=limit) return false;
    // The fixed support points at the midpoint give an upper bound for
    // every normal in this interval, even when the support point changes.
    const peak=(Math.atan2(p.y,p.x)+2*Math.PI)%(2*Math.PI);
    const upper=Math.max(project(lo),project(hi),peak>=lo&&peak<=hi?Math.hypot(p.x,p.y):-Infinity);
    if (upper<limit) continue;
    if (upper-lower<=CLEARANCE_EPS/8 || mid===lo || mid===hi) {
      if (upper>=limit) return false;
      continue;
    }
    intervals.push([lo,mid],[mid,hi]);
  }
  return true;
}
function clearanceConflicts(items, board) {
  const glass=items.filter(item=>item.kind!=='foot').map(outline);
  const feet=items.filter(item=>item.kind==='foot').map(outline);
  const conflicts=new Map();
  function record(item,message) {
    const messages=conflicts.get(item.id)??new Set();
    messages.add(message);
    conflicts.set(item.id,messages);
  }
  for (const shape of glass) {
    const {item}=shape;
    if (board.shape==='circle') {
      const radius=board.diameter/2;
      if (radius<=board.edgeGap || radialExtent(item,radius)>radius-board.edgeGap+CLEARANCE_EPS) {
        record(item,'与棚板边缘的距离不足。');
      }
      continue;
    }
    if (item.kind==='heart') {
      const gap=board.edgeGap-CLEARANCE_EPS;
      if (heartPolygon(item).some(p=>p.x<gap||p.y<gap||p.x>board.width-gap||p.y>board.height-gap)) {
        record(item,'与棚板边缘的距离不足。');
      }
      continue;
    }
    const horizontal=shape.support(1,0).x, vertical=shape.support(0,1).y;
    const distances=[item.x-horizontal,board.width-item.x-horizontal,item.y-vertical,board.height-item.y-vertical];
    if (Math.min(...distances)<board.edgeGap-CLEARANCE_EPS) record(item,'与棚板边缘的距离不足。');
  }
  for (let i=0;i<glass.length;i++) {
    for (let j=i+1;j<glass.length;j++) {
      if (!pairConflict(glass[i],glass[j],board.pieceGap)) continue;
      record(glass[i].item,'与同层玻璃作品距离不足或重叠。');
      record(glass[j].item,'与同层玻璃作品距离不足或重叠。');
    }
  }
  for (const piece of glass) {
    for (const foot of feet) {
      if (!pairConflict(piece,foot,0.5)) continue;
      record(piece.item,'与马脚距离不足或重叠。');
      record(foot.item,'与玻璃作品距离不足或重叠。');
    }
  }
  return conflicts;
}
