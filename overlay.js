/*
 * Codex Koi: the ASCII Koi pond behind Codex's new-chat page.
 *
 * Runs in the Codex renderer, after pond.js (the page's own file, unchanged).
 * The pond lives in the home page's main surface, under the native content
 * (z-index -1 in an isolated stacking context), so every control stays as it
 * is. It shows while the new-chat page is the active page and stops when a
 * thread opens. Anchors follow Codex-Dream-Skin's selector contract: stable
 * test ids first, and pages Codex keeps in the DOM but marks inactive are
 * skipped.
 */
(() => {
  if (window.__codexKoi) return
  const route = new URLSearchParams(location.search).get('initialRoute') || ''
  /* the pet floats in a page of its own: no pond there */
  if (route.startsWith('/avatar-overlay') || location.pathname.endsWith('/avatar-overlay-composition-surface.html')) return
  if (location.protocol !== 'app:' || !window.AsciiKoi) return

  const HOME = '[role="main"]:has([data-testid="home-icon"])'
  const INACTIVE = '[data-app-shell-active-page="false"]'
  const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="menu"], [role="dialog"], [contenteditable=""], [contenteditable="true"]'
  /* ASCII Koi's three waters, the same tokens as the page's [data-theme]; black unless one was chosen (shift-click the water) */
  const WATERS = {
    pond:  { water: '#0e2a32', ink: '#ebe6dc', accent: '#e8784f', koiLight: '#ece6da', koiDark: '#3a3632', dark: true },
    black: { water: '#0d1315', ink: '#ebe6dc', accent: '#e8784f', koiLight: '#ece6da', koiDark: '#3a3632', dark: true },
    light: { water: '#e9e4da', ink: '#1c1a17', accent: '#9e3214', koiLight: '#f7f2e8', koiDark: '#2b2723', dark: false },
  }
  const ORDER = ['black', 'pond', 'light'], STORE = 'codex-koi-water'
  let water = (() => { try { const w = localStorage.getItem(STORE); return WATERS[w] ? w : 'black' } catch { return 'black' } })()
  const palette = () => WATERS[water]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  /*
   * A higher view: the pond is simulated over VIEW times the page's size and drawn back into it, so the
   * koi are smaller, there are more of them and more water shows. The canvas keeps the screen's own
   * pixel density, so the higher view costs no more to draw.
   */
  const VIEW = 1.3

  const canvas = document.createElement('canvas')
  canvas.dataset.codexKoi = ''
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none', display: 'block', opacity: '0', transition: 'opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)' })

  let host = null, pond = null, running = false

  /*
   * The heading keeps Codex's own font. A canvas over it draws each character again where Codex laid
   * it out, in the heading's own colour; a koi passing under a character lends it the koi's colour
   * (across the glyph, so half a character can turn) and a soft glow, and the caustic net brightens
   * it, as the page's clock takes on the pond. Codex's text stays underneath, transparent, so
   * the project name keeps its underline and still opens the project menu.
   */
  const TITLE = '[data-feature="game-source"]'
  const PAD = 28
  const css = document.createElement('style')
  css.textContent = `[data-codex-koi-title] > span, [data-codex-koi-title] > span * { color: transparent !important; }
@property --codex-koi-r { syntax: "<length>"; inherits: false; initial-value: 0px; }
canvas[data-codex-koi-snap] { --codex-koi-r: 0px; opacity: 0; }
canvas[data-codex-koi-snap].show { opacity: 1; -webkit-mask: radial-gradient(circle at var(--x) var(--y), transparent var(--codex-koi-r), #000 calc(var(--codex-koi-r) + 28px)); mask: radial-gradient(circle at var(--x) var(--y), transparent var(--codex-koi-r), #000 calc(var(--codex-koi-r) + 28px)); }
canvas[data-codex-koi-snap].wipe { --codex-koi-r: 160vmax; transition: --codex-koi-r 1100ms cubic-bezier(0.55, 0, 0.25, 1); }`
  /*
   * A new water spreads like a ripple from where it was chosen, as on the ASCII Koi page: the old frame (the pond
   * and the heading) is kept on a canvas over the pond, and a widening hole in it shows the new water underneath.
   */
  const snap = document.createElement('canvas')
  snap.dataset.codexKoiSnap = ''
  snap.setAttribute('aria-hidden', 'true')
  Object.assign(snap.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none', display: 'block' })
  snap.addEventListener('transitionend', () => { snap.classList.remove('show', 'wipe'); ripple = null })
  /* the hole's radius over time, the same curve as the CSS above, so the heading's letters turn as it passes them */
  const curve = (() => {
    const x1 = 0.55, y1 = 0, x2 = 0.25, y2 = 1
    const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1, ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1
    return u => { if (u <= 0) return 0; if (u >= 1) return 1; let lo = 0, hi = 1, s = u; for (let i = 0; i < 30; i++) { const x = ((ax * s + bx) * s + cx) * s; if (x < u) lo = s; else hi = s; s = (lo + hi) / 2 } return ((ay * s + by) * s + cy) * s }
  })()
  let ripple = null
  const glow = document.createElement('canvas')
  glow.setAttribute('aria-hidden', 'true')
  Object.assign(glow.style, { position: 'absolute', left: '0', top: '0', zIndex: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1) 150ms' })
  const gx = glow.getContext('2d')
  let ink = [235, 230, 220], lastDraw = 0, raf = 0
  const titleEl = () => host && host.querySelector(TITLE)
  const titleText = el => (el.firstElementChild || el)
  const toPond = (x, y) => { const b = host.getBoundingClientRect(); return [(x - b.left) * VIEW, (y - b.top) * VIEW] }
  const rgbOf = c => (c.match(/[\d.]+/g) || [235, 230, 220]).slice(0, 3).map(Number)
  const css3 = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
  /* what one point of the heading shows: the koi colour under it and how strongly, the water's light */
  const at = (x, y, P = palette()) => {
    const [px, py] = toPond(x, y), k = pond.tint(px, py), w = k ? Math.min(1, k[3] * 1.15) : 0
    const l = Math.min(1, Math.max(0, (pond.light(px, py) - 0.72) / 0.28)), L = l * l * (3 - 2 * l)
    /* on dark water the letters keep Codex's own colour and the light brightens them; on light water they are the water's ink */
    const base = P.dark ? ink : rgbOf(P.ink)
    const c = base.map((v, j) => { const n = k ? v + (k[j] - v) * w : v; return P.dark ? n + (255 - n) * 0.35 * L : n * (1 - 0.15 * L) })
    return { c, w, k }
  }
  /* the water a point of the screen shows: the new one inside the ripple, the old one outside it */
  const waterAt = (x, y, now) => {
    if (!ripple) return palette()
    const r = curve((now - ripple.t0) / 1100) * ripple.R
    return Math.hypot(x - ripple.x, y - ripple.y) < r + 14 ? palette() : WATERS[ripple.from]
  }
  /* the koi fade under the heading, as under the page's clock */
  const hero = () => titleEl() && titleText(titleEl())

  /* about 30 frames a second, following the heading wherever Codex lays it out */
  const drawTitle = now => {
    raf = requestAnimationFrame(drawTitle)
    if (now - lastDraw < (ripple ? 16 : 33) || !host || document.hidden) return
    lastDraw = now
    const t = titleEl()
    if (!t) { glow.remove(); return }
    const span = titleText(t)
    if (!t.hasAttribute('data-codex-koi-title')) { ink = rgbOf(getComputedStyle(span).color); t.dataset.codexKoiTitle = '' }
    if (!glow.isConnected) host.append(glow)
    const hb = host.getBoundingClientRect(), sb = span.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
    const w = Math.ceil(sb.width + PAD * 2), h = Math.ceil(sb.height + PAD * 2), ox = sb.left - PAD, oy = sb.top - PAD
    if (glow.width !== w * dpr || glow.height !== h * dpr) { glow.width = w * dpr; glow.height = h * dpr; glow.style.width = w + 'px'; glow.style.height = h + 'px' }
    glow.style.transform = `translate(${Math.round(ox - hb.left)}px, ${Math.round(oy - hb.top)}px)`
    gx.setTransform(dpr, 0, 0, dpr, 0, 0)
    gx.clearRect(0, 0, w, h)
    const fonts = new Map(), walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT), range = document.createRange()
    for (let n; (n = walker.nextNode());) {
      const el = n.parentElement
      if (!fonts.has(el)) fonts.set(el, getComputedStyle(el).font)
      gx.font = fonts.get(el)
      for (let i = 0; i < n.data.length; i++) {
        const ch = n.data[i]
        if (!ch.trim()) continue
        range.setStart(n, i); range.setEnd(n, i + 1)
        const r = range.getBoundingClientRect()
        if (!r.width) continue
        const y = r.top + r.height / 2, P = waterAt(r.left + r.width / 2, y, now)
        const a = at(r.left + r.width * 0.15, y, P), b = at(r.left + r.width / 2, y, P), c = at(r.right - r.width * 0.15, y, P)
        const fill = gx.createLinearGradient(r.left - ox, 0, r.right - ox, 0)
        fill.addColorStop(0, css3(a.c)); fill.addColorStop(0.5, css3(b.c)); fill.addColorStop(1, css3(c.c))
        const top = [a, b, c].reduce((m, q) => q.w > m.w ? q : m)
        gx.shadowColor = top.k ? css3(top.k, 0.85) : 'transparent'
        gx.shadowBlur = 16 * top.w
        gx.fillStyle = fill
        gx.fillText(ch, r.left - ox, r.bottom - gx.measureText(ch).fontBoundingBoxDescent - oy)
      }
    }
  }
  /* the new water, from (x, y) on screen (the pointer, or the heading's middle) */
  const setWater = (name, x, y) => {
    if (!WATERS[name] || name === water || !host || !pond) return
    const hb = host.getBoundingClientRect()
    if (x == null) { const h = hero(), r = h && h.getBoundingClientRect(); x = r && r.width ? r.left + r.width / 2 : hb.left + hb.width / 2; y = r && r.width ? r.top + r.height / 2 : hb.top + hb.height / 2 }
    if (!reduce && canvas.width) {
      snap.width = canvas.width; snap.height = canvas.height
      const g = snap.getContext('2d'), sx = canvas.width / hb.width
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, snap.width, snap.height)
      g.drawImage(canvas, 0, 0)
      const gr = glow.getBoundingClientRect()
      if (gr.width && glow.width) g.drawImage(glow, (gr.left - hb.left) * sx, (gr.top - hb.top) * sx, gr.width * sx, gr.height * sx)
      snap.style.setProperty('--x', (x - hb.left) + 'px'); snap.style.setProperty('--y', (y - hb.top) + 'px')
      snap.classList.remove('wipe'); snap.classList.add('show'); void snap.offsetWidth; snap.classList.add('wipe')
      const far = Math.max(...[[hb.left, hb.top], [hb.right, hb.top], [hb.left, hb.bottom], [hb.right, hb.bottom]].map(([cx, cy]) => Math.hypot(cx - x, cy - y)))
      ripple = { from: water, x, y, t0: performance.now(), R: Math.max(window.innerWidth, window.innerHeight) * 1.6, far }
    }
    water = name
    try { localStorage.setItem(STORE, name) } catch { /* private window */ }
    pond.colors()
  }
  const fit = () => pond.size(host.clientWidth * VIEW, host.clientHeight * VIEW)
  const sizeToHost = new ResizeObserver(() => { if (host && pond) fit() })

  /* As on the page: a click on open water sends the cat's paw, a right click feeds the koi. */
  const onPointer = e => {
    if (!pond || e.target.closest(INTERACTIVE)) return
    const r = host.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    if (!(e.clientX || e.clientY) || x < 0 || y < 0 || x > r.width || y > r.height) return
    /* shift-click: the next water (black, the blue pond, light), spreading from the click; keys stay Codex's, for typing */
    if (e.button === 0 && e.shiftKey) { setWater(ORDER[(ORDER.indexOf(water) + 1) % ORDER.length], e.clientX, e.clientY); e.preventDefault(); return }
    if (e.button === 2) { pond.feed(x * VIEW, y * VIEW); e.preventDefault() } else if (e.button === 0) pond.paw(x * VIEW, y * VIEW)
  }
  const onMenu = e => { if (!e.target.closest(INTERACTIVE)) e.preventDefault() }

  const show = el => {
    host = el
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.style.isolation = 'isolate'
    host.prepend(canvas)
    canvas.after(snap)
    if (!css.isConnected) document.head.append(css)
    host.addEventListener('pointerdown', onPointer)
    host.addEventListener('contextmenu', onMenu)

    if (!pond) pond = window.AsciiKoi.createPond({
      /* a fuller shoal than the new-tab page: the window is wide and the koi are drawn small (VIEW) */
      canvas, palette, reduce, most: 24,
      dpr: () => (window.devicePixelRatio || 1) / VIEW,
      dim: () => {
        const h = hero(); if (!h) return null
        const a = h.getBoundingClientRect(), b = host.getBoundingClientRect()
        return a.width ? { left: (a.left - b.left) * VIEW, top: (a.top - b.top) * VIEW, right: (a.right - b.left) * VIEW, bottom: (a.bottom - b.top) * VIEW } : null
      }
    })
    fit()
    sizeToHost.observe(host)
    pond.start()
    raf = requestAnimationFrame(drawTitle)
    running = true
    pond.pause(document.hidden)
    /* the pond comes up like the page's water: a slow fade, then the heading's light */
    requestAnimationFrame(() => { canvas.style.opacity = '1'; glow.style.opacity = '1' })
  }
  const hide = () => {
    if (pond && running) pond.stop()
    cancelAnimationFrame(raf)
    running = false
    canvas.style.opacity = '0'
    glow.style.opacity = '0'
    glow.remove()
    document.querySelectorAll('[data-codex-koi-title]').forEach(el => delete el.dataset.codexKoiTitle)
    sizeToHost.disconnect()
    if (host) { host.removeEventListener('pointerdown', onPointer); host.removeEventListener('contextmenu', onMenu) }
    snap.classList.remove('show', 'wipe'); ripple = null
    snap.remove()
    canvas.remove()
    host = null
  }

  /* The new-chat page is a route of the app's single page: watch the DOM and follow it. */
  const sync = () => {
    const home = [...document.querySelectorAll(HOME)].find(el => !el.closest(INACTIVE)) || null
    if (home === host && running) return
    hide()
    if (home) show(home)
  }
  /* at most one check per 150 ms, however busy the page is */
  let timer = 0
  const later = () => { if (!timer) timer = setTimeout(() => { timer = 0; sync() }, 150) }
  const begin = () => {
    new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-app-shell-active-page'] })
    sync()
  }
  /* nothing moves while the window is hidden or minimised */
  document.addEventListener('visibilitychange', () => { if (pond && running) pond.pause(document.hidden) })
  window.__codexKoi = { sync, hide, setWater: (name, x, y) => setWater(name, x, y), water: () => water }
  /* injected on every new document, which may not have its root yet */
  if (document.documentElement) begin(); else document.addEventListener('DOMContentLoaded', begin, { once: true })
})()
