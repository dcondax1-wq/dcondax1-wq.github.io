// HERMES effects: the animated background (a WebGL fragment shader, domain-warped noise in each card's palette, drawn at
// a fraction of the screen's pixels and scaled up: smooth gradients, cheap on an iPhone 13) and a 2D particle layer
// (coins, sparks, embers, confetti, glitter). One requestAnimationFrame loop; it stops while the page is hidden.
// Every card has its own scene: 0 flow, 1 rays, 2 rings, 3 orbs, 4 aurora (a green week), 5 warp (the all-time hall),
// 6 horizon grid (the evals). Only the scenes in the fade are computed; a slow light sweep and film grain sit on top.
//   const fx = createFx(bgCanvas, particleCanvas, { still, lite })
//   fx.palette(colors, mode)   cross-fade to a card's 3 colours (#rrggbb) and scene (0-6)
//   fx.burst(kind, n, opts)    'coins' | 'sparks' | 'embers' | 'confetti' | 'glitter'
//   fx.onFrame(fn)             fn(t seconds) every frame (the card tilt)
//   fx.colors()                the current palette (for the share image)
// still = prefers-reduced-motion: one frame per palette change, no particles, no loop.

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `precision mediump float;
uniform vec2 R;uniform float T,K,MA,MB;uniform vec3 A0,A1,A2,B0,B1,B2;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float pat(vec2 uv,float m,float t){
 vec2 q=vec2(fbm(uv*1.6+t*.05),fbm(uv*1.6-t*.04+3.1));
 float flow=fbm(uv*1.3+q*1.8+t*.03);
 float r=length(uv),a=atan(uv.y,uv.x);
 float rays=(.5+.5*sin(a*7.+t*.5+q.x*4.))*smoothstep(1.3,.0,r)*.7+flow*.4;
 float rings=.5+.5*sin(r*14.-t*1.4+q.y*3.);rings=mix(rings,flow,.45);
 float orbs=smoothstep(.75,.0,length(uv-vec2(sin(t*.3),cos(t*.23))*.45))+smoothstep(.65,.0,length(uv+vec2(cos(t*.27),sin(t*.31))*.5))*.8+flow*.3;
 float v=0.;
 if(m<.5)v=flow;else if(m<1.5)v=rays;else if(m<2.5)v=rings;else if(m<3.5)v=orbs;
 else if(m<4.5){                                    // aurora: curtains of light that ripple upward
  float x=uv.x*2.2+fbm(vec2(uv.x*1.4,t*.06))*1.6;
  float dy=(uv.y-.12-.18*sin(x*1.3+t*.25))*3.2,band=exp(-dy*dy);
  float rib=.55+.45*sin(x*9.+t*.7+q.x*3.);
  v=band*rib*smoothstep(-.6,.4,uv.y+.35)+flow*.28;}
 else if(m<5.5){                                    // warp: streaks of light rushing out of the centre
  float st=n(vec2(a*20.,0.))*.5+n(vec2(a*47.,3.))*.5;
  float rush=fract(st*7.+t*.55/(.2+st));
  v=smoothstep(.92,1.,1.-abs(rush-.5)*2.)*smoothstep(.0,.7,r)*1.4+smoothstep(.5,.0,r)*.55+flow*.18;}
 else{                                              // horizon grid: a futuristic floor that runs toward you
  float y=uv.y+.12,p=.38/max(.04,-y);
  vec2 g=vec2(uv.x*p*7.,p*2.2+t*.7);
  float lines=max(smoothstep(.0,.05,abs(fract(g.x)-.5)-.44),smoothstep(.0,.06,abs(fract(g.y)-.5)-.43));
  float floor_=y<0.?lines*smoothstep(-.01,-.25,y)*smoothstep(9.,2.,p):0.;
  v=floor_*1.1+exp(-abs(y)*9.)*.65+flow*.25*smoothstep(.0,.5,y);}
 return pow(clamp(v,0.,1.),1.45);}
vec3 pal(float v,vec3 c0,vec3 c1,vec3 c2){return v<.5?mix(c0,c1,v*2.):mix(c1,c2,(v-.5)*2.);}
void main(){vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;
 float vb=pat(uv,MB,T),va=K<.999?pat(uv,MA,T):vb;   // the old scene only while the fade runs
 vec3 c=mix(pal(va,A0,A1,A2),pal(vb,B0,B1,B2),K);
 float sw=(uv.x*.8+uv.y*.6-mod(T*.16,3.2)+1.6)*4.,sweep=exp(-sw*sw)*.06;  // a slow light sweep, like glass catching the sun
 c+=sweep*B2;
 c*=1.-.38*length(uv*vec2(.9,.7));
 c+=(h(gl_FragCoord.xy+T)-.5)*.03;
 gl_FragColor=vec4(c,1.);}`;

