/*
 * ASCII Cat for a Codex pet: the cat drawing code copied verbatim from
 * One Page is all you need, page/template.html (https://github.com/pursurer/one-page-is-all-you-need)
 * lines 5110-5138 (header, constants, state), 5140-5484 (model, draw) and 5508-5514 (lookPoint).
 * Only the wrapper differs: the canvas is passed in, the page's DOM pieces are stubs, and set() lets a
 * caller pose the cat (st, t, pos, dpr and the blink/tail timers) for one frame at a time.
 */
/*
 * The cat. Decoration only, like the koi: a round black cat with big black
 * eyes ringed in gold, drawn in character cells. It never stops on anything
 * you need to read: every place it sits is checked against the text, charts
 * and controls around it. While the reader scrolls, it trots or pounces to
 * the number or key word the agent marked and plays with it: it bats a lake-blue
 * yarn ball that bounces over the digits. They hop when the news is good,
 * sink when it is bad and flip on the countdown. Under a to-do the ball rolls
 * along the key words and leaves a twisted thread there for a few seconds.
 * While today's five fills the middle of the screen, the cat keeps to it. Point
 * at a pick, or tab to it, and the cat rolls the ball under that pick too.
 */
function makeCat(cv, env) {
  const { DESIGN, isDark } = env;
  const ctx = cv.getContext("2d");
  const ball = null, layer = null;
  /* Canvas size and the feet's place in it. */
  const W = 120, H = 96, AX = 60, AY = 94;
  const SCALES = [0.7, 0.58, 0.48];
  /* Trial v8: its size by the pond at the end of the page; the canvas is drawn finer by as much, so it stays sharp. */
  const FOOT_S = 1.3, ZOOM = DESIGN.footCat ? FOOT_S : 1;
  const footZone = () => { const r = document.getElementById("slot-foot")?.getBoundingClientRect(); return r && r.height && r.bottom > 0 && r.top < window.innerHeight ? r : null; };
  const st = { pose: "sit", dir: -1, eye: "open", ears: 0, tilt: 0, arm: null, tailUp: false, look: null, lid: 0, knead: false, yawnAt: null, washAt: 0, run: 0 };
  let dpr = 0, t = 0, last = 0, drawnAt = 0, blinkUntil = 0, nextBlink = 2.5, idleAt = 0, checkAt = 0, wideUntil = 0, tailSpeed = 2.2;
  let pos = null, current = null, busy = false, hidden = true, targets = [], LR = null, threadAt = 0;
  let pointer = null, pointerAt = -1e9, lastY = window.scrollY, wish = null, stay = null, overRow = null, bank = null;
  const threads = new Map(), played = new Map(), laid = new Map();
  /* ── the cat as shapes, in its own units: feet at 0,0, up is negative ── */
  const RANK = { tail: 0, body: 1, leg: 2, paw: 3, head: 4, front: 5 };
  const E = (x, y, rx, ry, p, a = 0) => ({ k: "e", x, y, rx, ry, a, p });
  const C = (x1, y1, x2, y2, r1, r2, p) => ({ k: "c", x1, y1, x2, y2, r1, r2, p });
  const xy = q => ({ x: q[0], y: q[1] });
  const rot = (q, o, a) => { const c = Math.cos(a), s = Math.sin(a), dx = q[0] - o[0], dy = q[1] - o[1]; return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c]; };
  const chain = (q, r1, r2, p) => q.slice(1).map((b, i) => C(q[i][0], q[i][1], b[0], b[1], r1 + (r2 - r1) * i / (q.length - 1), r1 + (r2 - r1) * (i + 1) / (q.length - 1), p));

  /* Soft shapes melt into each other where they meet, which keeps the head and body round like a plush toy. */
  const S = (x, y, rx, ry, p, a = 0) => ({ k: "e", x, y, rx, ry, a, p, soft: true });

  function model() {
    const sh = [], eyes = [], pads = [], whisk = [], pinks = [], tp = t * tailSpeed, fl = st.ears;
    if (st.pose === "sit") {
      /* Sitting, seen from the front: a round loaf, a short fat tail curled up the right side. */
      const a = Math.sin(tp) * 0.16;
      const tail = st.tailUp ? [[10, -4], [18, -6], [24, -12], [26, -19.5], [25, -26.5]]
        : [[10, -4], [17.5, -5], [22, -10], [24, -16.5], [24.5, -21.5]].map(q => rot(q, [12, -5], a));
      sh.push(...chain(tail, 6.6, 6, "tail"));
      const br = Math.sin(t * 1.9) * 0.5;
      sh.push(S(0, -13.5 - br * 0.5, 19.5, 13.5 + br, "body"), S(0, -7, 20.5, 7, "body"));
      /* The head tilts around the neck, and lifts a little in a yawn. */
      const yawn = st.yawnAt === null ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, (t - st.yawnAt) / 1.7))) ** 0.6;
      const tl = st.tilt, R = q => rot([q[0], q[1] - yawn * 1.5], [0, -27], tl);
      /* Kneading: the front paws press down in turn. */
      const kn = st.knead ? Math.sin(t * 7) : 0, press = q => Math.max(0, q * kn) * 2.2;
      sh.push(C(6, -15, 6, -4.5 - press(-1), 4.8, 4.8, "leg"), E(6.5, -3.2 - press(-1), 5.6, 3.8, "paw"));
      let paw = null;
      if (!st.arm) sh.push(C(-6, -15, -6, -4.5 - press(1), 4.8, 4.8, "leg"), E(-6.5, -3.2 - press(1), 5.6, 3.8, "paw"));
      else if (st.arm === "lick" || st.arm === "wash") {
        /* Washing: the paw comes up to the mouth for a few licks, then wipes over the cheek to the ear and back. */
        if (st.arm === "lick") paw = R([-6.5, -29.5 + Math.sin(t * 11) * 0.9]);
        else {
          const q = (1 - Math.cos((t - st.washAt) * 4.4)) / 2, u = 1 - q;
          paw = R([u * u * -7 + 2 * u * q * -19 + q * q * -18, u * u * -31 + 2 * u * q * -37 + q * q * -49]);
        }
        sh.push(C(-8, -18, paw[0] + 0.5, paw[1] + 5, 4.8, 4.6, "front"), E(paw[0], paw[1], 5.6, 5, "front"));
        if (st.arm === "lick" && Math.sin(t * 11) > -0.3) pinks.push({ ...xy(R([-1.4, -30])), rx: 2.2, ry: 1.5 });
      } else if (st.arm === "eyes") {
        /* Bad news: one paw over an eye, peeking with the other. */
        const c = rot([-9.6, -39.5], [0, -27], st.tilt);
        sh.push(C(-8, -18, c[0] + 1, c[1] + 6, 4.8, 4.8, "front"), E(c[0], c[1], 7.4, 6.6, "front"));
      } else {
        /* One paw lifted toward what it plays with; only now does its pink pad show. */
        const up = st.arm === "up", end = up ? [-22, -26] : [-24, -10];
        sh.push(C(-8, -18, end[0] * 0.65, end[1] * 0.8 + (up ? -1 : 1), 4.8, 4.6, "leg"), E(end[0], end[1], 5.4, 4.8, "paw"));
        pads.push({ x: end[0] - 0.6, y: end[1] + (up ? 0.6 : 0) });
      }
      /* The head, like the plush: a wide bun, full cheeks, two small round ears set wide. */
      const soft = (x, y, rx, ry, a = 0) => { const c = R([x, y]); return S(c[0], c[1], rx, ry, "head", a + tl); };
      sh.push(soft(0, -41, 22, 14.5), soft(0, -35.5, 22.5, 10.5), soft(0, -48, 16, 10));
      sh.push(soft(-16.5 - fl * 4, -55.5 + fl * 5, 6.4, 6.6, -0.2 - fl * 0.9), soft(16.5 + fl * 4, -55.5 + fl * 5, 6.4, 6.6, 0.2 + fl * 0.9));
      for (const s of [-1, 1]) {
        const c = R([s * 9.6, -39]);
        if (s < 0 && (st.arm === "eyes" || (paw && Math.hypot(c[0] - paw[0], c[1] - paw[1]) < 7.5))) continue;
        eyes.push({ x: c[0], y: c[1], r: 7.2 });
      }
      /* The yawn: a small pink mouth that opens wide, with two white fangs at the top. */
      if (yawn > 0.05) { const c = R([0, -30]); pinks.push({ x: c[0], y: c[1] + yawn * 0.6, rx: 1.6 + yawn * 2.6, ry: 0.7 + yawn * 3, mouth: true, fangs: yawn > 0.55 }); }
      for (const s of [-1, 1]) { const o = R([s * 15.5, -33]); for (const [dx, dy] of [[8.5, -1.5], [9, 1.3]]) whisk.push([o, R([s * (15.5 + dx), -33 + dy])]); }
      return { sh, eyes, pads, whisk, pinks };
    }
    /* Side poses face right; the head turns a little toward the reader. */
    let hx, hy;
    if (st.pose === "walk") {
      const ph = t * 15 * (st.run || 1);
      for (const [x, o] of [[13, Math.PI], [-13, 0], [9, 0], [-9, Math.PI]]) {
        const ang = Math.sin(ph + o) * 0.45, lift = Math.max(0, Math.cos(ph + o)) * 2.4;
        const end = [x + Math.sin(ang) * 11, -11 + Math.cos(ang) * 10 - lift];
        sh.push(C(x, -15, end[0], end[1], 3.8, 3.4, "leg"), E(end[0] + 1, end[1] - 1.2, 4.2, 2.8, "paw"));
      }
      const w = Math.sin(tp * 2);
      sh.push(...chain([[-19, -21], [-24.5, -25.5], [-26.5, -31 + w * 1.2], [-25 + w * 2, -35.5]], 6, 5.4, "tail"));
      sh.push(S(-2, -20, 20, 10.5, "body"), S(10, -19.5, 10, 10.5, "body"), S(-13, -20, 9, 9.5, "body"));
      hx = 21; hy = -28;
    } else if (st.pose === "crouch") {
      /* Low like a loaf, rump up and wiggling before the pounce. */
      const wig = Math.sin(t * 24) * 2.2, w = Math.sin(t * 9);
      sh.push(...chain([[-20, -8 + wig], [-27, -6.5], [-32.5 + w * 1.2, -8.5 + w * 2.4]], 5.8, 5.2, "tail"));
      sh.push(E(14, -2.6, 5.4, 2.8, "paw"), E(21, -2.6, 5.4, 2.8, "paw"));
      sh.push(S(-2, -10, 21, 10, "body"), S(-14, -12 + wig, 10, 9.5, "body"), S(9, -10, 10, 9.5, "body"));
      hx = 20; hy = -16;
    } else {
      /* In the air: front paws reach forward, hind legs push back, tail straight out. */
      sh.push(...chain([[-22, -21], [-30, -23], [-36, -22.5]], 5.8, 5.2, "tail"));
      sh.push(C(13, -16, 30, -8, 4, 3.5, "leg"), E(31.5, -7.4, 4.4, 3, "paw"), C(10, -15, 27, -5, 4, 3.5, "leg"), E(28.5, -4.4, 4.4, 3, "paw"));
      sh.push(C(-14, -16, -31, -9, 4.4, 3.6, "leg"), E(-32.5, -8.4, 4.4, 3, "paw"), C(-11, -15, -28, -5, 4.4, 3.6, "leg"), E(-29.5, -4.4, 4.4, 3, "paw"));
      sh.push(S(-1, -18, 23, 9, "body"), S(12, -19, 10, 9.5, "body"));
      hx = 25; hy = -25;
    }
    sh.push(S(hx, hy, 14.5, 10.5, "head"), S(hx + 1, hy + 3.5, 13, 8, "head"), S(hx, hy - 4, 10.5, 7, "head"));
    sh.push(S(hx - 8.5 - fl * 3, hy - 9.2 + fl * 4, 4.8, 5.9, "head", -0.28 - fl * 0.8), S(hx + 8.5 + fl * 3, hy - 9.2 + fl * 4, 4.8, 5.9, "head", 0.28 + fl * 0.8));
    eyes.push({ x: hx - 4.8, y: hy + 2.2, r: 5 }, { x: hx + 5.6, y: hy + 2.4, r: 5.3 });
    for (const [dx, dy] of [[8.5, -1.5], [8.5, 2]]) whisk.push([[hx + 11.5, hy + 6], [hx + 11.5 + dx, hy + 6 + dy]]);
    return { sh, eyes, pads, whisk, pinks };
  }

  /* How strongly a soft shape covers a point; a cell is filled where the soft shapes of one part add up past SOFT. */
  const field = (s, x, y) => {
    let dx = x - s.x, dy = y - s.y;
    if (s.a) { const c = Math.cos(-s.a), n = Math.sin(-s.a); [dx, dy] = [dx * c - dy * n, dx * n + dy * c]; }
    const q = dx * dx / (s.rx * s.rx) + dy * dy / (s.ry * s.ry);
    return q < 1.7 ? (1 - q / 1.7) ** 2 : 0;
  };
  const SOFT = (1 - 1 / 1.7) ** 2;
  function partAt(sh, x, y) {
    let best = -1;
    const f = [0, 0, 0, 0, 0, 0];
    for (const s of sh) { if (s.soft) f[RANK[s.p]] += field(s, x, y); else if (RANK[s.p] > best && inside(s, x, y)) best = RANK[s.p]; }
    for (let r = 5; r > best; r--) if (f[r] >= SOFT) return r;
    return best;
  }

  function inside(s, x, y) {
    if (s.k === "e") {
      let dx = x - s.x, dy = y - s.y;
      if (s.a) { const c = Math.cos(-s.a), n = Math.sin(-s.a); [dx, dy] = [dx * c - dy * n, dx * n + dy * c]; }
      return dx * dx / (s.rx * s.rx) + dy * dy / (s.ry * s.ry) <= 1;
    }
    if (s.k === "c") {
      const vx = s.x2 - s.x1, vy = s.y2 - s.y1, u = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / (vx * vx + vy * vy || 1)));
      const px = s.x1 + vx * u - x, py = s.y1 + vy * u - y, r = s.r1 + (s.r2 - s.r1) * u;
      return px * px + py * py <= r * r;
    }
    return false;
  }

  /*
   * The cat in the pond's letters. Like the koi, it is a mosaic of small tiles with a glyph on each,
   * but it stays a plain black cat: no light plays over the fur, the marks are only a shade off black,
   * and the outline shows only on the dark page. The tiles are much finer than the koi's and keep one
   * size on screen whatever the cat's scale.
   */
  const FUR = " .:-=+*#%@", PX = 1.2, PY = 1.56, LX = -0.6, LY = -0.8;
  const SUB4 = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const SUB16 = Array.from({ length: 16 }, (_, q) => [(q % 4 + 0.5) / 4, ((q >> 2) + 0.5) / 4]);
  /* A stroke along an edge, from the way the edge faces. */
  function stroke(nx, ny) {
    let a = Math.atan2(nx, -ny);
    if (a < 0) a += Math.PI;
    if (a >= Math.PI) a -= Math.PI;
    return a < 0.39 || a > 2.75 ? (ny > 0 ? "_" : "-") : a < 1.18 ? "\\" : a < 1.96 ? "|" : "/";
  }
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const puffs = [];
  function puff(n, spread) { for (let k = 0; k < n; k++) puffs.push({ x: (Math.random() - 0.5) * 2 * spread, y: -1 - Math.random() * 3, vx: (Math.random() - 0.5) * 2 * spread * 1.6, vy: -6 - Math.random() * 10, born: t, g: ".,'`"[k % 4] }); }

  function draw() {
    const dark = isDark(), m = model(), side = st.pose === "walk" || st.pose === "crouch" || st.pose === "jump";
    const mirror = side ? st.dir < 0 : st.dir > 0;
    const s = pos ? pos.s : SCALES[0], cw = PX / s, ch = PY / s;
    /* a cell edge under the feet and through the middle, so the grid stays put as the cat moves */
    const ox = AX - Math.ceil(AX / cw) * cw, oy = AY - Math.ceil(AY / ch) * ch;
    const nc = Math.ceil((W - ox) / cw), nr = Math.ceil((H - oy) / ch), N = nc * nr;
    const toModel = (gx, gy) => { const x = gx - AX; return [mirror ? -x : x, gy - AY]; };
    const part = new Int8Array(N).fill(-1), cov = new Uint8Array(N), A = new Float32Array(N), Hd = new Float32Array(N);
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    for (const q of m.sh) {
      const e = q.k === "e" ? Math.max(q.rx, q.ry) * (q.soft ? 1.31 : 1) : Math.max(q.r1, q.r2);
      for (const [x, y] of q.k === "e" ? [[q.x, q.y]] : [[q.x1, q.y1], [q.x2, q.y2]]) { bx0 = Math.min(bx0, x - e); bx1 = Math.max(bx1, x + e); by0 = Math.min(by0, y - e); by1 = Math.max(by1, y + e); }
    }
    if (mirror) [bx0, bx1] = [-bx1, -bx0];
    const ci0 = Math.max(0, Math.floor((bx0 + AX - ox) / cw) - 1), ci1 = Math.min(nc - 1, Math.ceil((bx1 + AX - ox) / cw) + 1);
    const cj0 = Math.max(0, Math.floor((by0 + AY - oy) / ch) - 1), cj1 = Math.min(nr - 1, Math.ceil((by1 + AY - oy) / ch) + 1);
    for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) {
      let n = 0, top = -1, nh = 0;
      for (const [u, v] of SUB4) {
        const [x, y] = toModel(ox + (i + u) * cw, oy + (j + v) * ch), p = partAt(m.sh, x, y);
        if (p >= 0) { n++; top = Math.max(top, p); if (p >= 4) nh++; }
      }
      const k = j * nc + i;
      cov[k] = n; part[k] = n >= 2 ? top : n ? -2 : -1; A[k] = n / 4; Hd[k] = nh / 4;
    }
    /* soft copies of the shape give each cell a slope, and the slope gives its light */
    const blur = src => {
      const a = new Float32Array(N), b = new Float32Array(N);
      for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) { let v = 2 * src[j * nc + i]; v += i > 0 ? src[j * nc + i - 1] : 0; v += i < nc - 1 ? src[j * nc + i + 1] : 0; a[j * nc + i] = v / 4; }
      for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) { let v = 2 * a[j * nc + i]; v += j > 0 ? a[(j - 1) * nc + i] : 0; v += j < nr - 1 ? a[(j + 1) * nc + i] : 0; b[j * nc + i] = v / 4; }
      return b;
    };
    const Ab = blur(blur(A)), Hb = blur(blur(Hd));
    const at = (src, i, j) => i < 0 || j < 0 || i >= nc || j >= nr ? 0 : src[j * nc + i];
    const slope = (src, i, j) => [at(src, i + 1, j) - at(src, i - 1, j), at(src, i, j + 1) - at(src, i, j - 1)];
    /* which way an edge faces: a Sobel over the cells that are in (part >= p) */
    const facing = (i, j, inn) => {
      let gx = 0, gy = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj, v = ii < 0 || jj < 0 || ii >= nc || jj >= nr ? 0 : inn(part[jj * nc + ii]) ? 1 : 0;
        const w = di && dj ? 1 : 2;
        gx += di * w * v; gy += dj * w * v;
      }
      const l = Math.hypot(gx, gy) || 1;
      return [-gx / l, -gy / l];
    };

    /* Black tiles in a grout a shade lighter. The marks in the fur, the seams between head, body and paws
       and the outline are darker greys, never a light, so the cat reads as one plain black. */
    const fur = dark ? [8, 8, 7] : [14, 13, 12], grout = dark ? [21, 20, 18] : [25, 23, 21];
    const mark = dark ? [32, 30, 27] : [36, 33, 30], seamC = dark ? [54, 51, 46] : [60, 56, 50], pawC = dark ? [64, 61, 56] : [54, 51, 47], edgeC = dark ? [88, 84, 77] : [36, 33, 30];
    const ink = dark ? [150, 143, 130] : [138, 130, 118], whiskC = dark ? [98, 93, 85] : [92, 87, 80];
    const gold = [224, 166, 58], deep = [11, 7, 5], cream = [255, 250, 240], rose = [112, 38, 52];
    const pink = m.pads.length || m.pinks.length ? getComputedStyle(document.documentElement).getPropertyValue("--cat-pink").trim() : "";
    const moving = st.pose === "walk" || st.pose === "jump";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `700 ${(ch * 0.78).toFixed(2)}px "Geist Mono", ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const gap = PX * 0.06 / s;
    const glyph = (g, c, a, x, y) => { if (a <= 0.01 || g === " ") return; ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = rgb(c); ctx.fillText(g, x + cw / 2, y + ch / 2 + ch * 0.04); };
    const tile = (c, a, x, y, bare) => {
      ctx.globalAlpha = a;
      if (!bare) { ctx.fillStyle = rgb(grout); ctx.fillRect(x, y, cw + 0.03, ch + 0.03); }
      ctx.fillStyle = rgb(c); ctx.fillRect(x + gap, y + gap, cw - 2 * gap, ch - 2 * gap);
    };

    /* eyes, pads and whiskers claim their cells first */
    const over = new Map();
    let eye = st.eye;
    if (eye === "open" && t < blinkUntil) eye = "blink";
    if (eye === "open" && t < wideUntil) eye = "wide";
    let lx = 0, ly = 0;
    if (side) lx = 1;
    else { const p = lookPoint(); if (p && pos) { lx = Math.max(-1, Math.min(1, (p.x - pos.x) / 70)); ly = Math.max(-1, Math.min(1, (p.y - (pos.y - 39 * pos.s)) / 70)); if (mirror) lx = -lx; } }
    for (const e of m.eyes) {
      /* Big black eyes with only a thin ring of gold at the edge and one small catchlight, as before, now set in tiles.
         Each eye cell is sampled 16 times and takes the share of gold, black and fur under it, so the ring stays thin. */
      const r = e.r * (eye === "wide" ? 1.08 : 1), pr = r - (eye === "wide" ? 0.8 : 1.05);
      const px = e.x + lx * 0.6, py = e.y + ly * 0.5 + 0.1, hx = px - pr * 0.38, hy = py - pr * 0.42, hr = Math.max(0.75, r * 0.13);
      const shut = eye === "blink" || eye === "happy";
      /* a sleepy eye: the upper lid comes down over it, edged in the same thin gold */
      const lid = shut || eye === "wide" ? 0 : Math.min(0.9, st.lid), lidY = e.y - r + 2 * r * lid;
      /* a shut eye is a thin gold arc: dipping when it blinks, arched when it is pleased */
      const arcY = x => { const u = (x - e.x) / (0.8 * r); return Math.abs(u) > 1 ? null : eye === "blink" ? e.y + (1 - u * u) * r * 0.225 : e.y + 1 - (1 - u * u) * (r * 0.45 + 0.5); };
      const ex = mirror ? -e.x : e.x;
      const i0 = Math.max(0, Math.floor((ex + AX - r - ox) / cw) - 1), i1 = Math.min(nc - 1, Math.ceil((ex + AX + r - ox) / cw) + 1);
      const j0 = Math.max(0, Math.floor((e.y + AY - r - oy) / ch) - 1), j1 = Math.min(nr - 1, Math.ceil((e.y + AY + r - oy) / ch) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        let fi = 0, fg = 0, fh = 0;
        for (const [u, v] of SUB16) {
          const [x, y] = toModel(ox + (i + u) * cw, oy + (j + v) * ch);
          if (shut) { const ay = arcY(x); if (ay !== null && Math.abs(y - ay) < 0.62) fg++; continue; }
          if ((x - e.x) ** 2 + (y - e.y) ** 2 >= r * r || (lid && y < lidY)) continue;
          fi++;
          if ((x - px) ** 2 + (y - py) ** 2 >= pr * pr || (lid && y < lidY + 0.8)) fg++;
          else if (((x - hx) / hr) ** 2 + ((y - hy) / (hr * 0.8)) ** 2 < 1) fh++;
        }
        const k = j * nc + i;
        if (shut) { if (fg) over.set(k, { tile: mixc(fur, gold, Math.min(1, fg / 16 * 2.2)), g: "", ga: 0 }); continue; }
        if (!fi) continue;
        const inside = mixc(mixc(deep, gold, Math.min(1, fg / Math.max(1, fi) * 1.5)), cream, Math.min(1, fh / Math.max(1, fi) * 2.4));
        over.set(k, { tile: mixc(fur, inside, Math.min(1, fi / 16 * 1.15)), g: "", ga: 0 });
      }
    }
    for (const p of m.pads) {
      for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
        const [x, y] = toModel(ox + (i + 0.5) * cw, oy + (j + 0.5) * ch);
        if (((x - p.x) / 2.6) ** 2 + ((y - p.y - 0.6) / 2.2) ** 2 < 1) over.set(j * nc + i, { tile: null, pink: true, g: "o", gc: [120, 50, 64], ga: 0.5 });
        else for (const [dx, dy] of [[-2.2, -2.4], [0, -3.1], [2.2, -2.4]]) if ((x - p.x - dx) ** 2 + (y - p.y - dy) ** 2 < 1.6) over.set(j * nc + i, { tile: fur, g: "o", pinkG: true, ga: 1 });
      }
    }
    for (const p of m.pinks) {
      const pi = Math.floor(((mirror ? -p.x : p.x) + AX - ox) / cw), pj = Math.floor((p.y + AY - oy) / ch), ri = Math.ceil(p.rx / cw) + 1, rj = Math.ceil(p.ry / ch) + 1;
      for (let j = Math.max(0, pj - rj); j <= Math.min(nr - 1, pj + rj); j++) for (let i = Math.max(0, pi - ri); i <= Math.min(nc - 1, pi + ri); i++) {
        const [x, y] = toModel(ox + (i + 0.5) * cw, oy + (j + 0.5) * ch), u = (x - p.x) / p.rx, v = (y - p.y) / p.ry;
        if (u * u + v * v >= 1) continue;
        const k = j * nc + i;
        if (p.fangs && v < -0.5 && Math.abs(Math.abs(u) - 0.5) < 0.2) over.set(k, { tile: cream, g: "", ga: 0 });
        else if (p.mouth && v < 0.3) over.set(k, { tile: rose, g: "", ga: 0 });
        else over.set(k, { tile: null, pink: true, g: "", ga: 0 });
      }
    }
    for (const [a, b] of m.whisk) {
      const c = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 1];
      for (let q = 0; q <= 1.0001; q += 0.08) {
        const x = (1 - q) ** 2 * a[0] + 2 * (1 - q) * q * c[0] + q * q * b[0], y = (1 - q) ** 2 * a[1] + 2 * (1 - q) * q * c[1] + q * q * b[1];
        const i = Math.floor(((mirror ? -x : x) + AX - ox) / cw), j = Math.floor((y + AY - oy) / ch), k = j * nc + i;
        if (i < 0 || j < 0 || i >= nc || j >= nr || over.has(k) || part[k] === 5) continue;
        const dyq = 2 * (1 - q) * (c[1] - a[1]) + 2 * q * (b[1] - c[1]), dxq = 2 * (1 - q) * (c[0] - a[0]) + 2 * q * (b[0] - c[0]);
        const sl = dyq / (Math.abs(dxq) || 1) * (mirror ? -1 : 1) * Math.sign(dxq || 1);
        over.set(k, { whisk: true, g: Math.abs(sl) < 0.25 ? "-" : sl < 0 ? "/" : "\\" });
      }
    }

    for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
      const k = j * nc + i, v = part[k], x = ox + i * cw, y = oy + j * ch, o = over.get(k);
      if (o && o.whisk) {
        if (v >= 0) tile(fur, 1, x, y);
        glyph(o.g, v >= 0 ? whiskC : ink, v >= 0 ? 0.65 : 0.75, x, y);
        continue;
      }
      if (o) {
        if (o.pink) { ctx.globalAlpha = 1; ctx.fillStyle = pink; ctx.fillRect(x + gap, y + gap, cw - 2 * gap, ch - 2 * gap); }
        else tile(o.tile, 1, x, y);
        if (o.pinkG) { ctx.globalAlpha = 1; ctx.fillStyle = pink; ctx.fillText(o.g, x + cw / 2, y + ch / 2); }
        else glyph(o.g, o.gc, o.ga, x, y);
        continue;
      }
      if (v === -1) continue;
      if (v === -2) {
        const [nx, ny] = facing(i, j, p => p >= 0 || p === -2);
        tile(fur, 0.35, x, y);
        glyph(ny < -0.5 ? "'" : ny > 0.5 ? "," : nx < 0 ? "(" : ")", dark ? edgeC : fur, dark ? 0.35 : 0.55, x, y);
        continue;
      }
      const head = v >= 4, src = head ? Hb : Ab, [gx, gy] = slope(src, i, j);
      let sx = -gx * 1.6, sy = -gy * 1.6;
      const sl = Math.hypot(sx, sy);
      if (sl > 1) { sx /= sl; sy /= sl; }
      const nz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));
      let lit = 0.3 + 0.6 * (sx * LX + sy * LY) + 0.28 * nz;
      if (!head) lit -= 0.55 * at(Hb, i, j - 1);
      lit = Math.max(0, Math.min(1, lit));
      const nb = [at(part, i - 1, j), at(part, i + 1, j), at(part, i, j - 1), at(part, i, j + 1)].map((p, q) => {
        const ii = i + [-1, 1, 0, 0][q], jj = j + [0, 0, -1, 1][q];
        return ii < 0 || jj < 0 || ii >= nc || jj >= nr ? -1 : part[jj * nc + ii];
      });
      const edge = nb.some(p => p < 0), seam = !edge && nb.some(p => p >= 0 && p < v);
      tile(fur, cov[k] === 2 && edge ? 0.8 : 1, x, y);
      if (edge) {
        const [nx, ny] = facing(i, j, p => p >= 0);
        glyph(stroke(nx, ny), edgeC, dark ? 0.6 : 0.8, x, y);
      } else if (seam) {
        const [nx, ny] = facing(i, j, p => p >= v);
        /* a paw in front of the black body or face gets a thin grey line round it, a cell wide */
        if (v === 3 || v === 5) tile(pawC, 1, x, y, true);
        else glyph(stroke(nx, ny), seamC, 0.85, x, y);
      } else {
        const idx = Math.round(lit * 6);
        const g = moving && idx > 1 ? (st.pose === "jump" ? "=" : "-~"[(i + j + Math.floor(t * 8)) % 2]) : FUR[Math.max(0, Math.min(8, idx))];
        glyph(g, mark, 0.45 + 0.35 * lit, x, y);
      }
    }
    /* a little dust where the cat lands or springs off */
    for (let q = puffs.length - 1; q >= 0; q--) {
      const p = puffs[q], age = t - p.born;
      if (age > 0.5) { puffs.splice(q, 1); continue; }
      const x = (mirror ? -1 : 1) * (p.x + p.vx * age) + AX, y = p.y + p.vy * age + 18 * age * age + AY;
      glyph(p.g, ink, 0.8 * (1 - age / 0.5), Math.floor((x - ox) / cw) * cw + ox, Math.floor((y - oy) / ch) * ch + oy);
    }
    ctx.globalAlpha = 1;
  }
  function lookPoint() {
    if (st.look === "ball") { lrect(); const r = rel(ball.getBoundingClientRect()); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }
    if (st.look) return st.look;
    if (pointer && performance.now() - pointerAt < 2500) { lrect(); return { x: pointer.x - LR.left, y: pointer.y - LR.top }; }
    if (current && current.el.isConnected) { const T = aim(current); if (T) return { x: (T.left + T.right) / 2, y: (T.top + T.bottom) / 2 }; }
    return null;
  }
  return {
    st, draw, model, W, H, AX, AY, FOOT_S, puffs,
    set(o) {
      if ("t" in o) t = o.t;
      if ("pos" in o) pos = o.pos;
      if ("dpr" in o) { dpr = o.dpr; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      if ("tailSpeed" in o) tailSpeed = o.tailSpeed;
      if ("blinkUntil" in o) blinkUntil = o.blinkUntil;
      if ("wideUntil" in o) wideUntil = o.wideUntil;
    }
  };
}
