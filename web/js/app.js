/* Ohrguss interface: menus and controls, 3D preview, scan, photo and filter import, package export.
   Needs three.js (r128) and js/core.js (window.EarCore) loaded first. */
(function () {
'use strict';
var C = window.EarCore, $ = function (id) { return document.getElementById(id); };
var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
var CANAL = ['canalW', 'canalH', 'len', 'bend', 'bendDir', 'taper'], CONCHA = ['conchaW', 'conchaH', 'depth', 'offX', 'offY', 'smooth'];
var EAR_KEYS = CANAL.concat(CONCHA, ['gap']);
var SHARED_KEYS = ['grip', 'vent', 'ventDia', 'kitMode', 'filterOn', 'filterFit', 'filterSink', 'filterTurn', 'bore', 'seatDia', 'seatDepth', 'solid', 'cord', 'marks', 'mouldWall', 'coreTaper', 'caseHinge', 'caseLoop', 'caseMagnets', 'caseFit'];
var RESET = { canal: CANAL, concha: CONCHA, filter: ['bore', 'seatDia', 'seatDepth', 'solid'] };
var KEY = 'ohrguss.v6', NAME = { L: 'left ear', R: 'right ear' }, XO = { L: 15, R: -15 };
function fresh() {
  var e = {}, s = {};
  EAR_KEYS.forEach(function (k) { e[k] = C.DEFAULTS[k]; }); SHARED_KEYS.forEach(function (k) { s[k] = C.DEFAULTS[k]; });
  return { ears: { L: Object.assign({}, e), R: Object.assign({}, e) }, shared: s };
}
var D = fresh();
function adopt(o) {
  if (!o || !o.ears || !o.ears.L || !o.ears.R || !o.shared) return false;
  ['L', 'R'].forEach(function (sd) { EAR_KEYS.forEach(function (k) { if (typeof o.ears[sd][k] === 'number' && isFinite(o.ears[sd][k])) D.ears[sd][k] = o.ears[sd][k]; }); });
  SHARED_KEYS.forEach(function (k) { if (typeof o.shared[k] === typeof C.DEFAULTS[k]) D.shared[k] = o.shared[k]; });
  return true;
}
try { var st = JSON.parse(localStorage.getItem(KEY) || 'null'); if (adopt(st) && st.rev !== 2) D.shared.caseHinge = false; } catch (e) {}
D.shared.filterOn = false; // the filter scan itself is not stored
var ear = 'R', fit = { L: false, R: false }, kind = 'plug', menu = 'canal', COLOR = '#3333ff';
try { var oldC = localStorage.getItem('ohrguss.color3'); COLOR = localStorage.getItem('ohrguss.color4') || (oldC && oldC !== '#0000ff' ? oldC : COLOR); } catch (e) {}
function flat(sd) { return Object.assign({}, D.shared, D.ears[sd], { side: sd, fit: fit[sd] }); }
function design() { return { L: flat('L'), R: flat('R') }; }
function other() { return ear === 'L' ? 'R' : 'L'; }
function earMenu() { return kind === 'plug' && (menu === 'canal' || menu === 'concha' || menu === 'scan'); }

/* ---------- menus: dot-matrix icons ---------- */
var ICON = {
  general: ['##.####', '.......', '####.##', '.......', '#.#####', '.......', '###.###'],
  scan: ['##...##', '#.....#', '.......', '...#...', '.......', '#.....#', '##...##'],
  canal: ['.....##', '....##.', '...##..', '..##...', '..##...', '..##...', '..##...'],
  concha: ['..###..', '.#...#.', '#.....#', '#..##.#', '#.#..#.', '.#.#...', '..##...'],
  filter: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  colour: ['...#...', '..###..', '..###..', '.#####.', '.#####.', '.#####.', '..###..'],
  plug: ['.....', '.###.', '#####', '.###.', '..#..'],
  mould: ['#####', '#...#', '#...#', '#...#', '#####'],
  kit: ['.....', '.....', '#.#.#', '#.#.#', '.....'],
  'case': ['.....', '#####', '.....', '#####', '#####']
};
function icon(name) {
  var rows = ICON[name], n = rows.length, o = '<svg viewBox="0 0 ' + n * 4 + ' ' + n * 4 + '" aria-hidden="true">';
  rows.forEach(function (r, j) { for (var i = 0; i < n; i++) if (r[i] === '#') o += '<circle cx="' + (i * 4 + 2) + '" cy="' + (j * 4 + 2) + '" r="1.45"/>'; });
  return o + '</svg>';
}
['scan', 'canal', 'concha', 'filter', 'colour', 'general'].forEach(function (id) {
  var b = document.createElement('button');
  b.id = 'nav-' + id; b.setAttribute('aria-pressed', 'false'); b.innerHTML = icon(id) + '<span>' + id + '</span>';
  b.addEventListener('click', function () { openMenu(id); });
  $('nav').appendChild(b);
});
each('.tab', function (t) { t.innerHTML = icon(t.dataset.kind) + '<span>' + t.textContent + '</span>'; });
function openMenu(id) {
  menu = id;
  each('section[data-sec]', function (s) { s.hidden = s.dataset.sec !== id; });
  each('.nav button', function (b) { b.setAttribute('aria-pressed', String(b.id === 'nav-' + id)); });
  try { sessionStorage.setItem('og.menu', id); } catch (e) {}
  if (typeof look === 'function') { look(); focus(); }
}

/* ---------- controls ---------- */
var ROWS = {
  'canal-rows': [['len', 'Length', 6, 18, 0.5, 'mm', 1], ['bendDir', 'Bend turns to', 0, 355, 5, '°', 1]],
  'canal-fine': [['canalW', 'Width', 4.5, 10, 0.1, 'mm', 1], ['canalH', 'Height', 6, 14, 0.1, 'mm', 1], ['bend', 'Bend', 0, 50, 1, '°', 1], ['taper', 'Tip size', 0.6, 1, 0.02, '%', 1]],
  'concha-rows': [['conchaW', 'Width', 12, 26, 0.5, 'mm', 1], ['conchaH', 'Height', 14, 30, 0.5, 'mm', 1], ['depth', 'Thickness', 5, 14, 0.5, 'mm', 1], ['offX', 'Move sideways', -8, 8, 0.5, 'mm', 1], ['offY', 'Move up or down', -8, 8, 0.5, 'mm', 1], ['smooth', 'Blend to canal', 0.5, 6, 0.5, 'mm', 1]],
  'filter-rows': [['bore', 'Sound bore', 0, 3.5, 0.1, 'mm', 0]],
  'seat-rows': [['seatDia', 'Seat width', 0, 9, 0.1, 'mm', 0], ['seatDepth', 'Seat depth', 1, 5, 0.5, 'mm', 0]],
  'flt-rows': [['filterFit', 'Fit gap', -0.3, 0.6, 0.05, 'mm', 0], ['filterSink', 'Sink in', -3, 5, 0.25, 'mm', 0], ['filterTurn', 'Turn', 0, 355, 5, '°', 0]],
  'vent-rows': [['ventDia', 'Vent width', 0.6, 1.6, 0.1, 'mm', 0]],
  'scan-rows': [['gap', 'Skin gap', -0.5, 1, 0.1, 'mm', 1]],
  'mould-rows': [['mouldWall', 'Wall', 4, 8, 0.5, 'mm', 0]],
  'case-rows': [['caseFit', 'Room around plugs', 0.2, 1, 0.1, 'mm', 0]]
};
function val(r) { return r[6] ? D.ears[ear][r[0]] : D.shared[r[0]]; }
function fmt(v, unit, step) {
  if (unit === '%') return Math.round(v * 100) + '<em>%</em>';
  return (+v).toFixed(unit === '°' ? 0 : step < 0.1 || step === 0.25 ? 2 : 1) + '<em>' + unit + '</em>';
}
Object.keys(ROWS).forEach(function (host) {
  ROWS[host].forEach(function (r) {
    var row = document.createElement('div'); row.className = 'row';
    row.innerHTML = '<label for="r-' + r[0] + '">' + r[1] + '</label><input type="range" id="r-' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" step="' + r[4] + '"><output id="o-' + r[0] + '" for="r-' + r[0] + '"></output>';
    $(host).appendChild(row);
    var inp = row.querySelector('input');
    ['pointerdown', 'focus'].forEach(function (ev) { inp.addEventListener(ev, function () { guide(r[0], r[1]); }); });
    inp.addEventListener('input', function () {
      var v = parseFloat(inp.value); if (r[6]) D.ears[ear][r[0]] = v; else D.shared[r[0]] = v;
      var jump = host === 'mould-rows' ? 'mould' : host === 'case-rows' ? 'case' : null; if (jump && kind !== jump) setKind(jump);
      $('o-' + r[0]).innerHTML = fmt(v, r[5], r[4]); changed(); guide(r[0], r[1]);
      if (r[6]) syncVariants();
    });
  });
});
function syncVariants() {
  var P = D.ears[ear];
  each('.var', function (b) {
    var s = C.SIZES[+b.dataset.s], bd = C.BENDS[+b.dataset.b];
    b.setAttribute('aria-pressed', String(Math.abs(P.canalW - s.w) < 0.01 && Math.abs(P.canalH - s.h) < 0.01 && P.bend === bd.bend));
  });
}
function syncControls() {
  Object.keys(ROWS).forEach(function (host) { ROWS[host].forEach(function (r) { $('r-' + r[0]).value = val(r); $('o-' + r[0]).innerHTML = fmt(val(r), r[5], r[4]); }); });
  each('.earseg button', function (b) { b.setAttribute('aria-pressed', String(b.dataset.ear === ear)); });
  each('input[data-key]', function (c) { c.checked = !!D.shared[c.dataset.key]; });
  $('close-click').setAttribute('aria-pressed', String(!D.shared.caseMagnets)); $('close-mag').setAttribute('aria-pressed', String(!!D.shared.caseMagnets));
  $('type-solid').setAttribute('aria-pressed', String(!!D.shared.solid)); $('type-filter').setAttribute('aria-pressed', String(!D.shared.solid));
  $('filter-wrap').hidden = !!D.shared.solid; $('solid-wrap').hidden = !D.shared.solid; $('vent-rows').hidden = !D.shared.vent;
  $('c-grip').disabled = !!D.shared.cord;
  each('[data-kit]', function (b) { b.setAttribute('aria-pressed', String(b.dataset.kit === D.shared.kitMode)); });
  $('kit-note').textContent = { sizes: 'Five gauges per ear, XS to XL, with that ear\u2019s length and bend.', fine: 'Five gauges per ear around that ear\u2019s canal size: 12% and 6% smaller, the same, 6% and 12% larger.', bends: 'Three gauges per ear at that ear\u2019s canal size: 10° straighter, the same, 10° sharper.' }[D.shared.kitMode] + ' Rim holes count the gauge; one rim notch means left, two mean right.';
  $('flt-none').hidden = !!flt; $('flt-have').hidden = !flt; $('seat-wrap').hidden = !!(flt && D.shared.filterOn); $('flt-rows').hidden = !D.shared.filterOn;
  if (flt) $('flt-info').textContent = flt.name + ' · ' + flt.w.toFixed(1) + ' mm across, ' + flt.h.toFixed(1) + ' mm tall. If the size is wrong, the scan was not exported in millimetres.';
  syncVariants(); scanUI();
}
// variant grid: stroke width = canal size, curve = bend
(function () {
  var g = $('variants'), h = '<span></span>';
  C.SIZES.forEach(function (s) { h += '<span class="hd">' + s.id + '</span>'; });
  C.BENDS.forEach(function (b, bi) {
    h += '<span class="hd rh">' + b.id + '</span>';
    C.SIZES.forEach(function (s, si) {
      var x = 22 - bi * 4.5, y = 37, d = 'M' + x.toFixed(1) + ' ' + y.toFixed(1), a = 0;
      for (var i = 0; i < 12; i++) {
        a = (b.bend * 1.6 * Math.PI / 180) * Math.min(1, Math.max(0, (i - 2) / 7));
        x += Math.sin(a) * 2.5; y -= Math.cos(a) * 2.5; d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      h += '<button class="var" id="v-' + si + '-' + bi + '" data-s="' + si + '" data-b="' + bi + '" aria-label="Canal ' + s.id + ', ' + b.id.toLowerCase() + '" aria-pressed="false"><svg viewBox="0 0 44 44" aria-hidden="true"><path d="' + d + '" stroke-width="' + (4.5 + si * 1.7).toFixed(1) + '"/></svg></button>';
    });
  });
  g.innerHTML = h;
  g.addEventListener('click', function (ev) {
    var b = ev.target.closest('.var'); if (!b) return;
    var s = C.SIZES[+b.dataset.s], bd = C.BENDS[+b.dataset.b], P = D.ears[ear];
    P.canalW = s.w; P.canalH = s.h; P.bend = bd.bend; syncControls(); changed();
  });
})();
each('.earseg button', function (b) { b.addEventListener('click', function () { ear = b.dataset.ear; syncControls(); look(); scanShow(); focus(); }); });
each('.copy', function (b) { b.addEventListener('click', function () { RESET[b.dataset.copy].forEach(function (k) { D.ears[other()][k] = D.ears[ear][k]; }); changed(); }); });
each('.reset', function (b) { b.addEventListener('click', function () {
  RESET[b.dataset.reset].forEach(function (k) { if (b.dataset.reset === 'filter') D.shared[k] = C.DEFAULTS[k]; else D.ears[ear][k] = C.DEFAULTS[k]; });
  syncControls(); changed();
}); });
each('input[data-key]', function (c) { c.addEventListener('change', function () { D.shared[c.dataset.key] = c.checked; if (c.dataset.view) setKind(c.dataset.view); syncControls(); changed(); }); });
['click', 'mag'].forEach(function (t) { $('close-' + t).addEventListener('click', function () { D.shared.caseMagnets = t === 'mag'; setKind('case'); syncControls(); changed(); }); });
each('[data-kit]', function (b) { b.addEventListener('click', function () { D.shared.kitMode = b.dataset.kit; setKind('kit'); syncControls(); changed(); }); });
['solid', 'filter'].forEach(function (t) { $('type-' + t).addEventListener('click', function () { D.shared.solid = t === 'solid'; syncControls(); changed(); }); });
$('fit').addEventListener('change', function () { fit[ear] = $('fit').checked; changed(); });
/* show one kind of part; also used to jump to the part a setting belongs to */
function setKind(k) {
  kind = k; each('.tab', function (o) { o.setAttribute('aria-pressed', String(o.dataset.kind === k)); });
  needFrame = true; look(); scanShow();
}
each('.tab', function (t) { t.addEventListener('click', function () { setKind(t.dataset.kind); changed(); }); });
$('load-design').addEventListener('click', function () { $('design-file').click(); });
$('design-file').addEventListener('change', function () {
  var f = this.files[0]; this.value = ''; if (!f) return;
  f.text().then(function (t) {
    var o = null; try { o = JSON.parse(t); } catch (e) {}
    if (!adopt(o)) { note = 'This file is not an Ohrguss design.'; readout(); return; }
    if (!flt) D.shared.filterOn = false;
    if (o.color && /^#[0-9a-f]{6}$/i.test(o.color)) setColor(o.color);
    note = ''; syncControls(); changed();
  });
});

/* ---------- 3D stage ---------- */
var canvas = $('view'), stage = $('stage');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.85));
var sun = new THREE.DirectionalLight(0xffffff, 0.4); sun.position.set(-1.2, 1.4, 1); camera.add(sun); scene.add(camera);
var group = new THREE.Group(); scene.add(group);
var MAT = {
  a: new THREE.MeshPhongMaterial({ color: 0x3333ff, shininess: 30, specular: 0x161210 }),
  b: new THREE.MeshPhongMaterial({ color: 0x3333ff, shininess: 30, specular: 0x161210 }),
  filter: new THREE.MeshPhongMaterial({ color: 0xe9e6de, shininess: 20, specular: 0x222222 }),
  scan: new THREE.MeshPhongMaterial({ color: 0x9a968c, shininess: 5, side: THREE.DoubleSide, transparent: true, opacity: 1 })
};
var photos = { L: null, R: null };
/* the ear being edited is solid; the other one fades while a per-ear menu is open */
function look() {
  var see = (photos.L || photos.R) && $('see').checked ? 0.55 : 1, dim = earMenu() ? 0.22 : 1;
  [[MAT.a, see], [MAT.b, see * dim]].forEach(function (p) { p[0].opacity = p[1]; p[0].transparent = p[1] < 1; p[0].depthWrite = p[1] === 1; p[0].needsUpdate = true; });
  group.children.forEach(function (m) { if (m.userData.side) m.material = m.userData.side === ear ? MAT.a : MAT.b; });
  gGroup.position.x = XO[ear]; filterShow(); dirty = true;
}
function hsl(hh, s, l) { s /= 100; l /= 100; var k = function (n) { return (n + hh / 30) % 12; }, a = s * Math.min(l, 1 - l), f = function (n) { var v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return ('0' + Math.round(v * 255).toString(16)).slice(-2); }; return '#' + f(0) + f(8) + f(4); }
function setColor(c) {
  COLOR = c.toLowerCase(); MAT.a.color.set(COLOR); MAT.b.color.set(COLOR); try { localStorage.setItem('ohrguss.color4', COLOR); } catch (e) {}
  $('now').style.background = COLOR; if (document.activeElement !== $('hex')) $('hex').value = COLOR;
  each('#pal button', function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === COLOR)); });
  dirty = true;
}
(function () {
  var hues = [197, 222, 240, 268, 300, 335, 0, 22, 38, 50, 62, 100], light = [16, 24, 33, 42, 50, 60, 70, 80, 90], o = '';
  for (var g = 0; g < 12; g++) { var gc = hsl(0, 0, 100 - g * 100 / 11); o += '<button data-c="' + gc + '" style="background:' + gc + '" aria-label="' + gc + '"></button>'; }
  light.forEach(function (l) { hues.forEach(function (hu) { var c = hsl(hu, 100, l); o += '<button data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>'; }); });
  $('pal').innerHTML = o;
  $('pal').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setColor(b.dataset.c); });
  $('hex').addEventListener('input', function () { var v = this.value.trim(); if (v[0] !== '#') v = '#' + v; if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v); });
})();
var O = { az: -0.5, el: 0.25, r: 150, t: new THREE.Vector3(0, 0, 4) }, dirty = true, needFrame = true;
function camUpdate() {
  var ce = Math.cos(O.el);
  camera.position.set(O.t.x + O.r * Math.sin(O.az) * ce, O.t.y + O.r * Math.sin(O.el), O.t.z - O.r * Math.cos(O.az) * ce);
  camera.up.set(0, 1, 0); camera.lookAt(O.t); dirty = true;
}
function resize() {
  var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
}
new ResizeObserver(resize).observe(stage); resize(); camUpdate();
(function loop() { if (dirty) { dirty = false; renderer.render(scene, camera); } requestAnimationFrame(loop); })();
function frame(obj, az, el) {
  var box = new THREE.Box3().setFromObject(obj); if (box.isEmpty()) return;
  var s = new THREE.Sphere(); box.getBoundingSphere(s);
  O.t.copy(s.center); O.r = s.radius / Math.sin(15 * Math.PI / 180) * 1.12 / Math.min(1, camera.aspect);
  if (az !== undefined) { O.az = az; O.el = el; }
  camUpdate();
}
/* point the camera at what the open menu edits */
function focus() {
  if (scan && scan.marking) return;
  if (kind !== 'plug') return;
  if (earMenu()) {
    O.t.set(XO[ear], 0, 3); O.r = 118 / Math.min(1, camera.aspect);
    if (menu === 'concha') { O.az = 0; O.el = 0; }
    else if (menu === 'canal') { O.az = ear === 'L' ? 1.5708 : -1.5708; O.el = 0; }
    else { O.az = ear === 'L' ? 0.5 : -0.5; O.el = 0.25; }
    camUpdate();
  } else frame(group, -0.5, 0.25);
}