const hex = (s) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '')); const v = m ? parseInt(m[1], 16) : 0; return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function shader(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch (_) { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const k of ['R', 'T', 'K', 'MA', 'MB', 'A0', 'A1', 'A2', 'B0', 'B1', 'B2']) U[k] = gl.getUniformLocation(pr, k);
  return {
    draw(w, h, t, k, A, B, ma, mb) {
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.R, w, h); gl.uniform1f(U.T, t); gl.uniform1f(U.K, k); gl.uniform1f(U.MA, ma); gl.uniform1f(U.MB, mb);
      for (let i = 0; i < 3; i++) { gl.uniform3fv(U['A' + i], A[i]); gl.uniform3fv(U['B' + i], B[i]); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

export function createFx(bg, layer, { still = false, lite = false } = {}) {
  const S = { from: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], to: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], hexes: ['#19140e', '#4e372a', '#c8a24a'],
    ma: 0, mb: 0, k0: 0, parts: [], frames: [], raf: 0, t0: performance.now(), lastW: 0, lastH: 0 };
  const gl = shader(bg);
  const ctx = layer.getContext('2d');
  const BG_SCALE = lite ? 0.3 : 0.42;                        // shader pixels per CSS pixel: soft gradients, ~1/20 of the work
  const CAP = lite ? 90 : 150;                               // particles on screen at once

  function size() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    if (w === S.lastW && h === S.lastH) return;
    S.lastW = w; S.lastH = h;
    bg.width = Math.round(w * BG_SCALE); bg.height = Math.round(h * BG_SCALE);
    const d = window.OLYMPUS ? window.OLYMPUS.dpr() : Math.min(2, devicePixelRatio || 1);   // <= 2, <= 1.5 on LITE
    layer.width = Math.round(w * d); layer.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  function cssFallback(k) {                                 // no WebGL: the same palette as a CSS gradient
    const c = S.hexes;
    bg.style.background = `radial-gradient(120% 80% at 20% 15%, ${c[1]} 0%, transparent 60%), radial-gradient(90% 70% at 85% 80%, ${c[2]}55 0%, transparent 65%), ${c[0]}`;
    bg.style.opacity = String(0.85 + 0.15 * k);
  }

  function particles(dt) {
    const w = S.lastW, h = S.lastH;
    ctx.clearRect(0, 0, w, h);
    const P = S.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt;
      if (p.life > p.max) { P.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= p.kind === 'confetti' ? 0.985 : 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.kind === 'confetti' && p.vy > 60) p.vy = 60 + (p.vy - 60) * 0.9;   // paper: air brakes the fall
      const a = Math.min(1, (p.max - p.life) / 0.6) * Math.min(1, p.life / 0.12);
      ctx.globalAlpha = a;
      if (p.kind === 'coins') {
        const sx = Math.abs(Math.cos(p.rot)) * p.s;
        ctx.fillStyle = '#c8a24a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.6, sx), p.s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f3ece0'; ctx.beginPath(); ctx.ellipse(p.x - sx * 0.3, p.y - p.s * 0.3, Math.max(0.3, sx * 0.35), p.s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'confetti') {                    // a paper strip that flutters and flips in 3D as it falls
        const flip = Math.cos(p.rot * 1.7 + p.life * 9);
        ctx.save(); ctx.translate(p.x + Math.sin(p.life * p.wob + p.ph) * 14, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.globalAlpha = a * (0.65 + 0.35 * Math.abs(flip));
        ctx.fillRect(-p.s, -p.s * 0.45 * Math.abs(flip) - 0.3, p.s * 2, p.s * 0.9 * Math.abs(flip) + 0.6); ctx.restore();
      } else if (p.kind === 'glitter') {                     // a gold star that twinkles as it drifts
        const tw = 0.5 + 0.5 * Math.sin(p.life * 14 + p.ph), s = p.s * (0.6 + tw * 0.7);
        ctx.globalAlpha = a * (0.4 + 0.6 * tw); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 2.2); ctx.lineTo(p.x + s * 0.45, p.y - s * 0.45); ctx.lineTo(p.x + s * 2.2, p.y);
        ctx.lineTo(p.x + s * 0.45, p.y + s * 0.45); ctx.lineTo(p.x, p.y + s * 2.2); ctx.lineTo(p.x - s * 0.45, p.y + s * 0.45);
        ctx.lineTo(p.x - s * 2.2, p.y); ctx.lineTo(p.x - s * 0.45, p.y - s * 0.45); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (p.kind === 'embers' ? 1 - p.life / p.max * 0.6 : 1), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function frame(now) {
    S.raf = 0;
    if (window.OLYMPUS ? window.OLYMPUS.hidden() : document.hidden) return;   // hidden / covered tab: no frame (the battery)
    const gap = (window.OLYMPUS && window.OLYMPUS.frameGap ? window.OLYMPUS.frameGap() : 0);                  // idle 30 / 15 fps, battery saver, 3D Off (docs/OLYMPUS_PERF.md)
    if (gap && !S.kicked && now - last < gap - 3) { S.raf = requestAnimationFrame(frame); return; }
    S.kicked = false;
    const dt = Math.min(0.05, (now - last) / 1000), t = (now - S.t0) / 1000;
    last = now;
    size();
    const k = ease((now - S.k0) / 900);
    if (gl) gl.draw(bg.width, bg.height, t, k, S.from, S.to, S.ma, S.mb);
    else cssFallback(k);
    if (!still) {
      particles(dt);
      for (const f of S.frames) f(t);
      S.raf = requestAnimationFrame(frame);
    }
  }
  const kick = () => { S.kicked = true; if (!S.raf) S.raf = requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); kick(); } });
  addEventListener('resize', () => { S.lastW = 0; kick(); });

  return {
    gl: !!gl,
    palette(colors, mode = 0) {
      const now = performance.now(), k = ease((now - S.k0) / 900);
      // start the fade from where the last one is now
      S.from = S.from.map((c, i) => c.map((v, j) => v + (S.to[i][j] - v) * k));
      S.ma = k > 0.5 ? S.mb : S.ma;
      S.to = colors.map(hex); S.mb = mode; S.k0 = still ? now - 1e4 : now; S.hexes = colors.slice();
      kick();
    },
    burst(kind, n = 60, { x = 0.5, y = 0.45, colors = ['#c8a24a', '#f3ece0', '#9bab63'] } = {}) {
      if (still) return;
      const w = S.lastW || innerWidth, h = S.lastH || innerHeight, cap = CAP - S.parts.length;
      const rain = kind === 'embers' || kind === 'glitter';                   // these fall from above instead of bursting
      for (let i = 0; i < Math.min(n, cap); i++) {
        const a = Math.random() * Math.PI * 2, sp = rain ? 20 + Math.random() * 40 : 140 + Math.random() * 360;
        // confetti: two cannons from the bottom corners; the rest from (x, y)
        const side = kind === 'confetti' ? (i % 2 ? 1 : -1) : 0, th = 0.25 + Math.random() * 0.4, V = 520 + Math.random() * 480;
        S.parts.push({ kind,
          x: kind === 'confetti' ? (side < 0 ? 0.04 : 0.96) * w : x * w + (rain ? (Math.random() - 0.5) * w : 0),
          y: kind === 'confetti' ? h * 0.92 : rain ? -10 - Math.random() * h * 0.3 : y * h,
          vx: kind === 'confetti' ? -side * Math.sin(th) * V : Math.cos(a) * sp * (rain ? 0.3 : 1),       // the cannons aim inward
          vy: kind === 'confetti' ? -Math.cos(th) * V * 1.25 : rain ? 30 + Math.random() * 50 : Math.sin(a) * sp - 180,
          g: rain ? 8 : kind === 'sparks' ? 120 : kind === 'confetti' ? 520 : 420, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
          s: kind === 'coins' ? 5 + Math.random() * 5 : kind === 'confetti' ? 3 + Math.random() * 4 : kind === 'glitter' ? 1.6 + Math.random() * 2 : 1.2 + Math.random() * 2.2,
          wob: 4 + Math.random() * 5, ph: Math.random() * 6.3,
          c: colors[i % colors.length], life: 0, max: rain ? 4 + Math.random() * 3 : kind === 'confetti' ? 2.6 + Math.random() * 1.6 : 1.6 + Math.random() * 1.4 });
      }
      kick();
    },
    onFrame(fn) { S.frames.push(fn); kick(); },
    colors: () => S.hexes.slice(),
    count: () => S.parts.length,
  };
}
