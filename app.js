/* HOOP SIGHT（Fable版）— 外部ライブラリなし・1ファイルのアプリ本体
   座標はメートル。コートは幅15×長さ28（FIBA）。攻めるゴールは y=1.575 側（画面の上）。 */
'use strict';
(() => {
const W = 15, HOOP = [7.5, 1.575], RIM_H = 3.05;
const KEY = 'hs2-plays', KEY_ME = 'hs2-me';
const C_OFF = '#1d3a8a', C_DEF = '#c8405a', C_BALL = '#f07c12', C_ME = '#ff8a1f', C_LINE = '#2a4064';
const C_FLOOR = '#f1e3c6', C_PAINT = '#e7d0a2';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = u => u * u * (3 - 2 * u);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

/* ───────── コートの線 ───────── */
function arc(cx, cy, r, a0, a1, n) {
  const o = [];
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return o;
}
function endLines() {
  const a3 = Math.asin(1.415 / 6.75);
  return [
    [[5.05, 0], [5.05, 5.8], [9.95, 5.8], [9.95, 0]],
    arc(7.5, 5.8, 1.8, 0, Math.PI * 2, 36),
    [[0.9, 0], ...arc(7.5, 1.575, 6.75, Math.PI - a3, a3, 44), [14.1, 0]],
    [[6.25, 1.2], ...arc(7.5, 1.575, 1.25, Math.PI, 0, 16), [8.75, 1.2]],
  ];
}
const lineCache = {};
function courtLines(full) {
  const k = full ? 'f' : 'h';
  if (lineCache[k]) return lineCache[k];
  const cl = full ? 28 : 14, e = endLines();
  const out = [[[0, 0], [W, 0], [W, cl], [0, cl], [0, 0]], ...e];
  if (full) {
    e.forEach(pl => out.push(pl.map(p => [p[0], 28 - p[1]])));
    out.push([[0, 14], [W, 14]], arc(7.5, 14, 1.8, 0, Math.PI * 2, 36));
  } else out.push(arc(7.5, 14, 1.8, Math.PI, Math.PI * 2, 18));
  return lineCache[k] = out;
}

/* ───────── 並び方（攻め） ───────── */
const FORMS = {
  '5アウト': [[7.5, 9.2], [12.8, 6.8], [2.2, 6.8], [1.3, 1.8], [13.7, 1.8]],
  '4アウト1イン': [[5.0, 9.2], [10.0, 9.2], [1.6, 4.6], [13.4, 4.6], [9.4, 3.3]],
  '3アウト2イン': [[7.5, 9.4], [12.8, 6.6], [2.2, 6.6], [5.2, 3.0], [9.8, 3.0]],
  '1-4 ハイ': [[7.5, 10], [13.2, 5.8], [1.8, 5.8], [5.3, 5.8], [9.7, 5.8]],
  'ボックス': [[7.5, 10], [9.9, 5.8], [5.1, 5.8], [5.1, 2.3], [9.9, 2.3]],
};
function guardSpot(m) { // 守りを手で動かすときの最初の位置（マークとゴールの間）
  const dx = HOOP[0] - m[0], dy = HOOP[1] - m[1], l = Math.hypot(dx, dy) || 1, d = Math.min(1.2, l * 0.6);
  return [m[0] + dx / l * d, m[1] + dy / l * d];
}
function startOf(p, id) {
  if (p.start[id]) return p.start[id];
  const i = +id.slice(1) - 1, o = p.start['o' + (i + 1)] || FORMS['5アウト'][i];
  return id[0] === 'o' ? FORMS['5アウト'][i] : guardSpot(o);
}

/* ───────── 作戦のデータ ───────── */
function newPlay(name) {
  const start = {};
  FORMS['5アウト'].forEach((q, i) => start['o' + (i + 1)] = q.slice());
  return { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || '新しい作戦',
    full: false, no: 5, nd: 5, def: 'auto', ball: 'o1', start, steps: [], updated: Date.now() };
}
const offIds = p => Array.from({ length: p.no }, (_, i) => 'o' + (i + 1));
const defIds = p => p.def === 'off' ? [] : Array.from({ length: p.nd }, (_, i) => 'd' + (i + 1));
const scripted = p => p.def === 'manual' ? [...offIds(p), ...defIds(p)] : offIds(p);
const validPass = (st, h, off) => st.pass && h && st.pass !== h && off.includes(st.pass) ? st.pass : null;

/* なぞった線をなめらかにして、長さで位置を取れるようにする */
const dcache = new WeakMap();
function dense(pts) {
  let d = dcache.get(pts); if (d) return d;
  const o = [], n = pts.length;
  if (n < 3) o.push(...pts);
  else {
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let j = 0; j < 8; j++) {
        const t = j / 8, t2 = t * t, t3 = t2 * t, q = [0, 0];
        for (let a = 0; a < 2; a++) q[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
        o.push(q);
      }
    }
    o.push(pts[n - 1]);
  }
  const c = [0]; for (let i = 1; i < o.length; i++) c.push(c[i - 1] + dist(o[i - 1], o[i]));
  d = { p: o, c, len: c[c.length - 1] }; dcache.set(pts, d); return d;
}
function pointAt(d, u) {
  const t = clamp(u, 0, 1) * d.len; let i = 1;
  while (i < d.c.length - 1 && d.c[i] < t) i++;
  const seg = d.c[i] - d.c[i - 1] || 1, f = clamp((t - d.c[i - 1]) / seg, 0, 1), a = d.p[i - 1], b = d.p[i] || a;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
}
/* 前のステップを直して出発点がずれても、終点は変えずにつなぐ */
function pathPoint(mv, start, u) {
  const q = pointAt(dense(mv.pts), u), k = 1 - u;
  return [q[0] + (start[0] - mv.pts[0][0]) * k, q[1] + (start[1] - mv.pts[0][1]) * k];
}

/* 作戦全体の下ごしらえ：各ステップの出発位置・ボールを持つ人・長さ */
function compile(p) {
  const ids = scripted(p), off = offIds(p), S = [{}], durs = [];
  ids.forEach(id => S[0][id] = startOf(p, id));
  const H = [off.includes(p.ball) ? p.ball : off[0]], LH = [H[0]];
  p.steps.forEach((st, k) => {
    const n = {}; let mx = 0;
    ids.forEach(id => { const mv = st.moves[id]; if (mv) { n[id] = mv.pts[mv.pts.length - 1]; mx = Math.max(mx, dense(mv.pts).len); } else n[id] = S[k][id]; });
    S.push(n);
    let h = H[k]; const pass = validPass(st, h, off); if (pass) h = pass;
    const lh = h || LH[k], shot = !!(st.shot && h); if (shot) h = null;
    H.push(h); LH.push(lh);
    let d = mx > 0 ? clamp(mx / 4.2, 0.9, 2.8) : 0.5;
    if (pass) d = Math.max(d, 0.8);
    if (shot) d = Math.max(d, pass || mx > 0 ? 1.5 : 1.0);
    durs.push(d);
  });
  const GAP = 0.12, t0 = []; let t = 0;
  durs.forEach(d => { t0.push(t); t += d + GAP; });
  return { ids, off, S, H, LH, durs, t0, total: t, GAP };
}
function timeToKU(C, t) {
  const n = C.durs.length; if (!n) return [0, 0];
  t = clamp(t, 0, C.total);
  for (let k = n - 1; k >= 0; k--) if (t >= C.t0[k]) return [k, clamp((t - C.t0[k]) / C.durs[k], 0, 1)];
  return [0, 0];
}
/* ステップ k の途中 u（0〜1）での全員の位置とボール */
function stateAt(p, C, k, u) {
  const n = p.steps.length; if (k >= n) { k = n; u = 0; }
  const st = p.steps[k], S = C.S[k], pos = {}, e = ease(u);
  let hasMv = false;
  C.ids.forEach(id => { const mv = st && st.moves[id]; if (mv) hasMv = true; pos[id] = mv ? pathPoint(mv, S[id], e) : S[id]; });
  const hold = id => [pos[id][0] + 0.42, pos[id][1] - 0.3, 1.0];
  let h = C.H[k], w = {}, ball;
  if (!h) { ball = [HOOP[0], HOOP[1] + 0.45, 0.12]; if (C.LH[k]) w[C.LH[k]] = 1; }
  else {
    ball = hold(h); w[h] = 1;
    if (st) {
      const pass = validPass(st, h, C.off), shot = st.shot;
      if (pass) {
        const a = 0.08, b = shot ? 0.45 : 0.7, f = clamp((u - a) / (b - a), 0, 1);
        if (f >= 1) { h = pass; ball = hold(h); w = { [h]: 1 }; }
        else if (f > 0) { const g = ease(f), A = hold(h), B = hold(pass); ball = [lerp(A[0], B[0], g), lerp(A[1], B[1], g), 1 + 0.5 * Math.sin(Math.PI * f)]; w = { [h]: 1 - g, [pass]: g }; }
      }
      if (shot) {
        const s0 = (pass || hasMv) ? 0.55 : 0.2;
        if (u > s0) { const g = (u - s0) / (1 - s0), A = hold(h); ball = [lerp(A[0], HOOP[0], g), lerp(A[1], HOOP[1], g), lerp(2.1, RIM_H, g) + 4.4 * g * (1 - g)]; }
      }
    }
  }
  if (p.def === 'auto') defIds(p).forEach((id, i) => {
    const m = pos['o' + (i + 1)]; if (!m) { pos[id] = [5.5 + i, 4.2]; return; }
    const wt = w['o' + (i + 1)] || 0, dx = HOOP[0] - m[0], dy = HOOP[1] - m[1], l = Math.hypot(dx, dy) || 1, d = Math.min(1.3, l * 0.6);
    const on = [m[0] + dx / l * d, m[1] + dy / l * d];
    let ob = [m[0] + dx * 0.34, m[1] + dy * 0.34];
    ob = [ob[0] + (ball[0] - ob[0]) * 0.2, ob[1] + (ball[1] - ob[1]) * 0.2];
    pos[id] = [lerp(ob[0], on[0], wt), lerp(ob[1], on[1], wt)];
  });
  return { pos, ball, holder: h, w };
}
/* ステップ k の図（走る線・ドリブル・パス・シュート） */
function stepShapes(p, C, k) {
  const st = p.steps[k], out = []; if (!st) return out;
  const h = C.H[k], pass = validPass(st, h, C.off);
  C.ids.forEach(id => {
    const mv = st.moves[id]; if (!mv) return;
    const L = dense(mv.pts).len, n = Math.max(8, Math.ceil(L / 0.12)), poly = [];
    for (let i = 0; i <= n; i++) poly.push(pathPoint(mv, C.S[k][id], i / n));
    out.push({ id, kind: id[0] === 'd' ? 'def' : (id === h && !pass ? 'dribble' : 'cut'), poly, screen: !!mv.screen });
  });
  if (pass) out.push({ kind: 'pass', id: pass, poly: [stateAt(p, C, k, 0.08).pos[h], stateAt(p, C, k, st.shot ? 0.45 : 0.7).pos[pass]] });
  if (st.shot && (pass || h)) { const s = pass || h; out.push({ kind: 'shot', id: s, poly: [stateAt(p, C, k, 0.6).pos[s], HOOP] }); }
  return out;
}
function resample(poly, step) {
  const d = { p: poly, c: [0] }; for (let i = 1; i < poly.length; i++) d.c.push(d.c[i - 1] + dist(poly[i - 1], poly[i]));
  d.len = d.c[d.c.length - 1]; const n = Math.max(1, Math.round(d.len / step)), o = [];
  for (let i = 0; i <= n; i++) o.push(pointAt(d, i / n));
  return { pts: o, len: d.len };
}
function wavy(poly) { // ドリブルの波線
  const r = resample(poly, 0.07), n = r.pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const s = r.len * i / (n - 1 || 1), fade = Math.min(1, s / 0.3, (r.len - s - 0.5) / 0.3);
    const amp = fade > 0 ? 0.17 * fade * Math.sin(s / 0.75 * 2 * Math.PI) : 0;
    out.push([r.pts[i][0] - dy / l * amp, r.pts[i][1] + dx / l * amp]);
  }
  return out;
}