// orbit: drag turns, pinch or wheel zooms, two fingers or shift+drag pans
var ptr = new Map(), moved = 0, lastPinch = 0, lastMid = null;
canvas.addEventListener('pointerdown', function (e) { canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) moved = 0; lastPinch = 0; lastMid = null; });
canvas.addEventListener('pointermove', function (e) {
  var p = ptr.get(e.pointerId); if (!p) return;
  var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptr.size === 1) {
    moved += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey || e.buttons === 2) pan(dx, dy);
    else { O.az += dx * 0.008; O.el = Math.max(-1.5, Math.min(1.5, O.el + dy * 0.008)); }
    camUpdate();
  } else if (ptr.size === 2) {
    var a = Array.from(ptr.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    if (lastPinch) O.r = Math.max(15, Math.min(2500, O.r * lastPinch / d));
    if (lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
    lastPinch = d; lastMid = mid; moved = 99; camUpdate();
  }
});
function pan(dx, dy) {
  var k = O.r * 2 * Math.tan(15 * Math.PI / 180) / stage.clientHeight;
  var m = camera.matrixWorld.elements;
  O.t.x += (-m[0] * dx + m[4] * dy) * k; O.t.y += (-m[1] * dx + m[5] * dy) * k; O.t.z += (-m[2] * dx + m[6] * dy) * k;
}
function up(e) { var had = ptr.has(e.pointerId); ptr.delete(e.pointerId); lastPinch = 0; lastMid = null; if (had && ptr.size === 0 && moved < 6) tap(e); }
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', function (e) { ptr.delete(e.pointerId); });
canvas.addEventListener('wheel', function (e) { e.preventDefault(); O.r = Math.max(15, Math.min(2500, O.r * Math.exp(e.deltaY * 0.0012))); camUpdate(); }, { passive: false });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

