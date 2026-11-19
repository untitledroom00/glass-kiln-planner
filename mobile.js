'use strict';
{
  const visual = window.visualViewport;
  const form=$('properties');
  const desktopAnchor=form.nextElementSibling;
  function placePropertyForm() {
    if (mobileLayout.matches) miniPanel.append(form);
    else desktopAnchor.before(form);
    paint();
  }
  mobileLayout.addEventListener('change',placePropertyForm);
  placePropertyForm();
  const contacts = new Map();
  let pinch = null, multiTouch = false;

  function contactPair() {
    const [a,b] = contacts.values();
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,span:Math.hypot(a.x-b.x,a.y-b.y)};
  }

  function beginPinch() {
    const center=contactPair();
    pinch={span:Math.max(1,center.span),zoom,anchor:point({clientX:center.x,clientY:center.y})};
  }

  canvas.addEventListener('pointerdown',event=>{
    if (!mobileLayout.matches||event.pointerType!=='touch'||gesture?.rotation||
        event.target.closest('.touch-handle[data-rotate]')) return;
    contacts.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    if (contacts.size<2&&!multiTouch) return;
    event.stopImmediatePropagation();
    if (gesture) cancelGesture({pointerId:gesture.id});
    multiTouch=true;
    if (contacts.size===2) beginPinch();
  },true);

  canvas.addEventListener('pointermove',event=>{
    if (!contacts.has(event.pointerId)) return;
    contacts.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (!multiTouch) return;
    event.stopImmediatePropagation();
    if (contacts.size<2||!pinch) return;
    const center=contactPair();
    zoom=Math.max(.15,Math.min(5,pinch.zoom*center.span/pinch.span));
    const scale=view(data);
    const shelf=shelfBounds(data);
    const frame=viewport.getBoundingClientRect();
    mobilePan.x=pinch.anchor.x-shelf.width/2-(center.x-frame.left-frame.width/2)/scale;
    mobilePan.y=pinch.anchor.y-shelf.height/2-(center.y-frame.top-frame.height/2)/scale;
    paint();
  },true);

  function endContact(event) {
    if (!contacts.delete(event.pointerId)) return;
    if (!multiTouch) return;
    event.stopImmediatePropagation();
    pinch=null;
    if (contacts.size>=2) beginPinch();
    if (!contacts.size) multiTouch=false;
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    canvas.addEventListener(type,endContact,true);
  }
  let restingHeight=0, restingWidth=0, editingViewport=false, shelfKeyboard=false, viewportFrame=0;
  function revealPanelInput(input) {
    if (!miniOpen||!miniPanel.contains(input)) return;
    const field=input.getBoundingClientRect(), panel=miniPanel.getBoundingClientRect();
    if (field.bottom>panel.bottom-8) miniPanel.scrollTop+=field.bottom-panel.bottom+8;
    else if (field.top<panel.top+8) miniPanel.scrollTop+=field.top-panel.top-8;
  }

  function updateVisibleArea() {
    viewportFrame=0;
    const style=document.body.style;
    if (!mobileLayout.matches) {
      for (const key of ['--mobile-height','--mobile-top','--visible-height']) style.removeProperty(key);
      restingHeight=0;
      editingViewport=false;
      shelfKeyboard=false;
      miniVisibleBottom=Infinity;
      return;
    }
    const height=visual?.height??window.innerHeight;
    const top=visual?.offsetTop??0;
    const input=document.activeElement;
    const editing=input?.matches('input');
    const width=document.documentElement.clientWidth;
    if (!restingHeight||width!==restingWidth) {
      restingHeight=height;
      restingWidth=width;
    }
    if (editing) {
      editingViewport=true;
      shelfKeyboard=shelfDialog.contains(input);
    }
    else if (!editingViewport||height>=restingHeight-24) {
      editingViewport=false;
      shelfKeyboard=false;
      restingHeight=height;
    }
    // Preserve the canvas viewport while the keyboard animates. On iOS the
    // visual viewport can also pan, so keep the fixed app aligned with it.
    style.setProperty('--mobile-height',restingHeight+'px');
    style.setProperty('--mobile-top',(editingViewport&&!shelfKeyboard?top:0)+'px');
    style.setProperty('--visible-height',height+'px');
    miniVisibleBottom=editingViewport?top+height:Infinity;
    if (!shelfKeyboard && selected!==null) paint();
    if (editing) revealPanelInput(input);
  }

  function scheduleViewportUpdate() {
    if (!viewportFrame) viewportFrame=requestAnimationFrame(updateVisibleArea);
  }
  visual?.addEventListener('resize',scheduleViewportUpdate);
  visual?.addEventListener('scroll',scheduleViewportUpdate);
  window.addEventListener('resize',scheduleViewportUpdate);
  document.addEventListener('focusin',scheduleViewportUpdate);
  document.addEventListener('focusout',scheduleViewportUpdate);
  mobileLayout.addEventListener('change',scheduleViewportUpdate);
  updateVisibleArea();
}
