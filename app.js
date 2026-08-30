(function(){

  // ---------------- State ----------------
  const state = {
    difficulty: {rows:4, cols:5, label:'Media'},
    sourceImg: null,      // HTMLImageElement or canvas, ready to cut
    sourceLabel: '',
    pieces: [],           // piece metadata + DOM element
    placedCount: 0,
    totalPieces: 0,
    boardW: 0, boardH: 0,
    pieceW: 0, pieceH: 0,
    tabSize: 0,
    timerStart: null,
    timerInterval: null,
  };

  const DIFFICULTIES = [
    {key:'facil',  label:'Fácil',   rows:3, cols:4},
    {key:'media',  label:'Media',   rows:4, cols:5},
    {key:'dificil',label:'Difícil', rows:6, cols:7},
    {key:'experto',label:'Experto', rows:8, cols:9},
  ];

  // ---------------- Built-in demo image: procedural Eiffel Tower ----------------
  function drawEiffelTower(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    // Sky
    const sky = ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0, '#1B2C4F');
    sky.addColorStop(0.55, '#3C4E72');
    sky.addColorStop(0.82, '#C98A4B');
    sky.addColorStop(1, '#E7B463');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,w,h);

    // Sun / moon glow
    ctx.save();
    const glow = ctx.createRadialGradient(w*0.78,h*0.30,0, w*0.78,h*0.30, w*0.22);
    glow.addColorStop(0,'rgba(255,231,180,0.55)');
    glow.addColorStop(1,'rgba(255,231,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // Distant rooftops silhouette
    ctx.fillStyle = 'rgba(15,20,35,0.55)';
    ctx.beginPath();
    ctx.moveTo(0,h*0.86);
    for(let x=0;x<=w;x+=w/14){
      const rh = h*0.86 - (Math.sin(x*0.07)+1)*h*0.02 - (x%3===0? h*0.02:0);
      ctx.lineTo(x, rh);
      ctx.lineTo(x+w/28, rh - h*0.015);
    }
    ctx.lineTo(w,h*0.86);
    ctx.lineTo(w,h);
    ctx.lineTo(0,h);
    ctx.closePath();
    ctx.fill();

    // Ground
    ctx.fillStyle = '#0F1420';
    ctx.fillRect(0, h*0.865, w, h*0.135);

    // ---- Tower geometry (proportions relative to h) ----
    const groundY = h*0.865;
    const apexY = h*0.06;
    const cx = w*0.5;
    const baseHalfW = w*0.30;
    const p1Y = h*0.60;   // first platform
    const p1HalfW = w*0.155;
    const p2Y = h*0.38;   // second platform
    const p2HalfW = w*0.075;
    const p3Y = h*0.155;  // top platform, before mast
    const p3HalfW = w*0.02;

    ctx.strokeStyle = '#12151C';
    ctx.fillStyle = '#12151C';
    ctx.lineJoin = 'round';

    // Four "legs" as two curved silhouettes (left pair, right pair) - draw as thick tapering outline
    function legPath(fromX, toX, y0, y1, curve){
      ctx.beginPath();
      ctx.moveTo(fromX, y0);
      ctx.quadraticCurveTo(fromX + curve, (y0+y1)/2, toX, y1);
      return;
    }

    ctx.lineWidth = w*0.012;
    ctx.lineCap = 'round';

    // Outer silhouette: base -> p1 -> p2 -> p3 -> apex, mirrored
    const outline = [
      [cx-baseHalfW, groundY],
      [cx-p1HalfW*1.5, p1Y],
      [cx-p2HalfW*1.6, p2Y],
      [cx-p3HalfW*3, p3Y],
      [cx, apexY],
      [cx+p3HalfW*3, p3Y],
      [cx+p2HalfW*1.6, p2Y],
      [cx+p1HalfW*1.5, p1Y],
      [cx+baseHalfW, groundY],
    ];
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for(let i=1;i<outline.length;i++){
      const [x,y] = outline[i];
      const [px,py] = outline[i-1];
      ctx.quadraticCurveTo((px+x)/2 + (i%2? -w*0.02: w*0.02), (py+y)/2, x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Platforms (horizontal bars)
    function platform(y, halfW, thick){
      ctx.fillRect(cx-halfW-w*0.02, y-thick/2, (halfW+w*0.02)*2, thick);
    }
    platform(p1Y, p1HalfW, h*0.016);
    platform(p2Y, p2HalfW, h*0.012);
    platform(p3Y, p3HalfW, h*0.008);

    // Lattice cross-bracing, clipped to the tower silhouette
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for(let i=1;i<outline.length;i++){
      const [x,y] = outline[i];
      const [px,py] = outline[i-1];
      ctx.quadraticCurveTo((px+x)/2 + (i%2? -w*0.02: w*0.02), (py+y)/2, x, y);
    }
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = 'rgba(230,220,200,0.35)';
    ctx.lineWidth = Math.max(1, w*0.0022);
    const bandTop = apexY, bandBottom = groundY;
    const step = h*0.028;
    let toggle = true;
    for(let y=bandTop; y<bandBottom; y+=step){
      const spanTop = w*0.02 + (y-bandTop)/(bandBottom-bandTop)*w*0.5;
      ctx.beginPath();
      if(toggle){
        ctx.moveTo(cx-spanTop, y);
        ctx.lineTo(cx+spanTop, y+step);
        ctx.moveTo(cx+spanTop, y);
        ctx.lineTo(cx-spanTop, y+step);
      } else {
        ctx.moveTo(cx-spanTop, y+step);
        ctx.lineTo(cx+spanTop, y);
        ctx.moveTo(cx+spanTop, y+step);
        ctx.lineTo(cx-spanTop, y);
      }
      ctx.stroke();
      toggle = !toggle;
    }
    ctx.restore();

    // Antenna mast
    ctx.strokeStyle = '#12151C';
    ctx.lineWidth = w*0.006;
    ctx.beginPath();
    ctx.moveTo(cx, apexY);
    ctx.lineTo(cx, apexY - h*0.05);
    ctx.stroke();

    // Birds for atmosphere
    ctx.strokeStyle = 'rgba(20,20,30,0.5)';
    ctx.lineWidth = Math.max(1,w*0.002);
    [[0.18,0.22],[0.24,0.26],[0.82,0.18]].forEach(([bx,by])=>{
      const x=w*bx, y=h*by, s=w*0.014;
      ctx.beginPath();
      ctx.moveTo(x-s,y);
      ctx.quadraticCurveTo(x,y-s*0.8,x+s*0.1,y);
      ctx.quadraticCurveTo(x+s*0.2,y-s*0.8,x+s*1.1,y);
      ctx.stroke();
    });
  }

  const BUILTIN_IMAGES = [
    {key:'eiffel', label:'Torre Eiffel', draw:drawEiffelTower},
  ];

  // ---------------- UI: builtin thumbnails ----------------
  const builtinThumbsEl = document.getElementById('builtinThumbs');
  BUILTIN_IMAGES.forEach(img=>{
    const c = document.createElement('canvas');
    c.width=140; c.height=180;
    img.draw(c);
    const div = document.createElement('div');
    div.className='thumb';
    div.style.backgroundImage = `url(${c.toDataURL()})`;
    div.title = img.label;
    div.addEventListener('click', ()=>{
      document.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));
      div.classList.add('active');
      setSourceFromDraw(img.draw, img.label);
    });
    builtinThumbsEl.appendChild(div);
  });

  function setSourceFromDraw(drawFn, label){
    const c = document.createElement('canvas');
    c.width = 900; c.height = 1150;
    drawFn(c);
    state.sourceImg = c;
    state.sourceLabel = label;
    document.getElementById('imgStatus').textContent = `Imagen lista: ${label}`;
    document.getElementById('generateBtn').disabled = false;
    setStep(2);
  }

  function setSourceFromImageElement(imgEl, label){
    // Draw into a working canvas at a fixed max resolution, cover-fit
    const maxDim = 1100;
    let w = imgEl.naturalWidth || imgEl.width;
    let h = imgEl.naturalHeight || imgEl.height;
    const scale = Math.min(maxDim/w, maxDim/h, 1) || 1;
    const targetW = Math.round(w*scale), targetH = Math.round(h*scale);
    const c = document.createElement('canvas');
    c.width = targetW; c.height = targetH;
    const ctx = c.getContext('2d');
    try{
      ctx.drawImage(imgEl,0,0,targetW,targetH);
    }catch(e){
      document.getElementById('imgStatus').textContent = 'No se pudo leer esa imagen (bloqueo de origen). Probá subirla como archivo.';
      return;
    }
    state.sourceImg = c;
    state.sourceLabel = label;
    document.getElementById('imgStatus').textContent = `Imagen lista: ${label}`;
    document.getElementById('generateBtn').disabled = false;
    setStep(2);
  }

  document.getElementById('fileInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        document.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));
        setSourceFromImageElement(img, file.name);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('loadUrlBtn').addEventListener('click', ()=>{
    const url = document.getElementById('urlInput').value.trim();
    if(!url) return;
    document.getElementById('imgStatus').textContent = 'Cargando imagen…';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>{
      document.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));
      setSourceFromImageElement(img, 'Imagen de URL');
    };
    img.onerror = ()=>{
      document.getElementById('imgStatus').textContent = 'No se pudo cargar esa URL. Probá con otra o subí un archivo.';
    };
    img.src = url;
  });

  // ---------------- UI: difficulty chips ----------------
  const difficultyRow = document.getElementById('difficultyRow');
  DIFFICULTIES.forEach((d,i)=>{
    const chip = document.createElement('div');
    chip.className = 'chip' + (i===1?' active':'');
    chip.textContent = `${d.label} · ${d.rows*d.cols} piezas`;
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('#difficultyRow .chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      state.difficulty = d;
      setStep(2);
    });
    difficultyRow.appendChild(chip);
  });
  state.difficulty = DIFFICULTIES[1];

  // ---------------- Jigsaw geometry ----------------
  // edge sign convention: +1 = tab pointing outward (away from piece a's own body, into neighbor)
  //                        -1 = blank / indentation
  function buildEdgeMatrices(rows, cols){
    const horiz = []; // horiz[r][c] : edge between (r,c) and (r,c+1), c in [0, cols-2]
    for(let r=0;r<rows;r++){
      horiz.push([]);
      for(let c=0;c<cols-1;c++) horiz[r].push(Math.random()<0.5?1:-1);
    }
    const vert = []; // vert[r][c] : edge between (r,c) and (r+1,c), r in [0, rows-2]
    for(let r=0;r<rows-1;r++){
      const row=[];
      for(let c=0;c<cols;c++) row.push(Math.random()<0.5?1:-1);
      vert.push(row);
    }
    return {horiz, vert};
  }

  // draws one edge of a piece path (in local piece coordinates, before clip),
  // from point (x1,y1) to (x2,y2), with a tab of given sign (0 flat, 1 out, -1 in)
  function edgePath(ctx, x1,y1,x2,y2, sign, tabSize){
    if(sign===0){
      ctx.lineTo(x2,y2);
      return;
    }
    const dx = x2-x1, dy = y2-y1;
    const len = Math.sqrt(dx*dx+dy*dy);
    const ux = dx/len, uy = dy/len;   // unit along edge
    const nx = -uy, ny = ux;          // unit normal
    const dir = sign; // +1 outward, -1 inward
    const amp = tabSize * dir;

    const p = (t)=>({x:x1+ux*len*t, y:y1+uy*len*t});
    const a = p(0.38), b = p(0.5), c = p(0.62);

    // control points bulge along normal
    const bulge = (pt, mult)=>({x:pt.x+nx*amp*mult, y:pt.y+ny*amp*mult});

    const c1 = bulge(a, 0.9);
    const c2 = bulge(p(0.44), 1.65);
    const neckTop = bulge(b, 1.65);
    const c3 = bulge(p(0.56), 1.65);
    const c4 = bulge(c, 0.9);

    ctx.lineTo(a.x, a.y);
    ctx.bezierCurveTo(c1.x,c1.y, c2.x,c2.y, neckTop.x,neckTop.y);
    ctx.bezierCurveTo(c3.x,c3.y, c4.x,c4.y, c.x,c.y);
    ctx.lineTo(x2,y2);
  }

  function tracePiecePath(ctx, w, h, edges, tabSize){
    // edges = {top, right, bottom, left} each -1,0,1 as seen from THIS piece
    // (top/left signs need flipping since they're shared with neighbor's right/bottom)
    ctx.beginPath();
    ctx.moveTo(0,0);
    edgePath(ctx, 0,0, w,0, edges.top, tabSize);
    edgePath(ctx, w,0, w,h, edges.right, tabSize);
    edgePath(ctx, w,h, 0,h, edges.bottom, tabSize);
    edgePath(ctx, 0,h, 0,0, edges.left, tabSize);
    ctx.closePath();
  }

  // ---------------- Puzzle generation ----------------
  const boardWrapEl = document.getElementById('boardWrap');
  const boardEl = document.getElementById('board');
  const trayInnerEl = document.getElementById('trayInner');

  function clearBoard(){
    boardEl.innerHTML='';
    trayInnerEl.innerHTML='';
    state.pieces = [];
    state.placedCount = 0;
  }

  function generatePuzzle(){
    clearBoard();
    stopTimer();

    const rows = state.difficulty.rows, cols = state.difficulty.cols;
    const src = state.sourceImg;
    const aspect = src.height / src.width;

    // Fit the board fully inside whatever space boardWrap actually has
    // (both width AND height), so the whole puzzle is visible without
    // needing to scroll the board itself while playing.
    const wrapRect = boardWrapEl.getBoundingClientRect();
    const wrapPad = 16;
    const availW = Math.max(200, (wrapRect.width || document.body.clientWidth) - wrapPad);
    const availH = Math.max(200, (wrapRect.height || 420) - wrapPad);

    let boardW, boardH;
    if(availW * aspect <= availH){
      boardW = Math.min(availW, 900);
      boardH = boardW * aspect;
    } else {
      boardH = Math.min(availH, 900);
      boardW = boardH / aspect;
    }
    boardW = Math.round(boardW); boardH = Math.round(boardH);

    state.boardW = boardW; state.boardH = boardH;
    const pieceW = boardW / cols, pieceH = boardH / rows;
    state.pieceW = pieceW; state.pieceH = pieceH;
    const tabSize = Math.min(pieceW, pieceH) * 0.22;
    state.tabSize = tabSize;

    // pre-render source at board resolution for cutting
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = boardW; srcCanvas.height = boardH;
    srcCanvas.getContext('2d').drawImage(src, 0,0, boardW, boardH);

    const {horiz, vert} = buildEdgeMatrices(rows, cols);

    boardEl.style.width = boardW+'px';
    boardEl.style.height = boardH+'px';

    // draw slot outlines (visual target grid)
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const slot = document.createElement('div');
        slot.className='slot';
        slot.style.left = (c*pieceW)+'px';
        slot.style.top = (r*pieceH)+'px';
        slot.style.width = pieceW+'px';
        slot.style.height = pieceH+'px';
        boardEl.appendChild(slot);
      }
    }

    const pad = tabSize;
    const pieceCanvasW = pieceW + pad*2;
    const pieceCanvasH = pieceH + pad*2;

    // "Hand size": the size pieces render at while loose (in the tray or
    // being carried), independent of their true board size. Capping this
    // keeps the tray's height constant and predictable, and — just as
    // importantly — means a piece never visually jumps in size the instant
    // you pick it up. It only grows to its true size at the moment it
    // snaps correctly into the board.
    const HAND_MAX_H = 88;
    const handScale = Math.min(1, HAND_MAX_H / pieceCanvasH);
    const handW = pieceCanvasW * handScale;
    const handH = pieceCanvasH * handScale;

    const piecesData = [];

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const edges = {
          top:    r===0 ? 0 : -vert[r-1][c],
          left:   c===0 ? 0 : -horiz[r][c-1],
          right:  c===cols-1 ? 0 : horiz[r][c],
          bottom: r===rows-1 ? 0 : vert[r][c],
        };

        const pc = document.createElement('canvas');
        pc.width = pieceCanvasW; pc.height = pieceCanvasH;
        const pctx = pc.getContext('2d');

        pctx.save();
        pctx.translate(pad, pad);
        tracePiecePath(pctx, pieceW, pieceH, edges, tabSize);
        pctx.restore();

        pctx.save();
        pctx.translate(pad, pad);
        tracePiecePath(pctx, pieceW, pieceH, edges, tabSize);
        pctx.clip();
        const sx = c*pieceW - pad, sy = r*pieceH - pad;
        pctx.drawImage(srcCanvas, sx, sy, pieceCanvasW, pieceCanvasH, -pad, -pad, pieceCanvasW, pieceCanvasH);
        pctx.restore();

        // subtle edge stroke for definition
        pctx.save();
        pctx.translate(pad, pad);
        tracePiecePath(pctx, pieceW, pieceH, edges, tabSize);
        pctx.lineWidth = 1;
        pctx.strokeStyle = 'rgba(16,20,28,0.55)';
        pctx.stroke();
        pctx.restore();

        const correctX = c*pieceW - pad;
        const correctY = r*pieceH - pad;

        piecesData.push({r,c, canvas:pc, correctX, correctY, w:pieceCanvasW, h:pieceCanvasH});
      }
    }

    // shuffle order for tray placement
    const order = piecesData.map((_,i)=>i);
    for(let i=order.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [order[i],order[j]] = [order[j],order[i]];
    }

    order.forEach((idx)=>{
      const pd = piecesData[idx];
      const el = pd.canvas;              // use the cut canvas directly, no base64 round-trip
      el.className = 'piece in-tray';
      el.style.width = handW+'px';
      el.style.height = handH+'px';
      el.draggable = false;

      trayInnerEl.appendChild(el);       // flex row lays it out automatically

      const pieceObj = {
        el, correctX: pd.correctX, correctY: pd.correctY,
        trueW: pd.w, trueH: pd.h,        // full size, applied on correct placement
        w: handW, h: handH, placed:false, container:'tray'
      };
      state.pieces.push(pieceObj);
      attachDrag(pieceObj);
    });


    state.totalPieces = piecesData.length;
    updateStats();
    startTimer();
  }

  // ---------------- Drag & drop (pointer events, mouse+touch) ----------------
  // Movement during drag is done purely with CSS transform (translate3d) on a
  // single fixed full-viewport "stage", batched through requestAnimationFrame.
  // The piece is appended to the stage ONCE per drag (not on every pointermove),
  // which is what removes the stutter/jank from the previous version.

  function getDragStage(){
    let stage = document.getElementById('dragStage');
    if(!stage){
      stage = document.createElement('div');
      stage.id = 'dragStage';
      document.body.appendChild(stage);
    }
    return stage;
  }

  function attachDrag(piece){
    const el = piece.el;
    let dragging = false;
    let activePointerId = null;
    let offsetX = 0, offsetY = 0;
    let lastX = 0, lastY = 0;        // latest pointer position
    let rafId = null;

    function scheduleMove(){
      if(rafId) return;
      rafId = requestAnimationFrame(()=>{
        rafId = null;
        const x = lastX - offsetX;
        const y = lastY - offsetY;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    }

    // NOTE: we deliberately do NOT use setPointerCapture here. The piece
    // gets reparented into #dragStage the moment the drag starts, and in
    // practice that reparenting causes captured pointer events to stop
    // arriving. Listening on `document` instead is what actually keeps the
    // drag smooth and reliable, on both mouse and touch.
    function onPointerMove(e){
      if(!dragging || e.pointerId !== activePointerId) return;
      lastX = e.clientX; lastY = e.clientY;
      scheduleMove();
    }
    function onPointerUp(e){
      if(!dragging || e.pointerId !== activePointerId) return;
      endDrag(e);
    }

    el.addEventListener('pointerdown', (e)=>{
      if(piece.placed) return;
      dragging = true;
      activePointerId = e.pointerId;
      el.classList.add('dragging');

      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      lastX = e.clientX; lastY = e.clientY;

      // Freeze the element at its current viewport position, then move it
      // to the drag stage exactly once. All subsequent motion is a transform.
      el.style.position = 'fixed';
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.margin = '0';
      el.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
      getDragStage().appendChild(el);

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    });

    function finalizeInto(parent, left, top, growToTrue){
      el.classList.remove('in-tray');
      el.style.position = 'absolute';
      el.style.transform = 'none';
      el.style.left = left+'px';
      el.style.top = top+'px';
      if(growToTrue){
        el.style.width = piece.trueW+'px';
        el.style.height = piece.trueH+'px';
      }
      parent.appendChild(el);
    }

    // Instant placement (used for free drops that don't need a snap animation)
    function settleInto(parent, left, top){
      finalizeInto(parent, left, top, false);
    }

    // Sends the piece back into the tray's normal horizontal flow (no
    // manual left/top bookkeeping needed — flexbox lays it out).
    function returnToTray(){
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.transform = 'none';
      el.style.width = piece.w+'px';
      el.style.height = piece.h+'px';
      el.classList.add('in-tray');
      trayInnerEl.appendChild(el);
    }

    // Animated placement: slides from wherever the finger let go into the
    // exact correct slot, using the Web Animations API on transform so it
    // stays smooth regardless of the position:fixed -> absolute switch.
    // The piece also grows from its "hand size" to its true board size,
    // right as it locks in — a deliberate, satisfying snap rather than a
    // jarring resize on pickup (which is why it stays hand-size the whole
    // time it's just being carried around).
    function snapAnimateInto(parent, left, top){
      const parentRect = parent.getBoundingClientRect();
      const finalX = parentRect.left + left;
      const finalY = parentRect.top + top;
      const anim = el.animate(
        [{transform: el.style.transform}, {transform:`translate3d(${finalX}px, ${finalY}px, 0)`}],
        {duration:170, easing:'cubic-bezier(.2,.85,.3,1.15)'}
      );
      // width/height grow via the CSS transition already defined on .piece
      requestAnimationFrame(()=>{
        el.style.width = piece.trueW+'px';
        el.style.height = piece.trueH+'px';
      });
      anim.onfinish = () => finalizeInto(parent, left, top, true);
    }

    function endDrag(e){
      if(!dragging) return;
      dragging = false;
      activePointerId = null;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
      el.classList.remove('dragging');
      el.style.margin = '';

      const boardRect = boardEl.getBoundingClientRect();
      const dropX = e.clientX - offsetX - boardRect.left;
      const dropY = e.clientY - offsetY - boardRect.top;

      const threshold = Math.min(state.pieceW, state.pieceH) * 0.32;
      const dist = Math.hypot(dropX - piece.correctX, dropY - piece.correctY);

      if(dist < threshold){
        piece.placed = true;
        piece.container = 'board';
        el.classList.add('placed');
        el.style.cursor = 'default';
        state.placedCount++;
        updateStats();
        snapAnimateInto(boardEl, piece.correctX, piece.correctY);
        setTimeout(()=>pulse(el), 170);
        if(state.placedCount === state.totalPieces){
          setTimeout(onWin, 220);
        }
      } else {
        const trayRect = document.getElementById('tray').getBoundingClientRect();
        const overBoard = dropX > -state.tabSize && dropX < state.boardW &&
                           dropY > -state.tabSize && dropY < state.boardH &&
                           e.clientY < trayRect.top;
        if(overBoard){
          el.classList.remove('in-tray');
          settleInto(boardEl, dropX, dropY);
          piece.container = 'board';
        } else {
          returnToTray();
          piece.container = 'tray';
        }
      }
    }

  }

  function pulse(el){
    el.animate(
      [{transform:'scale(1.08)'},{transform:'scale(1)'}],
      {duration:180, easing:'ease-out'}
    );
  }

  // ---------------- Stats / timer ----------------
  function updateStats(){
    document.getElementById('statPieces').textContent = `${state.placedCount}/${state.totalPieces}`;
  }
  function startTimer(){
    state.timerStart = Date.now();
    stopTimer(true);
    state.timerInterval = setInterval(()=>{
      const s = Math.floor((Date.now()-state.timerStart)/1000);
      const mm = String(Math.floor(s/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      document.getElementById('statTime').textContent = `${mm}:${ss}`;
    }, 500);
  }
  function stopTimer(silent){
    if(state.timerInterval) clearInterval(state.timerInterval);
    if(!silent && state.timerStart){
      // keep last displayed value
    }
  }

  function onWin(){
    stopTimer();
    const timeText = document.getElementById('statTime').textContent;
    document.getElementById('winStats').textContent = `${state.sourceLabel} · ${state.totalPieces} piezas · tiempo ${timeText}`;
    document.getElementById('winOverlay').classList.add('show');
  }

  // ---------------- Step indicator ----------------
  function setStep(n){
    document.querySelectorAll('#stepsIndicator .step').forEach(el=>{
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s===n);
      el.classList.toggle('done', s<n);
    });
  }

  // ---------------- Buttons ----------------
  document.getElementById('generateBtn').addEventListener('click', ()=>{
    document.getElementById('setupPanel').classList.add('hide');
    document.getElementById('board-area').classList.add('visible');
    document.body.classList.add('playing');
    setStep(3);
    // wait one frame so boardWrap has its final flex-allocated size
    // before we measure it to fit the board.
    requestAnimationFrame(()=>requestAnimationFrame(generatePuzzle));
  });

  document.getElementById('changeImgBtn').addEventListener('click', ()=>{
    stopTimer();
    document.getElementById('board-area').classList.remove('visible');
    document.getElementById('setupPanel').classList.remove('hide');
    document.body.classList.remove('playing');
    setStep(1);
  });

  document.getElementById('shuffleBtn').addEventListener('click', ()=>{
    generatePuzzle();
  });

  document.getElementById('playAgainBtn').addEventListener('click', ()=>{
    document.getElementById('winOverlay').classList.remove('show');
    generatePuzzle();
  });

  let refShown=false;
  document.getElementById('showRefBtn').addEventListener('click', (e)=>{
    refShown = !refShown;
    let refImg = document.getElementById('refPreview');
    if(refShown){
      if(!refImg){
        refImg = document.createElement('img');
        refImg.id='refPreview';
        refImg.style.maxWidth='100%';
        refImg.style.border='1px solid var(--steel-dim)';
        refImg.style.borderRadius='3px';
        refImg.style.marginTop='10px';
        document.getElementById('board-area').insertBefore(refImg, document.getElementById('boardWrap'));
      }
      refImg.src = state.sourceImg.toDataURL ? state.sourceImg.toDataURL() : '';
      refImg.style.display='block';
      e.target.textContent = 'Ocultar referencia';
    } else if(refImg){
      refImg.style.display='none';
      e.target.textContent = 'Ver referencia';
    }
  });

  // register service worker for offline/installable use
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(()=>{/* ignore if not hosted */});
    });
  }

})();