/* ---------- measure guides drawn on the model ---------- */
var gGroup = new THREE.Group(), gMat = new THREE.MeshBasicMaterial({ color: 0xe9e6de, depthTest: false }), gTimer = 0, gText = '';
gGroup.renderOrder = 10; scene.add(gGroup);
function bar(a, b) {
  var d = new THREE.Vector3().subVectors(b, a), L = d.length(); if (L < 0.05) return;
  var m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, L, 8), gMat); m.renderOrder = 10;
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); gGroup.add(m);
  [a, b].forEach(function (p) { var s = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), gMat); s.renderOrder = 10; s.position.copy(p); gGroup.add(s); });
}
function guide(key, label) {
  while (gGroup.children.length) gGroup.children.pop().geometry.dispose();
  if (kind !== 'plug' || (scan && scan.marking)) return;
  var P = D.ears[ear], ox = ear === 'L' ? -P.offX : P.offX, oy = P.offY, A = P.conchaW / 2, B = P.conchaH / 2, zf = -P.depth - 0.4, V = function (x, y, z) { return new THREE.Vector3(x, y, z); }, side = 0;
  if (key === 'conchaW') bar(V(ox - A, oy, zf), V(ox + A, oy, zf));
  else if (key === 'conchaH') bar(V(ox, oy - B, zf), V(ox, oy + B, zf));
  else if (key === 'offX') bar(V(0, 0, zf), V(ox, 0, zf));
  else if (key === 'offY') bar(V(ox, 0, zf), V(ox, oy, zf));
  else if (key === 'depth') { bar(V(ox, oy + B + 1.5, -P.depth), V(ox, oy + B + 1.5, 0)); side = 1; }
  else return;
  if (side && Math.abs(O.az) < 0.6) { O.az = ear === 'L' ? 1.5708 : -1.5708; O.el = 0; camUpdate(); }
  if (!side && Math.abs(O.az) > 0.9) { O.az = 0; O.el = 0; camUpdate(); }
  gText = label + ' ' + (+P[key]).toFixed(1) + ' mm'; dirty = true; readout();
  clearTimeout(gTimer); gTimer = setTimeout(function () { while (gGroup.children.length) gGroup.children.pop().geometry.dispose(); gText = ''; dirty = true; readout(); }, 2200);
}