/* ───────── 真上からの絵 ───────── */
function topTf(w, h, full) {
  const cl = full ? 28 : 14, m = 1.0, rot = full && w > h * 1.15;
  const s = rot ? Math.min(w / (cl + 2 * m), h / (W + 2 * m)) : Math.min(w / (W + 2 * m), h / (cl + 2 * m));
  const ox = rot ? (w - cl * s) / 2 : (w - W * s) / 2, oy = rot ? (h - W * s) / 2 : (h - cl * s) / 2;
  return rot
    ? { s, toS: (x, y) => [ox + y * s, oy + (W - x) * s], toW: (X, Y) => [W - (Y - oy) / s, (X - ox) / s] }
    : { s, toS: (x, y) => [ox + x * s, oy + y * s], toW: (X, Y) => [(X - ox) / s, (Y - oy) / s] };
}
function strokePts(ctx, pts) { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); }
function drawShapesTop(ctx, tf, shapes, alpha, me, small) {
  const S = q => tf.toS(q[0], q[1]), lw = small ? 1.4 : Math.max(2.4, tf.s * 0.1);
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  shapes.forEach(sh => {
    const mine = me && sh.id === me && sh.kind !== 'pass' && sh.kind !== 'shot';
    const col = mine ? C_ME : sh.kind === 'def' ? C_DEF : sh.kind === 'shot' ? C_BALL : C_OFF;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = mine ? lw * 1.5 : lw; ctx.setLineDash([]);
    if (sh.kind === 'pass' || sh.kind === 'shot') ctx.setLineDash(small ? [3, 3] : [lw * 2.6, lw * 2.4]);
    const world = sh.kind === 'dribble' ? wavy(sh.poly) : sh.poly, px = world.map(S);
    if (sh.kind === 'shot') { // シュートはゴールに印をつける
      const c = S(HOOP); ctx.save(); ctx.globalAlpha = alpha * 0.3; ctx.beginPath(); ctx.arc(c[0], c[1], small ? 6 : tf.s * 0.75, 0, 7); ctx.fill(); ctx.restore();
      if (!small) { ctx.font = `700 ${Math.max(12, Math.round(tf.s * 0.55))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('シュート', c[0], c[1] - tf.s * 0.85); }
    }
    strokePts(ctx, px); ctx.setLineDash([]);
    const E = px[px.length - 1]; let B = px[0];
    for (let i = world.length - 2; i >= 0; i--) if (dist(world[i], world[world.length - 1]) > 0.45) { B = px[i]; break; }
    const ang = Math.atan2(E[1] - B[1], E[0] - B[0]), hs = small ? 4.5 : Math.max(9, tf.s * 0.42);
    if (sh.screen) { // スクリーンは T の字
      const t = small ? 5 : tf.s * 0.6; ctx.beginPath();
      ctx.moveTo(E[0] - Math.sin(ang) * t, E[1] + Math.cos(ang) * t); ctx.lineTo(E[0] + Math.sin(ang) * t, E[1] - Math.cos(ang) * t); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(E[0] + Math.cos(ang) * hs * 0.35, E[1] + Math.sin(ang) * hs * 0.35);
      ctx.lineTo(E[0] - Math.cos(ang - 0.45) * hs, E[1] - Math.sin(ang - 0.45) * hs);
      ctx.lineTo(E[0] - Math.cos(ang + 0.45) * hs, E[1] - Math.sin(ang + 0.45) * hs); ctx.closePath(); ctx.fill();
    }
  });
  ctx.restore();
}
function drawTop(ctx, w, h, p, st, o) {
  o = o || {};
  const tf = topTf(w, h, p.full), S = q => tf.toS(q[0], q[1]), cl = p.full ? 28 : 14, small = o.small;
  ctx.fillStyle = C_FLOOR; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C_PAINT;
  const paint = y => { const a = S([5.05, y ? 28 : 0]), b = S([9.95, y ? 22.2 : 5.8]); ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); };
  paint(0); if (p.full) paint(1);
  ctx.strokeStyle = C_LINE; ctx.lineWidth = small ? 1 : Math.max(1.5, tf.s * 0.055); ctx.lineJoin = 'round';
  courtLines(p.full).forEach(pl => strokePts(ctx, pl.map(S)));
  const hoop = y => { const c = S([7.5, y]); ctx.strokeStyle = C_BALL; ctx.lineWidth = small ? 1.2 : Math.max(2, tf.s * 0.08); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(2, tf.s * 0.23), 0, 7); ctx.stroke(); };
  hoop(HOOP[1]); if (p.full) hoop(28 - HOOP[1]);
  (o.paths || []).forEach(q => drawShapesTop(ctx, tf, q.shapes, q.alpha, o.me, small));
  const pr = Math.max(small ? 4.2 : 12, tf.s * 0.52);
  if (o.ghosts) o.ghosts.forEach(g => { // 動いた先の点線の丸
    const c = S(g.at); ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = g.id[0] === 'd' ? C_DEF : C_OFF; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c[0], c[1], pr * 0.86, 0, 7); ctx.stroke(); ctx.restore();
  });
  const ids = [...defIds(p), ...offIds(p)];
  ids.forEach(id => {
    const q = st.pos[id]; if (!q) return; const c = S(q), isD = id[0] === 'd', r = isD ? pr * 0.86 : pr;
    if (o.me === id) { ctx.strokeStyle = C_ME; ctx.lineWidth = Math.max(3, r * 0.3); ctx.beginPath(); ctx.arc(c[0], c[1], r + ctx.lineWidth, 0, 7); ctx.stroke(); }
    ctx.fillStyle = isD ? C_DEF : C_OFF; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = small ? 0.8 : 1.6; ctx.stroke();
    if (!small) { ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r * 1.15)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(id.slice(1), c[0], c[1] + r * 0.06); }
  });
  const b = S(st.ball), br = Math.max(small ? 2.5 : 6, tf.s * 0.27) * (1 + Math.max(0, st.ball[2] - 1) * 0.12);
  ctx.fillStyle = C_BALL; ctx.strokeStyle = '#5a2c00'; ctx.lineWidth = small ? 0.8 : 1.5; ctx.beginPath(); ctx.arc(b[0], b[1], br, 0, 7); ctx.fill(); ctx.stroke();
  return tf;
}

/* ───────── 立体の絵（ななめ・自分目線）。カメラは自前で計算 ───────── */
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const NEAR = 0.25;
function makeCam(C, T, w, h, hf, vf, fit) {
  const f = norm3(sub3(T, C)), r = norm3(cross3([0, 0, 1], f)), u = cross3(f, r);
  let F = Math.min((w / 2) / Math.tan(hf / 2), (h / 2) / Math.tan(vf / 2)), ox = w / 2, oy = h / 2;
  const toC = q => { const d = [q[0] - C[0], q[1] - C[1], (q[2] || 0) - C[2]]; return [dot3(d, r), dot3(d, u), dot3(d, f)]; };
  if (fit) { // 指定した点がちょうど画面に入るように大きさと位置を合わせる
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    fit.forEach(q => { const c = toC(q), x = c[0] / c[2], y = -c[1] / c[2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    F = Math.min(w * 0.96 / (x1 - x0), h * 0.9 / (y1 - y0)); ox = w / 2 - (x0 + x1) / 2 * F; oy = h / 2 - (y0 + y1) / 2 * F;
  }
  const pr = c => [ox + c[0] / c[2] * F, oy - c[1] / c[2] * F, c[2]];
  return {
    F, toC, pr,
    pt: q => { const c = toC(q); return c[2] < NEAR ? null : pr(c); },
    seg: (a, b) => {
      let A = toC(a), B = toC(b); if (A[2] < NEAR && B[2] < NEAR) return null;
      if (A[2] < NEAR) { const t = (NEAR - A[2]) / (B[2] - A[2]); A = [lerp(A[0], B[0], t), lerp(A[1], B[1], t), NEAR]; }
      if (B[2] < NEAR) { const t = (NEAR - B[2]) / (A[2] - B[2]); B = [lerp(B[0], A[0], t), lerp(B[1], A[1], t), NEAR]; }
      return [pr(A), pr(B)];
    },
    poly: pts => { // 面をカメラの手前で切る
      const cs = pts.map(toC), out = [];
      for (let i = 0; i < cs.length; i++) {
        const A = cs[i], B = cs[(i + 1) % cs.length], ia = A[2] >= NEAR, ib = B[2] >= NEAR;
        if (ia) out.push(pr(A));
        if (ia !== ib) { const t = (NEAR - A[2]) / (B[2] - A[2]); out.push(pr([lerp(A[0], B[0], t), lerp(A[1], B[1], t), NEAR])); }
      }
      return out;
    },
  };
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fillPoly(ctx, px, col) { if (px.length < 3) return; ctx.fillStyle = col; ctx.beginPath(); px.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); }
function line3(ctx, cam, pts) { for (let i = 1; i < pts.length; i++) { const s = cam.seg(pts[i - 1], pts[i]); if (s) { ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.stroke(); } } }
const ring3 = (x, y, z, r, n) => arc(x, y, r, 0, Math.PI * 2, n).map(q => [q[0], q[1], z]);

function drawPersp(ctx, w, h, p, st, cam, o) {
  const cl = p.full ? 28 : 14;
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1524'); g.addColorStop(1, '#1b2c47');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  fillPoly(ctx, cam.poly([[-2.5, -2.5, 0], [W + 2.5, -2.5, 0], [W + 2.5, cl + 2.5, 0], [-2.5, cl + 2.5, 0]]), '#d9c69f');
  fillPoly(ctx, cam.poly([[0, 0, 0], [W, 0, 0], [W, cl, 0], [0, cl, 0]]), C_FLOOR);
  fillPoly(ctx, cam.poly([[5.05, 0, 0], [9.95, 0, 0], [9.95, 5.8, 0], [5.05, 5.8, 0]]), C_PAINT);
  if (p.full) fillPoly(ctx, cam.poly([[5.05, 28, 0], [9.95, 28, 0], [9.95, 22.2, 0], [5.05, 22.2, 0]]), C_PAINT);
  ctx.strokeStyle = C_LINE; ctx.lineWidth = 2; ctx.lineCap = 'round';
  courtLines(p.full).forEach(pl => line3(ctx, cam, pl));
  // 床に描く動きの線
  (o.shapes || []).forEach(sh => {
    const mine = o.me && sh.id === o.me && sh.kind !== 'pass' && sh.kind !== 'shot';
    if (o.onlyMine && !mine) return; if (sh.kind === 'shot') return;
    ctx.save(); ctx.globalAlpha = mine ? 0.95 : 0.5; ctx.strokeStyle = mine ? C_ME : sh.kind === 'def' ? C_DEF : C_OFF; ctx.lineWidth = mine ? 5 : 3;
    if (sh.kind === 'pass') ctx.setLineDash([8, 8]);
    line3(ctx, cam, sh.kind === 'dribble' ? wavy(sh.poly) : sh.poly); ctx.restore();
  });
  // 奥から順に描く
  const items = [];
  const hoopAt = y0 => { const sgn = y0 < 14 ? 1 : -1, by = y0 < 14 ? 1.2 : 26.8, hy = y0 < 14 ? HOOP[1] : 28 - HOOP[1]; items.push({ z: cam.toC([7.5, hy, 3])[2], hoop: { sgn, by, hy } }); };
  hoopAt(0); if (p.full) hoopAt(28);
  [...defIds(p), ...offIds(p)].forEach(id => { if (id === o.hide || !st.pos[id]) return; items.push({ z: cam.toC([st.pos[id][0], st.pos[id][1], 0.9])[2], id }); });
  items.push({ z: cam.toC(st.ball)[2], ball: 1 });
  items.sort((a, b) => b.z - a.z);
  items.forEach(it => {
    if (it.hoop) {
      const { sgn, by, hy } = it.hoop;
      ctx.strokeStyle = '#8492a6'; ctx.lineWidth = 4; line3(ctx, cam, [[7.5, by - sgn * 1.4, 0], [7.5, by - sgn * 1.4, 2.7], [7.5, by, 3.1]]);
      fillPoly(ctx, cam.poly([[6.6, by, 2.9], [8.4, by, 2.9], [8.4, by, 3.95], [6.6, by, 3.95]]), 'rgba(255,255,255,.82)');
      ctx.strokeStyle = '#56657c'; ctx.lineWidth = 1.5; line3(ctx, cam, [[6.6, by, 2.9], [8.4, by, 2.9], [8.4, by, 3.95], [6.6, by, 3.95], [6.6, by, 2.9]]);
      const top = ring3(7.5, hy, RIM_H, 0.225, 16), bot = ring3(7.5, hy, RIM_H - 0.42, 0.13, 16);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; for (let i = 0; i < 16; i += 2) line3(ctx, cam, [top[i], bot[i]]);
      ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 3; line3(ctx, cam, top);
    } else if (it.ball) {
      const c = cam.pt(st.ball), s = cam.pt([st.ball[0], st.ball[1], 0]);
      if (s) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(s[0], s[1], Math.max(2, cam.F * 0.13 / s[2]), Math.max(1, cam.F * 0.05 / s[2]), 0, 0, 7); ctx.fill(); }
      if (c) { ctx.fillStyle = C_BALL; ctx.strokeStyle = '#5a2c00'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(3, cam.F * 0.125 / c[2]), 0, 7); ctx.fill(); ctx.stroke(); }
    } else {
      const q = st.pos[it.id], foot = cam.pt([q[0], q[1], 0]), head = cam.pt([q[0], q[1], 1.72]); if (!foot || !head) return;
      const H = foot[1] - head[1], isD = it.id[0] === 'd', col = isD ? C_DEF : C_OFF, mine = o.me === it.id;
      ctx.globalAlpha = o.hide ? clamp((foot[2] - 0.5) / 1.6, 0.18, 1) : 1; // 自分目線：目の前の人は透かす
      fillPoly(ctx, cam.poly(ring3(q[0], q[1], 0, 0.42, 14)), mine ? 'rgba(255,138,31,.55)' : 'rgba(0,0,0,.2)');
      const bw = H * 0.3, top = head[1] + H * 0.2;
      ctx.fillStyle = col; rr(ctx, foot[0] - bw / 2, top, bw, foot[1] - top, bw * 0.42); ctx.fill();
      ctx.beginPath(); ctx.arc(head[0], head[1] + H * 0.1, H * 0.1, 0, 7); ctx.fillStyle = isD ? '#e9a0ae' : '#9db4e6'; ctx.fill();
      const fs = clamp(H * 0.24, 14, 44), bx = head[0], byy = head[1] - fs * 0.85;
      ctx.fillStyle = mine ? C_ME : col; rr(ctx, bx - fs * 0.7, byy - fs * 0.62, fs * 1.4, fs * 1.24, fs * 0.4); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(fs)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.id.slice(1), bx, byy + fs * 0.05);
      ctx.globalAlpha = 1;
    }
  });
}

/* ───────── 保存 ───────── */
let plays = [];
try { plays = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { plays = []; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(plays)); } catch (e) { toast('保存できませんでした（端末の空きを確認してください）'); } }
let saveTimer = 0;
function touch() { // 変更があったら少し待って保存
  if (!cur.play || cur.shared) return;
  cur.play.updated = Date.now();
  if (!plays.includes(cur.play)) plays.unshift(cur.play);
  clearTimeout(saveTimer); saveTimer = setTimeout(persist, 250);
}

/* 送るリンク：作戦をまるごとリンクの中に入れる（サーバーなし） */
function pack(p) {
  const r = v => Math.round(v * 10), s = {};
  scripted(p).forEach(id => { const q = startOf(p, id); s[id] = [r(q[0]), r(q[1])]; });
  return { v: 1, n: p.name, c: p.full ? 1 : 0, o: p.no, d: p.nd, m: p.def[0], b: p.ball, s,
    t: p.steps.map(st => { const m = {}, e = []; for (const id in st.moves) { m[id] = st.moves[id].pts.flatMap(q => [r(q[0]), r(q[1])]); if (st.moves[id].screen) e.push(id); }
      const o = { m }; if (e.length) o.e = e; if (st.pass) o.p = st.pass; if (st.shot) o.h = 1; return o; }) };
}
function unpack(c) {
  const p = newPlay(String(c.n || '作戦').slice(0, 30));
  p.full = !!c.c; p.no = clamp(c.o | 0, 1, 5); p.nd = clamp(c.d | 0, 0, 5); p.def = { a: 'auto', m: 'manual', o: 'off' }[c.m] || 'auto';
  p.ball = /^o[1-5]$/.test(c.b) ? c.b : 'o1'; p.start = {};
  for (const id in c.s) if (/^[od][1-5]$/.test(id)) p.start[id] = [c.s[id][0] / 10, c.s[id][1] / 10];
  p.steps = (c.t || []).slice(0, 40).map(t => {
    const st = { moves: {}, pass: /^o[1-5]$/.test(t.p) ? t.p : null, shot: !!t.h };
    for (const id in t.m || {}) { if (!/^[od][1-5]$/.test(id)) continue; const a = t.m[id], pts = []; for (let i = 0; i + 1 < a.length; i += 2) pts.push([a[i] / 10, a[i + 1] / 10]); if (pts.length > 1) st.moves[id] = { pts, screen: (t.e || []).includes(id) }; }
    return st;
  });
  return p;
}
const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
const shareUrl = p => location.origin + location.pathname + '#p=' + b64e(JSON.stringify(pack(p)));

/* 見本の作戦 */
function sample(name, form, steps) {
  const p = newPlay(name); p.id = 's-' + name; FORMS[form].forEach((q, i) => p.start['o' + (i + 1)] = q.slice());
  p.steps = steps.map(s => { const st = { moves: {}, pass: s.pass || null, shot: !!s.shot }; for (const id in s.m || {}) st.moves[id] = { pts: s.m[id], screen: (s.screen || []).includes(id) }; return st; });
  return p;
}
const SAMPLES = [
  sample('パス＆カット', '5アウト', [
    { pass: 'o2' },
    { m: { o1: [[7.5, 9.2], [8.7, 6.6], [8.0, 3.0]], o3: [[2.2, 6.8], [4.5, 8.7], [7.5, 9.2]], o4: [[1.3, 1.8], [1.3, 4.6], [2.2, 6.8]] } },
    { pass: 'o1', shot: 1 }]),
  sample('ピック＆ロール', '3アウト2イン', [
    { m: { o5: [[9.8, 3.0], [9.4, 6.6], [8.6, 8.9]] }, screen: ['o5'] },
    { m: { o1: [[7.5, 9.4], [9.8, 8.8], [10.8, 6.4]], o5: [[8.6, 8.9], [8.7, 6.6], [8.0, 3.6]], o4: [[5.2, 3.0], [3.4, 2.2]] } },
    { pass: 'o5', shot: 1 }]),
  sample('バックドア', '5アウト', [
    { m: { o2: [[12.8, 6.8], [13.5, 8.0]] } },
    { m: { o2: [[13.5, 8.0], [12.2, 5.6], [9.2, 2.6]] }, pass: 'o2' },
    { shot: 1 }]),
];

/* ───────── 画面の状態 ───────── */
const cv = $('#cv'), ctx = cv.getContext('2d');
const cur = { play: null, shared: false, mode: 'edit', step: 0, view: 'top', me: null, t: 0, playing: false, speed: 1, undo: [], rec: null, look: null };
let cw = 0, ch = 0, tfNow = null, drag = null;

function resize() {
  const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2.5);
  cw = r.width; ch = r.height; cv.width = Math.max(1, Math.round(cw * d)); cv.height = Math.max(1, Math.round(ch * d));
  ctx.setTransform(d, 0, 0, d, 0, 0); draw();
}
window.addEventListener('resize', resize);

function camFor(p, st, dt) {
  if (cur.view === 'me' && cur.me && st.pos[cur.me]) {
    const m = st.pos[cur.me], mine = st.holder === cur.me;
    let tg = mine ? [HOOP[0], HOOP[1]] : [st.ball[0], st.ball[1]];
    if (dist(tg, m) < 0.8) tg = [HOOP[0], HOOP[1]];
    if (!cur.look || dt == null) cur.look = tg; else { const k = 1 - Math.exp(-dt * 5); cur.look = [lerp(cur.look[0], tg[0], k), lerp(cur.look[1], tg[1], k)]; }
    let dx = cur.look[0] - m[0], dy = cur.look[1] - m[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    return makeCam([m[0] - dx * 0.25, m[1] - dy * 0.25, 1.55], [m[0] + dx * 6, m[1] + dy * 6, 1.45], cw, ch, 1.55, 1.15);
  }
  const cl = p.full ? 28 : 14, tall = ch > cw * 1.1; // 縦長の画面では高い位置から見下ろす
  const fit = [[0, 0, 0], [W, 0, 0], [W, cl, 0], [0, cl, 0], [6.6, 1.2, 4.6], [8.4, 1.2, 4.6]];
  return makeCam([7.5, cl + (tall ? 5 : 9.5), p.full ? (tall ? 30 : 17) : (tall ? 17 : 9.5)], [7.5, cl * 0.4, 0], cw, ch, 1, 1, fit);
}

function draw(dt) {
  const p = cur.play; if (!p || !cw) return;
  const C = compile(p), n = p.steps.length;
  if (cur.mode === 'edit') {
    cur.step = clamp(cur.step, 0, n);
    const k = cur.step - 1, st = stateAt(p, C, Math.max(0, k), 0), o = { paths: [], ghosts: [] };
    if (k >= 0) {
      if (k > 0) o.paths.push({ shapes: stepShapes(p, C, k - 1), alpha: 0.16 });
      o.paths.push({ shapes: stepShapes(p, C, k), alpha: 1 });
      for (const id in p.steps[k].moves) if (C.ids.includes(id)) o.ghosts.push({ id, at: C.S[k + 1][id] });
    }
    if (drag && drag.pts && drag.pts.length > 1) o.paths.push({ shapes: [{ id: drag.id, kind: drag.id[0] === 'd' ? 'def' : (drag.id === C.H[k] && !validPass(p.steps[k], C.H[k], C.off) ? 'dribble' : 'cut'), poly: dense(drag.pts).p }], alpha: 0.9 });
    if (cur.step === 0 && drag && drag.id) st.pos[drag.id] = startOf(p, drag.id);
    tfNow = drawTop(ctx, cw, ch, p, st, o);
    return;
  }
  const [k, u] = timeToKU(C, cur.t), st = stateAt(p, C, n ? k : 0, n ? u : 0), shapes = n ? stepShapes(p, C, k) : [];
  if (cur.view === 'top' || (cur.view === 'me' && !cur.me)) drawTop(ctx, cw, ch, p, st, { paths: [{ shapes, alpha: 0.4 }], me: cur.me });
  else drawPersp(ctx, cw, ch, p, st, camFor(p, st, dt), { shapes, me: cur.me, hide: cur.view === 'me' ? cur.me : null, onlyMine: cur.view === 'me' });
  if (cur.rec) { // 動画には作戦名とアプリ名を入れる
    ctx.save(); ctx.font = '700 18px system-ui,sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.fillStyle = '#12233a';
    ctx.strokeText(p.name, 12, 10); ctx.fillText(p.name, 12, 10);
    ctx.font = '700 14px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.strokeText('HOOP SIGHT', cw - 10, ch - 8); ctx.fillText('HOOP SIGHT', cw - 10, ch - 8); ctx.restore();
  }
  $('#seek').value = C.total ? Math.round(cur.t / C.total * 1000) : 0;
  const chips = $('#steps'); // 再生中のステップは使わない（みる側には出さない）
}

/* 再生 */
let lastTs = 0;
function tick(ts) {
  if (!cur.playing) return;
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
  const C = compile(cur.play); cur.t += dt * cur.speed;
  if (cur.t >= C.total + 0.5) { cur.t = C.total; setPlaying(false); draw(dt); if (cur.onEnd) { const f = cur.onEnd; cur.onEnd = null; f(); } return; }
  draw(dt); requestAnimationFrame(tick);
}
function setPlaying(on) {
  cur.playing = on; $('#bPlay2').textContent = on ? '❚❚ 止める' : '▶ 再生';
  if (on) { lastTs = performance.now(); requestAnimationFrame(tick); }
}
function togglePlay() {
  const C = compile(cur.play); if (!cur.play.steps.length) { toast('まだ動きがありません'); return; }
  if (cur.playing) return setPlaying(false);
  if (cur.t >= C.total - 0.01) { cur.t = 0; cur.look = null; }
  setPlaying(true);
}

/* ───────── 画面の切り替え ───────── */
function setMode(m) {
  cur.mode = m; setPlaying(false);
  $('#editBar').hidden = m !== 'edit'; $('#viewBar').hidden = m !== 'view';
  $('#bEdit').textContent = cur.shared ? '＋ 作戦集に入れる' : '✎ 直す';
  $('#pName').readOnly = cur.shared;
  if (m === 'view') { cur.t = 0; cur.look = null; } else cur.view = 'top';
  syncUI(); requestAnimationFrame(resize);
}
function syncUI() {
  const p = cur.play; if (!p) return;
  if (document.activeElement !== $('#pName')) $('#pName').value = p.name;
  const n = p.steps.length, box = $('#steps'); box.innerHTML = '';
  const add = (label, i, cls) => { const b = document.createElement('button'); b.textContent = label; b.className = (cls || '') + (cur.step === i ? ' on' : ''); b.onclick = () => pickStep(i); box.appendChild(b); };
  add('配置', 0); for (let i = 1; i <= n; i++) add(String(i), i); add('＋ 次の動き', n + 1, 'add');
  $('#bDef').textContent = '守り：' + ({ auto: '自動', manual: '手動', off: 'なし' }[p.def]);
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === cur.view));
  $('#bMe').textContent = cur.me ? `自分の番号：${cur.me.slice(1)}` : '自分の番号をえらぶ';
  $('#bSpeed').textContent = '速さ ×' + cur.speed;
  const hint = $('#hint'); hint.classList.toggle('dark', cur.mode === 'view' && cur.view !== 'top' && !(cur.view === 'me' && !cur.me));
  hint.textContent = cur.mode === 'view' ? '' : cur.step === 0 ? '選手をドラッグして並べる ／ タップでボールを持たせる'
    : 'なぞる＝走る ／ 味方をタップ＝パス ／ ゴール＝シュート';
  draw();
}
function pickStep(i) {
  const p = cur.play, n = p.steps.length;
  if (i > n) {
    const last = p.steps[n - 1];
    if (last && !Object.keys(last.moves).length && !last.pass && !last.shot) { cur.step = n; toast('このステップに動きを描いてから、次へ進みます'); }
    else { pushUndo(); p.steps.push({ moves: {}, pass: null, shot: false }); cur.step = n + 1; touch(); }
  } else cur.step = i;
  syncUI();
  const on = $('#steps .on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function openPlay(p, shared, mode) {
  cur.play = p; cur.shared = !!shared; cur.step = shared ? 0 : Math.min(1, p.steps.length); cur.undo = []; cur.t = 0;
  cur.me = null; const m = localStorage.getItem(KEY_ME); if (m && offIds(p).includes(m) && shared) cur.me = m;
  $('#home').hidden = true; $('#board').hidden = false; setMode(mode || (shared ? 'view' : 'edit'));
}
function goHome() {
  setPlaying(false); clearTimeout(saveTimer);
  const p = cur.play;
  if (p && !cur.shared) { // 何も描いていない新しい作戦は残さない
    const empty = !p.steps.some(s => Object.keys(s.moves).length || s.pass || s.shot);
    if (empty && p.name === '新しい作戦') plays = plays.filter(x => x !== p);
    persist();
  }
  cur.play = null; history.replaceState(null, '', location.pathname);
  $('#board').hidden = true; $('#home').hidden = false; renderHome();
}
function thumb(p) {
  const c = document.createElement('canvas'); c.width = 300; c.height = 280;
  const x = c.getContext('2d'), q = p.full ? Object.assign(clone(p), { full: false }) : p, C = compile(q);
  drawTop(x, 300, 280, q, stateAt(q, C, 0, 0), { small: false, paths: q.steps.map((_, k) => ({ shapes: stepShapes(q, C, k), alpha: 0.75 })) });
  return c;
}
function renderHome() {
  const mk = (p, isSample) => {
    const d = document.createElement('div'); d.className = 'card'; d.appendChild(thumb(p));
    d.insertAdjacentHTML('beforeend', `<div class="nm">${esc(p.name)}</div><div class="meta">${p.steps.length} ステップ${isSample ? '・見本' : ''}</div>`);
    d.onclick = () => isSample ? openPlay(clone(p), true) : openPlay(p, false, p.steps.length ? 'view' : 'edit');
    if (!isSample) { const b = document.createElement('button'); b.className = 'more'; b.textContent = '⋯'; b.setAttribute('aria-label', 'メニュー'); b.onclick = e => { e.stopPropagation(); cardMenu(p); }; d.appendChild(b); }
    return d;
  };
  const my = $('#myList'); my.innerHTML = '';
  if (!plays.length) my.innerHTML = '<div class="empty">まだ作戦がありません。「新しい作戦をつくる」か、下の見本を開いてみてください。</div>';
  plays.forEach(p => my.appendChild(mk(p, false)));
  const sm = $('#sampleList'); sm.innerHTML = ''; SAMPLES.forEach(p => sm.appendChild(mk(p, true)));
}
function duplicate(p) { const q = clone(p); q.id = newPlay().id; q.name = (p.name + ' のコピー').slice(0, 30); q.updated = Date.now(); plays.unshift(q); persist(); return q; }
function removePlay(p) {
  sheet('「' + p.name + '」を消しますか？', [
    { label: '消す', sub: '元には戻せません', danger: 1, fn: () => { plays = plays.filter(x => x !== p); persist(); if (cur.play === p) { cur.play = null; $('#board').hidden = true; $('#home').hidden = false; } renderHome(); toast('消しました'); } },
  ]);
}
function cardMenu(p) {
  sheet(p.name, [
    { label: '直す', fn: () => openPlay(p, false, 'edit') },
    { label: '送る（リンク）', fn: () => share(p) },
    { label: 'コピーをつくる', fn: () => { duplicate(p); renderHome(); } },
    { label: '消す', danger: 1, fn: () => removePlay(p), keep: 1 },
  ]);
}

/* ───────── 下から出るメニュー・お知らせ ───────── */
function sheet(title, items, extra) {
  $('#sheetTitle').textContent = title; const b = $('#sheetBody'); b.innerHTML = '';
  if (extra) b.appendChild(extra);
  (items || []).forEach(it => {
    const x = document.createElement('button'); x.className = (it.danger ? 'danger ' : '') + (it.sel ? 'sel' : '');
    x.innerHTML = esc(it.label) + (it.sub ? `<small>${esc(it.sub)}</small>` : '');
    x.onclick = () => { if (!it.keep) closeSheet(); it.fn(); }; b.appendChild(x);
  });
  $('#shade').hidden = false; $('#sheet').hidden = false;
}
function closeSheet() { $('#shade').hidden = true; $('#sheet').hidden = true; }
$('#shade').onclick = closeSheet; $('#sheetClose').onclick = closeSheet;
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600); }

/* ───────── つくる：指の操作 ───────── */
function pushUndo() { cur.undo.push(JSON.stringify(cur.play)); if (cur.undo.length > 60) cur.undo.shift(); }
function undo() {
  const s = cur.undo.pop(); if (!s) { toast('これ以上は戻せません'); return; }
  const i = plays.indexOf(cur.play), q = JSON.parse(s); Object.keys(cur.play).forEach(k => delete cur.play[k]); Object.assign(cur.play, q);
  if (i < 0) plays.unshift(cur.play); touch(); syncUI();
}
function evPos(e) { const r = cv.getBoundingClientRect(); return tfNow.toW(e.clientX - r.left, e.clientY - r.top); }
function limit(q, p) { return [clamp(q[0], -0.6, W + 0.6), clamp(q[1], -0.6, (p.full ? 28 : 14) + 0.6)]; }
function simplify(pts, eps) { // 点を間引く
  if (pts.length < 3) return pts;
  let mx = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1], l = dist(a, b) || 1e-6;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / l; if (d > mx) { mx = d; idx = i; } }
  if (mx <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
cv.addEventListener('pointerdown', e => {
  if (cur.mode !== 'edit' || !tfNow) return;
  const p = cur.play, C = compile(p), k = cur.step - 1, st = stateAt(p, C, Math.max(0, k), 0), q = evPos(e);
  let best = null, bd = 1.15;
  [...offIds(p), ...defIds(p)].forEach(id => { const d = dist(st.pos[id], q); if (d < bd) { bd = d; best = id; } });
  drag = { id: best, down: q, moved: false, pts: null, C, k, st };
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (!drag) return; const p = cur.play, q = limit(evPos(e), p);
  if (!drag.id) return;
  const canMove = C_ids(drag).includes(drag.id);
  if (!drag.moved) {
    if (dist(q, drag.down) < 0.35) return;
    if (!canMove) { toast('守りは自動です。「守り」で手動に変えると動かせます'); drag = null; return; }
    drag.moved = true; pushUndo();
    if (drag.k >= 0) drag.pts = [drag.st.pos[drag.id].slice()];
  }
  if (drag.k < 0) p.start[drag.id] = q;
  else if (dist(q, drag.pts[drag.pts.length - 1]) > 0.22) drag.pts.push(q);
  draw();
});
const C_ids = d => d.C.ids;
function endDrag(e) {
  if (!drag) return; const d = drag, p = cur.play; drag = null;
  if (d.moved) {
    if (d.k >= 0) {
      const pts = simplify(d.pts, 0.16);
      if (dense(pts).len >= 0.6) p.steps[d.k].moves[d.id] = { pts, screen: false }; else cur.undo.pop();
    }
    touch(); syncUI(); return;
  }
  tap(d);
}
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', () => { if (drag && drag.moved) cur.undo.pop(); drag = null; draw(); });
function tap(d) {
  const p = cur.play, C = d.C, k = d.k, q = d.down;
  if (k < 0) { // 配置：タップでボール
    if (d.id && d.id[0] === 'o') { pushUndo(); p.ball = d.id; touch(); syncUI(); }
    return;
  }
  const st = p.steps[k], h = C.H[k];
  if (d.id && d.id[0] === 'o') {
    if (!h) return toast('シュートのあとはパスできません');
    if (d.id === h) { if (st.pass) { pushUndo(); st.pass = null; touch(); syncUI(); } else toast(d.id.slice(1) + '番がボールを持っています。味方をタップでパス'); return; }
    pushUndo(); st.pass = st.pass === d.id ? null : d.id; touch(); syncUI(); return;
  }
  for (const id in st.moves) if (C.ids.includes(id) && dist(C.S[k + 1][id], q) < 0.9) { // 動いた先をタップ：スクリーンに切り替え
    pushUndo(); st.moves[id].screen = !st.moves[id].screen; touch(); syncUI(); toast(st.moves[id].screen ? 'スクリーン（壁）にしました' : '走る動きに戻しました'); return;
  }
  if (dist(q, HOOP) < 1.2) {
    if (!h) return toast('ボールを持っている選手がいません');
    pushUndo(); st.shot = !st.shot; touch(); syncUI();
  }
}

/* ───────── ボタン ───────── */
$('#bNew').onclick = () => { const p = newPlay(); openPlay(p, false, 'edit'); toast('まず並び方を決めて、「＋ 次の動き」へ'); cur.step = 0; syncUI(); };
$('#bHome').onclick = goHome;
$('#pName').oninput = e => { if (cur.shared) return; cur.play.name = e.target.value.trim() || '作戦'; touch(); };
$('#pName').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };
$('#bUndo').onclick = undo;
$('#bPlay').onclick = () => { if (!cur.play.steps.length) return toast('「＋ 次の動き」で動きを描いてから再生します'); setMode('view'); setPlaying(true); };
$('#bPlay2').onclick = togglePlay;
$('#bEdit').onclick = () => {
  if (cur.shared) { const q = clone(cur.play); q.id = newPlay().id; q.updated = Date.now(); plays.unshift(q); persist(); cur.play = q; cur.shared = false; toast('自分の作戦集に入れました'); history.replaceState(null, '', location.pathname); }
  cur.step = Math.min(1, cur.play.steps.length); setMode('edit');
};
$('#bSpeed').onclick = () => { cur.speed = { 1: 0.5, 0.5: 1.5, 1.5: 1 }[cur.speed]; syncUI(); };
$('#seek').oninput = e => { setPlaying(false); cur.t = e.target.value / 1000 * compile(cur.play).total; cur.look = null; draw(); };
$('#viewSeg').onclick = e => { const v = e.target.dataset.v; if (!v) return; cur.view = v; cur.look = null; if (v === 'me' && !cur.me) pickMe(); syncUI(); };
$('#bMe').onclick = pickMe;
function pickMe() {
  const box = document.createElement('div'); box.className = 'nums';
  offIds(cur.play).forEach(id => { const b = document.createElement('button'); b.textContent = id.slice(1); if (cur.me === id) b.className = 'sel'; b.onclick = () => { cur.me = id; localStorage.setItem(KEY_ME, id); cur.look = null; closeSheet(); syncUI(); }; box.appendChild(b); });
  sheet('自分の番号をえらぼう', [{ label: 'えらばない', sub: '全員を同じように表示します', fn: () => { cur.me = null; if (cur.view === 'me') cur.view = 'top'; syncUI(); } }], box);
}
$('#bForm').onclick = () => {
  const p = cur.play, box = document.createElement('div'); box.style.display = 'contents';
  const grid = document.createElement('div'); grid.className = 'grid2';
  Object.keys(FORMS).forEach(name => { const b = document.createElement('button'); b.textContent = name; b.onclick = () => { pushUndo(); FORMS[name].forEach((q, i) => { p.start['o' + (i + 1)] = q.slice(); delete p.start['d' + (i + 1)]; }); cur.step = 0; touch(); closeSheet(); syncUI(); }; grid.appendChild(b); });
  box.appendChild(grid);
  const nums = (label, from, key) => {
    box.insertAdjacentHTML('beforeend', `<div class="lbl">${label}</div>`); const r = document.createElement('div'); r.className = 'nums';
    for (let i = from; i <= 5; i++) { const b = document.createElement('button'); b.textContent = i; if (p[key] === i) b.className = 'sel'; b.onclick = () => { pushUndo(); p[key] = i; if (!offIds(p).includes(p.ball)) p.ball = 'o1'; touch(); closeSheet(); syncUI(); }; r.appendChild(b); }
    box.appendChild(r);
  };
  nums('攻めの人数', 1, 'no'); nums('守りの人数', 0, 'nd');
  sheet('並び方と人数', [{ label: p.full ? 'ハーフコートにする' : 'オールコートにする', fn: () => { pushUndo(); p.full = !p.full; touch(); syncUI(); requestAnimationFrame(resize); } }], box);
  if (cur.step !== 0 && p.steps.length) toast('並び方は「配置」に反映されます');
};
$('#bDef').onclick = () => {
  const p = cur.play, set = v => () => {
    pushUndo();
    if (v === 'manual' && p.def !== 'manual') { const q = Object.assign({}, p, { def: 'auto' }), st = stateAt(q, compile(q), 0, 0); defIds(q).forEach(id => { if (!p.start[id]) p.start[id] = st.pos[id]; }); }
    p.def = v; if (v !== 'off' && !p.nd) p.nd = Math.min(5, p.no); touch(); syncUI();
  };
  sheet('守りの動かし方', [
    { label: '自動（マンツーマン）', sub: '攻めの動きに合わせて勝手についていきます', sel: p.def === 'auto', fn: set('auto') },
    { label: '手動', sub: '守りも攻めと同じように、なぞって動かします', sel: p.def === 'manual', fn: set('manual') },
    { label: 'なし', sub: '攻めだけを表示します', sel: p.def === 'off', fn: set('off') },
  ]);
};
$('#bMenu').onclick = () => {
  const p = cur.play, items = [];
  if (!cur.shared && cur.mode === 'edit' && cur.step > 0) items.push({ label: `ステップ ${cur.step} を消す`, sub: '「戻す」で元に戻せます', fn: () => { pushUndo(); p.steps.splice(cur.step - 1, 1); cur.step = Math.min(cur.step, p.steps.length); touch(); syncUI(); } });
  if (p.steps.length) items.push({ label: '動画にして保存', sub: 'いまの視点で1本の動画にします', fn: exportVideo });
  if (!cur.shared) items.push({ label: 'コピーをつくる', fn: () => { duplicate(p); toast('コピーをつくりました'); } }, { label: 'この作戦を消す', danger: 1, keep: 1, fn: () => removePlay(p) });
  sheet(p.name, items);
};
$('#bShare').onclick = () => share(cur.play);
async function share(p) {
  if (!p.steps.length) return toast('動きを描いてから送れます');
  const url = shareUrl(p);
  try { if (navigator.share) { await navigator.share({ title: p.name, text: `作戦「${p.name}」`, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました。LINE などに貼って送れます'); }
  catch (e) { const box = document.createElement('input'); box.value = url; box.readOnly = true; box.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid #2c4466;background:#0e1a2b'; sheet('このリンクをコピーして送ってください', [], box); box.select(); }
}
/* 動画：画面の絵をそのまま録る */
function exportVideo() {
  if (!cv.captureStream || !window.MediaRecorder) return toast('この端末・ブラウザでは動画にできません');
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) return toast('この端末・ブラウザでは動画にできません');
  if (cur.mode !== 'view') setMode('view');
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 4e6 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    cur.rec = null; draw();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] }));
    a.download = cur.play.name + (mime.includes('mp4') ? '.mp4' : '.webm'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('動画を保存しました');
  };
  cur.rec = rec; cur.t = 0; cur.look = null; const sp = cur.speed; cur.speed = 1; draw(); rec.start(); toast('動画をつくっています…');
  setTimeout(() => { cur.onEnd = () => setTimeout(() => { cur.speed = sp; rec.stop(); }, 500); setPlaying(true); }, 500);
}

/* ───────── はじまり ───────── */
function boot() {
  const m = /[#&]p=([\w-]+)/.exec(location.hash);
  if (m) { try { openPlay(unpack(JSON.parse(b64d(m[1]))), true); if (!cur.me) pickMe(); return; } catch (e) { toast('リンクを読み込めませんでした'); } }
  renderHome();
}
window.addEventListener('hashchange', () => { if (/[#&]p=/.test(location.hash)) boot(); });
boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.HS = { cur, compile, stateAt, draw, resize, pack, shareUrl, plays: () => plays }; // 確認用
})();
