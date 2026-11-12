/* Geometry core: implicit plug model -> smooth watertight meshes. Units: mm. */
(function (root) {
  'use strict';
  var DEG = Math.PI / 180;

  function smin(a, b, k) {
    if (k <= 0) return Math.min(a, b);
    var h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  var SIZES = [
    { id: 'XS', w: 5.2, h: 7.5 },
    { id: 'S', w: 5.9, h: 8.5 },
    { id: 'M', w: 6.5, h: 9.4 },
    { id: 'L', w: 7.2, h: 10.3 },
    { id: 'XL', w: 7.8, h: 11.3 }
  ];
  var BENDS = [
    { id: 'STRAIGHT', bend: 8 },
    { id: 'MEDIUM', bend: 20 },
    { id: 'SHARP', bend: 35 }
  ];

  var DEFAULTS = {
    side: 'R',
    canalW: 6.5, canalH: 9.4, len: 12, bend: 20, bendDir: 0, taper: 0.85,
    conchaW: 16, conchaH: 18.5, depth: 9, offX: -3, offY: 2,
    bore: 2.0, seatDia: 5.5, seatDepth: 3,
    smooth: 3, solid: false, cord: false, grip: false, vent: false, ventDia: 1.0, kitMode: 'sizes', marks: true,
    filterOn: false, filterFit: 0.15, filterSink: 0, filterTurn: 0,
    mouldWall: 5, coreTaper: true, caseHinge: false, caseLoop: false, caseMagnets: false, caseFit: 0.5,
    fit: false, gap: 0
  };

  /* 2D distance to a stroked capital L or R, about 2.4 x 4 mm at k = 1 */
  var GLYPH = {
    L: [[-0.9, 2, -0.9, -2], [-0.9, -2, 1, -2]],
    R: [[-0.9, -2, -0.9, 2], [-0.9, 2, 0.3, 2], [0.3, 2, 1, 1.4], [1, 1.4, 1, 0.6], [1, 0.6, 0.3, 0], [0.3, 0, -0.9, 0], [0.1, 0, 1, -2]]
  };
  function letter(ch, lx, ly, k) {
    var g = GLYPH[ch], best = 1e9; lx /= k; ly /= k;
    for (var i = 0; i < g.length; i++) {
      var ax = g[i][0], ay = g[i][1], bx = g[i][2] - ax, by = g[i][3] - ay, t = ((lx - ax) * bx + (ly - ay) * by) / (bx * bx + by * by);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var dx = lx - ax - bx * t, dy = ly - ay - by * t, d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return (Math.sqrt(best) - 0.42) * k;
  }

  /* Left ear = mirror of the right ear model across X. */
  function normalize(P) {
    var Q = {};
    for (var key in DEFAULTS) Q[key] = (P && P[key] !== undefined) ? P[key] : DEFAULTS[key];
    if (Q.solid) { Q.bore = Q.vent ? Q.ventDia : 0; Q.seatDia = 0; Q.filterOn = false; }
    Q.ventMode = !!(Q.solid && Q.vent); // thin pressure vent instead of a filter bore
    if (Q.side === 'L') { Q.offX = -Q.offX; Q.bendDir = 180 - Q.bendDir; }
    return Q;
  }

  /* Uploaded filter as a signed-distance grid: x, y across the filter, z from its outer end inward.
     { n, nz, g, half, z0, far, rad, dmax, data } */
  var FILTER = null;
  function fsample(G, x, y, z) {
    var fx = (x + G.half) / G.g, fy = (y + G.half) / G.g, fz = (z - G.z0) / G.g;
    if (fx < 0 || fy < 0 || fx > G.n - 1.001 || fy > G.n - 1.001 || fz > G.nz - 1.001) return G.far;
    if (fz < 0) fz = 0; // the seat stays open outward
    var i = fx | 0, j = fy | 0, k = fz | 0, tx = fx - i, ty = fy - j, tz = fz - k, n = G.n, o = i + n * (j + n * k), s2 = n * n, d = G.data;
    var a = (d[o] * (1 - tx) + d[o + 1] * tx) * (1 - ty) + (d[o + n] * (1 - tx) + d[o + n + 1] * tx) * ty;
    var b = (d[o + s2] * (1 - tx) + d[o + s2 + 1] * tx) * (1 - ty) + (d[o + s2 + n] * (1 - tx) + d[o + s2 + n + 1] * tx) * ty;
    return a * (1 - tz) + b * tz;
  }

  /* Height field of the scanned ear, seen along the canal axis. */
  function makeHF(hf) {
    if (!hf) return null;
    var n = hf.n, cell = hf.cell, half = hf.half, data = hf.data;
    return function (x, y) {
      var fx = (x + half) / cell, fy = (y + half) / cell;
      if (fx < 0 || fy < 0 || fx > n - 1.001 || fy > n - 1.001) return 50;
      var i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, o = i + n * j;
      return (data[o] * (1 - tx) + data[o + 1] * tx) * (1 - ty) + (data[o + n] * (1 - tx) + data[o + n + 1] * tx) * ty;
    };
  }

  function makePlug(P0, hfRaw) {
    var P = normalize(P0);
    var hf = P.fit ? makeHF(hfRaw) : null;
    var len = P.len, depth = P.depth, back = depth + 3;
    var phi = P.bendDir * DEG, bend = P.bend * DEG;
    var cph = Math.cos(phi), sph = Math.sin(phi);
    var ex = -sph, ey = cph; // bend plane normal
    var sb = Math.min(8, len * 0.7), wz = len * 0.55;
    var z0b = Math.max(0, sb - wz / 2), z1b = Math.min(len, sb + wz / 2);
    function alphaAt(s) {
      var t = (s - z0b) / (z1b - z0b);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return bend * t * t * (3 - 2 * t);
    }
    // centreline samples
    var M = 28, n = M + 2;
    var px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n), ps = new Float64Array(n);
    px[0] = 0; py[0] = 0; pz[0] = -back; ps[0] = -back;
    px[1] = 0; py[1] = 0; pz[1] = 0; ps[1] = 0;
    var ds = len / M;
    for (var i = 1; i <= M; i++) {
      var a = alphaAt((i - 0.5) * ds), sa = Math.sin(a), ca = Math.cos(a);
      px[i + 1] = px[i] + sa * cph * ds; py[i + 1] = py[i] + sa * sph * ds; pz[i + 1] = pz[i] + ca * ds; ps[i + 1] = i * ds;
    }
    var rx0 = P.canalW / 2, ry0 = P.canalH / 2, rb = P.bore / 2;
    var FG = P.filterOn ? FILTER : null, rs = FG ? FG.rad + Math.max(P.filterFit, 0) + 0.2 : P.seatDia / 2;
    var A = P.conchaW / 2, B = P.conchaH / 2, mAB = Math.min(A, B);
    var zf = -depth, zi = hf ? 4 : 0.6, H = zi - zf;
    var r1 = Math.min(1.5, H / 4), r2 = hf ? 1 : Math.min(H - r1 - 0.2, mAB * 0.8, H * 0.7);
    var zm = zf + r1 + (H - r1 - r2) / 2;
    var k = P.smooth, gap = P.gap;
    var qa = (cph * cph) / (A * A) + (sph * sph) / (B * B);
    var qb = -2 * (cph * P.offX / (A * A) + sph * P.offY / (B * B));
    var qc = (P.offX * P.offX) / (A * A) + (P.offY * P.offY) / (B * B) - 1;
    var disc = qb * qb - 4 * qa * qc, t0 = -A * 0.6, t1 = A * 0.6;
    if (disc > 0) { t0 = (-qb - Math.sqrt(disc)) / (2 * qa); t1 = (-qb + Math.sqrt(disc)) / (2 * qa); }
    var tBig = Math.abs(t1) >= Math.abs(t0) ? t1 : t0, tSmall = tBig === t1 ? t0 : t1;
    // cord ring on the outer face: stands in the mould parting plane, opening square to it
    var feat = P.cord ? 'ring' : P.grip ? 'grip' : null; // one add-on on the outer face
    var RR = 2.4, RT = 1.2, RZ = 2.0, STUD = feat === 'ring' ? RZ + RR + RT : 5, FW = feat === 'ring' ? RR + RT : 2.6;
    var ringT = (tBig < 0 ? -1 : 1) * Math.min(Math.abs(tBig) - 2.6, Math.max(0.62 * Math.abs(tBig), rs + 4));
    // engraved L or R on the outer face: the free spot farthest from seat, rim and cord ring
    var mark = null;
    if (P.marks) {
      var bestS = 0.2;
      for (var mi = 0; mi < 9; mi++) {
        var ma = mi * Math.PI / 4, mr = mi === 8 ? 0 : 0.5;
        var mx = P.offX + mr * A * Math.cos(ma), my = P.offY + mr * B * Math.sin(ma);
        var sc = Math.min(Math.sqrt(mx * mx + my * my) - rs - 2.7, (1 - mr) * mAB - 2.7);
        if (feat) sc = Math.min(sc, Math.sqrt((mx - cph * ringT) * (mx - cph * ringT) + (my - sph * ringT) * (my - sph * ringT)) - 6.3);
        if (sc > bestS) { bestS = sc; mark = { x: mx, y: my, ch: P.side === 'L' ? 'L' : 'R' }; }
      }
    }
    var dC = 0, dB = 0, cS = 0, cLt = 0, cTip = false; // outputs of canal()

    function canal(x, y, z) {
      var best = 1e30, bi = 0, bt = 0;
      for (var i = 0; i < n - 1; i++) {
        var ax = px[i], ay = py[i], az = pz[i];
        var bx = px[i + 1] - ax, by = py[i + 1] - ay, bz = pz[i + 1] - az;
        var vx = x - ax, vy = y - ay, vz = z - az;
        var t = (vx * bx + vy * by + vz * bz) / (bx * bx + by * by + bz * bz);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var qx = vx - bx * t, qy = vy - by * t, qz = vz - bz * t;
        var d2 = qx * qx + qy * qy + qz * qz;
        if (d2 < best) { best = d2; bi = i; bt = t; }
      }
      var s = ps[bi] + bt * (ps[bi + 1] - ps[bi]);
      var cx = px[bi] + bt * (px[bi + 1] - px[bi]), cy = py[bi] + bt * (py[bi + 1] - py[bi]), cz = pz[bi] + bt * (pz[bi + 1] - pz[bi]);
      var al = alphaAt(s), sa = Math.sin(al), ca = Math.cos(al), oc = 1 - ca;
      // frame: rotate X, Y, Z about the bend normal e by alpha
      var tx = sa * cph, ty = sa * sph, tz = ca;
      var ux = ca + ex * ex * oc, uy = ex * ey * oc, uz = -ey * sa;
      var wx = ex * ey * oc, wy = ca + ey * ey * oc, wz2 = ex * sa;
      var vx2 = x - cx, vy2 = y - cy, vz2 = z - cz;
      var lt = vx2 * tx + vy2 * ty + vz2 * tz;
      var lx = vx2 * ux + vy2 * uy + vz2 * uz;
      var ly = vx2 * wx + vy2 * wy + vz2 * wz2;
      var sc = s <= 0 ? 1 : 1 - (1 - P.taper) * (s / len);
      var rx = rx0 * sc, ry = ry0 * sc, m = Math.min(rx, ry);
      var ex2 = lx / rx, ey2 = ly / ry, et = lt / m;
      dC = (Math.sqrt(ex2 * ex2 + ey2 * ey2 + et * et) - 1) * m;
      dB = Math.sqrt(lx * lx + ly * ly) - rb;
      cS = s; cLt = lt; cTip = bi === n - 2 && bt >= 1;
    }

    function blob(x, y, z) {
      var X = (x - P.offX) / A, Y = (y - P.offY) / B;
      var d2 = (Math.sqrt(X * X + Y * Y) - 1) * mAB;
      var r, az;
      if (z < zm) { r = r1; az = zf - z + r; } else { r = r2; az = z - zi + r; }
      var ax = d2 + r;
      var mx = ax > 0 ? ax : 0, mz = az > 0 ? az : 0;
      return Math.sqrt(mx * mx + mz * mz) + Math.min(Math.max(ax, az), 0) - r;
    }

    function outer(x, y, z) {
      canal(x, y, z);
      var c = blob(x, y, z);
      if (hf) c = smax(c, (z - hf(x, y) + gap) * 0.8, 0.8);
      var d = smin(c, dC, k);
      var f = zf - z;
      if (f > d) d = f;
      if (mark && z < zf + 1.2) {
        var md = Math.max(letter(mark.ch, -(x - mark.x), y - mark.y, 1), z - zf - 0.5);
        if (-md > d) d = -md;
      }
      if (feat) {
        var ra = x * cph + y * sph - ringT, rb2 = -x * sph + y * cph;
        if (feat === 'ring') {
          var rc = z - (zf - RZ), rq = Math.sqrt(ra * ra + rc * rc) - RR;
          d = smin(d, Math.sqrt(rq * rq + rb2 * rb2) - RT, 0.8);
        } else { // removal grip: a rounded tab standing in the mould parting plane
          var gq = Math.abs(ra) - 1.4, gc = Math.abs(zf - 2.2 - z) - 1.6, gx2 = gq > 0 ? gq : 0, gc2 = gc > 0 ? gc : 0;
          var g2 = Math.sqrt(gx2 * gx2 + gc2 * gc2) + Math.min(Math.max(gq, gc), 0) - 1.2;
          d = smin(d, Math.max(g2, Math.abs(rb2) - 1.2), 0.8);
        }
      }
      return d;
    }
    /* the filter seat as a solid: a cylinder, or the shape of the uploaded filter grown by the fit */
    var seatTopZ = FG ? zf + P.filterSink + FG.dmax : zf + P.seatDepth, fct = Math.cos(P.filterTurn * DEG), fst = Math.sin(P.filterTurn * DEG);
    function seat(x, y, z) {
      if (FG) return fsample(FG, x * fct + y * fst, -x * fst + y * fct, z - zf - P.filterSink) - P.filterFit;
      return Math.max(Math.sqrt(x * x + y * y) - rs, z - seatTopZ);
    }
    function sdf(x, y, z) {
      var d = outer(x, y, z);
      if (rb > 0) d = smax(d, -dB, 0.5);
      if (rs > 0) d = smax(d, -seat(x, y, z), FG ? 0.2 : 0.5);
      return d;
    }

    /* for the mould: the bore core as its own solid. Tapered from 3 mm at the seat to the bore size at the tip,
       and running 2.5 mm past the tip into a socket. Valid right after outer(). */
    var coreS0 = rs > 0 ? Math.min(-0.5, seatTopZ) : -depth, coreBase = Math.max(rb, 1.5), mTip = Math.min(rx0, ry0) * P.taper;
    function core(extra, taper) {
      var t = (len - cS) / (len - coreS0); t = t < 0 ? 0 : t > 1 ? 1 : t;
      var d = dB + rb - (rb + (taper ? (coreBase - rb) * t : 0)) - extra;
      if (cTip) { var e = cLt - (mTip + 2.5 + extra); if (e > d) d = e; }
      return d;
    }

    /* extent of the outer shape along a horizontal unit direction */
    function extent(dx, dy) {
      var c = P.offX * dx + P.offY * dy, e = Math.sqrt(A * dx * A * dx + B * dy * B * dy);
      var lo = c - e, hi = c + e, rm = Math.max(rx0, ry0);
      for (var i = 0; i < n; i++) {
        var v = px[i] * dx + py[i] * dy;
        if (v - rm < lo) lo = v - rm;
        if (v + rm > hi) hi = v + rm;
      }
      if (feat) { // ring or grip can reach past the rim
        var rv = ringT * (cph * dx + sph * dy);
        if (rv - FW < lo) lo = rv - FW;
        if (rv + FW > hi) hi = rv + FW;
      }
      return [lo, hi];
    }
    var zmax = zi;
    for (var j = 0; j < n; j++) if (pz[j] + Math.max(rx0, ry0) > zmax) zmax = pz[j] + Math.max(rx0, ry0);
    var bxr = extent(1, 0), byr = extent(0, 1), pad = 1.5 + k / 4 + 0.8;
    var tipWall = Math.min(rx0, ry0) * P.taper - rb;

    return {
      P: P, sdf: sdf, outer: outer, core: core, seat: seat, track: canal, rb: rb, rs: rs, cl: { x: px, y: py, z: pz, n: n }, extent: extent, zmax: zmax, zf: zf,
      tipWall: rb > 0 ? tipWall : null, tBig: tBig, tSmall: tSmall, stud: feat ? STUD : 0, ringT: ringT, pin: function () { return dB + rb; },
      bounds: { x0: bxr[0] - pad, x1: bxr[1] + pad, y0: byr[0] - pad, y1: byr[1] + pad, z0: zf - pad - (feat ? STUD : 0), z1: zmax + pad }
    };
  }

  /* One ear's share of the mould, in that ear's local frame: parting plane Y = 0, outer face at z = zf. */
  function earMould(plug, W, taper) {
    var P = plug.P, phi = P.bendDir * DEG, c = Math.cos(phi), s = Math.sin(phi);
    var hasCap = !P.ventMode && (plug.rb > 0 || plug.rs > 0), rsh = Math.max(plug.rs, 2.5), zf = plug.zf;
    var sgn = plug.tBig < 0 ? -1 : 1, ribS = P.side === 'L' ? -1 : 1, notches = P.side === 'L' ? 1 : 2;
    var xs = plug.stud ? plug.ringT : sgn * Math.max(0.62 * Math.abs(plug.tBig), hasCap ? rsh + 3.1 : 0), xr = plug.tSmall * 0.7;
    var spMax = hasCap ? Math.max(2.5, Math.abs(xs) - rsh - 0.6) : 99, gx = -sgn * rsh, zOut = zf - W - plug.stud;
    /* cap: handle bar outside the block, keyed shaft through the wall, filter seat and bore core */
    function cap(X, Y, Z, ex, tracked) {
      var rad = Math.sqrt(X * X + Y * Y);
      var d = Math.max(rad - rsh - ex, Z - zf - ex);
      if (plug.rs > 0) d = Math.min(d, Math.max(plug.seat(c * X - s * Y, s * X + c * Y, Z), zf - 1 - Z));
      d = Math.min(d, Math.max(Math.abs(X) - 0.8 - ex, Math.abs(Y * ribS - rsh - 0.45) - 0.75 - ex, Z - (zf - 1.5) - ex));
      var bar = Math.max(Math.abs(X) - rsh, Math.abs(Y) - rsh - 4, Math.abs(Z - zOut + 1) - 1);
      for (var i = 0; i < notches; i++) { // 1 notch = left, 2 notches = right
        var nx = X - (i - (notches - 1) / 2) * 2.6, ny = Y * ribS - rsh - 4;
        bar = Math.max(bar, 0.9 - Math.sqrt(nx * nx + ny * ny));
      }
      d = Math.min(d, bar);
      if (plug.rb > 0) { if (!tracked) plug.track(c * X - s * Y, s * X + c * Y, Z); d = Math.min(d, plug.core(ex, taper)); }
      return Math.max(d, zOut - 2 - Z);
    }
    function vent(X, Y, Z) { return Math.max(Math.sqrt((X - gx) * (X - gx) + Y * Y) - 0.8, Z - zf - 0.4); }
    /* everything this ear removes from the block, as one signed value to max() with */
    function cut(X, Y, Z) {
      var d = -plug.outer(c * X - s * Y, s * X + c * Y, Z);
      if (hasCap) { d = Math.max(d, -cap(X, Y, Z, 0.15, true), -vent(X, Y, Z)); }
      if (P.ventMode && plug.rb > 0) d = Math.max(d, plug.rb + 0.05 - plug.pin()); // channel for a wire that forms the vent
      var up = zf - Z, us = up - plug.stud;
      if (us > (plug.stud ? -0.9 : -0.6)) d = Math.max(d, Math.min((plug.stud ? 1.1 : 2.5) + Math.max(us, 0) * 0.5, spMax) - Math.sqrt((X - xs) * (X - xs) + Y * Y));
      if (!hasCap && up > -0.6) d = Math.max(d, 1.2 - Math.sqrt((X - xr) * (X - xr) + Y * Y));
      return d;
    }
    // tight box around the cap for meshing
    var cx0 = -rsh - 1, cx1 = rsh + 1, cy0 = -rsh - 5, cy1 = rsh + 5, L = plug.cl;
    for (var i = 0; i < L.n; i++) {
      var lx = c * L.x[i] + s * L.y[i], ly = -s * L.x[i] + c * L.y[i];
      cx0 = Math.min(cx0, lx - 2.5); cx1 = Math.max(cx1, lx + 2.5); cy0 = Math.min(cy0, ly - 2.5); cy1 = Math.max(cy1, ly + 2.5);
    }
    // the core runs on past the tip, along the tip direction
    var q = L.n - 1, tx = L.x[q] - L.x[q - 1], ty = L.y[q] - L.y[q - 1], tz = L.z[q] - L.z[q - 1], tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    var over = Math.min(P.canalW, P.canalH) / 2 * P.taper + 4, ex2 = L.x[q] + tx / tl * over, ey2 = L.y[q] + ty / tl * over, ez2 = L.z[q] + tz / tl * over;
    var elx = c * ex2 + s * ey2, ely = -s * ex2 + c * ey2;
    cx0 = Math.min(cx0, elx - 2); cx1 = Math.max(cx1, elx + 2); cy0 = Math.min(cy0, ely - 2); cy1 = Math.max(cy1, ely + 2);
    return { plug: plug, eX: plug.extent(c, s), eY: plug.extent(-s, c), zf: zf, len: plug.zmax - zf, cut: cut, hasCap: hasCap,
      capSdf: function (X, Y, Z) { return Math.max(cap(X, Y, Z, 0, false), -vent(X, Y, Z)); },
      capBounds: { x0: cx0 - 1, x1: cx1 + 1, y0: cy0 - 1, y1: cy1 + 1, z0: zOut - 3.2, z1: Math.max(plug.zmax, ez2) + 3 }, zBase: zOut - 2 };
  }

  /* One mould block for both ears. Left cavity at -X, right at +X, outer faces level at Z = 0. */
  function makeMould(plugs, o) {
    var W = o.mouldWall, E = plugs.map(function (p) { return earMould(p, W, o.coreTaper); });
    var gap = Math.max(6, W + 1), stud = plugs[0].stud;
    E[0].ox = -gap / 2 - E[0].eX[1]; E[1].ox = gap / 2 - E[1].eX[0];
    var bx0 = E[0].ox + E[0].eX[0] - W, bx1 = E[1].ox + E[1].eX[1] + W;
    var by0 = Math.min(E[0].eY[0], E[1].eY[0]) - W, by1 = Math.max(E[0].eY[1], E[1].eY[1]) + W;
    var bz0 = -W - stud, bz1 = Math.max(E[0].len, E[1].len) + W;
    var cxm = (bx0 + bx1) / 2, cym = (by0 + by1) / 2, czm = (bz0 + bz1) / 2, hx = (bx1 - bx0) / 2, hy = (by1 - by0) / 2, hz = (bz1 - bz0) / 2, rr = 1;
    var pz = bz1 - 2.6, PX = [bx0 + 2.6, 0, bx1 - 2.6], zc = (bz0 + bz1) / 2;
    function block(X, Y, Z) {
      var qx = Math.abs(X - cxm) - hx + rr, qy = Math.abs(Y - cym) - hy + rr, qz = Math.abs(Z - czm) - hz + rr;
      var ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      var d = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rr;
      if (d > 1) return d;
      var e = X < 0 ? E[0] : E[1], k = e.cut(X - e.ox, Y, Z + e.zf);
      return k > d ? k : d;
    }
    function pins(X, Y, Z, r) {
      var best = 1e9;
      for (var i = 0; i < 3; i++) { var a = Math.sqrt((X - PX[i]) * (X - PX[i]) + Y * Y + (Z - pz) * (Z - pz)) - r; if (a < best) best = a; }
      return best;
    }
    function halfB(X, Y, Z) {
      var d = Math.max(Math.max(block(X, Y, Z), Y), -pins(X, Y, Z, 1.95));
      if (o.marks && Y > -1.2) { // L and R engraved in the side walls of the parting face
        var m = Math.min(letter('L', X - (bx0 + W / 2), -(Z - zc), 1), letter('R', X - (bx1 - W / 2), -(Z - zc), 1));
        d = Math.max(d, -Math.max(m, -Y - 0.5));
      }
      return d;
    }
    var pad = 1.2;
    return { E: E, halves: [
      { name: 'mould_A', sdf: function (X, Y, Z) { return Math.min(Math.max(block(X, Y, Z), -Y), pins(X, Y, Z, 1.7)); },
        bounds: { x0: bx0 - pad, x1: bx1 + pad, y0: -1.7 - pad, y1: by1 + pad, z0: bz0 - pad, z1: bz1 + pad } },
      { name: 'mould_B', sdf: halfB,
        bounds: { x0: bx0 - pad, x1: bx1 + pad, y0: by0 - pad, y1: pad, z0: bz0 - pad, z1: bz1 + pad } }] };
  }

  /* Case for the pair: cavities are the negative of the left and right plug. Plugs lie on their side.
     Axes: u across (left plug at -u), v along the plugs (hinge at +v, latch at -v), w up. */
  function makeCase(plugs, o) {
    var cl = o.caseFit, gap = 3, M = 4.7, R = 6, lipH = 2.5, fl = 1.6;
    var E = plugs.map(function (plug) {
      var phi = plug.P.bendDir * DEG, c = Math.cos(phi), s = Math.sin(phi);
      return { plug: plug, c: c, s: s, eX: plug.extent(c, s), eY: plug.extent(-s, c), z0: plug.zf - plug.stud, z1: plug.zmax };
    });
    E[0].ou = -gap / 2 - E[0].eX[1]; E[1].ou = gap / 2 - E[1].eX[0];
    var S0 = E[0].ou + E[0].eX[0], S1 = E[1].ou + E[1].eX[1], uc = (S0 + S1) / 2;
    E.forEach(function (e) { e.ou -= uc; e.mz = (e.z0 + e.z1) / 2; });
    var ext = o.caseMagnets ? 5 : 0, vOff = ext / 2;
    var hx = (S1 - S0) / 2 + M, hy = Math.max(E[0].z1 - E[0].z0, E[1].z1 - E[1].z0) / 2 + M + ext / 2;
    var wb = -Math.max(E[0].eY[1], E[1].eY[1]) - cl - fl, wt = -Math.min(E[0].eY[0], E[1].eY[0]) + cl + fl;
    var lf = hy - 1.85, va = hy + 2.9, kr = 2.6, Lh = hx * 0.7, mgV = -(hy - 5.7), mgU = hx * 0.45, lpU = hx + 2.4;
    function rr(x, y, d) {
      var r = R - d, qx = Math.abs(x) - hx + d + r, qy = Math.abs(y) - hy + d + r, ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
      return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
    }
    function cav(u, v, w) {
      var e = u < 0 ? E[0] : E[1], X = u - e.ou, Y = -w, Z = v - vOff + e.mz;
      return e.plug.outer(e.c * X - e.s * Y, e.s * X + e.c * Y, Z) - cl;
    }
    function bead(u, v, w, r) { // click ridge: front only with a hinge, front and back without
      var dv = (o.caseHinge ? -v : Math.abs(v)) - lf, dw = w - 1.4;
      return Math.max(Math.sqrt(dv * dv + dw * dw) - r, Math.abs(u) - hx * 0.45);
    }
    function magnets(u, v) { var du = Math.abs(u) - mgU, dv = v - mgV; return Math.sqrt(du * du + dv * dv) - 2.1; }
    function knuckle(v, w) { return Math.sqrt((v - va) * (v - va) + w * w); }
    function base(u, v, w) {
      var d = Math.max(rr(u, v, 0), wb - w, w);
      var lip = Math.max(rr(u, v, 1.85), -rr(u, v, 3.05), -w - 1, w - lipH);
      if (o.caseHinge) lip = Math.max(lip, v - (hy - 4.5));
      d = Math.min(d, lip);
      if (!o.caseMagnets) d = Math.min(d, bead(u, v, w, 0.6));
      if (o.caseHinge) { // two outer knuckles with a 45 degree web down to the wall
        var web = Math.max(hy - 0.5 - v, v - va, w + 0.15, v - hy - w - 6.58);
        d = Math.min(d, Math.max(Math.min(knuckle(v, w) - kr, web), Lh / 3 + 0.2 - Math.abs(u), Math.abs(u) - Lh));
        d = Math.max(d, 1 - knuckle(v, w));
      }
      if (o.caseLoop) { var q = Math.sqrt((u - lpU) * (u - lpU) + v * v); d = Math.min(d, Math.max(Math.abs(q - 2.7) - 0.9, wb - w, w - wb - 2.5)); }
      if (o.caseMagnets) d = Math.max(d, -Math.max(magnets(u, v), -w - 2.2));
      if (d < 1) d = Math.max(d, -cav(u, v, w));
      return d;
    }
    function lid(u, v, w) {
      var d = Math.max(rr(u, v, 0), -w, w - wt);
      d = Math.max(d, -Math.max(rr(u, v, 1.6), -rr(u, v, 3.3), w - lipH - 0.25));
      if (!o.caseMagnets) d = Math.max(d, -bead(u, v, w, 0.8));
      if (o.caseHinge) { // centre knuckle
        var web = Math.max(hy - 0.5 - v, v - va, 0.15 - w, v - hy + w - 6.58);
        d = Math.min(d, Math.max(Math.min(knuckle(v, w) - kr, web), Math.abs(u) - Lh / 3 + 0.2));
        d = Math.max(d, 1 - knuckle(v, w));
      }
      if (o.caseMagnets) d = Math.max(d, -Math.max(magnets(u, v), w - 2.2));
      if (o.marks && w > wt - 1.2) { // L and R on the lid top
        var m = Math.min(letter('L', u + hx / 2, v, 2), letter('R', u - hx / 2, v, 2));
        d = Math.max(d, -Math.max(m, wt - 0.5 - w));
      }
      if (d < 1) d = Math.max(d, -cav(u, v, w));
      return d;
    }
    var p = 1.2, y1 = hy + (o.caseHinge ? 5.6 : 0) + p, x1 = hx + (o.caseLoop ? 6.2 : 0) + p;
    return { wb: wb, wt: wt, parts: [
      { name: 'case_base', sdf: base, bounds: { x0: -hx - p, x1: x1, y0: -hy - p, y1: y1, z0: wb - p, z1: Math.max(lipH, o.caseHinge ? kr : 0) + p } },
      { name: 'case_lid', sdf: lid, bounds: { x0: -hx - p, x1: hx + p, y0: -hy - p, y1: y1, z0: (o.caseHinge ? -kr : 0) - p, z1: wt + p } }] };
  }

  /* One sizing gauge: canal tip on a flange. Holes in the rim count the variant; rim notches say which ear
     (1 = left, 2 = right). spec: { w, h, bend, count } */
  function makeGauge(P0, spec) {
    var Q = {};
    for (var key in P0) Q[key] = P0[key];
    Q.canalW = spec.w; Q.canalH = spec.h; Q.bend = spec.bend; Q.depth = 2.2; Q.bore = 0; Q.seatDia = 0; Q.fit = false; Q.solid = false;
    Q.conchaW = spec.w + 11; Q.conchaH = spec.h + 11; Q.offX = 0; Q.offY = 0; Q.smooth = 1.2;
    Q.cord = false; Q.grip = false; Q.vent = false; Q.marks = false; Q.filterOn = false;
    var plug = makePlug(Q, null), cuts = [], i, th, n = P0.side === 'L' ? 1 : 2;
    for (i = 0; i < spec.count; i++) {
      th = (-90 + (i - (spec.count - 1) / 2) * 24) * DEG;
      cuts.push([(spec.w / 2 + 3) * Math.cos(th), (spec.h / 2 + 3) * Math.sin(th), 0.8]);
    }
    for (i = 0; i < n; i++) {
      th = (90 + (i - (n - 1) / 2) * 30) * DEG;
      cuts.push([(spec.w / 2 + 5.5) * Math.cos(th), (spec.h / 2 + 5.5) * Math.sin(th), 1.1]);
    }
    function sdf(x, y, z) {
      var d = plug.outer(x, y, z);
      for (var i = 0; i < cuts.length; i++) {
        var h = Math.sqrt((x - cuts[i][0]) * (x - cuts[i][0]) + (y - cuts[i][1]) * (y - cuts[i][1])) - cuts[i][2];
        d = smax(d, -h, 0.3);
      }
      return d;
    }
    return { sdf: sdf, bounds: plug.bounds };
  }

  /* Naive surface nets: smooth, watertight quads from a sampled field. */
  function surfaceNets(f, b, h) {
    var nx = Math.ceil((b.x1 - b.x0) / h) + 1, ny = Math.ceil((b.y1 - b.y0) / h) + 1, nz = Math.ceil((b.z1 - b.z0) / h) + 1;
    var vals = new Float32Array(nx * ny * nz), i, j, k, o = 0;
    for (k = 0; k < nz; k++) { var z = b.z0 + k * h; for (j = 0; j < ny; j++) { var y = b.y0 + j * h; for (i = 0; i < nx; i++) vals[o++] = f(b.x0 + i * h, y, z); } }
    var cx = nx - 1, cy = ny - 1, cz = nz - 1;
    var cell = new Int32Array(cx * cy * cz).fill(-1);
    var pos = [], nv = 0;
    var sx = 1, sy = nx, sz = nx * ny;
    var off = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz];
    var EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
    var v = new Float64Array(8);
    for (k = 0; k < cz; k++) for (j = 0; j < cy; j++) for (i = 0; i < cx; i++) {
      var base = i + nx * (j + ny * k), mask = 0, c;
      for (c = 0; c < 8; c++) { v[c] = vals[base + off[c]]; if (v[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      var ax = 0, ay = 0, az = 0, cnt = 0;
      for (var e = 0; e < 12; e++) {
        var a = EA[e], bb = EB[e];
        if ((v[a] < 0) === (v[bb] < 0)) continue;
        var t = v[a] / (v[a] - v[bb]);
        ax += (a & 1) + ((bb & 1) - (a & 1)) * t;
        ay += ((a >> 1) & 1) + (((bb >> 1) & 1) - ((a >> 1) & 1)) * t;
        az += ((a >> 2) & 1) + (((bb >> 2) & 1) - ((a >> 2) & 1)) * t;
        cnt++;
      }
      pos.push(b.x0 + (i + ax / cnt) * h, b.y0 + (j + ay / cnt) * h, b.z0 + (k + az / cnt) * h);
      cell[i + cx * (j + cy * k)] = nv++;
    }
    var idx = [];
    function quad(a, b2, c2, d, flip) {
      if (a < 0 || b2 < 0 || c2 < 0 || d < 0) return;
      if (flip) idx.push(a, c2, b2, a, d, c2); else idx.push(a, b2, c2, a, c2, d);
    }
    function C(i, j, k) { return cell[i + cx * (j + cy * k)]; }
    for (k = 1; k < cz; k++) for (j = 1; j < cy; j++) for (i = 1; i < cx; i++) {
      var n0 = i + nx * (j + ny * k), v0 = vals[n0] < 0;
      if (v0 !== (vals[n0 + sx] < 0)) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !v0);
      if (v0 !== (vals[n0 + sy] < 0)) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), !v0);
      if (v0 !== (vals[n0 + sz] < 0)) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !v0);
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
  }

  /* Taubin smoothing: removes grid texture without shrinking the part. */
  function smoothMesh(m, iters) {
    var pos = m.pos, idx = m.idx, n = pos.length / 3;
    var sum = new Float32Array(n * 3), cnt = new Uint16Array(n);
    for (var it = 0; it < iters * 2; it++) {
      var f = (it % 2 === 0) ? 0.5 : -0.53;
      sum.fill(0); cnt.fill(0);
      for (var t = 0; t < idx.length; t += 3) {
        for (var e = 0; e < 3; e++) {
          var a = idx[t + e], b = idx[t + (e + 1) % 3], a3 = a * 3, b3 = b * 3;
          sum[a3] += pos[b3]; sum[a3 + 1] += pos[b3 + 1]; sum[a3 + 2] += pos[b3 + 2]; cnt[a]++;
          sum[b3] += pos[a3]; sum[b3 + 1] += pos[a3 + 1]; sum[b3 + 2] += pos[a3 + 2]; cnt[b]++;
        }
      }
      for (var i = 0; i < n; i++) {
        if (!cnt[i]) continue;
        var i3 = i * 3, c = 1 / cnt[i];
        pos[i3] += f * (sum[i3] * c - pos[i3]);
        pos[i3 + 1] += f * (sum[i3 + 1] * c - pos[i3 + 1]);
        pos[i3 + 2] += f * (sum[i3 + 2] * c - pos[i3 + 2]);
      }
    }
    return m;
  }

  function volume(m) {
    var p = m.pos, ix = m.idx, v = 0;
    for (var t = 0; t < ix.length; t += 3) {
      var a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    return v / 6;
  }
  function size(m) {
    var p = m.pos, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (var i = 0; i < p.length; i += 3) for (var a = 0; a < 3; a++) { if (p[i + a] < lo[a]) lo[a] = p[i + a]; if (p[i + a] > hi[a]) hi[a] = p[i + a]; }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  }

  function nonManifold(m) {
    var e = new Map(), nv = m.pos.length / 3, ix = m.idx;
    for (var t = 0; t < ix.length; t += 3) for (var k = 0; k < 3; k++) {
      var a = ix[t + k], b = ix[t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a;
      e.set(key, (e.get(key) || 0) + 1);
    }
    var bad = 0;
    e.forEach(function (v) { if (v !== 2) bad++; });
    return bad;
  }
  /* Extract, and if the grid produced a pinched edge, retry on a shifted grid. */
  function mesh(f, b, res, iters, strict) {
    var m = null;
    for (var a = 0; a < (strict ? 5 : 1); a++) {
      var o = a * res * 0.21;
      m = surfaceNets(f, { x0: b.x0 - o, x1: b.x1, y0: b.y0 - o * 0.7, y1: b.y1, z0: b.z0 - o * 1.3, z1: b.z1 }, res);
      if (!strict || nonManifold(m) === 0) break;
    }
    return smoothMesh(m, iters);
  }

  /* Lay parts out for printing: each drops to z = 0, in a row along x. */
  function plate(meshes) {
    var x = 0;
    meshes.forEach(function (m) {
      var p = m.pos, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, a;
      for (i = 0; i < p.length; i += 3) for (a = 0; a < 3; a++) { if (p[i + a] < lo[a]) lo[a] = p[i + a]; if (p[i + a] > hi[a]) hi[a] = p[i + a]; }
      var cy = (lo[1] + hi[1]) / 2;
      for (i = 0; i < p.length; i += 3) { p[i] += x - lo[0]; p[i + 1] -= cy; p[i + 2] -= lo[2]; }
      x += hi[0] - lo[0] + 5;
    });
    var half = (x - 5) / 2;
    meshes.forEach(function (m) { for (var i = 0; i < m.pos.length; i += 3) m.pos[i] -= half; });
    return meshes;
  }

  /* kind: 'plug' | 'mould' | 'case' | 'kit'. DS = { L: params, R: params }, HF = { L: heightfield, R: ... }.
     Plugs come back in their own ear frame; all other kinds come back laid out for printing. */
  function generate(kind, DS, HF, res, strict) {
    var out = [], stats = {}, sides = ['L', 'R'], o = DS.R;
    HF = HF || {};
    if (kind === 'plug') {
      sides.forEach(function (sd) {
        var pl = makePlug(DS[sd], HF[sd]), m = mesh(pl.sdf, pl.bounds, res, 4, strict);
        out.push({ name: 'plug_' + sd, pos: m.pos, idx: m.idx });
        if (pl.tipWall != null) stats.tipWall = Math.min(stats.tipWall == null ? 99 : stats.tipWall, pl.tipWall);
      });
      return { meshes: out, stats: stats };
    }
    var plugs = sides.map(function (sd) { return makePlug(DS[sd], HF[sd]); });
    if (kind === 'mould') {
      var mo = makeMould(plugs, o);
      mo.halves.forEach(function (h, i) {
        var hm = mesh(h.sdf, h.bounds, res, 2, strict), p = hm.pos;
        for (var v = 0; v < p.length; v += 3) { // turn the cavity side up
          var y = p[v + 1], z = p[v + 2];
          if (i === 0) { p[v + 1] = z; p[v + 2] = -y; } else { p[v + 1] = -z; p[v + 2] = y; }
        }
        out.push({ name: h.name, pos: p, idx: hm.idx });
      });
      mo.E.forEach(function (e, i) {
        if (!e.hasCap) return;
        var cm = mesh(e.capSdf, e.capBounds, res * 0.7, 2, strict);
        out.push({ name: 'mould_core_' + sides[i], pos: cm.pos, idx: cm.idx });
      });
    } else if (kind === 'case') {
      var cs = makeCase(plugs, o);
      cs.parts.forEach(function (part, i) {
        var cm = mesh(part.sdf, part.bounds, res, 1, strict), cp = cm.pos;
        if (i === 1) for (var v = 0; v < cp.length; v += 3) { cp[v] = -cp[v]; cp[v + 2] = cs.wt - cp[v + 2]; } // lid top side down
        out.push({ name: part.name, pos: cp, idx: cm.idx });
      });
    } else { // sizing kit: one row of gauges per ear
      var rows = sides.map(function (sd) {
        var P = DS[sd], specs = [];
        if (o.kitMode === 'fine') [-0.12, -0.06, 0, 0.06, 0.12].forEach(function (f, i) { specs.push({ w: P.canalW * (1 + f), h: P.canalH * (1 + f), bend: P.bend, count: i + 1 }); });
        else if (o.kitMode === 'bends') [-10, 0, 10].forEach(function (b, i) { specs.push({ w: P.canalW, h: P.canalH, bend: Math.max(0, Math.min(50, P.bend + b)), count: i + 1 }); });
        else SIZES.forEach(function (S, i) { specs.push({ w: S.w, h: S.h, bend: P.bend, count: i + 1 }); });
        return plate(specs.map(function (sp, i) {
          var ga = makeGauge(P, sp), gm = mesh(ga.sdf, ga.bounds, res, 3, strict);
          return { name: 'gauge_' + sd + '_' + (i + 1), pos: gm.pos, idx: gm.idx };
        }));
      });
      var depth = rows.map(function (row) { var m = 0; row.forEach(function (g) { for (var i = 1; i < g.pos.length; i += 3) m = Math.max(m, Math.abs(g.pos[i])); }); return m; });
      rows.forEach(function (row, r) { var dy = (r === 0 ? -1 : 1) * (depth[r] + 2.5); row.forEach(function (g) { for (var i = 1; i < g.pos.length; i += 3) g.pos[i] += dy; out.push(g); }); });
      return { meshes: out, stats: stats };
    }
    return { meshes: plate(out), stats: stats };
  }

  /* Every print file for one design: one STL plate per product. */
  function buildPackage(DS, HF, progress) {
    var steps = [['plug', 0.25, 'plugs'], ['mould', 0.32, 'mould'], ['case', 0.28, 'case'], ['kit', 0.3, 'sizing_kit']], files = [];
    steps.forEach(function (st, i) {
      if (progress) progress(i + 1, steps.length);
      var r = generate(st[0], DS, HF, st[1], true);
      files.push({ name: st[2] + '.stl', data: stl(st[0] === 'plug' ? plate(r.meshes) : r.meshes) });
    });
    return files;
  }

  function stl(list) {
    if (!list.length) list = [list];
    var nt = 0; list.forEach(function (m) { nt += m.idx.length / 3; });
    var buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf), o = 84;
    dv.setUint32(80, nt, true);
    list.forEach(function (m) {
      var p = m.pos, ix = m.idx;
      for (var t = 0; t < ix.length; t += 3) {
        var a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        var vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
        dv.setFloat32(o + 12, p[a], true); dv.setFloat32(o + 16, p[a + 1], true); dv.setFloat32(o + 20, p[a + 2], true);
        dv.setFloat32(o + 24, p[b], true); dv.setFloat32(o + 28, p[b + 1], true); dv.setFloat32(o + 32, p[b + 2], true);
        dv.setFloat32(o + 36, p[c], true); dv.setFloat32(o + 40, p[c + 1], true); dv.setFloat32(o + 44, p[c + 2], true);
        o += 50;
      }
    });
    return new Uint8Array(buf);
  }

  var CRC = null;
  function crc32(u8) {
    if (!CRC) { CRC = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  /* Zip. files: [{name, data: Uint8Array, comp?: Uint8Array of raw-deflated data}] */
  function zip(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = new Uint8Array(f.name.split('').map(function (ch) { return ch.charCodeAt(0) & 127; }));
      var crc = crc32(f.data), sz = f.data.length, body = f.comp || f.data, csz = body.length, meth = f.comp ? 8 : 0;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, meth, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, csz, true); lh.setUint32(22, sz, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, body);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(10, meth, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, csz, true); ch.setUint32(24, sz, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + csz;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (a, b) { return a + b.length; }, 0), out = new Uint8Array(total), o = 0;
    all.forEach(function (u) { out.set(u, o); o += u.length; });
    return out;
  }

  var api = { SIZES: SIZES, BENDS: BENDS, DEFAULTS: DEFAULTS, generate: generate, buildPackage: buildPackage, setFilter: function (g) { FILTER = g; }, stl: stl, zip: zip, volume: volume };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EarCore = api;

  /* Worker entry: only active when loaded inside a Web Worker. */
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    var HF = {};
    root.onmessage = function (ev) {
      var d = ev.data;
      if (d.type === 'hf') { HF[d.side] = d.hf; return; }
      if (d.type === 'filter') { FILTER = d.grid; return; }
      try {
        if (d.type === 'package') {
          var files = buildPackage(d.design, HF, function (i, n) { root.postMessage({ progress: i, of: n }); });
          root.postMessage({ files: files }, files.map(function (f) { return f.data.buffer; }));
          return;
        }
        var r = generate(d.kind, d.design, HF, d.res, false);
        var tr = [];
        r.meshes.forEach(function (m) { tr.push(m.pos.buffer, m.idx.buffer); });
        root.postMessage({ job: d.job, kind: d.kind, meshes: r.meshes, stats: r.stats }, tr);
      } catch (err) { root.postMessage({ job: d.job, error: String(err && err.message || err) }); }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
