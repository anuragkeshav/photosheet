
(function(){
  "use strict";

  var L=PS.layout;

  /* ---------- layout-derived geometry ----------
     These were fixed constants (COLS=5, ROWS=6, OUT_W=1920, RATIO). They are now
     recomputed by buildGrid() from PS.layout, so a size change reflows the whole
     app while every existing call site keeps reading a plain value. */
  var grid=L.solve();
  var COLS=grid.cols, ROWS=grid.rows, TOTAL=grid.total;
  var OUT_W=L.outPx().w, OUT_H=L.outPx().h;
  var RATIO=L.ratio();
  var PLUS_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  var slots=new Array(TOTAL).fill(null);
  var sheet=document.getElementById('sheet'), cells=[];
  var slotGrid=document.getElementById('slotGrid'), slotCards=[];

  /*
   * Builds (or rebuilds) both grids to the current slot count and pushes the
   * paper/photo dimensions into CSS custom properties, which is how .sheet and
   * .cell get their physical mm sizing.
   */
  function buildGrid(){
    grid=L.solve();
    COLS=grid.cols; ROWS=grid.rows; TOTAL=grid.total;
    var px=L.outPx(); OUT_W=px.w; OUT_H=px.h;
    RATIO=L.ratio();

    var root=document.documentElement.style;
    root.setProperty('--paper-w', L.fmtMM(grid.paper.w)+'mm');
    root.setProperty('--paper-h', L.fmtMM(grid.paper.h)+'mm');
    root.setProperty('--photo-w', L.fmtMM(grid.boxW)+'mm');
    root.setProperty('--photo-h', L.fmtMM(grid.boxH)+'mm');
    root.setProperty('--col-gap', L.fmtMM(grid.gap)+'mm');
    root.setProperty('--row-gap', L.fmtMM(grid.gap)+'mm');
    root.setProperty('--pad-x', L.fmtMM(grid.originX)+'mm');
    root.setProperty('--pad-y', L.fmtMM(grid.originY)+'mm');
    root.setProperty('--sheet-cols', grid.cols);
    /* Slot cards keep the upright photo ratio even when the sheet lays photos
       sideways -- the card previews the photo, not its place on the paper. */
    root.setProperty('--card-ratio', grid.photo.w+'/'+grid.photo.h);

    if(slots.length<TOTAL){
      while(slots.length<TOTAL) slots.push(null);
    }else if(slots.length>TOTAL){
      /* Keep filled photos, drop trailing empties first. */
      var kept=slots.filter(Boolean);
      slots=new Array(Math.max(TOTAL,kept.length)).fill(null);
      for(var q=0;q<kept.length;q++) slots[q]=kept[q];
    }

    cells.length=0; slotCards.length=0;
    sheet.innerHTML=''; slotGrid.innerHTML='';

    var cellFrag=document.createDocumentFragment();
    for(var i=0;i<TOTAL;i++){
      var c=document.createElement('div');
      c.className='cell';
      c.dataset.index=i;
      cellFrag.appendChild(c);
      cells.push(c);
    }
    sheet.appendChild(cellFrag);

    var cardFrag=document.createDocumentFragment();
    for(var j=0;j<TOTAL;j++){
      var card=document.createElement('button');
      card.type='button';
      card.className='slot-card';
      card.dataset.index=j;
      cardFrag.appendChild(card);
      slotCards.push(card);
    }
    slotGrid.appendChild(cardFrag);
  }

  sheet.addEventListener('click',function(e){
    var c=e.target.closest('.cell');
    if(c) onCell(+c.dataset.index);
  });
  sheet.addEventListener('keydown',function(e){
    var c=e.target.closest('.cell');
    if(c && (e.key==='Enter'||e.key===' ')){
      e.preventDefault();
      onCell(+c.dataset.index);
    }
  });
  slotGrid.addEventListener('click',function(e){
    var card=e.target.closest('.slot-card');
    if(card) onCell(+card.dataset.index);
  });

  function firstEmpty(){
    for(var i=0;i<TOTAL;i++){ if(!slots[i]) return i; }
    return -1;
  }

  /** Photos beyond the current sheet capacity; surfaced as extra PDF pages. */
  function overflowCount(){
    return Math.max(0, slots.filter(Boolean).length - TOTAL);
  }

  var zoomMode = 'fit';


  function render(){
    var active=firstEmpty();
    for(var i=0;i<TOTAL;i++){
      var c=cells[i], s=slots[i];
      c.className='cell';
      c.innerHTML='';
      c.setAttribute('role','button');
      c.setAttribute('tabindex','0');
      if(s){
        c.classList.add('filled');
        c.setAttribute('aria-label','Edit photo '+(i+1));
        c.innerHTML='<img src="'+s.out+'" alt="">';
      }else if(i===active){
        c.classList.add('addable');
        c.setAttribute('aria-label','Add photo to slot '+(i+1));
        c.innerHTML='<div class="add-inner"><span class="plus-circle">'+PLUS_SVG+'</span><span class="add-label">Add Photo</span></div>';
      }else{
        c.classList.add('is-empty');
        c.setAttribute('aria-label','Add photo to slot '+(i+1));
        c.innerHTML='<span class="cell-empty-plus">'+PLUS_SVG+'</span>';
      }
    }
    updateSlotsUI();
    requestAnimationFrame(applyZoom);
  }

  function applyZoom(){
    var scaler=document.getElementById('scaler'), stage=document.getElementById('stage');
    var scalewrap=document.querySelector('.scalewrap');
    var fitBtn=document.getElementById('fitBtn'), sizeBtn=document.getElementById('sizeBtn');
    var bottom=document.querySelector('.bottom-bar');
    if(!scaler || !stage || !sheet) return;

    var sw=sheet.offsetWidth, sh=sheet.offsetHeight;
    if(!sw || !sh) return;

    var availW=Math.min(Math.max(0,(stage.clientWidth||window.innerWidth)-24),820);
    var reserve=(bottom?bottom.offsetHeight:0)+68;
    var availH=Math.max(220,window.innerHeight-reserve);

    if(zoomMode==='fit'){
      if(fitBtn) fitBtn.classList.add('active');
      if(sizeBtn) sizeBtn.classList.remove('active');
      stage.classList.remove('is-scrollable');

      var s=Math.min(1, availW/sw, availH/sh);
      if(s<0.25) s=0.25;

      scaler.style.transform='scale('+s+')';
      if(scalewrap){
        scalewrap.style.width=(sw*s)+'px';
        scalewrap.style.height=(sh*s)+'px';
      }
      stage.style.height=(sh*s+6)+'px';
      stage.scrollLeft=0;
      stage.scrollTop=0;
    }else{
      if(sizeBtn) sizeBtn.classList.add('active');
      if(fitBtn) fitBtn.classList.remove('active');
      stage.classList.add('is-scrollable');

      scaler.style.transform='scale(1)';
      if(scalewrap){
        scalewrap.style.width=sw+'px';
        scalewrap.style.height=sh+'px';
      }
      stage.style.height=Math.min(availH, 620)+'px';
      requestAnimationFrame(function(){
        focusPreviewAddSlot(stage);
      });
    }
  }

  // At 100%, take the user straight to the next place where a photo can be
  // added instead of leaving the sheet parked at an arbitrary corner.
  function focusPreviewAddSlot(stage){
    var active=firstEmpty();
    if(active<0 || !cells[active] || !stage) return;
    var cell=cells[active];
    var left=Math.max(0,cell.offsetLeft+cell.offsetWidth/2-stage.clientWidth/2);
    var top=Math.max(0,cell.offsetTop+cell.offsetHeight/2-stage.clientHeight/2);
    stage.scrollTo({left:left,top:top,behavior:'smooth'});
  }

  function fitScale(){
    applyZoom();
  }

  // rAF-throttle resize -> one layout pass per frame instead of one per event
  var zoomTick=0;
  function requestZoom(){
    if(zoomTick) return;
    zoomTick=requestAnimationFrame(function(){ zoomTick=0; applyZoom(); });
  }
  window.addEventListener('resize',requestZoom,{passive:true});
  if(window.visualViewport){ window.visualViewport.addEventListener('resize',requestZoom,{passive:true}); }

  /* ---------- overlays ---------- */
  function show(id){ document.getElementById(id).classList.add('show'); }
  function hide(id){ document.getElementById(id).classList.remove('show'); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'),function(b){
    b.addEventListener('click',function(){ hide(b.getAttribute('data-close')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.overlay'),function(o){
    o.addEventListener('click',function(e){ if(e.target===o) o.classList.remove('show'); });
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      var open=document.querySelector('.overlay.show');
      if(open) open.classList.remove('show');
    }
  });

  /* ---------- routing ---------- */
  var targetSlot=-1, editSlot=-1;
  function defaultAdjust(){ return {brightness:0,contrast:0,saturation:0,mono:0}; }
  function normalizeAdjust(adj){
    adj=adj||{};
    return {
      brightness:Math.max(-30,Math.min(30,+adj.brightness||0)),
      contrast:Math.max(-30,Math.min(30,+adj.contrast||0)),
      saturation:Math.max(-50,Math.min(50,+adj.saturation||0)),
      mono:adj.mono?1:0
    };
  }
  function adjustmentFilter(adj){
    adj=normalizeAdjust(adj);
    return 'brightness('+(100+adj.brightness)+'%) contrast('+(100+adj.contrast)+'%) saturate('+(100+adj.saturation)+'%) grayscale('+(adj.mono?100:0)+'%)';
  }
  var cropAdjust=defaultAdjust();
  function onCell(i){
    if(slots[i]){
      editSlot=i;
      show('editOverlay');
    } else {
      targetSlot=i;
      show('chooseOverlay');
    }
  }

  /* ---------- file pick ---------- */
  var fg=document.getElementById('fileGallery'), fc=document.getElementById('fileCamera');
  document.getElementById('pickGallery').onclick=function(){ fg.click(); };
  document.getElementById('pickCamera').onclick=function(){ fc.click(); };
  fg.onchange=function(e){ loadFile(e.target.files[0]); };
  fc.onchange=function(e){ loadFile(e.target.files[0]); };
  function loadFile(f){
    if(!f) return;
    var url=URL.createObjectURL(f);
    hide('chooseOverlay');
    cropAdjust=defaultAdjust();
    openCrop(url,0,null,function(){URL.revokeObjectURL(url);});
    fg.value=''; fc.value='';
  }

  /* ============ geometry helpers ============ */
  function rotDims(image,rot){
    var r=((rot%360)+360)%360;
    return (r===90||r===270)
      ? {w:image.naturalHeight,h:image.naturalWidth}
      : {w:image.naturalWidth,h:image.naturalHeight};
  }
  function defaultCrop(dw,dh){
    var w=Math.min(dw, dh*RATIO)*0.94, h=w/RATIO;
    return {x:(dw-w)/2/dw, y:(dh-h)/2/dh, w:w/dw, h:h/dh};
  }

  /* =================== CROP =================== */
  var canvas=document.getElementById('cropCanvas'), ctx=canvas.getContext('2d');
  var img=null, srcData='', rot=0;
  var SW=0,SH=0, dpr=1;
  var IX=0,IY=0,IW=0,IH=0,FIT=1;
  var R={x:0,y:0,w:0,h:0};
  var MIN=46, GRAB=36;

  function layoutStage(){
    var body=document.querySelector('#cropOverlay .card-body');
    var avail=body.clientWidth-28;
    if(!avail || avail<160) avail=300;
    SW=Math.max(200,Math.min(avail,340));
    SH=Math.round(SW*1.15);
    dpr=Math.max(1, window.devicePixelRatio || 1);
    canvas.width=Math.round(SW*dpr);
    canvas.height=Math.round(SH*dpr);
    canvas.style.width=SW+'px';
    canvas.style.height=SH+'px';
    var d=rotDims(img,rot), pad=8;
    FIT=Math.min((SW-pad*2)/d.w,(SH-pad*2)/d.h);
    IW=d.w*FIT; IH=d.h*FIT;
    IX=(SW-IW)/2; IY=(SH-IH)/2;
  }

  function setRectFromCrop(cr){
    var d=rotDims(img,rot);
    R.w=cr.w*d.w*FIT; R.h=cr.h*d.h*FIT;
    R.x=IX+cr.x*d.w*FIT; R.y=IY+cr.y*d.h*FIT;
    clampRect();
  }
  function cropFromRect(){
    return {x:(R.x-IX)/IW, y:(R.y-IY)/IH, w:R.w/IW, h:R.h/IH};
  }
  function clampRect(){
    R.w=Math.min(R.w, IW); R.h=R.w/RATIO;
    if(R.h>IH){ R.h=IH; R.w=R.h*RATIO; }
    if(R.w<MIN){ R.w=MIN; R.h=MIN/RATIO; }
    R.x=Math.max(IX,Math.min(IX+IW-R.w,R.x));
    R.y=Math.max(IY,Math.min(IY+IH-R.h,R.y));
  }

  function draw(){
    if(!img) return;
    ctx.save();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.clearRect(0,0,SW,SH);
    ctx.fillStyle='#141b2e';
    ctx.fillRect(0,0,SW,SH);

    var d=rotDims(img,rot);
    ctx.save();
    ctx.translate(IX+IW/2, IY+IH/2);
    ctx.rotate(rot*Math.PI/180);
    ctx.scale(FIT,FIT);
    ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
    ctx.restore();

    ctx.fillStyle='rgba(12,16,28,.64)';
    ctx.fillRect(0,0,SW,R.y);
    ctx.fillRect(0,R.y+R.h,SW,SH-R.y-R.h);
    ctx.fillRect(0,R.y,R.x,R.h);
    ctx.fillRect(R.x+R.w,R.y,SW-R.x-R.w,R.h);

    ctx.strokeStyle='#fff';
    ctx.lineWidth=2;
    ctx.strokeRect(R.x+1,R.y+1,R.w-2,R.h-2);
    ctx.strokeStyle='rgba(255,255,255,.4)';
    ctx.lineWidth=1;
    for(var i=1;i<3;i++){
      ctx.beginPath(); ctx.moveTo(R.x+R.w*i/3,R.y); ctx.lineTo(R.x+R.w*i/3,R.y+R.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R.x,R.y+R.h*i/3); ctx.lineTo(R.x+R.w,R.y+R.h*i/3); ctx.stroke();
    }
    ctx.strokeStyle='#d1492b';
    ctx.lineWidth=5;
    var arm=Math.min(20,R.w/3), cs=corners();
    cs.forEach(function(p){
      ctx.beginPath();
      ctx.moveTo(p.x+p.sx*arm,p.y); ctx.lineTo(p.x,p.y); ctx.lineTo(p.x,p.y+p.sy*arm);
      ctx.stroke();
    });
    ctx.restore();
  }
  function corners(){
    return [{x:R.x,y:R.y,sx:1,sy:1},{x:R.x+R.w,y:R.y,sx:-1,sy:1},
            {x:R.x,y:R.y+R.h,sx:1,sy:-1},{x:R.x+R.w,y:R.y+R.h,sx:-1,sy:-1}];
  }

  function openCrop(src,startRot,cr,onLoaded){
    srcData=src;
    var im=new Image();
    im.onload=function(){
      if(onLoaded) onLoaded();
      img=im; rot=startRot||0;
      show('cropOverlay');
      requestAnimationFrame(function(){
        layoutStage();
        var d=rotDims(img,rot);
        setRectFromCrop(cr||defaultCrop(d.w,d.h));
        draw();
      });
    };
    im.onerror=function(){ if(onLoaded) onLoaded(); };
    im.src=src;
  }

  function applyRotation(delta){
    rot+=delta;
    layoutStage();
    var d=rotDims(img,rot);
    setRectFromCrop(defaultCrop(d.w,d.h));
    draw();
  }
  document.getElementById('rotL').onclick=function(){ applyRotation(-90); };
  document.getElementById('rotR').onclick=function(){ applyRotation(90); };

  var mode=null, hitCorner=-1;
  var startR={x:0,y:0,w:0,h:0}, startP={x:0,y:0};
  var anchor={x:0,y:0};
  var pointers=new Map();
  var pinchDist=0, pinchW=0, pinchCenter={x:0,y:0};
  var drawScheduled=false;

  function scheduleDraw(){
    if(!drawScheduled){
      drawScheduled=true;
      requestAnimationFrame(function(){
        drawScheduled=false;
        draw();
      });
    }
  }

  function pos(e){
    var b=canvas.getBoundingClientRect();
    return {
      x: (e.clientX-b.left)*(SW/b.width),
      y: (e.clientY-b.top)*(SH/b.height)
    };
  }

  canvas.addEventListener('pointerdown',function(e){
    e.preventDefault();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}

    if(pointers.size===2){
      mode='pinch';
      var pts=Array.from(pointers.values());
      var b=canvas.getBoundingClientRect();
      var p1={x:(pts[0].x-b.left)*(SW/b.width), y:(pts[0].y-b.top)*(SH/b.height)};
      var p2={x:(pts[1].x-b.left)*(SW/b.width), y:(pts[1].y-b.top)*(SH/b.height)};
      pinchDist=Math.hypot(p1.x-p2.x, p1.y-p2.y);
      pinchW=R.w;
      pinchCenter={x:(R.x+R.w/2), y:(R.y+R.h/2)};
      return;
    }

    if(pointers.size>1) return;

    var p=pos(e), cs=corners();
    var hit=-1, minDist=GRAB*GRAB;
    for(var i=0;i<4;i++){
      var dx=p.x-cs[i].x, dy=p.y-cs[i].y;
      var d2=dx*dx+dy*dy;
      if(d2<=minDist){
        minDist=d2;
        hit=i;
      }
    }

    startR={x:R.x,y:R.y,w:R.w,h:R.h};
    startP={x:p.x,y:p.y};

    if(hit>=0){
      mode='resize';
      hitCorner=hit;
      if(hit===0) anchor={x:startR.x+startR.w, y:startR.y+startR.h};
      else if(hit===1) anchor={x:startR.x, y:startR.y+startR.h};
      else if(hit===2) anchor={x:startR.x+startR.w, y:startR.y};
      else if(hit===3) anchor={x:startR.x, y:startR.y};
    }else if(p.x>=R.x && p.x<=R.x+R.w && p.y>=R.y && p.y<=R.y+R.h){
      mode='move';
    }else{
      var newX=Math.max(IX,Math.min(IX+IW-R.w, p.x-R.w/2));
      var newY=Math.max(IY,Math.min(IY+IH-R.h, p.y-R.h/2));
      R.x=newX; R.y=newY;
      mode='move';
      startR={x:R.x,y:R.y,w:R.w,h:R.h};
      startP={x:p.x,y:p.y};
      scheduleDraw();
    }
  });

  canvas.addEventListener('pointermove',function(e){
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    e.preventDefault();

    if(mode==='pinch' && pointers.size>=2){
      var pts=Array.from(pointers.values());
      var b=canvas.getBoundingClientRect();
      var p1={x:(pts[0].x-b.left)*(SW/b.width), y:(pts[0].y-b.top)*(SH/b.height)};
      var p2={x:(pts[1].x-b.left)*(SW/b.width), y:(pts[1].y-b.top)*(SH/b.height)};
      var d=Math.hypot(p1.x-p2.x, p1.y-p2.y);
      if(pinchDist>5){
        var scale=d/pinchDist;
        var maxW=Math.min(IW, IH*RATIO);
        var newW=Math.max(MIN, Math.min(maxW, pinchW*scale));
        var newH=newW/RATIO;
        R.w=newW; R.h=newH;
        R.x=Math.max(IX, Math.min(IX+IW-newW, pinchCenter.x-newW/2));
        R.y=Math.max(IY, Math.min(IY+IH-newH, pinchCenter.y-newH/2));
        scheduleDraw();
      }
      return;
    }

    if(!mode) return;
    var p=pos(e);

    if(mode==='move'){
      var nx=startR.x+(p.x-startP.x);
      var ny=startR.y+(p.y-startP.y);
      R.x=Math.max(IX,Math.min(IX+IW-R.w,nx));
      R.y=Math.max(IY,Math.min(IY+IH-R.h,ny));
      scheduleDraw();
    }else if(mode==='resize'){
      var targetW=MIN;
      if(hitCorner===0){
        var dx=anchor.x-p.x, dy=anchor.y-p.y;
        targetW=Math.max(dx, dy*RATIO);
        var maxW=anchor.x-IX, maxH=anchor.y-IY;
        var w=Math.max(MIN, Math.min(targetW, maxW, maxH*RATIO));
        R.w=w; R.h=w/RATIO;
        R.x=anchor.x-w; R.y=anchor.y-R.h;
      }else if(hitCorner===1){
        var dx=p.x-anchor.x, dy=anchor.y-p.y;
        targetW=Math.max(dx, dy*RATIO);
        var maxW=IX+IW-anchor.x, maxH=anchor.y-IY;
        var w=Math.max(MIN, Math.min(targetW, maxW, maxH*RATIO));
        R.w=w; R.h=w/RATIO;
        R.x=anchor.x; R.y=anchor.y-R.h;
      }else if(hitCorner===2){
        var dx=anchor.x-p.x, dy=p.y-anchor.y;
        targetW=Math.max(dx, dy*RATIO);
        var maxW=anchor.x-IX, maxH=IY+IH-anchor.y;
        var w=Math.max(MIN, Math.min(targetW, maxW, maxH*RATIO));
        R.w=w; R.h=w/RATIO;
        R.x=anchor.x-w; R.y=anchor.y;
      }else if(hitCorner===3){
        var dx=p.x-anchor.x, dy=p.y-anchor.y;
        targetW=Math.max(dx, dy*RATIO);
        var maxW=IX+IW-anchor.x, maxH=IY+IH-anchor.y;
        var w=Math.max(MIN, Math.min(targetW, maxW, maxH*RATIO));
        R.w=w; R.h=w/RATIO;
        R.x=anchor.x; R.y=anchor.y;
      }
      scheduleDraw();
    }
  });

  function endPointer(e){
    pointers.delete(e.pointerId);
    if(pointers.size===0){
      mode=null;
      hitCorner=-1;
    }else if(pointers.size===1 && mode==='pinch'){
      var remId=Array.from(pointers.keys())[0];
      var pt=pointers.get(remId);
      var b=canvas.getBoundingClientRect();
      var p={x:(pt.x-b.left)*(SW/b.width), y:(pt.y-b.top)*(SH/b.height)};
      mode='move';
      startR={x:R.x,y:R.y,w:R.w,h:R.h};
      startP={x:p.x,y:p.y};
    }
  }
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',endPointer);

  var cropResizeTick=0;
  window.addEventListener('resize',function(){
    if(cropResizeTick) return;
    cropResizeTick=requestAnimationFrame(function(){
      cropResizeTick=0;
      if(document.getElementById('cropOverlay').classList.contains('show')){
        var cr=cropFromRect(); layoutStage(); setRectFromCrop(cr); draw();
      }
    });
  },{passive:true});

  function exportCrop(image,rotation,cr,adjustment){
    var r=((rotation%360)+360)%360;
    var iw=image.naturalWidth, ih=image.naturalHeight;
    var dw=(r===90||r===270)?ih:iw, dh=(r===90||r===270)?iw:ih;
    var off=document.createElement('canvas'); off.width=dw; off.height=dh;
    var oc=off.getContext('2d');
    oc.imageSmoothingEnabled=true;
    oc.imageSmoothingQuality='high';
    oc.translate(dw/2,dh/2); oc.rotate(r*Math.PI/180);
    oc.drawImage(image,-iw/2,-ih/2);

    var out=document.createElement('canvas'); out.width=OUT_W; out.height=OUT_H;
    var c=out.getContext('2d');
    c.imageSmoothingEnabled=true;
    c.imageSmoothingQuality='high';
    c.fillStyle='#fff'; c.fillRect(0,0,OUT_W,OUT_H);
    c.filter=adjustmentFilter(adjustment);
    c.drawImage(off, cr.x*dw, cr.y*dh, cr.w*dw, cr.h*dh, 0,0,OUT_W,OUT_H);
    c.filter='none';
    return out.toDataURL('image/jpeg',0.98);
  }

  document.getElementById('cropDone').onclick=function(){
    var cr=cropFromRect();
    slots[targetSlot]={src:srcData,rot:rot,cr:cr,adj:normalizeAdjust(cropAdjust),out:exportCrop(img,rot,cr,cropAdjust)};
    hide('cropOverlay'); render();
  };

  /* =================== EDIT =================== */
  document.getElementById('mCrop').onclick=function(){
    var s=slots[editSlot];
    hide('editOverlay'); targetSlot=editSlot;
    cropAdjust=normalizeAdjust(s.adj);
    openCrop(s.src,s.rot,s.cr);
  };
  document.getElementById('mRot').onclick=function(){
    var s=slots[editSlot];
    var im=new Image();
    im.onload=function(){
      var nr=s.rot+90, d=rotDims(im,nr), cr=defaultCrop(d.w,d.h);
      slots[editSlot]={src:s.src,rot:nr,cr:cr,adj:normalizeAdjust(s.adj),out:exportCrop(im,nr,cr,s.adj)};
      hide('editOverlay'); render();
    };
    im.src=s.src;
  };
  document.getElementById('mDup').onclick=function(){
    var e=firstEmpty();
    if(e!==-1){
      var s=slots[editSlot];
      slots[e]={src:s.src,rot:s.rot,cr:s.cr,adj:normalizeAdjust(s.adj),out:s.out};
    }
    hide('editOverlay'); render();
  };
  document.getElementById('mDel').onclick=function(){
    slots[editSlot]=null;
    var filled=slots.filter(Boolean);
    for(var i=0;i<TOTAL;i++) slots[i]= i<filled.length ? filled[i] : null;
    hide('editOverlay'); render();
  };

  /* =================== PHOTO ADJUSTMENTS =================== */
  if(document.getElementById('tuneOverlay')){
  var tuneAdjust=defaultAdjust();
  var tunePreview=document.getElementById('tunePreview');
  var tuneInputs={
    brightness:document.getElementById('brightnessInput'),
    contrast:document.getElementById('contrastInput'),
    saturation:document.getElementById('saturationInput')
  };
  var tuneValues={
    brightness:document.getElementById('brightnessValue'),
    contrast:document.getElementById('contrastValue'),
    saturation:document.getElementById('saturationValue')
  };
  function tuneValueText(n){ return n>0?'+'+n:''+n; }
  function updateTunePreview(){
    tunePreview.style.filter=adjustmentFilter(tuneAdjust);
    ['brightness','contrast','saturation'].forEach(function(key){
      tuneInputs[key].value=tuneAdjust[key];
      tuneValues[key].textContent=tuneValueText(tuneAdjust[key]);
    });
  }
  function setTunePreset(name){
    if(name==='enhance') tuneAdjust={brightness:4,contrast:9,saturation:5,mono:0};
    else if(name==='mono') tuneAdjust={brightness:2,contrast:12,saturation:0,mono:1};
    else tuneAdjust=defaultAdjust();
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'),function(button){
      button.classList.toggle('selected',button.getAttribute('data-preset')===name);
    });
    updateTunePreview();
  }
  function openTune(){
    var s=slots[editSlot];
    if(!s) return;
    tuneAdjust=normalizeAdjust(s.adj);
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'),function(button){
      button.classList.toggle('selected',false);
    });
    tunePreview.removeAttribute('src');
    updateTunePreview();
    hide('editOverlay'); show('tuneOverlay');
    // Build the preview from the original crop, so opening this editor again
    // never applies an existing adjustment twice in the preview.
    var im=new Image();
    im.onload=function(){ tunePreview.src=exportCrop(im,s.rot,s.cr,defaultAdjust()); };
    im.src=s.src;
  }
  document.getElementById('mTune').onclick=openTune;
  Object.keys(tuneInputs).forEach(function(key){
    tuneInputs[key].addEventListener('input',function(){
      tuneAdjust[key]=+this.value;
      tuneAdjust.mono=0;
      Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'),function(button){button.classList.remove('selected');});
      updateTunePreview();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'),function(button){
    button.addEventListener('click',function(){setTunePreset(this.getAttribute('data-preset'));});
  });
  document.getElementById('tuneSave').onclick=function(){
    var s=slots[editSlot];
    if(!s) return;
    var adjustment=normalizeAdjust(tuneAdjust), im=new Image();
    im.onload=function(){
      slots[editSlot]={src:s.src,rot:s.rot,cr:s.cr,adj:adjustment,out:exportCrop(im,s.rot,s.cr,adjustment)};
      hide('tuneOverlay'); render();
    };
    im.src=s.src;
  };
  }

  /* =================== BACKGROUND TOUCH-UP =================== */
  if(document.getElementById('backgroundOverlay')){
  var backgroundCanvas=document.getElementById('backgroundCanvas');
  var backgroundCtx=backgroundCanvas.getContext('2d');
  var backgroundStart='', backgroundColor='#ffffff', backgroundDrawing=false;
  var backgroundLast=null;
  var brushSize=document.getElementById('brushSizeInput');
  var brushOpacity=document.getElementById('brushOpacityInput');
  function updateBackgroundLabels(){
    document.getElementById('brushSizeValue').textContent=brushSize.value;
    document.getElementById('brushOpacityValue').textContent=brushOpacity.value+'%';
  }
  function loadBackgroundCanvas(src){
    var im=new Image();
    im.onload=function(){
      backgroundCanvas.width=im.naturalWidth;
      backgroundCanvas.height=im.naturalHeight;
      backgroundCanvas.style.aspectRatio=im.naturalWidth+'/'+im.naturalHeight;
      backgroundCtx.setTransform(1,0,0,1,0,0);
      backgroundCtx.clearRect(0,0,im.naturalWidth,im.naturalHeight);
      backgroundCtx.drawImage(im,0,0);
    };
    im.src=src;
  }
  function openBackground(){
    var s=slots[editSlot];
    if(!s) return;
    backgroundStart=s.out;
    backgroundColor='#ffffff'; brushSize.value=42; brushOpacity.value=85;
    Array.prototype.forEach.call(document.querySelectorAll('[data-bg-color]'),function(button){
      button.classList.toggle('selected',button.getAttribute('data-bg-color')===backgroundColor);
    });
    updateBackgroundLabels();
    hide('editOverlay'); show('backgroundOverlay');
    loadBackgroundCanvas(backgroundStart);
  }
  document.getElementById('mBackground').onclick=openBackground;
  function backgroundPoint(e){
    var rect=backgroundCanvas.getBoundingClientRect();
    return {x:(e.clientX-rect.left)*backgroundCanvas.width/rect.width,
      y:(e.clientY-rect.top)*backgroundCanvas.height/rect.height,
      scale:backgroundCanvas.width/rect.width};
  }
  function paintBackground(from,to,scale){
    var radius=(+brushSize.value)*scale/2;
    backgroundCtx.save();
    backgroundCtx.strokeStyle=backgroundColor;
    backgroundCtx.globalAlpha=(+brushOpacity.value)/100;
    backgroundCtx.lineWidth=radius*2;
    backgroundCtx.lineCap='round'; backgroundCtx.lineJoin='round';
    backgroundCtx.beginPath(); backgroundCtx.moveTo(from.x,from.y); backgroundCtx.lineTo(to.x,to.y); backgroundCtx.stroke();
    backgroundCtx.restore();
  }
  backgroundCanvas.addEventListener('pointerdown',function(e){
    if(!backgroundCanvas.width) return;
    e.preventDefault();
    backgroundDrawing=true;
    backgroundLast=backgroundPoint(e);
    backgroundCanvas.setPointerCapture(e.pointerId);
    paintBackground(backgroundLast,backgroundLast,backgroundLast.scale);
  });
  backgroundCanvas.addEventListener('pointermove',function(e){
    if(!backgroundDrawing) return;
    e.preventDefault();
    var point=backgroundPoint(e);
    paintBackground(backgroundLast,point,point.scale);
    backgroundLast=point;
  });
  function finishBackgroundStroke(){ backgroundDrawing=false; backgroundLast=null; }
  backgroundCanvas.addEventListener('pointerup',finishBackgroundStroke);
  backgroundCanvas.addEventListener('pointercancel',finishBackgroundStroke);
  Array.prototype.forEach.call(document.querySelectorAll('[data-bg-color]'),function(button){
    button.addEventListener('click',function(){
      backgroundColor=this.getAttribute('data-bg-color');
      Array.prototype.forEach.call(document.querySelectorAll('[data-bg-color]'),function(item){item.classList.toggle('selected',item===button);});
    });
  });
  brushSize.addEventListener('input',updateBackgroundLabels);
  brushOpacity.addEventListener('input',updateBackgroundLabels);
  document.getElementById('backgroundReset').onclick=function(){loadBackgroundCanvas(backgroundStart);};
  document.getElementById('backgroundSave').onclick=function(){
    var s=slots[editSlot];
    if(!s || !backgroundCanvas.width) return;
    slots[editSlot]={src:s.src,rot:s.rot,cr:s.cr,adj:normalizeAdjust(s.adj),out:backgroundCanvas.toDataURL('image/jpeg',.98),backgroundTouched:true};
    hide('backgroundOverlay'); render();
  };
  }

  /* =================== PRINT / PDF BUILDER =================== */
  var MM = 72/25.4;

  function pdfNum(n){ return (Math.round(n*1000)/1000).toString(); }
  function pad10(n){ n=''+n; while(n.length<10) n='0'+n; return n; }

  var jpegCache=new Map();

  function jpegBytes(dataUrl){
    var cached=jpegCache.get(dataUrl);
    if(cached) return cached;
    var bin=atob(dataUrl.slice(dataUrl.indexOf(',')+1)), len=bin.length;
    var b=new Uint8Array(len);
    for(var i=0;i<len;i++) b[i]=bin.charCodeAt(i);
    jpegCache.set(dataUrl,b);
    return b;
  }

  function buildSheetPdf(){
    var g=grid;
    var PW=g.paper.w*MM, PH=g.paper.h*MM;
    var boxW=g.boxW*MM, boxH=g.boxH*MM;

    var images=[], place=[], imageMap=new Map();
    for(var idx=0; idx<TOTAL; idx++){
      if(!slots[idx]) continue;
      var o=L.cellOrigin(g,idx);
      /* PDF's origin is bottom-left, the solver's is top-left. */
      var x=o.x*MM, yBot=(g.paper.h-(o.y+g.boxH))*MM;
      var key=slots[idx].out, k=imageMap.get(key);
      if(k===undefined){
        k=images.length;
        imageMap.set(key,k);
        images.push(jpegBytes(key));
      }
      place.push({x:x,y:yBot,k:k});
    }

    var content='0.702 0.725 0.776 RG '+pdfNum(0.25*MM)+' w\n';
    for(var cell=0; cell<TOTAL; cell++){
      var go=L.cellOrigin(g,cell);
      var gx=go.x*MM, gy=(g.paper.h-(go.y+g.boxH))*MM;
      content+=pdfNum(gx)+' '+pdfNum(gy)+' '+pdfNum(boxW)+' '+pdfNum(boxH)+' re S\n';
    }
    place.forEach(function(p){
      if(g.rotated){
        /* Lay the upright export on its side to fill a rotated cell. Maps the
           image's unit square so its width runs up the page. */
        content+='q 0 '+pdfNum(boxH)+' '+pdfNum(-boxW)+' 0 '
                +pdfNum(p.x+boxW)+' '+pdfNum(p.y)+' cm /Im'+p.k+' Do Q\n';
      }else{
        content+='q '+pdfNum(boxW)+' 0 0 '+pdfNum(boxH)+' '+pdfNum(p.x)+' '+pdfNum(p.y)+' cm /Im'+p.k+' Do Q\n';
      }
    });

    var enc=new TextEncoder(), parts=[], offset=0, xref=[];
    function put(s){ var b=enc.encode(s); parts.push(b); offset+=b.length; }
    function putB(b){ parts.push(b); offset+=b.length; }
    function obj(n){ xref[n]=offset; put(n+' 0 obj\n'); }

    var nImg=images.length, contentsNum=4+nImg;

    put('%PDF-1.4\n'); putB(new Uint8Array([0x25,0xE2,0xE3,0xCF,0xD3,0x0A]));

    obj(1); put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    obj(2); put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    var xo='';
    for(var k=0;k<nImg;k++) xo+='/Im'+k+' '+(4+k)+' 0 R ';
    obj(3);
    put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pdfNum(PW)+' '+pdfNum(PH)+'] '
       +'/Resources << /XObject << '+xo+'>> >> /Contents '+contentsNum+' 0 R >>\nendobj\n');

    for(var k=0;k<nImg;k++){
      obj(4+k);
      put('<< /Type /XObject /Subtype /Image /Width '+OUT_W+' /Height '+OUT_H
         +' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+images[k].length+' >>\nstream\n');
      putB(images[k]); put('\nendstream\nendobj\n');
    }

    var cb=enc.encode(content);
    obj(contentsNum);
    put('<< /Length '+cb.length+' >>\nstream\n'); putB(cb); put('\nendstream\nendobj\n');

    var xrefAt=offset, size=contentsNum+1;
    put('xref\n0 '+size+'\n0000000000 65535 f \n');
    for(var n=1;n<=contentsNum;n++) put(pad10(xref[n])+' 00000 n \n');
    put('trailer\n<< /Size '+size+' /Root 1 0 R >>\nstartxref\n'+xrefAt+'\n%%EOF');

    return new Blob(parts,{type:'application/pdf'});
  }

  function printSheet(){
    var blob;
    try{ blob=buildSheetPdf(); }
    catch(err){ try{ window.print(); }catch(e){} return; }

    /* inside the APK a native bridge prints the exact PDF through Android's printer */
    if(window.PPSBridge && typeof window.PPSBridge.printPdf==='function'){
      var fr=new FileReader();
      fr.onload=function(){ window.PPSBridge.printPdf(fr.result.slice(fr.result.indexOf(',')+1)); };
      fr.readAsDataURL(blob);
      return;
    }

    var url=URL.createObjectURL(blob);
    var win=window.open(url,'_blank');
    if(!win){
      var a=document.createElement('a');
      a.href=url; a.download='passport-photo-sheet-A4.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  }

  document.getElementById('printBtn').onclick=printSheet;

  /* =================== PHOTO + PAPER SIZE ===================
     ImageToolbox-style size control is intentionally kept focused here: every
     choice changes the crop ratio, preview grid and PDF together. */
  if(document.getElementById('sizeOverlay')){
  var sizeSheet=document.getElementById('sizeOverlay');
  var photoSizeList=document.getElementById('photoSizeList');
  var paperSeg=document.getElementById('paperSeg');
  var dpiSeg=document.getElementById('dpiSeg');
  var orientSeg=document.getElementById('orientSeg');
  var customSizeRow=document.getElementById('customSizeRow');
  var customW=document.getElementById('customW'), customH=document.getElementById('customH');
  var sizeSummary=document.getElementById('sizeSummary');

  function sizeButton(label, dataName, dataValue, on, sub){
    return '<button class="seg-btn'+(on?' is-on':'')+'" data-'+dataName+'="'+dataValue+'" type="button">'
      +label+(sub?'<span class="sb-sub">'+sub+'</span>':'')+'</button>';
  }
  function updateLayoutText(){
    var d=L.describe(), g=L.solve(), p=L.photo();
    document.getElementById('sizeChipText').textContent=L.fmtMM(p.w)+' × '+L.fmtMM(p.h)+' · '+g.paper.label;
    document.getElementById('tabSlotsLabel').textContent='Photo Slots ('+TOTAL+')';
    document.getElementById('tabPreviewLabel').textContent=g.paper.label+' Sheet Preview';
    document.getElementById('paperMeta').innerHTML=d.paper+' · <strong>'+d.grid+'</strong>';
    document.getElementById('printSub').textContent=g.paper.label+' Dialog';
    sizeSummary.innerHTML='<strong>'+p.label+'</strong> on <strong>'+g.paper.label+'</strong> · '+g.cols+' × '+g.rows+' = '+g.total+' photos per sheet · '+L.effectiveDpi()+' DPI';
  }
  function renderSizeControls(){
    var st=L.state;
    photoSizeList.innerHTML=PS.PHOTO_SIZES.map(function(p){
      return '<button class="opt-row'+(p.id===st.photoId?' is-on':'')+'" data-photo-id="'+p.id+'" type="button">'
        +'<span class="or-copy"><span class="or-1">'+p.label+'</span><span class="or-2">'+p.note+'</span></span><span class="or-tick">✓</span></button>';
    }).join('');
    paperSeg.innerHTML=PS.PAPER_SIZES.map(function(p){return sizeButton(p.label,'paper-id',p.id,p.id===st.paperId,p.note);}).join('');
    dpiSeg.innerHTML=PS.DPI_MODES.map(function(m){return sizeButton(m.label,'dpi-id',m.id,m.id===st.dpiMode,m.note);}).join('');
    Array.prototype.forEach.call(orientSeg.querySelectorAll('[data-portrait]'),function(b){
      b.classList.toggle('is-on',(b.getAttribute('data-portrait')==='1')===st.portrait);
    });
    customSizeRow.hidden=st.photoId!=='custom';
    customW.value=L.fmtMM(st.customW); customH.value=L.fmtMM(st.customH);
    document.getElementById('marginValue').textContent=L.fmtMM(st.marginMM)+' mm';
    document.getElementById('gapValue').textContent=L.fmtMM(st.gapMM)+' mm';
    document.getElementById('autoRotateInput').checked=st.autoRotate;
    updateLayoutText();
  }
  function openSizeSheet(){ renderSizeControls(); show('sizeOverlay'); }
  document.getElementById('sizeChip').addEventListener('click',openSizeSheet);
  document.getElementById('paperMeta').addEventListener('click',openSizeSheet);
  photoSizeList.addEventListener('click',function(e){
    var b=e.target.closest('[data-photo-id]'); if(b) L.set({photoId:b.getAttribute('data-photo-id')});
  });
  paperSeg.addEventListener('click',function(e){
    var b=e.target.closest('[data-paper-id]'); if(b) L.set({paperId:b.getAttribute('data-paper-id')});
  });
  dpiSeg.addEventListener('click',function(e){
    var b=e.target.closest('[data-dpi-id]'); if(b) L.set({dpiMode:b.getAttribute('data-dpi-id')});
  });
  orientSeg.addEventListener('click',function(e){
    var b=e.target.closest('[data-portrait]'); if(b) L.set({portrait:b.getAttribute('data-portrait')==='1'});
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-step]'),function(b){
    b.addEventListener('click',function(){
      var key=this.getAttribute('data-step'), next=L.state[key]+(+this.getAttribute('data-delta'));
      L.set((function(){var patch={};patch[key]=PS.clamp(next,key==='marginMM'?0:0,key==='marginMM'?25:20);return patch;}()));
    });
  });
  [customW,customH].forEach(function(input){
    input.addEventListener('change',function(){
      var value=PS.clamp(parseFloat(this.value)||35,10,200), patch={};
      patch[this.id==='customW'?'customW':'customH']=value; L.set(patch);
    });
  });
  document.getElementById('autoRotateInput').addEventListener('change',function(){L.set({autoRotate:this.checked});});

  function fitCropToRatio(cr, newRatio){
    var cx=cr.x+cr.w/2, cy=cr.y+cr.h/2, w=cr.w, h=cr.h;
    if(w/h>newRatio) w=h*newRatio; else h=w/newRatio;
    w=Math.min(1,w); h=Math.min(1,h);
    return {x:PS.clamp(cx-w/2,0,1-w),y:PS.clamp(cy-h/2,0,1-h),w:w,h:h};
  }
  function rerenderStoredPhotos(){
    slots.forEach(function(s,index){
      if(!s) return;
      var im=new Image();
      im.onload=function(){
        var cr=fitCropToRatio(s.cr,RATIO);
        slots[index]={src:s.src,rot:s.rot,cr:cr,adj:normalizeAdjust(s.adj),out:exportCrop(im,s.rot,cr,s.adj)};
        render();
      };
      im.src=s.src;
    });
  }
  L.onChange(function(reason){
    buildGrid();
    updateLayoutText();
    renderSizeControls();
    if(reason==='photo') rerenderStoredPhotos();
    render();
  });
  }

  /* =================== UI =================== */
  function updateSlotsUI(){
    var active=firstEmpty();
    var count=0;
    for(var i=0;i<TOTAL;i++){
      var s=slots[i], card=slotCards[i];
      if(s) count++;
      card.className='slot-card'+(i===active?' is-active':'')+(s?' is-filled':'');
      card.setAttribute('aria-label',s?'Edit photo '+(i+1):'Add photo to slot '+(i+1));
      card.innerHTML=s
        ? '<span class="slot-number">'+(i+1)+'</span><img src="'+s.out+'" alt=""><span class="slot-edit">Edit</span>'
        : '<span class="slot-number">'+(i+1)+'</span><span class="slot-plus">'+PLUS_SVG+'</span>'+(i===active?'<span class="slot-add-text">Add Photo</span>':'');
    }
    var ct=document.getElementById('countText');
    if(ct) ct.textContent=count+' / '+TOTAL;
    var bc=document.getElementById('bottomCount');
    if(bc) bc.textContent=count+' of '+TOTAL+' photos';
    var fill=document.getElementById('fillAllBtn');
    if(fill) fill.hidden=(count===0 || count===TOTAL);
    var delAll=document.getElementById('deleteAllBtn');
    if(delAll) delAll.hidden=(count===0);
  }

  function setTab(tab){
    var slotsView=document.getElementById('slotsView'), previewView=document.getElementById('previewView');
    var a=document.getElementById('tabSlots'), b=document.getElementById('tabPreview');
    var tabs=document.querySelector('.tabs');
    var isSlots=tab==='slots';
    slotsView.hidden=!isSlots; previewView.hidden=isSlots;
    a.classList.toggle('selected',isSlots); b.classList.toggle('selected',!isSlots);
    if(tabs) tabs.classList.toggle('preview-active',!isSlots);
    var activeView=isSlots?slotsView:previewView;
    activeView.classList.remove('tab-view-enter');
    requestAnimationFrame(function(){activeView.classList.add('tab-view-enter');});
    if(!isSlots) requestAnimationFrame(function(){fitScale();});
    window.scrollTo({top:0});
  }

  document.getElementById('tabSlots').addEventListener('click',function(){setTab('slots');});
  document.getElementById('tabPreview').addEventListener('click',function(){setTab('preview');});

  document.getElementById('fillAllBtn').addEventListener('click',function(){
    var source=null;
    for(var i=0;i<TOTAL;i++){ if(slots[i]){source=slots[i];break;} }
    if(!source) return;
    for(var j=0;j<TOTAL;j++){
      if(!slots[j]) slots[j]={src:source.src,rot:source.rot,cr:source.cr,adj:normalizeAdjust(source.adj),out:source.out};
    }
    render();
  });

  document.getElementById('deleteAllBtn').addEventListener('click',function(){
    var hasAny=slots.some(Boolean);
    if(!hasAny) return;
    for(var i=0;i<TOTAL;i++) slots[i]=null;
    render();
  });

  document.getElementById('downloadBtn').addEventListener('click',function(){
    if(!slots.some(Boolean)) return;
    var blob=buildSheetPdf();

    if(window.PPSBridge && typeof window.PPSBridge.savePdf==='function'){
      var fr=new FileReader();
      fr.onload=function(){ window.PPSBridge.savePdf(fr.result.slice(fr.result.indexOf(',')+1), 'passport-photo-sheet-A4.pdf'); };
      fr.readAsDataURL(blob);
      return;
    }

    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='passport-photo-sheet-A4.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},60000);
  });

  document.getElementById('fitBtn').addEventListener('click',function(){
    zoomMode='fit';
    applyZoom();
  });
  document.getElementById('sizeBtn').addEventListener('click',function(){
    zoomMode='100';
    applyZoom();
  });

  var scrollTick=0;
  var scrollFadeRoot=document.querySelector('.scroll-fade');
  var maxScroll=0;

  // Measuring document height during every scroll frame can trigger a layout pass.
  // Cache the range and update it only after layout/viewport changes instead.
  function measureScrollRange(){
    var doc=document.documentElement, body=document.body;
    maxScroll=Math.max(0,Math.max(doc.scrollHeight,body.scrollHeight)-window.innerHeight);
  }
  function updateScrollFade(){
    if(!scrollFadeRoot) return;
    var scrollTop=window.scrollY||0;
    scrollFadeRoot.classList.toggle('can-scroll-up',scrollTop>8);
    scrollFadeRoot.classList.toggle('can-scroll-down',scrollTop<maxScroll-8);
  }
  function requestScrollUpdate(){
    if(scrollTick) return;
    scrollTick=requestAnimationFrame(function(){
      scrollTick=0;
      updateScrollFade();
    });
  }
  window.addEventListener('scroll',requestScrollUpdate,{passive:true});
  function refreshScrollRange(){
    measureScrollRange();
    requestScrollUpdate();
  }
  window.addEventListener('resize',refreshScrollRange,{passive:true});
  if(window.visualViewport){ window.visualViewport.addEventListener('resize',refreshScrollRange,{passive:true}); }
  window.addEventListener('load',refreshScrollRange);
  if(window.ResizeObserver){
    new ResizeObserver(refreshScrollRange).observe(document.body);
  }
  requestAnimationFrame(refreshScrollRange);

  buildGrid();
  render();

})();