/* ---------- generation (worker) ---------- */
/* the engine also runs as a Web Worker: from its own file on the site, or from the inlined copy in the single-file build */
var coreEl = $('core'), blobUrl = coreEl.src || URL.createObjectURL(new Blob([coreEl.textContent], { type: 'text/javascript' }));
function makeWorker() { try { return new Worker(blobUrl); } catch (e) { return null; } }
var worker = makeWorker(), exporter = null, busy = false, pending = null, jobSeq = 0, timer = 0, hfs = { L: null, R: null };
var stats = {}, note = '';
function sendHF(side) { [worker, exporter].forEach(function (w) { if (w) w.postMessage({ type: 'hf', side: side, hf: hfs[side] }); }); }
function post(req) {
  if (!worker) { var r = C.generate(req.kind, req.design, hfs, req.res, false); r.job = req.job; r.kind = req.kind; show(r); return; }
  if (busy) { pending = req; return; }
  busy = true; worker.postMessage(req);
}
if (worker) worker.onmessage = function (ev) {
  busy = false;
  if (ev.data.error) { note = 'Could not build this shape. Change a value and try again.'; readout(); }
  else if (ev.data.job === jobSeq || !pending) show(ev.data);
  if (pending) { var q = pending; pending = null; post(q); }
};
var RES = { plug: [0.8, 0.35], mould: [1.1, 0.5], kit: [0.9, 0.45], 'case': [1.0, 0.5] };
function changed() {
  try { D.rev = 2; localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {}
  filterShow();
  if (scan && scan.marking) return;
  post({ job: ++jobSeq, kind: kind, design: design(), res: RES[kind][0] });
  clearTimeout(timer);
  timer = setTimeout(function () { post({ job: ++jobSeq, kind: kind, design: design(), res: RES[kind][1] }); }, 260);
}
function show(r) {
  if (r.kind !== kind) return;
  while (group.children.length) group.children.pop().geometry.dispose();
  r.meshes.forEach(function (m) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeVertexNormals();
    var mesh = new THREE.Mesh(g, MAT.a);
    if (kind === 'plug') { mesh.userData.side = m.name.slice(-1); mesh.position.x = XO[mesh.userData.side]; }
    group.add(mesh);
  });
  group.rotation.x = kind === 'plug' ? 0 : -Math.PI / 2; // printed parts are laid out z-up
  group.updateMatrixWorld(true); look();
  if (needFrame) { needFrame = false; if (kind === 'plug') focus(); else frame(group, 0.45, 0.75); }
  stats = r.stats || {}; dirty = true; readout();
}
function readout() {
  var h = '';
  if (scan && scan.marking) h = '<span class="chip hint">' + (scan.marking === 'L' ? 'Left' : 'Right') + ' ear: turn the scan until you look straight into the ear canal with the ear upright. Then tap the canal opening.</span>';
  else if (stats.tipWall != null && stats.tipWall < 0.8 && (kind === 'plug' || kind === 'mould')) h += '<span class="chip warn">Tip wall ' + stats.tipWall.toFixed(1) + ' mm. Too thin</span>';
  if (gText) h += '<span class="chip hint">' + gText + '</span>';
  if (note) h += '<span class="chip warn">' + note + '</span>';
  $('read').innerHTML = h;
  $('save').hidden = !!(scan && scan.marking);
}

/* ---------- save: one package for the whole design ---------- */
var dl = null;
if (window.claude && window.claude.use) window.claude.use('downloads').then(function (d) { dl = d; }, function () {});
function deflate(u8) {
  if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
  try { return new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return null; }); }
  catch (e) { return Promise.resolve(null); }
}
$('save').addEventListener('click', function () {
  var btn = $('save'), ds = design(), S = D.shared; btn.disabled = true; btn.textContent = 'Building…'; note = ''; readout();
  var fin = function (msg) { btn.disabled = false; btn.textContent = 'Save package'; note = msg || ''; readout(); };
  function done(files) {
    var core = !S.solid && (S.bore > 0 || S.seatDia > 0);
    var txt = 'OHRGUSS package\nUnits: millimetres. Every STL is one print plate with the parts laid out flat.\n\n' +
      'plugs.stl      Left and right plug for direct printing in a soft, skin-safe material.' + (S.marks ? ' An engraved L or R is on the outer face.' : '') + '\n' +
      'mould.stl      One mould for both plugs: two halves, cavity side up' + (core ? ', plus one core per ear standing on its handle (1 notch = left, 2 notches = right)' : '') + '.\n' +
      '               ' + (core ? 'Push each core into its pocket at the outer-face end; the rib only fits one way and the tip rests in the socket at the far end. ' : '') + 'Clamp the halves and pour skin-safe silicone through the funnels' + (S.cord ? ', which enter through the cord rings' : '') + '. ' + (core ? 'Air leaves along the groove beside each core. After curing, open the halves and pull the cores out.' : '') + '\n' +
      'case.stl       Base and lid with cavities shaped to these two plugs. Print both open side up.' + (S.caseHinge ? ' Push a 2 mm rod or 1.75 mm filament through the hinge.' : '') + (S.caseMagnets ? ' Press 4 x 2 mm disc magnets into the four pockets, poles matched.' : ' The lid clicks over a ridge on the lip; PETG or ABS flex better than PLA.') + '\n' +
      (S.filterOn && flt ? 'The filter seat is shaped from your filter scan (' + flt.name + ') with a ' + S.filterFit.toFixed(2) + ' mm gap.\n' : '') +
      'sizing_kit.stl Two rows of canal gauges, one per ear: ' + { sizes: 'sizes XS to XL', fine: 'fine size steps from 12% smaller to 12% larger', bends: 'the same size with 10 degrees less bend, the same bend and 10 degrees more' }[S.kitMode] + '. Rim holes count the gauge; one rim notch = left, two = right.\n' +
      (S.solid && S.vent ? 'Pressure vent: lay a ' + S.ventDia.toFixed(1) + ' mm wire in the channel of each mould cavity before clamping and pull it out after curing.\n' : '') +
      'design.json    Load this in the General menu to continue the design.\n\n' +
      'Left canal ' + ds.L.canalW.toFixed(1) + ' x ' + ds.L.canalH.toFixed(1) + ' mm, right canal ' + ds.R.canalW.toFixed(1) + ' x ' + ds.R.canalH.toFixed(1) + ' mm.\n' +
      'Not certified hearing protection. Check the seal before relying on a plug.\n';
    files.push({ name: 'README.txt', data: new TextEncoder().encode(txt) });
    files.push({ name: 'design.json', data: new TextEncoder().encode(JSON.stringify({ app: 'ohrguss', v: 1, ears: D.ears, shared: D.shared, color: COLOR }, null, 1)) });
    btn.textContent = 'Packing…';
    Promise.all(files.map(function (f) { return deflate(f.data).then(function (c) { if (c && c.length < f.data.length) f.comp = c; }); })).then(function () {
      var blob = new Blob([C.zip(files)], { type: 'application/zip' }), name = 'ohrguss_package.zip';
      if (dl) dl.save({ filename: name, data: blob }).then(function () { fin(''); }, function (e) { fin(e && e.code === 'declined' ? '' : 'Saving is not available in this view.'); });
      else { try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); fin(''); } catch (e) { fin('Saving is not available in this view.'); } }
    });
  }
  if (!exporter) { exporter = makeWorker(); if (exporter) { ['L', 'R'].forEach(function (sd) { exporter.postMessage({ type: 'hf', side: sd, hf: hfs[sd] }); }); exporter.postMessage({ type: 'filter', grid: flt ? flt.grid : null }); } }
  if (!exporter) { setTimeout(function () { try { done(C.buildPackage(ds, hfs)); } catch (e) { fin('Could not build this design.'); } }, 30); return; }
  exporter.onmessage = function (ev) {
    if (ev.data.error) fin('Could not build this design.');
    else if (ev.data.progress) btn.textContent = 'Building ' + ev.data.progress + ' / ' + ev.data.of;
    else if (ev.data.files) done(ev.data.files);
  };
  exporter.postMessage({ type: 'package', design: ds });
});

