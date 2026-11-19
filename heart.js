'use strict';

// Normalized to a 1 × 1 bounding box. The outline is mirrored across x=0.
const heartCurves = [
  [[0,-.27],[.09,-.43],[.16,-.5],[.27,-.5]],
  [[.27,-.5],[.40,-.5],[.5,-.37],[.5,-.19]],
  [[.5,-.19],[.5,.08],[.23,.35],[0,.5]],
  [[0,.5],[-.23,.35],[-.5,.08],[-.5,-.19]],
  [[-.5,-.19],[-.5,-.37],[-.40,-.5],[-.27,-.5]],
  [[-.27,-.5],[-.16,-.5],[-.09,-.43],[0,-.27]]
];

function heartPath(width,height) {
  const point=([x,y])=>x*width+' '+y*height;
  return 'M'+point(heartCurves[0][0])+heartCurves.map(curve=>'C'+curve.slice(1).map(point).join(' ')).join('')+'Z';
}

const HEART_TOLERANCE = .0001; // cm per curved outline
const heartPolygonCache = new WeakMap();

function heartPolygon(item) {
  const cached=heartPolygonCache.get(item);
  const {x,y,width,height,angle}=item;
  if (cached&&cached.x===x&&cached.y===y&&cached.width===width&&cached.height===height&&cached.angle===angle) return cached.points;
  const world=([u,v])=>{
    const p=rotateVector(u*width,v*height,angle);
    return {x:x+p.x,y:y+p.y};
  };
  const points=[world(heartCurves[0][0])];
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  function flatten(a,b,c,d,depth=0) {
    if (depth>=16 || Math.max(segmentDistanceSquared(b,a,d),segmentDistanceSquared(c,a,d))<=HEART_TOLERANCE**2) {
      points.push(d);
      return;
    }
    const ab=midpoint(a,b),bc=midpoint(b,c),cd=midpoint(c,d);
    const left=midpoint(ab,bc),right=midpoint(bc,cd),middle=midpoint(left,right);
    flatten(a,ab,left,middle,depth+1);
    flatten(middle,right,cd,d,depth+1);
  }
  for (const curve of heartCurves) flatten(...curve.map(world));
  points.pop();
  heartPolygonCache.set(item,{x,y,width,height,angle,points});
  return points;
}

function segmentDistanceSquared(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
}

function polygonContains(points,p) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[j],b=points[i];
    if (segmentDistanceSquared(p,a,b)<=1e-20) return false;
    if ((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}

function conflictWithHeart(left,right,gap) {
  const [heart,other]=left.kind==='heart'?[left,right]:[right,left];
  const first=heartPolygon(heart);
  const limit=Math.max(0,gap-CLEARANCE_EPS);
  if(other.kind==='circle') {
    const min=(other.width/2+limit)**2;
    return polygonContains(first,other)||first.some((p,i)=>segmentDistanceSquared(other,p,first[(i+1)%first.length])<min);
  }
  let second;
  if(other.kind==='heart') second=heartPolygon(other);
  else {
    const a=other.width/2,b=other.height/2;
    let local=[[-a,-b],[a,-b],[a,b],[-a,b]];
    if (other.kind==='ellipse') {
      // The maximum axis bounds the chord error under affine scaling.
      const steps=Math.min(4096,Math.max(16,Math.ceil(Math.PI*Math.sqrt(Math.max(a,b)/(2*HEART_TOLERANCE)))));
      local=Array.from({length:steps},(_,i)=>[a*Math.cos(i*2*Math.PI/steps),b*Math.sin(i*2*Math.PI/steps)]);
    }
    second=local.map(([x,y])=>{
      const p=rotateVector(x,y,other.angle);
      return {x:p.x+other.x,y:p.y+other.y};
    });
  }
  const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  const straddles=(a,b)=>a<0&&b>0||b<0&&a>0;
  const edges=points=>points.map((a,i)=>{
    const b=points[(i+1)%points.length];
    return {a,b,left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};
  });
  const secondEdges=edges(second), squared=limit*limit;
  for(const one of edges(first)) {
    for(const two of secondEdges) {
      if (one.right+limit<two.left||two.right+limit<one.left||
          one.bottom+limit<two.top||two.bottom+limit<one.top) continue;
      const {a,b}=one,{a:c,b:d}=two;
      if (straddles(cross(a,b,c),cross(a,b,d))&&straddles(cross(c,d,a),cross(c,d,b))) return true;
      if (limit&&Math.min(segmentDistanceSquared(a,c,d),segmentDistanceSquared(b,c,d),
        segmentDistanceSquared(c,a,b),segmentDistanceSquared(d,a,b))<squared) return true;
    }
  }
  // Check interior points too, including coincident outlines at zero clearance.
  const interior=item=>{
    if(item.kind!=='heart') return item;
    const p=rotateVector(0,item.height*.1,item.angle);
    return {x:item.x+p.x,y:item.y+p.y};
  };
  return polygonContains(first,second[0])||polygonContains(second,first[0])||
    (polygonContains(first,interior(other))&&polygonContains(second,interior(other)))||
    (polygonContains(first,interior(heart))&&polygonContains(second,interior(heart)));
}
