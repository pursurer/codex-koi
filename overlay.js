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
  /* the black water of ASCII Koi, the same tokens as the page's [data-theme="black"] */
  const palette = () => ({ water: '#0d1315', ink: '#ebe6dc', accent: '#e8784f', koiLight: '#ece6da', koiDark: '#3a3632', dark: true })
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
  css.textContent = `[data-codex-koi-title] > span, [data-codex-koi-title] > span * { color: transparent !important; }`
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
  const at = (x, y) => {
    const [px, py] = toPond(x, y), k = pond.tint(px, py), w = k ? Math.min(1, k[3] * 1.15) : 0
    const l = Math.min(1, Math.max(0, (pond.light(px, py) - 0.72) / 0.28)), L = l * l * (3 - 2 * l)
    const c = ink.map((v, j) => { const n = k ? v + (k[j] - v) * w : v; return n + (255 - n) * 0.35 * L })
    return { c, w, k }
  }
  /* the koi fade under the heading, as under the page's clock */
  const hero = () => titleEl() && titleText(titleEl())

  /* about 30 frames a second, following the heading wherever Codex lays it out */
  const drawTitle = now => {
    raf = requestAnimationFrame(drawTitle)
    if (now - lastDraw < 33 || !host || document.hidden) return
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
        const y = r.top + r.height / 2, a = at(r.left + r.width * 0.15, y), b = at(r.left + r.width / 2, y), c = at(r.right - r.width * 0.15, y)
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
  const fit = () => pond.size(host.clientWidth * VIEW, host.clientHeight * VIEW)
  const sizeToHost = new ResizeObserver(() => { if (host && pond) fit() })

  /* As on the page: a click on open water sends the cat's paw, a right click feeds the koi. */
  const onPointer = e => {
    if (!pond || e.target.closest(INTERACTIVE)) return
    const r = host.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    if (!(e.clientX || e.clientY) || x < 0 || y < 0 || x > r.width || y > r.height) return
    if (e.button === 2) { pond.feed(x * VIEW, y * VIEW); e.preventDefault() } else if (e.button === 0) pond.paw(x * VIEW, y * VIEW)
  }
  const onMenu = e => { if (!e.target.closest(INTERACTIVE)) e.preventDefault() }

  const show = el => {
    host = el
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.style.isolation = 'isolate'
    host.prepend(canvas)
    if (!css.isConnected) document.head.append(css)
    host.addEventListener('pointerdown', onPointer)
    host.addEventListener('contextmenu', onMenu)
    if (!pond) pond = window.AsciiKoi.createPond({
      canvas, palette, reduce,
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
  window.__codexKoi = { sync, hide }
  /* injected on every new document, which may not have its root yet */
  if (document.documentElement) begin(); else document.addEventListener('DOMContentLoaded', begin, { once: true })
})()