/* ---------- filter upload: the seat becomes the negative of the scanned filter ---------- */
var flt = null, fMesh = { L: null, R: null };
function eig3(m) { // Jacobi eigenvectors of a symmetric 3x3, returned as rows with their eigenvalues
  var a = [m[0].slice(), m[1].slice(), m[2].slice()], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (var sw = 0; sw < 12; sw++) for (var p = 0; p < 2; p++) for (var q = p + 1; q < 3; q++) {
    if (Math.abs(a[p][q]) < 1e-12) continue;
    var th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (var k = 0; k < 3; k++) { var x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
    for (k = 0; k < 3; k++) { x = a[p][k]; y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
    for (k = 0; k < 3; k++) { x = v[k][p]; y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
  }
  return [0, 1, 2].map(function (i) { return { l: a[i][i], v: [v[0][i], v[1][i], v[2][i]] }; }).sort(function (A, B) { return A.l - B.l; });
}
/* put the filter in its own frame (z = insertion direction, 0 at the outer end) and sample it into a distance grid */
function filterBuild() {
  var pos = flt.pos, nv = pos.length / 3, i, k, mean = [0, 0, 0], cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (i = 0; i < pos.length; i += 3) for (k = 0; k < 3; k++) mean[k] += pos[i + k] / nv;
  for (i = 0; i < pos.length; i += 3) for (k = 0; k < 3; k++) for (var l = 0; l < 3; l++) cov[k][l] += (pos[i + k] - mean[k]) * (pos[i + l] - mean[l]) / nv;
  var E = eig3(cov), def = (E[1].l - E[0].l) < (E[2].l - E[1].l) ? 2 : 0; // rod: long axis, disc: short axis
  var ai = (def + flt.axis) % 3, a = E[ai].v.slice(), u = E[(ai + 1) % 3].v.slice();
  var cross = function (p, q) { return [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; };
  var v = cross(a, u), loc = new Float32Array(pos.length);
  function project() {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (i = 0; i < pos.length; i += 3) {
      var p = [pos[i] - mean[0], pos[i + 1] - mean[1], pos[i + 2] - mean[2]];
      var c3 = [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2], p[0] * a[0] + p[1] * a[1] + p[2] * a[2]];
      for (k = 0; k < 3; k++) { loc[i + k] = c3[k]; if (c3[k] < lo[k]) lo[k] = c3[k]; if (c3[k] > hi[k]) hi[k] = c3[k]; }
    }
    var cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
    for (i = 0; i < pos.length; i += 3) { loc[i] -= cx; loc[i + 1] -= cy; loc[i + 2] -= lo[2]; }
    return hi[2] - lo[2];
  }
  var H = project();
  if (flt.flip === null) { // by default the narrower end goes in
    var rin = 0, nin = 0, rout = 0, nout = 0;
    for (i = 0; i < loc.length; i += 3) { var r = Math.hypot(loc[i], loc[i + 1]); if (loc[i + 2] > H * 0.66) { rin += r; nin++; } else if (loc[i + 2] < H * 0.33) { rout += r; nout++; } }
    flt.flip = nin && nout ? rin / nin > rout / nout : false;
  }
  if (flt.flip) { a = a.map(function (x) { return -x; }); v = v.map(function (x) { return -x; }); H = project(); }
  var rad = 0; for (i = 0; i < loc.length; i += 3) rad = Math.max(rad, Math.hypot(loc[i], loc[i + 1]));
  // depth map: how far in the filter reaches at each spot
  var g = Math.max(0.15, (rad + 1.2) / 90), half = rad + 1.2, n = Math.ceil(2 * half / g) + 1, Dm = new Float32Array(n * n).fill(-1e9), ix = flt.idx;
  var nt = ix ? ix.length / 3 : nv / 3, X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
  for (var t = 0; t < nt; t++) {
    for (k = 0; k < 3; k++) { var o = (ix ? ix[t * 3 + k] : t * 3 + k) * 3; X[k] = (loc[o] + half) / g; Y[k] = (loc[o + 1] + half) / g; Z[k] = loc[o + 2]; }
    var x0 = Math.max(0, Math.floor(Math.min(X[0], X[1], X[2]))), x1 = Math.min(n - 1, Math.ceil(Math.max(X[0], X[1], X[2])));
    var y0 = Math.max(0, Math.floor(Math.min(Y[0], Y[1], Y[2]))), y1 = Math.min(n - 1, Math.ceil(Math.max(Y[0], Y[1], Y[2])));
    var den = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]);
    for (var j = y0; j <= y1; j++) for (i = x0; i <= x1; i++) {
      var zz;
      if (Math.abs(den) < 1e-9) zz = Math.max(Z[0], Z[1], Z[2]);
      else {
        var b0 = ((Y[1] - Y[2]) * (i - X[2]) + (X[2] - X[1]) * (j - Y[2])) / den, b1 = ((Y[2] - Y[0]) * (i - X[2]) + (X[0] - X[2]) * (j - Y[2])) / den, b2 = 1 - b0 - b1;
        if (b0 < -0.02 || b1 < -0.02 || b2 < -0.02) continue;
        zz = b0 * Z[0] + b1 * Z[1] + b2 * Z[2];
      }
      if (zz > Dm[i + n * j]) Dm[i + n * j] = zz;
    }
  }
  for (var pass = 0; pass < 2; pass++) { // close pinholes in the scan
    var cp = Dm.slice();
    for (j = 1; j < n - 1; j++) for (i = 1; i < n - 1; i++) {
      if (cp[i + n * j] > -1e8) continue;
      var sum = 0, cnt = 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var q = cp[i + di + n * (j + dj)]; if (q > -1e8) { sum += q; cnt++; } }
      if (cnt >= 5) Dm[i + n * j] = sum / cnt;
    }
  }
  // signed distance to the swept filter (open towards the outside), within 5 cells
  var far = 5 * g, z0 = -far, nz = Math.ceil((H + 2 * far) / g) + 1, data = new Float32Array(n * n * nz);
  for (k = 0; k < nz; k++) {
    var zp = z0 + k * g;
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      var inside = zp <= Dm[i + n * j], best = far * far;
      for (dj = -5; dj <= 5; dj++) { var jj = j + dj; for (di = -5; di <= 5; di++) {
        var ii = i + di, h2 = (di * di + dj * dj) * g * g; if (h2 >= best) continue;
        var Dn = (ii < 0 || jj < 0 || ii >= n || jj >= n) ? -1e9 : Dm[ii + n * jj], d2;
        if (inside) d2 = Dn < zp ? h2 : h2 + (Dn - zp) * (Dn - zp);
        else d2 = Dn >= zp ? h2 : (Dn > -1e8 ? h2 + (zp - Dn) * (zp - Dn) : 1e9);
        if (d2 < best) best = d2;
      } }
      data[i + n * (j + n * k)] = (inside ? -1 : 1) * Math.sqrt(best);
    }
  }
  flt.grid = { n: n, nz: nz, g: g, half: half, z0: z0, far: far, rad: rad, dmax: H, data: data };
  flt.w = 2 * rad; flt.h = H;
  C.setFilter(flt.grid); [worker, exporter].forEach(function (w) { if (w) w.postMessage({ type: 'filter', grid: flt.grid }); });
  // the filter itself, shown seated in both plugs
  var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(loc, 3)); if (ix) geo.setIndex(new THREE.BufferAttribute(ix, 1)); geo.computeVertexNormals();
  ['L', 'R'].forEach(function (sd) { if (fMesh[sd]) { scene.remove(fMesh[sd]); fMesh[sd].geometry.dispose(); } fMesh[sd] = new THREE.Mesh(geo, MAT.filter); scene.add(fMesh[sd]); });
}
function filterShow() {
  ['L', 'R'].forEach(function (sd) {
    var m = fMesh[sd]; if (!m) return;
    m.visible = !!flt && D.shared.filterOn && !D.shared.solid && kind === 'plug' && !(scan && scan.marking);
    m.position.set(XO[sd], 0, -D.ears[sd].depth + D.shared.filterSink); m.rotation.z = D.shared.filterTurn * Math.PI / 180;
  });
  dirty = true;
}
function filterRemove() {
  ['L', 'R'].forEach(function (sd) { if (fMesh[sd]) { scene.remove(fMesh[sd]); fMesh[sd] = null; } });
  flt = null; D.shared.filterOn = false; C.setFilter(null); [worker, exporter].forEach(function (w) { if (w) w.postMessage({ type: 'filter', grid: null }); });
}
$('flt-load').addEventListener('click', function () { $('flt-file').click(); });
$('flt-file').addEventListener('change', function () {
  var f = this.files[0]; this.value = ''; if (!f) return; note = '';
  f.arrayBuffer().then(function (buf) {
    var ext = f.name.split('.').pop().toLowerCase(), d;
    try { d = ext === 'obj' ? parseOBJ(buf) : ext === 'ply' ? parsePLY(buf) : parseSTL(buf); } catch (e) { d = null; }
    if (!d || (d.idx ? d.idx.length : d.pos.length / 3) < 12) { note = 'This file has no surface mesh. Export the filter as a mesh in STL, OBJ or PLY.'; readout(); return; }
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (var i = 0; i < d.pos.length; i += 3) for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], d.pos[i + k]); hi[k] = Math.max(hi[k], d.pos[i + k]); }
    if (Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) < 0.5) for (i = 0; i < d.pos.length; i++) d.pos[i] *= 1000; // metres
    filterRemove();
    flt = { name: f.name, pos: d.pos, idx: d.idx && d.idx.length ? d.idx : null, axis: 0, flip: null };
    filterBuild(); D.shared.filterOn = true; D.shared.solid = false; syncControls(); changed(); readout();
  });
});
$('flt-flip').addEventListener('click', function () { if (!flt) return; flt.flip = !flt.flip; filterBuild(); syncControls(); changed(); });
$('flt-axis').addEventListener('click', function () { if (!flt) return; flt.axis = (flt.axis + 1) % 3; flt.flip = null; filterBuild(); syncControls(); changed(); });
$('flt-remove').addEventListener('click', function () { filterRemove(); syncControls(); changed(); });

