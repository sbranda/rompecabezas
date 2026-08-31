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
    rotationEnabled: false,
    sourceIsBuiltin: false,
    rows: 0, cols: 0, horiz: null, vert: null,
    timeAttackEnabled: false,
    timeLimitSec: 0,
    timeUp: false,
    hideTimer: false,
    dailyMode: false,
    dailyDate: null,
    dailyRng: null,
  };

  // ---------------- Seeded RNG (for the daily challenge) ----------------
  // mulberry32: small, fast, deterministic PRNG. Same seed -> same sequence
  // -> same puzzle cut/shuffle/etc for everyone playing on the same date.
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStringToSeed(str){
    let h = 2166136261;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function todayStr(){
    const d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  const DIFFICULTIES = [
    {key:'facil',  label:'Fácil',    rows:3,  cols:4},
    {key:'media',  label:'Media',    rows:4,  cols:5},
    {key:'dificil',label:'Difícil',  rows:6,  cols:7},
    {key:'experto',label:'Experto',  rows:8,  cols:9},
    {key:'maestro',label:'Maestro',  rows:10, cols:12},
    {key:'extremo',label:'Extremo',  rows:13, cols:15},
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

  // ---------------- Built-in demo image: procedural world map ----------------
  function drawWorldMap(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    // Ocean
    const ocean = ctx.createLinearGradient(0,0,0,h);
    ocean.addColorStop(0, '#16324A');
    ocean.addColorStop(1, '#0E2436');
    ctx.fillStyle = ocean;
    ctx.fillRect(0,0,w,h);

    // Latitude/longitude grid (blueprint style, matches the app's own aesthetic)
    ctx.strokeStyle = 'rgba(201,162,39,0.14)';
    ctx.lineWidth = 1;
    for(let y=0; y<=h; y+=h/12){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
    for(let x=0; x<=w; x+=w/10){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }

    const land = '#C9A227';
    const landShade = '#A9852090';
    ctx.fillStyle = land;

    function blob(points){
      ctx.beginPath();
      ctx.moveTo(points[0][0]*w, points[0][1]*h);
      for(let i=1;i<points.length;i++) ctx.lineTo(points[i][0]*w, points[i][1]*h);
      ctx.closePath();
      ctx.fill();
    }

    // Rough, stylized continent silhouettes (not geographically precise —
    // this is a puzzle prop, not an atlas).
    blob([[0.06,0.20],[0.16,0.16],[0.20,0.26],[0.15,0.38],[0.18,0.48],[0.12,0.55],[0.14,0.62],
          [0.09,0.60],[0.05,0.46],[0.07,0.32]]); // North America
    blob([[0.16,0.58],[0.22,0.56],[0.24,0.66],[0.20,0.82],[0.16,0.92],[0.12,0.80],[0.13,0.66]]); // South America
    blob([[0.42,0.18],[0.52,0.16],[0.56,0.24],[0.50,0.30],[0.53,0.36],[0.46,0.34],[0.41,0.26]]); // Europe
    blob([[0.44,0.36],[0.54,0.34],[0.58,0.50],[0.52,0.66],[0.46,0.72],[0.40,0.60],[0.41,0.46]]); // Africa
    blob([[0.56,0.16],[0.72,0.14],[0.80,0.22],[0.76,0.34],[0.66,0.42],[0.58,0.36],[0.55,0.26]]); // Asia
    blob([[0.78,0.62],[0.88,0.60],[0.90,0.68],[0.82,0.72],[0.76,0.68]]); // Australia

    // subtle shading pass for depth
    ctx.fillStyle = landShade;
    blob([[0.06,0.20],[0.11,0.18],[0.14,0.30],[0.10,0.40],[0.07,0.32]]);
    blob([[0.44,0.36],[0.50,0.35],[0.52,0.50],[0.47,0.60],[0.42,0.50]]);

    // compass rose
    const cx = w*0.87, cy = h*0.86, r = Math.min(w,h)*0.055;
    ctx.strokeStyle = 'rgba(237,230,214,0.7)';
    ctx.fillStyle = 'rgba(237,230,214,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    [0,90,180,270].forEach(a=>{
      const rad = a*Math.PI/180;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.sin(rad)*r*1.3, cy-Math.cos(rad)*r*1.3);
      ctx.stroke();
    });
    ctx.font = `${Math.round(r*0.7)}px sans-serif`;
    ctx.textAlign='center';
    ctx.fillText('N', cx, cy-r*1.5);
  }

  // ---------------- Built-in demo image: procedural pyramids of Giza ----------------
  function drawPyramids(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    const sky = ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0, '#1B2A4A');
    sky.addColorStop(0.45, '#5A4A6B');
    sky.addColorStop(0.75, '#C9793F');
    sky.addColorStop(1, '#F0B860');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,w,h);

    // sun
    ctx.save();
    const glow = ctx.createRadialGradient(w*0.5,h*0.62,0, w*0.5,h*0.62, w*0.18);
    glow.addColorStop(0,'rgba(255,220,160,0.9)');
    glow.addColorStop(1,'rgba(255,220,160,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // stars in the upper sky
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for(let i=0;i<40;i++){
      const sx = (i*97 % w), sy = (i*53 % (h*0.35));
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // dunes
    const ground = h*0.72;
    ctx.fillStyle = '#3A2A22';
    ctx.beginPath();
    ctx.moveTo(0,h);
    ctx.lineTo(0,ground+20);
    ctx.quadraticCurveTo(w*0.3, ground-10, w*0.55, ground+15);
    ctx.quadraticCurveTo(w*0.8, ground+35, w, ground+5);
    ctx.lineTo(w,h);
    ctx.closePath();
    ctx.fill();

    function pyramid(cx, baseY, baseW, peakH, colorLit, colorShade){
      const half = baseW/2;
      ctx.fillStyle = colorShade;
      ctx.beginPath();
      ctx.moveTo(cx, baseY-peakH);
      ctx.lineTo(cx+half, baseY);
      ctx.lineTo(cx, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colorLit;
      ctx.beginPath();
      ctx.moveTo(cx, baseY-peakH);
      ctx.lineTo(cx-half, baseY);
      ctx.lineTo(cx, baseY);
      ctx.closePath();
      ctx.fill();
    }

    pyramid(w*0.68, ground+30, w*0.30, h*0.30, '#C99A5B', '#8F6A3D');
    pyramid(w*0.40, ground+45, w*0.42, h*0.42, '#D9AE72', '#A17A45');
    pyramid(w*0.15, ground+35, w*0.22, h*0.20, '#C99A5B', '#8F6A3D');

    // small sphinx-like silhouette for scale/interest
    ctx.fillStyle = '#6B4E30';
    ctx.beginPath();
    ctx.ellipse(w*0.86, ground+55, w*0.09, h*0.03, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillRect(w*0.90, ground+30, w*0.03, h*0.045);
  }

  // ---------------- Built-in demo image: procedural Statue of Liberty ----------------
  function drawStatueOfLiberty(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    const sky = ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0, '#22314F');
    sky.addColorStop(0.6, '#3E5470');
    sky.addColorStop(1, '#B7C9C4');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,w,h);

    // harbor water
    const waterY = h*0.82;
    const water = ctx.createLinearGradient(0,waterY,0,h);
    water.addColorStop(0,'#264858');
    water.addColorStop(1,'#132631');
    ctx.fillStyle = water;
    ctx.fillRect(0,waterY,w,h-waterY);
    ctx.strokeStyle='rgba(230,240,235,0.25)';
    for(let i=0;i<8;i++){
      const y = waterY + 8 + i*((h-waterY)/9);
      ctx.beginPath(); ctx.moveTo(w*0.1,y); ctx.lineTo(w*0.9,y); ctx.stroke();
    }

    const cx = w*0.5;
    // pedestal
    const pedTop = h*0.62, pedBot = waterY;
    ctx.fillStyle = '#8B8378';
    ctx.beginPath();
    ctx.moveTo(cx-w*0.11, pedBot);
    ctx.lineTo(cx-w*0.08, pedTop);
    ctx.lineTo(cx+w*0.08, pedTop);
    ctx.lineTo(cx+w*0.11, pedBot);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.15)';
    for(let i=1;i<5;i++){
      const y = pedTop + (pedBot-pedTop)*i/5;
      ctx.beginPath(); ctx.moveTo(cx-w*0.10,y); ctx.lineTo(cx+w*0.10,y); ctx.stroke();
    }

    // robe (body)
    const robeTop = h*0.22;
    ctx.fillStyle = '#5C8A7A';
    ctx.beginPath();
    ctx.moveTo(cx, robeTop);
    ctx.quadraticCurveTo(cx-w*0.10, h*0.40, cx-w*0.075, pedTop);
    ctx.lineTo(cx+w*0.075, pedTop);
    ctx.quadraticCurveTo(cx+w*0.10, h*0.40, cx, robeTop);
    ctx.closePath();
    ctx.fill();
    // robe shading folds
    ctx.strokeStyle='rgba(0,0,0,0.12)';
    ctx.lineWidth=1.5;
    for(let i=-2;i<=2;i++){
      ctx.beginPath();
      ctx.moveTo(cx+i*w*0.012, robeTop+h*0.06);
      ctx.quadraticCurveTo(cx+i*w*0.02, h*0.4, cx+i*w*0.03, pedTop-5);
      ctx.stroke();
    }

    // head + crown
    const headY = robeTop - h*0.03;
    ctx.fillStyle = '#6B9A88';
    ctx.beginPath();
    ctx.ellipse(cx, headY, w*0.028, h*0.022, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#5C8A7A';
    for(let i=-3;i<=3;i++){
      const ang = i*0.22;
      ctx.beginPath();
      ctx.moveTo(cx+Math.sin(ang)*w*0.02, headY-h*0.01);
      ctx.lineTo(cx+Math.sin(ang)*w*0.05, headY-h*0.07);
      ctx.lineTo(cx+Math.sin(ang+0.1)*w*0.02, headY-h*0.008);
      ctx.closePath();
      ctx.fill();
    }

    // raised arm + torch
    ctx.strokeStyle = '#5C8A7A';
    ctx.lineWidth = w*0.02;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(cx+w*0.05, robeTop+h*0.05);
    ctx.lineTo(cx+w*0.14, robeTop-h*0.10);
    ctx.stroke();
    // torch glow
    ctx.save();
    const tglow = ctx.createRadialGradient(cx+w*0.14, robeTop-h*0.13, 0, cx+w*0.14, robeTop-h*0.13, w*0.05);
    tglow.addColorStop(0,'rgba(255,224,140,0.95)');
    tglow.addColorStop(1,'rgba(255,224,140,0)');
    ctx.fillStyle = tglow;
    ctx.beginPath(); ctx.arc(cx+w*0.14, robeTop-h*0.13, w*0.05, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#D9AE72';
    ctx.beginPath();
    ctx.arc(cx+w*0.14, robeTop-h*0.13, w*0.016, 0, Math.PI*2);
    ctx.fill();

    // tablet arm (left, held against body)
    ctx.fillStyle = '#D9AE72';
    ctx.fillRect(cx-w*0.10, robeTop+h*0.09, w*0.045, h*0.09);
  }

  // ---------------- Built-in demo image: procedural flag mosaic ----------------
  function drawFlagsMosaic(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#10161F';
    ctx.fillRect(0,0,w,h);

    const cols = 2, rows = 3;
    const padOuter = w*0.04, gap = w*0.03;
    const cellW = (w - padOuter*2 - gap*(cols-1))/cols;
    const cellH = (h - padOuter*2 - gap*(rows-1))/rows;

    function cellBox(i){
      const c = i % cols, r = Math.floor(i/cols);
      return {
        x: padOuter + c*(cellW+gap),
        y: padOuter + r*(cellH+gap),
        w: cellW, h: cellH,
      };
    }

    function withClip(box, drawFn){
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      drawFn(box);
      ctx.restore();
      ctx.strokeStyle = 'rgba(16,20,28,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }

    // Argentina: light blue / white / light blue, sun in the middle
    withClip(cellBox(0), (b)=>{
      ctx.fillStyle = '#75AADB';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(b.x, b.y+b.h/3, b.w, b.h/3);
      ctx.fillStyle = '#F6B40E';
      ctx.beginPath();
      ctx.arc(b.x+b.w/2, b.y+b.h/2, b.h*0.14, 0, Math.PI*2);
      ctx.fill();
    });

    // Japan: white field, red disc
    withClip(cellBox(1), (b)=>{
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle = '#BC002D';
      ctx.beginPath();
      ctx.arc(b.x+b.w/2, b.y+b.h/2, b.h*0.28, 0, Math.PI*2);
      ctx.fill();
    });

    // Italy: green / white / red vertical stripes
    withClip(cellBox(2), (b)=>{
      const s = b.w/3;
      ctx.fillStyle = '#009246'; ctx.fillRect(b.x, b.y, s, b.h);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(b.x+s, b.y, s, b.h);
      ctx.fillStyle = '#CE2B37'; ctx.fillRect(b.x+2*s, b.y, s, b.h);
    });

    // Germany: black / red / gold horizontal stripes
    withClip(cellBox(3), (b)=>{
      const s = b.h/3;
      ctx.fillStyle = '#000000'; ctx.fillRect(b.x, b.y, b.w, s);
      ctx.fillStyle = '#DD0000'; ctx.fillRect(b.x, b.y+s, b.w, s);
      ctx.fillStyle = '#FFCE00'; ctx.fillRect(b.x, b.y+2*s, b.w, s);
    });

    // Brazil (simplified): green field, yellow diamond, blue circle
    withClip(cellBox(4), (b)=>{
      ctx.fillStyle = '#009C3B';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle = '#FFDF00';
      ctx.beginPath();
      ctx.moveTo(b.x+b.w/2, b.y+b.h*0.12);
      ctx.lineTo(b.x+b.w*0.90, b.y+b.h/2);
      ctx.lineTo(b.x+b.w/2, b.y+b.h*0.88);
      ctx.lineTo(b.x+b.w*0.10, b.y+b.h/2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#002776';
      ctx.beginPath();
      ctx.arc(b.x+b.w/2, b.y+b.h/2, b.h*0.20, 0, Math.PI*2);
      ctx.fill();
    });

    // France: blue / white / red vertical stripes
    withClip(cellBox(5), (b)=>{
      const s = b.w/3;
      ctx.fillStyle = '#0055A4'; ctx.fillRect(b.x, b.y, s, b.h);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(b.x+s, b.y, s, b.h);
      ctx.fillStyle = '#EF4135'; ctx.fillRect(b.x+2*s, b.y, s, b.h);
    });
  }

  const BUILTIN_IMAGES = [
    {key:'eiffel',   label:'Torre Eiffel',        draw:drawEiffelTower},
    {key:'liberty',  label:'Estatua de la Libertad', draw:drawStatueOfLiberty},
    {key:'pyramids', label:'Pirámides de Giza',    draw:drawPyramids},
    {key:'worldmap', label:'Mapa del Mundo',       draw:drawWorldMap},
    {key:'flags',    label:'Banderas del Mundo',   draw:drawFlagsMosaic},
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
    state.sourceIsBuiltin = true;
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
    state.sourceIsBuiltin = false;
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

  // ---------------- AI image generation (Pollinations.ai, no API key) ----------------
  document.getElementById('generateAiBtn').addEventListener('click', ()=>{
    const prompt = document.getElementById('aiPromptInput').value.trim();
    const statusEl = document.getElementById('aiStatus');
    const btn = document.getElementById('generateAiBtn');
    if(!prompt){
      statusEl.textContent = 'Escribí un tema primero (ej: "un castillo entre nubes").';
      return;
    }

    btn.disabled = true;
    statusEl.textContent = 'Generando imagen con IA… puede tardar unos segundos.';

    // Pollinations.ai is a free, keyless image-generation service — not an
    // Anthropic product. It's used here purely because this app is a static
    // page with no backend of its own to call a proper API from.
    const seed = Math.floor(Math.random()*1e9);
    const encoded = encodeURIComponent(prompt);
    const genUrl = `https://image.pollinations.ai/prompt/${encoded}?width=900&height=1150&nologo=true&seed=${seed}`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>{
      btn.disabled = false;
      document.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));
      setSourceFromImageElement(img, `IA: "${prompt}"`);
      statusEl.textContent = 'Usa un servicio gratuito externo (Pollinations.ai), no de Anthropic. Necesita internet y puede tardar unos segundos.';
    };
    img.onerror = ()=>{
      btn.disabled = false;
      statusEl.textContent = 'No se pudo generar la imagen (¿hay internet?). Probá de nuevo en un momento.';
    };
    img.src = genUrl;
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

  // ---------------- UI: rotation toggle ----------------
  const rotationToggleEl = document.getElementById('rotationToggle');
  rotationToggleEl.addEventListener('click', ()=>{
    state.rotationEnabled = !state.rotationEnabled;
    rotationToggleEl.classList.toggle('active', state.rotationEnabled);
  });

  // ---------------- UI: time attack toggle ----------------
  const timeAttackToggleEl = document.getElementById('timeAttackToggle');
  timeAttackToggleEl.addEventListener('click', ()=>{
    state.timeAttackEnabled = !state.timeAttackEnabled;
    timeAttackToggleEl.classList.toggle('active', state.timeAttackEnabled);
    if(state.timeAttackEnabled){
      // Contrarreloj needs a visible, ticking countdown — the two modes
      // are opposites, so turning one on turns the other off.
      state.hideTimer = false;
      noTimerToggleEl.classList.remove('active');
    }
  });

  // ---------------- UI: relaxed / no-visible-timer toggle ----------------
  const noTimerToggleEl = document.getElementById('noTimerToggle');
  noTimerToggleEl.addEventListener('click', ()=>{
    state.hideTimer = !state.hideTimer;
    noTimerToggleEl.classList.toggle('active', state.hideTimer);
    if(state.hideTimer){
      state.timeAttackEnabled = false;
      timeAttackToggleEl.classList.remove('active');
    }
  });

  // ---------------- Jigsaw geometry ----------------
  // edge sign convention: +1 = tab pointing outward (away from piece a's own body, into neighbor)
  //                        -1 = blank / indentation
  function buildEdgeMatrices(rows, cols, rand){
    rand = rand || Math.random;
    const horiz = []; // horiz[r][c] : edge between (r,c) and (r,c+1), c in [0, cols-2]
    for(let r=0;r<rows;r++){
      horiz.push([]);
      for(let c=0;c<cols-1;c++) horiz[r].push(rand()<0.5?1:-1);
    }
    const vert = []; // vert[r][c] : edge between (r,c) and (r+1,c), r in [0, rows-2]
    for(let r=0;r<rows-1;r++){
      const row=[];
      for(let c=0;c<cols;c++) row.push(rand()<0.5?1:-1);
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

  // Paints one piece into `canvas` at a given rotation (0/90/180/270), baking
  // the rotation directly into the pixels rather than using a CSS transform.
  // This is what lets full 4-way rotation coexist with the drag-and-drop
  // math: the canvas's own width/height ARE the piece's true footprint at
  // that rotation (swapped for 90°/270°), so getBoundingClientRect and every
  // position/offset calculation elsewhere just works, with zero awareness
  // that rotation exists at all.
  function paintPieceCanvas(canvas, edges, pieceW, pieceH, tabSize, srcCanvas, sx, sy, rotationDeg){
    const pad = tabSize;
    const pieceCanvasW = pieceW + pad*2;
    const pieceCanvasH = pieceH + pad*2;
    const rot = ((rotationDeg % 360) + 360) % 360;
    const swapped = (rot === 90 || rot === 270);
    canvas.width = swapped ? pieceCanvasH : pieceCanvasW;
    canvas.height = swapped ? pieceCanvasW : pieceCanvasH;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(rot * Math.PI/180);
    ctx.translate(-pieceCanvasW/2, -pieceCanvasH/2);
    // From here on, (0,0)-(pieceCanvasW,pieceCanvasH) is the piece's normal,
    // unrotated drawing frame — identical to the original single-orientation code.

    ctx.save();
    ctx.translate(pad, pad);
    tracePiecePath(ctx, pieceW, pieceH, edges, tabSize);
    ctx.clip();
    ctx.drawImage(srcCanvas, sx, sy, pieceCanvasW, pieceCanvasH, -pad, -pad, pieceCanvasW, pieceCanvasH);
    ctx.restore();

    // subtle edge stroke for definition
    ctx.save();
    ctx.translate(pad, pad);
    tracePiecePath(ctx, pieceW, pieceH, edges, tabSize);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(16,20,28,0.55)';
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  const HAND_MAX_H = 88; // cap on how tall a loose piece renders, whatever its rotation

  // Scales `canvasEl`'s current (possibly rotation-swapped) pixel size down
  // to the shared "hand size" budget, preserving its aspect ratio exactly.
  function handSizeFor(canvasEl){
    const scale = Math.min(1, HAND_MAX_H / canvasEl.height);
    return { w: canvasEl.width*scale, h: canvasEl.height*scale };
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

    // A stale reference preview (or a "shown" state left over from a
    // previous puzzle) must never persist into a freshly generated one.
    const refImg = document.getElementById('refPreview');
    if(refImg) refImg.remove();
    refShown = false;
    const refBtn = document.getElementById('showRefBtn');
    if(refBtn) refBtn.textContent = 'Ver referencia';
  }

  // ---------------- Save / resume progress (localStorage) ----------------
  // Uses localStorage (not the in-chat "window.storage" API) because this
  // app is downloaded and self-hosted outside Claude — localStorage is what
  // actually persists once it's running on the person's own site.
  const PROGRESS_KEY = 'rompecabezas:progress';

  function saveProgress(){
    try{
      if(!state.totalPieces || !state.timerStart) return;
      const payload = {
        version: 1,
        savedAt: Date.now(),
        label: state.sourceLabel,
        isBuiltin: state.sourceIsBuiltin,
        imageDataUrl: state.sourceIsBuiltin ? null : state.sourceImg.toDataURL('image/jpeg', 0.72),
        rows: state.rows, cols: state.cols,
        rotationEnabled: state.rotationEnabled,
        horiz: state.horiz, vert: state.vert,
        elapsedMs: Date.now() - state.timerStart,
        placedCount: state.placedCount,
        totalPieces: state.totalPieces,
        timeAttackEnabled: state.timeAttackEnabled,
        timeLimitSec: state.timeLimitSec,
        isDaily: state.dailyMode,
        dailyDate: state.dailyDate,
        pieces: state.pieces.map(p => ({r:p.r, c:p.c, rotation:p.rotation, placed:p.placed})),
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
    }catch(err){
      // Storage full, disabled, or unavailable (e.g. private browsing) —
      // saving progress is a nice-to-have, never worth interrupting play for.
    }
  }

  function loadSavedProgress(){
    try{
      const raw = localStorage.getItem(PROGRESS_KEY);
      if(!raw) return null;
      const data = JSON.parse(raw);
      if(!data || !Array.isArray(data.pieces) || !data.rows || !data.cols) return null;
      return data;
    }catch(err){
      return null;
    }
  }

  function clearSavedProgress(){
    try{ localStorage.removeItem(PROGRESS_KEY); }catch(err){}
  }

  // ---------------- Daily challenge: best time + streak (localStorage) ----------------
  const DAILY_KEY = 'rompecabezas:daily';

  function loadDailyData(){
    try{
      const raw = localStorage.getItem(DAILY_KEY);
      return raw ? JSON.parse(raw) : {streak:0, lastDate:null, best:{}};
    }catch(err){
      return {streak:0, lastDate:null, best:{}};
    }
  }

  function yesterdayStr(){
    const d = new Date();
    d.setDate(d.getDate()-1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function recordDailyCompletion(elapsedSec){
    try{
      const data = loadDailyData();
      const today = todayStr();
      if(data.best[today] === undefined || elapsedSec < data.best[today]){
        data.best[today] = elapsedSec;
      }
      if(data.lastDate === today){
        // already completed today — streak doesn't change on a replay
      } else if(data.lastDate === yesterdayStr()){
        data.streak = (data.streak||0) + 1;
        data.lastDate = today;
      } else {
        data.streak = 1;
        data.lastDate = today;
      }
      localStorage.setItem(DAILY_KEY, JSON.stringify(data));
      return {streak: data.streak, bestToday: data.best[today]};
    }catch(err){
      return null;
    }
  }

  // ---------------- Completed-puzzle history (localStorage) ----------------
  const HISTORY_KEY = 'rompecabezas:history';
  const HISTORY_MAX = 200;

  function recordHistoryEntry(entry){
    try{
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(entry); // most recent first
      if(list.length > HISTORY_MAX) list.length = HISTORY_MAX;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    }catch(err){
      // history is a nice-to-have; never worth interrupting the win moment for
    }
  }

  function loadHistory(){
    try{
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(err){
      return [];
    }
  }

  function formatMMSS(totalSec){
    const m = String(Math.floor(totalSec/60)).padStart(2,'0');
    const s = String(totalSec%60).padStart(2,'0');
    return `${m}:${s}`;
  }

  function renderHistory(){
    const list = loadHistory();
    const summaryEl = document.getElementById('historySummary');
    const listEl = document.getElementById('historyList');

    if(!list.length){
      summaryEl.innerHTML = 'Todavía no completaste ningún rompecabezas.';
      listEl.innerHTML = '<div class="history-empty">Cuando termines uno, va a aparecer acá.</div>';
      return;
    }

    const totalSec = list.reduce((sum,e)=>sum+(e.timeSec||0), 0);
    const totalH = Math.floor(totalSec/3600);
    const totalM = Math.floor((totalSec%3600)/60);
    summaryEl.innerHTML = `<b>${list.length}</b> rompecabezas completados · <b>${totalH}h ${totalM}m</b> jugadas en total`;

    listEl.innerHTML = list.map(e=>{
      const d = new Date(e.completedAt);
      const dateStr = d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'2-digit'});
      const timeOfDay = d.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
      const badges = [
        e.isDaily ? '<span class="hi-badge">diario</span>' : '',
        e.rotationEnabled ? '<span class="hi-badge">rotación</span>' : '',
        e.timeAttack ? '<span class="hi-badge">contrarreloj</span>' : '',
      ].join('');
      return `<div class="history-item">
        <div class="hi-main">
          <span class="hi-label">${escapeHtml(e.label||'Rompecabezas')}</span>
          <span class="hi-meta">${dateStr} · ${timeOfDay} · ${e.totalPieces} piezas${badges}</span>
        </div>
        <div class="hi-time">${formatMMSS(e.timeSec)}</div>
      </div>`;
    }).join('');
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------------- Best times per difficulty (derived from history) ----------------
  function renderBestTimes(){
    const history = loadHistory();
    const table = document.getElementById('bestTimesTable');

    const rowsHtml = DIFFICULTIES.map(diff=>{
      const matches = history.filter(e => e.rows===diff.rows && e.cols===diff.cols);
      if(!matches.length){
        return `<tr>
          <td>${diff.label}</td>
          <td>${diff.rows*diff.cols}</td>
          <td class="bt-empty" colspan="2">Todavía no completado</td>
        </tr>`;
      }
      const best = matches.reduce((a,b)=> b.timeSec < a.timeSec ? b : a);
      const d = new Date(best.completedAt);
      const dateStr = d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'2-digit'});
      const badges = [
        best.rotationEnabled ? '<span class="hi-badge">rotación</span>' : '',
        best.timeAttack ? '<span class="hi-badge">contrarreloj</span>' : '',
      ].join('');
      return `<tr>
        <td>${diff.label}</td>
        <td>${diff.rows*diff.cols}</td>
        <td class="bt-time">${formatMMSS(best.timeSec)}${badges}</td>
        <td>${dateStr}</td>
      </tr>`;
    }).join('');

    table.innerHTML = `
      <tr>
        <th>Dificultad</th>
        <th>Piezas</th>
        <th>Mejor tiempo</th>
        <th>Fecha</th>
      </tr>
      ${rowsHtml}
    `;
  }

  // ---------------- Hint: double-tap an empty slot to find its piece ----------------
  function attachSlotDoubleTap(slot){
    let lastTap = 0;
    slot.addEventListener('pointerup', (e)=>{
      const now = Date.now();
      if(now - lastTap < 350){
        lastTap = 0;
        highlightPieceForSlot(slot);
      } else {
        lastTap = now;
      }
    });
  }

  function highlightPieceForSlot(slot){
    const cx = parseFloat(slot.dataset.correctX);
    const cy = parseFloat(slot.dataset.correctY);
    const target = state.pieces.find(p =>
      !p.placed && Math.abs(p.correctX - cx) < 0.5 && Math.abs(p.correctY - cy) < 0.5
    );
    if(!target) return; // already solved (or, in edge cases, mid-animation)

    // If it's sitting in the tray's horizontal strip, scroll it into view
    // before drawing attention to it — a highlight off-screen helps no one.
    if(target.container === 'tray'){
      const elRect = target.el.getBoundingClientRect();
      const trayRect = trayInnerEl.getBoundingClientRect();
      if(elRect.left < trayRect.left || elRect.right > trayRect.right){
        const delta = (elRect.left + elRect.width/2) - (trayRect.left + trayRect.width/2);
        trayInnerEl.scrollLeft += delta;
      }
    }

    target.el.classList.remove('hint'); // restart the animation if tapped again mid-highlight
    void target.el.offsetWidth; // force reflow so the class removal registers
    target.el.classList.add('hint');
    setTimeout(()=>target.el.classList.remove('hint'), 1600);
  }

  function generatePuzzle(resumeData){
    clearBoard();
    stopTimer();
    if(!resumeData) clearSavedProgress(); // starting fresh discards any old save

    const rows = resumeData ? resumeData.rows : state.difficulty.rows;
    const cols = resumeData ? resumeData.cols : state.difficulty.cols;
    const src = state.sourceImg;
    const aspect = src.height / src.width;

    // Daily challenge uses a seeded RNG so the cut pattern, initial
    // rotations and shuffle are identical for everyone on the same date.
    // Resuming a saved puzzle needs no randomness at all (every piece's
    // exact state is already known), so it just uses Math.random for the
    // tray's cosmetic ordering.
    const rand = (!resumeData && state.dailyMode) ? state.dailyRng : Math.random;

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
    state.srcCanvas = srcCanvas; // kept for repainting pieces later (tap-to-rotate)

    const {horiz, vert} = resumeData
      ? {horiz: resumeData.horiz, vert: resumeData.vert}
      : buildEdgeMatrices(rows, cols, rand);
    state.horiz = horiz; state.vert = vert; // kept for saving/resuming progress
    state.rows = rows; state.cols = cols;

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
        slot.dataset.correctX = c*pieceW - tabSize;
        slot.dataset.correctY = r*pieceH - tabSize;
        attachSlotDoubleTap(slot);
        boardEl.appendChild(slot);
      }
    }

    const pad = tabSize;
    const pieceCanvasW = pieceW + pad*2;
    const pieceCanvasH = pieceH + pad*2;

    // Look up a piece's saved state (rotation / placed) when resuming.
    const savedByRC = new Map();
    if(resumeData){
      resumeData.pieces.forEach(p => savedByRC.set(p.r+','+p.c, p));
    }

    const piecesData = [];

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const edges = {
          top:    r===0 ? 0 : -vert[r-1][c],
          left:   c===0 ? 0 : -horiz[r][c-1],
          right:  c===cols-1 ? 0 : horiz[r][c],
          bottom: r===rows-1 ? 0 : vert[r][c],
        };

        const sx = c*pieceW - pad, sy = r*pieceH - pad;
        const saved = resumeData ? savedByRC.get(r+','+c) : null;
        const rotation = saved
          ? saved.rotation
          : (state.rotationEnabled ? [0,90,180,270][Math.floor(rand()*4)] : 0);

        const pc = document.createElement('canvas');
        paintPieceCanvas(pc, edges, pieceW, pieceH, tabSize, srcCanvas, sx, sy, rotation);

        const correctX = c*pieceW - pad;
        const correctY = r*pieceH - pad;

        piecesData.push({
          r, c, canvas:pc, correctX, correctY, w:pieceCanvasW, h:pieceCanvasH,
          edges, sx, sy, rotation, placed: saved ? saved.placed : false,
        });
      }
    }

    // shuffle order for tray placement (only matters for not-yet-placed pieces)
    const order = piecesData.map((_,i)=>i);
    for(let i=order.length-1;i>0;i--){
      const j = Math.floor(rand()*(i+1));
      [order[i],order[j]] = [order[j],order[i]];
    }

    let placedCount = 0;

    order.forEach((idx)=>{
      const pd = piecesData[idx];
      const el = pd.canvas;              // use the cut canvas directly, no base64 round-trip
      el.draggable = false;
      el.style.transform = 'none';       // rotation is baked into the pixels, not CSS

      const pieceObj = {
        el, r: pd.r, c: pd.c, correctX: pd.correctX, correctY: pd.correctY,
        trueW: pd.w, trueH: pd.h,        // full size at rotation 0, applied on correct placement
        edges: pd.edges, sx: pd.sx, sy: pd.sy,
        placed: pd.placed, container: pd.placed ? 'board' : 'tray',
        rotation: pd.rotation,           // 0 = correct orientation; 90/180/270 = needs a flip
      };

      if(pd.placed){
        el.className = 'piece placed';
        el.style.position = 'absolute';
        el.style.left = pd.correctX+'px';
        el.style.top = pd.correctY+'px';
        el.style.width = pd.w+'px';
        el.style.height = pd.h+'px';
        el.style.cursor = 'default';
        boardEl.appendChild(el);
        placedCount++;
      } else {
        el.className = 'piece in-tray';
        const hs = handSizeFor(el);
        el.style.width = hs.w+'px';
        el.style.height = hs.h+'px';
        trayInnerEl.appendChild(el);       // flex row lays it out automatically
      }

      state.pieces.push(pieceObj);
      attachDrag(pieceObj);
    });

    state.totalPieces = piecesData.length;
    state.placedCount = placedCount;
    state.timeUp = false;

    if(resumeData){
      state.timeAttackEnabled = !!resumeData.timeAttackEnabled;
      state.timeLimitSec = resumeData.timeLimitSec || 0;
    } else if(state.timeAttackEnabled){
      const perPiece = state.rotationEnabled ? 4.2 : 3.0;
      state.timeLimitSec = Math.max(45, Math.round(state.totalPieces * perPiece / 5) * 5);
    }

    updateStats();
    startTimer(resumeData ? resumeData.elapsedMs : 0);
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
    // mode: 'idle' -> 'pending' (we wait to see whether this becomes a tap,
    // a scroll, or a lift) -> 'scrolling' (hand the gesture to the tray's
    // horizontal scroll), 'dragging' (lift the piece), or released while
    // still 'pending' (a tap — used to flip a rotated piece right-side up).
    let mode = 'idle';
    let activePointerId = null;
    let offsetX = 0, offsetY = 0;
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;        // latest pointer position
    let lastScrollX = 0;
    let trayBottomAtStart = 0;
    let rafId = null;

    const DEADZONE = 6;          // px of wiggle room before committing to a gesture
    const HORIZ_BIAS = 1.3;      // how much more horizontal than vertical movement must be to count as a scroll
    const EXIT_MARGIN = 10;      // px below the tray's bottom edge that unambiguously means "lifting out"

    function scheduleMove(){
      if(rafId) return;
      rafId = requestAnimationFrame(()=>{
        rafId = null;
        const x = lastX - offsetX;
        const y = lastY - offsetY;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    }

    let startRect = null;            // piece's resting rect, captured at pointerdown

    function beginLift(){
      mode = 'dragging';
      el.classList.add('dragging');
      // offsetX/offsetY were computed at pointerdown from startRect (the
      // piece's resting "hand size"). Growing the piece to its true size
      // the moment it's lifted — rather than only on a correct snap — means
      // it's shown at roughly the same scale as the board slot it needs to
      // land in, instead of looking comically tiny next to a huge slot
      // (which is exactly what made low-piece-count puzzles like the
      // 12-piece one feel like pieces "didn't fit"). Since the box grows,
      // the grab offset must scale up by the same factor so the piece
      // doesn't jump under the finger.
      const growScale = piece.trueW / startRect.width;
      offsetX *= growScale;
      offsetY *= growScale;
      el.style.width = piece.trueW+'px';
      el.style.height = piece.trueH+'px';

      el.style.position = 'fixed';
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.margin = '0';
      el.style.transform = `translate3d(${startRect.left}px, ${startRect.top}px, 0)`;
      getDragStage().appendChild(el);
      scheduleMove();
    }

    // NOTE: we deliberately do NOT use setPointerCapture here. The piece
    // gets reparented into #dragStage the moment the drag starts, and in
    // practice that reparenting causes captured pointer events to stop
    // arriving. Listening on `document` instead is what actually keeps the
    // drag smooth and reliable, on both mouse and touch.
    function onPointerMove(e){
      if(e.pointerId !== activePointerId) return;
      lastX = e.clientX; lastY = e.clientY;

      if((mode === 'pending' || mode === 'scrolling') && piece.container === 'tray'){
        // The finger physically leaving the tray strip downward is an
        // unambiguous "lift" signal — it always wins, no matter the angle
        // of the gesture so far or whether we'd already started treating it
        // as a scroll. This matters because the tray sits above the board:
        // a piece can legitimately need a lot of *sideways* travel to reach
        // its target column (which can look like a scroll at first), and
        // the finger crossing below the tray at any point must still be
        // able to promote the gesture to a lift.
        if(e.clientY > trayBottomAtStart + EXIT_MARGIN){
          beginLift();
        } else if(mode === 'pending'){
          const dx = e.clientX - startX, dy = e.clientY - startY;
          const adx = Math.abs(dx), ady = Math.abs(dy);
          if(adx < DEADZONE && ady < DEADZONE) return; // not enough movement to decide yet
          if(adx > ady * HORIZ_BIAS){
            // Clearly a horizontal swipe, still inside the tray: scroll it
            // instead of picking the piece up.
            mode = 'scrolling';
            lastScrollX = e.clientX;
          } else {
            beginLift();
          }
        }
      } else if(mode === 'pending'){
        // Loose piece already on the board: no scroll to hand off to, so
        // any real movement in any direction just means "lift it".
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if(Math.abs(dx) > DEADZONE || Math.abs(dy) > DEADZONE){
          beginLift();
        } else {
          return;
        }
      }

      if(mode === 'scrolling'){
        trayInnerEl.scrollLeft -= (e.clientX - lastScrollX);
        lastScrollX = e.clientX;
        return;
      }

      if(mode === 'dragging'){
        scheduleMove();
      }
    }
    function onPointerUp(e){
      if(e.pointerId !== activePointerId) return;
      const wasDragging = (mode === 'dragging');
      const wasPending = (mode === 'pending');
      mode = 'idle';
      activePointerId = null;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
      if(wasDragging){
        endDrag(e);
      } else if(wasPending && state.rotationEnabled && !piece.placed){
        // Released without ever moving enough to count as a scroll or a
        // lift: that's a tap, and taps flip a piece right-side up.
        rotatePiece();
      }
    }

    el.addEventListener('pointerdown', (e)=>{
      if(piece.placed || state.timeUp) return;
      activePointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      lastX = e.clientX; lastY = e.clientY;
      startRect = el.getBoundingClientRect();
      offsetX = e.clientX - startRect.left;
      offsetY = e.clientY - startRect.top;

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);

      // Every gesture starts as "pending" — this is what lets a plain tap
      // (no meaningful movement) be recognized and used to flip a rotated
      // piece, instead of every touch immediately picking the piece up.
      mode = 'pending';
      if(piece.container === 'tray'){
        trayBottomAtStart = trayInnerEl.getBoundingClientRect().bottom;
      }
    });

    function finalizeInto(parent, left, top, growToTrue){
      el.classList.remove('in-tray');
      el.style.position = 'absolute';
      // Correct placement always means rotation 0 (enforced before this is
      // ever called with growToTrue); free drops keep whatever rotation the
      // piece currently has.
      el.style.transform = 'none'; // rotation lives in the pixels, never in CSS
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
      const hs = handSizeFor(el);
      el.style.width = hs.w+'px';
      el.style.height = hs.h+'px';
      el.classList.add('in-tray');
      trayInnerEl.appendChild(el);
    }

    // Tap-to-rotate: a plain tap (no drag) turns the piece 90° clockwise.
    // Rotation is baked directly into the canvas's own pixels (see
    // paintPieceCanvas) rather than applied as a CSS transform — that's
    // what lets 90°/270° swap the piece's footprint correctly without any
    // special-casing in the drag math, which only ever looks at the
    // element's plain box model. Only rotation 0 counts as a valid
    // placement (see endDrag). If the piece is already sitting exactly on
    // its correct slot when rotated back to 0, the tap completes the
    // placement on its own — no need to pick it up and drop it again.
    function rotatePiece(){
      piece.rotation = (piece.rotation + 90) % 360;
      paintPieceCanvas(el, piece.edges, state.pieceW, state.pieceH, state.tabSize, state.srcCanvas, piece.sx, piece.sy, piece.rotation);

      // Deliberately do NOT try to re-center the piece as its box resizes
      // (90°/270° swap width and height) — anchoring from the existing
      // top-left keeps this simple and, crucially, keeps a piece that's
      // sitting exactly on its correct slot exactly there across every tap,
      // which is what the "does this complete the placement" check below
      // depends on. Only tray pieces get shrunk to hand size here — a piece
      // already sitting on the board (even mis-rotated) stays at true size,
      // since it was already grown to true size the moment it was lifted.
      if(piece.container === 'tray'){
        const hs = handSizeFor(el);
        el.style.width = hs.w+'px';
        el.style.height = hs.h+'px';
      }

      pulse(el);

      if(piece.rotation === 0 && piece.container === 'board' && !piece.placed){
        const curLeft = parseFloat(el.style.left) || 0;
        const curTop = parseFloat(el.style.top) || 0;
        const sitting = Math.hypot(curLeft - piece.correctX, curTop - piece.correctY) < 1;
        if(sitting){
          piece.placed = true;
          el.classList.add('placed');
          el.style.cursor = 'default';
          el.style.left = piece.correctX+'px';
          el.style.top = piece.correctY+'px';
          el.style.width = piece.trueW+'px';
          el.style.height = piece.trueH+'px';
          state.placedCount++;
          updateStats();
          vibrateFeedback(15); playClickSound();
          if(state.placedCount === state.totalPieces){
            setTimeout(onWin, 220);
          }
        }
      }

      saveProgress();
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
      el.classList.remove('dragging');
      el.style.margin = '';

      const boardRect = boardEl.getBoundingClientRect();
      const dropX = e.clientX - offsetX - boardRect.left;
      const dropY = e.clientY - offsetY - boardRect.top;

      const threshold = Math.min(state.pieceW, state.pieceH) * 0.32;
      const dist = Math.hypot(dropX - piece.correctX, dropY - piece.correctY);
      const positionCorrect = dist < threshold;
      const correctlyOriented = piece.rotation === 0;

      if(positionCorrect && correctlyOriented){
        piece.placed = true;
        piece.container = 'board';
        el.classList.add('placed');
        el.style.cursor = 'default';
        state.placedCount++;
        updateStats();
        snapAnimateInto(boardEl, piece.correctX, piece.correctY);
        setTimeout(()=>pulse(el), 170);
        vibrateFeedback(15); playClickSound();
        if(state.placedCount === state.totalPieces){
          setTimeout(onWin, 220);
        }
      } else if(positionCorrect){
        // Right spot, wrong way up: snap it exactly into the slot so it
        // looks settled, but don't count it as placed yet. A tap will flip
        // it — and since it's already sitting exactly on its slot, that tap
        // completes the placement on its own (see rotatePiece()).
        el.classList.remove('in-tray');
        settleInto(boardEl, piece.correctX, piece.correctY);
        piece.container = 'board';
      } else {
        // A drop counts as "on the board" purely based on the board's own
        // bounds — no need to reason about where the tray sits relative to
        // it, which is what broke when the tray moved above the board.
        const overBoard = dropX > -state.tabSize && dropX < state.boardW &&
                           dropY > -state.tabSize && dropY < state.boardH;
        if(overBoard){
          el.classList.remove('in-tray');
          settleInto(boardEl, dropX, dropY);
          piece.container = 'board';
        } else {
          returnToTray();
          piece.container = 'tray';
        }
      }

      saveProgress();
    }

  }

  function pulse(el){
    el.animate(
      [{transform:'scale(1.08)'},{transform:'scale(1)'}],
      {duration:180, easing:'ease-out'}
    );
  }

  // Subtle haptic feedback on devices that support the Vibration API
  // (mostly Android phones — iOS Safari has no navigator.vibrate at all,
  // and this simply does nothing there, which is the correct fallback).
  function vibrateFeedback(pattern){
    try{
      if(navigator.vibrate) navigator.vibrate(pattern);
    }catch(err){
      // never let a missing/blocked vibration API interrupt gameplay
    }
  }

  // ---------------- Sound (synthesized, no audio files needed) ----------------
  // Preference persists across sessions, separate from any single puzzle's state.
  const SOUND_KEY = 'rompecabezas:sound';
  try{
    state.soundEnabled = localStorage.getItem(SOUND_KEY) !== '0'; // on by default
  }catch(err){
    state.soundEnabled = true;
  }

  let audioCtx = null;
  function getAudioCtx(){
    // Browsers require a user gesture before audio can play — every call
    // site here only ever runs in response to a tap/click, so creating (and
    // resuming) it lazily on first use is always safe.
    if(!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(err){ return null; }
    }
    if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }

  function playClickSound(){
    if(!state.soundEnabled) return;
    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }catch(err){ /* audio is a nice-to-have, never worth breaking play for */ }
  }

  function playWinChime(){
    if(!state.soundEnabled) return;
    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i)=>{ // a quick C-E-G arpeggio
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = now + i*0.1;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t+0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t+0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t+0.32);
      });
    }catch(err){ /* ditto */ }
  }

  // ---------------- Stats / timer ----------------
  function updateStats(){
    document.getElementById('statPieces').textContent = `${state.placedCount}/${state.totalPieces}`;
  }
  function startTimer(initialElapsedMs){
    state.timerStart = Date.now() - (initialElapsedMs || 0);
    stopTimer(true);
    const timeEl = document.getElementById('statTime');
    const timeLabelEl = document.getElementById('statTimeLabel');

    if(state.hideTimer){
      // We still track state.timerStart internally (so history/best-times
      // keep working once the puzzle is done) — we just never render a
      // ticking number during play, which is the whole point for someone
      // who finds a visible countdown/countup stressful.
      timeEl.textContent = '🧘';
      timeEl.classList.remove('urgent');
      if(timeLabelEl) timeLabelEl.textContent = 'Sin apuro';
      state.timerInterval = null;
      return;
    }
    if(timeLabelEl) timeLabelEl.textContent = 'Tiempo';

    state.timerInterval = setInterval(()=>{
      const elapsedS = Math.floor((Date.now()-state.timerStart)/1000);

      if(state.timeAttackEnabled){
        const remaining = state.timeLimitSec - elapsedS;
        if(remaining <= 0){
          timeEl.textContent = '00:00';
          timeEl.classList.remove('urgent');
          onTimeUp();
          return;
        }
        const mm = String(Math.floor(remaining/60)).padStart(2,'0');
        const ss = String(remaining%60).padStart(2,'0');
        timeEl.textContent = `${mm}:${ss}`;
        timeEl.classList.toggle('urgent', remaining <= 10);
      } else {
        const mm = String(Math.floor(elapsedS/60)).padStart(2,'0');
        const ss = String(elapsedS%60).padStart(2,'0');
        timeEl.textContent = `${mm}:${ss}`;
      }
    }, 500);
  }
  function stopTimer(silent){
    if(state.timerInterval) clearInterval(state.timerInterval);
    if(!silent && state.timerStart){
      // keep last displayed value
    }
  }

  function onTimeUp(){
    stopTimer();
    state.timeUp = true;
    clearSavedProgress();
    document.getElementById('timeUpStats').textContent =
      `${state.sourceLabel} · ${state.placedCount}/${state.totalPieces} piezas colocadas`;
    document.getElementById('timeUpOverlay').classList.add('show');
  }

  let lastResultStatsLine = '';

  function onWin(){
    stopTimer();
    vibrateFeedback([20,60,20,60,40]); playWinChime();
    const elapsedSec = Math.floor((Date.now()-state.timerStart)/1000);
    const timeText = formatMMSS(elapsedSec); // always the real time here — the
    // point of hiding it during play is to avoid a stressful ticking clock,
    // not to hide the result once the puzzle is actually done.
    let dailyExtra = '';
    if(state.dailyMode){
      const result = recordDailyCompletion(elapsedSec);
      if(result){
        const bm = String(Math.floor(result.bestToday/60)).padStart(2,'0');
        const bs = String(result.bestToday%60).padStart(2,'0');
        dailyExtra = ` · racha: ${result.streak} día${result.streak===1?'':'s'} · mejor de hoy: ${bm}:${bs}`;
      }
    }
    recordHistoryEntry({
      completedAt: Date.now(),
      label: state.sourceLabel,
      totalPieces: state.totalPieces,
      rows: state.rows, cols: state.cols,
      timeSec: elapsedSec,
      rotationEnabled: state.rotationEnabled,
      timeAttack: state.timeAttackEnabled,
      isDaily: state.dailyMode,
    });
    clearSavedProgress();
    const statsLine = `${state.sourceLabel} · ${state.totalPieces} piezas · tiempo ${timeText}${dailyExtra}`;
    document.getElementById('winStats').textContent = statsLine;
    lastResultStatsLine = statsLine;
    document.getElementById('shareStatus').textContent = '';
    document.getElementById('winOverlay').classList.add('show');
  }

  // ---------------- Share the finished puzzle as an image ----------------
  function buildResultCanvas(){
    const src = state.srcCanvas;
    const headerH = Math.round(src.width * 0.14);
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height + headerH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#10161F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = '#E4C158';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(headerH*0.34)}px Georgia, serif`;
    ctx.fillText('¡Rompecabezas completo!', canvas.width/2, headerH*0.46);

    // Stats line
    ctx.fillStyle = '#EDE6D6';
    ctx.font = `${Math.round(headerH*0.20)}px Georgia, serif`;
    ctx.fillText(lastResultStatsLine, canvas.width/2, headerH*0.78);

    ctx.drawImage(src, 0, headerH);

    // thin brass border around the finished picture for a "frame" feel
    ctx.strokeStyle = '#C9A227';
    ctx.lineWidth = Math.max(2, src.width*0.004);
    ctx.strokeRect(0, headerH, src.width, src.height);

    return canvas;
  }

  function shareResult(){
    const statusEl = document.getElementById('shareStatus');
    const canvas = buildResultCanvas();

    canvas.toBlob(async (blob)=>{
      if(!blob){
        statusEl.textContent = 'No se pudo generar la imagen.';
        return;
      }
      const file = new File([blob], 'rompecabezas.png', {type:'image/png'});

      if(navigator.canShare && navigator.canShare({files:[file]})){
        try{
          await navigator.share({
            files: [file],
            title: 'Taller de Rompecabezas',
            text: lastResultStatsLine,
          });
          statusEl.textContent = '';
        }catch(err){
          // AbortError just means the person closed the share sheet — not a failure
          if(err && err.name !== 'AbortError'){
            statusEl.textContent = 'No se pudo compartir. Probá descargar la imagen.';
          }
        }
      } else {
        // Desktop / unsupported browsers: fall back to a plain download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rompecabezas.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 2000);
        statusEl.textContent = 'Imagen descargada.';
      }
    }, 'image/png');
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
  function enterPlayMode(resumeData){
    document.getElementById('setupPanel').classList.add('hide');
    document.getElementById('board-area').classList.add('visible');
    document.body.classList.add('playing');
    setStep(3);
    // wait one frame so boardWrap has its final flex-allocated size
    // before we measure it to fit the board.
    requestAnimationFrame(()=>requestAnimationFrame(()=>generatePuzzle(resumeData)));
  }

  document.getElementById('generateBtn').addEventListener('click', ()=>{
    state.dailyMode = false;
    enterPlayMode();
  });

  document.getElementById('changeImgBtn').addEventListener('click', ()=>{
    stopTimer();
    document.getElementById('board-area').classList.remove('visible');
    document.getElementById('setupPanel').classList.remove('hide');
    document.body.classList.remove('playing');
    setStep(1);
  });

  // ---------------- Resume-progress banner ----------------
  (function initResumeBanner(){
    const saved = loadSavedProgress();
    if(!saved) return;

    const banner = document.getElementById('resumeBanner');
    const details = document.getElementById('resumeDetails');
    const mins = Math.floor((saved.elapsedMs||0)/60000);
    const secs = Math.floor(((saved.elapsedMs||0)%60000)/1000);
    const timeStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    details.innerHTML = `<span class="hint">${saved.label || 'Rompecabezas'} · ${saved.rows*saved.cols} piezas · ${saved.placedCount||0}/${saved.totalPieces||saved.rows*saved.cols} colocadas · tiempo ${timeStr}</span>`;
    banner.style.display = 'block';

    document.getElementById('resumeBtn').addEventListener('click', ()=>{
      state.rotationEnabled = !!saved.rotationEnabled;
      rotationToggleEl.classList.toggle('active', state.rotationEnabled);
      state.timeAttackEnabled = !!saved.timeAttackEnabled;
      timeAttackToggleEl.classList.toggle('active', state.timeAttackEnabled);
      state.dailyMode = !!saved.isDaily;
      state.dailyDate = saved.dailyDate || null;
      state.sourceLabel = saved.label || '';

      const startResume = ()=>{
        banner.style.display = 'none';
        enterPlayMode(saved);
      };

      if(saved.isBuiltin){
        setSourceFromDraw(drawEiffelTower, saved.label || 'Torre Eiffel');
        startResume();
      } else if(saved.imageDataUrl){
        const img = new Image();
        img.onload = ()=>{
          setSourceFromImageElement(img, saved.label || 'Imagen guardada');
          startResume();
        };
        img.onerror = ()=>{
          banner.style.display = 'none';
          clearSavedProgress();
        };
        img.src = saved.imageDataUrl;
      }
    });

    document.getElementById('discardResumeBtn').addEventListener('click', ()=>{
      clearSavedProgress();
      banner.style.display = 'none';
    });
  })();

  document.getElementById('shuffleBtn').addEventListener('click', ()=>{
    generatePuzzle();
  });

  document.getElementById('shareResultBtn').addEventListener('click', shareResult);

  document.getElementById('playAgainBtn').addEventListener('click', ()=>{
    document.getElementById('winOverlay').classList.remove('show');
    generatePuzzle();
  });

  document.getElementById('retryTimeAttackBtn').addEventListener('click', ()=>{
    document.getElementById('timeUpOverlay').classList.remove('show');
    generatePuzzle();
  });

  document.getElementById('timeUpChangeBtn').addEventListener('click', ()=>{
    document.getElementById('timeUpOverlay').classList.remove('show');
    document.getElementById('board-area').classList.remove('visible');
    document.getElementById('setupPanel').classList.remove('hide');
    document.body.classList.remove('playing');
    setStep(1);
  });

  // ---------------- Daily challenge ----------------
  const DAILY_DIFFICULTY = {rows:6, cols:7, label:'Difícil'}; // fixed, same for everyone

  function refreshDailyStats(){
    const data = loadDailyData();
    const today = todayStr();
    const el = document.getElementById('dailyStats');
    const playedToday = data.best[today] !== undefined;
    const parts = [];
    if(data.streak) parts.push(`Racha: <b>${data.streak} día${data.streak===1?'':'s'}</b>`);
    if(playedToday){
      const m = String(Math.floor(data.best[today]/60)).padStart(2,'0');
      const s = String(data.best[today]%60).padStart(2,'0');
      parts.push(`Ya completaste el de hoy — mejor tiempo: <b>${m}:${s}</b>`);
    }
    el.innerHTML = parts.length ? parts.join(' · ') : 'Todavía no jugaste el desafío diario.';
  }
  refreshDailyStats();

  // ---------------- Sound toggle button ----------------
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  function updateSoundBtn(){
    soundToggleBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
    soundToggleBtn.classList.toggle('muted', !state.soundEnabled);
  }
  updateSoundBtn();
  soundToggleBtn.addEventListener('click', ()=>{
    state.soundEnabled = !state.soundEnabled;
    try{ localStorage.setItem(SOUND_KEY, state.soundEnabled ? '1' : '0'); }catch(err){}
    updateSoundBtn();
    if(state.soundEnabled) playClickSound(); // quick confirmation blip
  });

  // ---------------- History overlay ----------------
  document.getElementById('openHistoryBtn').addEventListener('click', ()=>{
    renderHistory();
    document.getElementById('historyOverlay').classList.add('show');
  });
  document.getElementById('closeHistoryBtn').addEventListener('click', ()=>{
    document.getElementById('historyOverlay').classList.remove('show');
  });
  document.getElementById('clearHistoryBtn').addEventListener('click', ()=>{
    try{ localStorage.removeItem(HISTORY_KEY); }catch(err){}
    renderHistory();
  });

  // ---------------- Best-times overlay ----------------
  document.getElementById('openBestTimesBtn').addEventListener('click', ()=>{
    renderBestTimes();
    document.getElementById('bestTimesOverlay').classList.add('show');
  });
  document.getElementById('closeBestTimesBtn').addEventListener('click', ()=>{
    document.getElementById('bestTimesOverlay').classList.remove('show');
  });

  document.getElementById('dailyBtn').addEventListener('click', ()=>{
    const dateStr = todayStr();
    state.dailyMode = true;
    state.dailyDate = dateStr;
    state.dailyRng = mulberry32(hashStringToSeed('rompecabezas-diario-'+dateStr));
    state.rotationEnabled = false;
    rotationToggleEl.classList.remove('active');
    state.timeAttackEnabled = false;
    timeAttackToggleEl.classList.remove('active');
    state.difficulty = DAILY_DIFFICULTY;
    setSourceFromDraw(drawEiffelTower, 'Torre Eiffel — Desafío diario');
    enterPlayMode();
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