/* ---------- photo: true-size backdrop, one per ear ---------- */
var ed = null, edc = $('ed-canvas');
$('photo-load').addEventListener('click', function () { $('photo-file').click(); });
$('photo-file').addEventListener('change', function () {
  var f = this.files[0]; this.value = ''; if (!f) return;
  var img = new Image();
  img.onload = function () {
    var W = img.naturalWidth, H = img.naturalHeight;
    ed = { img: img, W: W, H: H, ear: ear, pts: [{ x: W * 0.25, y: H * 0.2, n: 'A' }, { x: W * 0.45, y: H * 0.2, n: 'B' }, { x: W * 0.5, y: H * 0.55, n: '' }], drag: -1 };
    $('editor').hidden = false; drawEd();
  };
  img.onerror = function () { note = 'This image could not be opened. Try a JPG or PNG.'; readout(); };
  img.src = URL.createObjectURL(f);
});
function edFit() {
  var r = edc.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  edc.width = Math.max(1, r.width * dpr); edc.height = Math.max(1, r.height * dpr);
  var s = Math.min(r.width / ed.W, r.height / ed.H);
  return { s: s, ox: (r.width - ed.W * s) / 2, oy: (r.height - ed.H * s) / 2, dpr: dpr, r: r };
}
function drawEd() {
  if (!ed) return; var f = edFit(), g = edc.getContext('2d');
  g.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); g.clearRect(0, 0, f.r.width, f.r.height);
  g.drawImage(ed.img, f.ox, f.oy, ed.W * f.s, ed.H * f.s);
  var p = ed.pts.map(function (q) { return { x: f.ox + q.x * f.s, y: f.oy + q.y * f.s }; });
  g.lineWidth = 2; g.strokeStyle = '#2f6bff'; g.beginPath(); g.moveTo(p[0].x, p[0].y); g.lineTo(p[1].x, p[1].y); g.stroke();
  for (var i = 0; i < 2; i++) { g.fillStyle = '#2f6bff'; g.beginPath(); g.arc(p[i].x, p[i].y, 9, 0, 7); g.fill(); g.fillStyle = '#0a0a0a'; g.font = '800 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ed.pts[i].n, p[i].x, p[i].y + 0.5); }
  g.lineWidth = 3; g.strokeStyle = '#2f6bff'; g.beginPath(); g.arc(p[2].x, p[2].y, 14, 0, 7); g.stroke();
  g.fillStyle = '#2f6bff'; g.beginPath(); g.arc(p[2].x, p[2].y, 2.5, 0, 7); g.fill();
}
edc.addEventListener('pointerdown', function (e) {
  if (!ed) return; var f = edFit(), x = e.clientX - f.r.left, y = e.clientY - f.r.top, best = 1e9;
  ed.pts.forEach(function (q, i) { var d = Math.hypot(f.ox + q.x * f.s - x, f.oy + q.y * f.s - y); if (d < best) { best = d; ed.drag = i; } });
  edc.setPointerCapture(e.pointerId); moveEd(e);
});
function moveEd(e) {
  if (!ed || ed.drag < 0) return; var f = edFit(), q = ed.pts[ed.drag];
  q.x = Math.max(0, Math.min(ed.W, (e.clientX - f.r.left - f.ox) / f.s)); q.y = Math.max(0, Math.min(ed.H, (e.clientY - f.r.top - f.oy) / f.s)); drawEd();
}
edc.addEventListener('pointermove', moveEd);
edc.addEventListener('pointerup', function () { if (ed) ed.drag = -1; });
new ResizeObserver(drawEd).observe(edc);
$('ed-ref').addEventListener('change', function () { $('ed-mm').hidden = this.value !== '0'; });
$('ed-cancel').addEventListener('click', function () { $('editor').hidden = true; ed = null; });
$('ed-use').addEventListener('click', function () {
  var mm = +$('ed-ref').value || +$('ed-mm').value, px = Math.hypot(ed.pts[0].x - ed.pts[1].x, ed.pts[0].y - ed.pts[1].y);
  if (!(mm > 0) || px < 4) { $('ed-mm').hidden = false; $('ed-mm').focus(); return; }
  var s = mm / px, k = Math.min(1, 2048 / Math.max(ed.W, ed.H)), cv = document.createElement('canvas'), sd = ed.ear;
  cv.width = Math.round(ed.W * k); cv.height = Math.round(ed.H * k); cv.getContext('2d').drawImage(ed.img, 0, 0, cv.width, cv.height);
  removePhoto(sd);
  var pl = new THREE.Mesh(new THREE.PlaneGeometry(ed.W * s, ed.H * s), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
  pl.rotation.y = Math.PI; pl.position.set(XO[sd] - (ed.W / 2 - ed.pts[2].x) * s, -(ed.H / 2 - ed.pts[2].y) * s, 1.5); scene.add(pl);
  photos[sd] = { mesh: pl, w: Math.round(ed.W * s), h: Math.round(ed.H * s) };
  $('editor').hidden = true; ed = null; ear = sd; syncControls(); openMenu('concha');
});
function removePhoto(sd) {
  var p = photos[sd]; if (p) { scene.remove(p.mesh); p.mesh.material.map.dispose(); p.mesh.material.dispose(); p.mesh.geometry.dispose(); }
  photos[sd] = null;
}
$('photo-remove').addEventListener('click', function () { removePhoto(ear); syncControls(); look(); });
$('see').addEventListener('change', look);

/* ---------- 3D scan: one mesh, one alignment per ear ---------- */
var scan = null; // { mesh, name, tris, M: { L, R }, marking }
function parseSTL(buf) {
  var dv = new DataView(buf), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (84 + n * 50 === buf.byteLength && n > 0) {
    var pos = new Float32Array(n * 9);
    for (var t = 0; t < n; t++) for (var k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
    return { pos: pos, idx: null };
  }
  var txt = new TextDecoder().decode(buf), re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, m, out = [];
  while ((m = re.exec(txt))) out.push(+m[1], +m[2], +m[3]);
  return { pos: new Float32Array(out), idx: null };
}
function parseOBJ(buf) {
  var lines = new TextDecoder().decode(buf).split('\n'), v = [], f = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (l.charCodeAt(0) === 118 && l.charCodeAt(1) === 32) { var a = l.trim().split(/\s+/); v.push(+a[1], +a[2], +a[3]); }
    else if (l.charCodeAt(0) === 102 && l.charCodeAt(1) === 32) {
      var q = l.trim().split(/\s+/).slice(1).map(function (s) { var x = parseInt(s, 10); return x < 0 ? v.length / 3 + x : x - 1; });
      for (var k = 1; k < q.length - 1; k++) f.push(q[0], q[k], q[k + 1]);
    }
  }
  return { pos: new Float32Array(v), idx: new Uint32Array(f) };
}
function parsePLY(buf) {
  var u8 = new Uint8Array(buf), end = -1, hdrMax = Math.min(u8.length, 8192), s = '';
  for (var i = 0; i < hdrMax; i++) s += String.fromCharCode(u8[i]);
  end = s.indexOf('end_header'); if (end < 0) throw new Error('ply');
  var bodyAt = s.indexOf('\n', end) + 1, hdr = s.slice(0, end).split('\n');
  var fmt2 = 'ascii', nv = 0, nf = 0, cur = '', vprops = [], listTypes = null;
  var SZ = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  hdr.forEach(function (l) {
    var a = l.trim().split(/\s+/);
    if (a[0] === 'format') fmt2 = a[1];
    else if (a[0] === 'element') { cur = a[1]; if (cur === 'vertex') nv = +a[2]; if (cur === 'face') nf = +a[2]; }
    else if (a[0] === 'property') { if (cur === 'vertex') vprops.push({ type: a[1], name: a[2] }); else if (cur === 'face' && a[1] === 'list' && !listTypes) listTypes = [a[2], a[3]]; }
  });
  var pos = new Float32Array(nv * 3), idx = [];
  if (fmt2 === 'ascii') {
    var rows = new TextDecoder().decode(u8.subarray(bodyAt)).split('\n'), xi = 0, yi = 1, zi = 2;
    vprops.forEach(function (p, i) { if (p.name === 'x') xi = i; if (p.name === 'y') yi = i; if (p.name === 'z') zi = i; });
    for (var r = 0; r < nv; r++) { var a = rows[r].trim().split(/\s+/); pos[r * 3] = +a[xi]; pos[r * 3 + 1] = +a[yi]; pos[r * 3 + 2] = +a[zi]; }
    for (var f = 0; f < nf; f++) { var b = rows[nv + f].trim().split(/\s+/).map(Number); for (var k = 2; k < b[0]; k++) idx.push(b[1], b[k], b[k + 1]); }
  } else {
    if (fmt2 !== 'binary_little_endian') throw new Error('ply');
    var dv = new DataView(buf), o = bodyAt;
    function rd(type) { var v; switch (SZ[type]) { case 1: v = dv.getUint8(o); break; case 2: v = dv.getUint16(o, true); break; case 8: v = dv.getFloat64(o, true); break; default: v = (type === 'float' || type === 'float32') ? dv.getFloat32(o, true) : dv.getUint32(o, true); } o += SZ[type]; return v; }
    for (var r2 = 0; r2 < nv; r2++) vprops.forEach(function (p) { var v = rd(p.type); if (p.name === 'x') pos[r2 * 3] = v; else if (p.name === 'y') pos[r2 * 3 + 1] = v; else if (p.name === 'z') pos[r2 * 3 + 2] = v; });
    if (listTypes) for (var f2 = 0; f2 < nf; f2++) { var c = rd(listTypes[0]), q = []; for (var j = 0; j < c; j++) q.push(rd(listTypes[1])); for (var k2 = 1; k2 < c - 1; k2++) idx.push(q[0], q[k2], q[k2 + 1]); }
  }
  return { pos: pos, idx: new Uint32Array(idx) };
}
function loadScan(file) {
  note = '';
  file.arrayBuffer().then(function (buf) {
    var ext = file.name.split('.').pop().toLowerCase(), d;
    try { d = ext === 'obj' ? parseOBJ(buf) : ext === 'ply' ? parsePLY(buf) : parseSTL(buf); } catch (e) { d = null; }
    var tris = d ? (d.idx ? d.idx.length / 3 : d.pos.length / 9) : 0;
    if (!d || tris < 4) { note = 'This file has no surface mesh. Export the scan as a mesh in STL, OBJ or PLY.'; readout(); return; }
    removeScan(true);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); if (d.idx) g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.computeBoundingBox(); var c = new THREE.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z);
    var sz = new THREE.Vector3(); g.boundingBox.getSize(sz);
    var mm = Math.max(sz.x, sz.y, sz.z) < 5 ? 1000 : 1;
    g.scale(mm, mm, mm); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    var mesh = new THREE.Mesh(g, MAT.scan); mesh.matrixAutoUpdate = false; scene.add(mesh);
    scan = { mesh: mesh, tris: tris, name: file.name, M: { L: null, R: null }, marking: null };
    startMarking();
  });
}
function scanUI() {
  var n = NAME[ear];
  $('photo-none').hidden = !!photos[ear]; $('photo-have').hidden = !photos[ear];
  $('photo-load').textContent = 'Take or choose photo · ' + n;
  if (photos[ear]) $('photo-info').textContent = 'Photo of the ' + n + ' placed at true size, ' + photos[ear].w + ' × ' + photos[ear].h + ' mm. Match the outline in the Concha menu.';
  $('scan-none').hidden = !!scan; $('scan-have').hidden = !scan;
  if (!scan) return;
  var b = scan.mesh.geometry.boundingBox, s = new THREE.Vector3(); b.getSize(s);
  $('scan-info').textContent = scan.name + ' · ' + Math.round(Math.max(s.x, s.y, s.z)) + ' mm across. Left ear ' + (scan.M.L ? 'marked' : 'not marked') + ', right ear ' + (scan.M.R ? 'marked' : 'not marked') + '.';
  $('scan-mark').textContent = (scan.M[ear] ? 'Mark again · ' : 'Mark canal opening · ') + n;
  $('fit-wrap').hidden = !scan.M[ear]; $('fit').checked = !!fit[ear];
}
/* show the scan where it belongs: full while marking, as a ghost behind the ear it was marked for */
function scanShow() {
  if (!scan) { group.visible = true; dirty = true; return; }
  var M = scan.M[ear];
  if (scan.marking) { scan.mesh.visible = true; scan.mesh.matrix.identity(); MAT.scan.opacity = 1; MAT.scan.depthWrite = true; group.visible = false; }
  else {
    group.visible = true; scan.mesh.visible = !!M && kind === 'plug';
    if (M) { scan.mesh.matrix.makeTranslation(XO[ear], 0, 0).multiply(M); MAT.scan.opacity = 0.42; MAT.scan.depthWrite = false; }
  }
  scan.mesh.updateMatrixWorld(true); dirty = true;
}
function startMarking() {
  if (kind !== 'plug') { kind = 'plug'; each('.tab', function (o) { o.setAttribute('aria-pressed', String(o.dataset.kind === 'plug')); }); }
  scan.marking = ear; scanShow(); syncControls(); openMenu('scan'); frame(scan.mesh, 0, 0.1); readout();
}
function removeScan(quiet) {
  if (scan) { scene.remove(scan.mesh); scan.mesh.geometry.dispose(); }
  scan = null; hfs = { L: null, R: null }; fit = { L: false, R: false }; sendHF('L'); sendHF('R'); scanShow();
  if (!quiet) { syncControls(); needFrame = true; changed(); }
}
function tap(e) {
  if (!scan || !scan.marking) return;
  var r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  var hit = ray.intersectObject(scan.mesh)[0]; if (!hit) return;
  // the current view becomes the plug frame: screen up = +Y, view direction = +Z (into the canal)
  var m = camera.matrixWorld.elements, p = hit.point, sd = scan.marking;
  var R = new THREE.Matrix4().set(-m[0], -m[1], -m[2], 0, m[4], m[5], m[6], 0, -m[8], -m[9], -m[10], 0, 0, 0, 0, 1);
  scan.M[sd] = R.multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  hfs[sd] = heightField(scan.mesh.geometry, scan.M[sd]); sendHF(sd); fit[sd] = true;
  scan.marking = null; ear = sd; scanShow(); syncControls(); look(); needFrame = true; changed(); readout();
}
/* outermost skin surface seen along the canal axis, on a 0.25 mm grid */
function heightField(g, M) {
  var n = 193, cell = 0.25, half = 24, data = new Float32Array(n * n).fill(1e9);
  var pa = g.attributes.position.array, ix = g.index ? g.index.array : null, e = M.elements;
  var nt = ix ? ix.length / 3 : pa.length / 9, X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
  for (var t = 0; t < nt; t++) {
    for (var k = 0; k < 3; k++) {
      var o = (ix ? ix[t * 3 + k] : t * 3 + k) * 3, x = pa[o], y = pa[o + 1], z = pa[o + 2];
      X[k] = (e[0] * x + e[4] * y + e[8] * z + e[12] + half) / cell; Y[k] = (e[1] * x + e[5] * y + e[9] * z + e[13] + half) / cell; Z[k] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    var x0 = Math.max(0, Math.floor(Math.min(X[0], X[1], X[2]))), x1 = Math.min(n - 1, Math.ceil(Math.max(X[0], X[1], X[2])));
    var y0 = Math.max(0, Math.floor(Math.min(Y[0], Y[1], Y[2]))), y1 = Math.min(n - 1, Math.ceil(Math.max(Y[0], Y[1], Y[2])));
    if (x0 > x1 || y0 > y1) continue;
    if (Math.min(Z[0], Z[1], Z[2]) < -30 || Math.max(Z[0], Z[1], Z[2]) > 30) continue;
    var den = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]);
    for (var j = y0; j <= y1; j++) for (var i = x0; i <= x1; i++) {
      var zz;
      if (Math.abs(den) < 1e-9) zz = Math.min(Z[0], Z[1], Z[2]);
      else {
        var a = ((Y[1] - Y[2]) * (i - X[2]) + (X[2] - X[1]) * (j - Y[2])) / den, b = ((Y[2] - Y[0]) * (i - X[2]) + (X[0] - X[2]) * (j - Y[2])) / den, c = 1 - a - b;
        if (a < -0.02 || b < -0.02 || c < -0.02) { if (x1 - x0 > 1 || y1 - y0 > 1) continue; zz = Math.min(Z[0], Z[1], Z[2]); }
        else zz = a * Z[0] + b * Z[1] + c * Z[2];
      }
      if (zz < data[i + n * j]) data[i + n * j] = zz;
    }
  }
  var out = new Float32Array(n * n);
  for (var q = 0; q < n * n; q++) {
    var qi = q % n, qj = (q / n) | 0, s = 0, w = 0;
    for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var ii = qi + di, jj = qj + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; var v = data[ii + n * jj]; if (v < 1e8) { s += v; w++; } }
    out[q] = w ? s / w : 50;
  }
  return { n: n, cell: cell, half: half, data: out };
}
$('scan-load').addEventListener('click', function () { $('scan-file').click(); });
$('scan-file').addEventListener('change', function () { if (this.files[0]) loadScan(this.files[0]); this.value = ''; });
$('scan-mark').addEventListener('click', function () { if (scan) startMarking(); });
$('scan-remove').addEventListener('click', function () { removeScan(false); });
$('scan-units').addEventListener('click', function () {
  if (!scan) return; var g = scan.mesh.geometry, s = new THREE.Vector3(); g.boundingBox.getSize(s);
  var f = Math.max(s.x, s.y, s.z) > 2000 ? 0.001 : 1000; g.scale(f, f, f); g.computeBoundingBox(); g.computeBoundingSphere();
  $('scan-units').textContent = f === 1000 ? 'Scale ÷1000' : 'Scale ×1000';
  scan.M = { L: null, R: null }; hfs = { L: null, R: null }; fit = { L: false, R: false }; sendHF('L'); sendHF('R'); startMarking();
});
stage.addEventListener('dragover', function (e) { e.preventDefault(); });
stage.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) loadScan(e.dataTransfer.files[0]); });

var startMenu = 'canal'; try { startMenu = sessionStorage.getItem('og.menu') || 'canal'; } catch (e) {}
if (!document.querySelector('section[data-sec="' + startMenu + '"]')) startMenu = 'canal';
setColor(COLOR); syncControls(); openMenu(startMenu); changed();
})();
