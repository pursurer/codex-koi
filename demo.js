/*
 * The promo demo, injected by record.mjs only (the everyday launcher never loads it).
 *
 * Once the Codex window has been in front for a moment, a cursor drawn in the page glides to the
 * heading and right-clicks (food), clicks open water (the cat's paw), then types a prompt into the
 * composer (never sent), and tidies up. The clicks are pointer events sent to whatever is under
 * the cursor, so they take the same path through overlay.js as a person's clicks.
 *
 * The sidebar lists private threads: it is hidden before the window is ever in front, and put
 * back long after the take. When Codex has been left and comes back, the demo plays again (a retake).
 * With window.__codexKoiDemoManual set first (record.mjs --studio), it only hides the sidebar.
 */
(() => {
  if (window.__codexKoiDemo || location.protocol !== 'app:' || !/\/index\.html$/.test(location.pathname)) return
  const D = window.__codexKoiDemo = { state: 'waiting', log: [] }
  const note = s => { D.state = s; D.log.push([Math.round(performance.now()), s]) }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const $ = s => document.querySelector(s)
  const HOME = '[role="main"]:has([data-testid="home-icon"])'
  const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="menu"], [role="dialog"], [contenteditable=""], [contenteditable="true"]'
  const front = () => document.hasFocus() && !document.hidden
  const sidebar = verb => { const b = [...document.querySelectorAll('button[aria-label]')].find(b => new RegExp(`^${verb} sidebar$`, 'i').test(b.getAttribute('aria-label'))); if (b) b.click(); return !!b }

  /* the macOS arrow, black with a white rim and a soft shadow; its tip is the hot spot */
  const cursor = document.createElement('div')
  cursor.innerHTML = '<svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg"><path d="M2 1.5 L2 21 L6.6 16.7 L9.7 24 L13 22.6 L9.9 15.4 L16.3 15.4 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', opacity: '0', transition: 'opacity 250ms ease', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.45))', willChange: 'transform' })
  let at = { x: 0, y: 0 }
  const place = () => { cursor.style.transform = `translate(${at.x - 2}px, ${at.y - 1.5}px)` }
  const move = async (x, y, ms) => {
    const from = { ...at }, t0 = performance.now()
    for (;;) {
      const u = Math.min(1, (performance.now() - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2
      at = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e }; place()
      if (u === 1) return
      await sleep(8)
    }
  }
  /* the first point on the way down from (x, y) that a click would give to the pond, not to the app */
  const water = (x, y) => {
    for (let dy = 0; dy < 160; dy += 6) { const el = document.elementFromPoint(x, y + dy); if (el && !el.closest(INTERACTIVE)) return { x, y: y + dy, el } }
    return null
  }
  const press = (p, button) => {
    const o = { clientX: p.x, clientY: p.y, screenX: p.x + screenX, screenY: p.y + screenY, button, buttons: button === 2 ? 2 : 1, bubbles: true, cancelable: true, composed: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true }
    p.el.dispatchEvent(new PointerEvent('pointerdown', o))
    if (button === 2) p.el.dispatchEvent(new MouseEvent('contextmenu', o))
    p.el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
  }
  const composer = () => $(`${HOME} [contenteditable="true"]`) || $('[contenteditable="true"], textarea')
  const clear = el => { if (!el) return; el.focus(); document.execCommand('selectAll'); document.execCommand('delete'); el.blur() }

  async function take() {
    note('focused')
    const T = $(`${HOME} [data-feature="game-source"] > span`).getBoundingClientRect(), C = composer()?.getBoundingClientRect()
    at = { x: innerWidth * 0.72, y: innerHeight * 0.78 }; place()
    document.body.append(cursor)
    await sleep(30); cursor.style.opacity = '1'
    await sleep(3500)                                                       // the koi swim, the cursor rests
    const food = water(T.left + T.width * 0.3, T.top + T.height * 0.55)
    D.food = food && { x: food.x, y: food.y, onHeading: food.y < T.bottom }
    if (food) { await move(food.x, food.y, 900); await sleep(250); press(food, 2); note('feed') }
    await sleep(4200)                                                       // they crowd in and light the words
    const paw = water(T.left + T.width * 0.12, T.bottom + 90)
    if (paw) { await move(paw.x, paw.y, 700); await sleep(200); press(paw, 0); note('paw') }
    await sleep(2600)                                                       // they scatter
    const box = composer()
    if (box && C) {
      await move(C.left + 40, C.top + C.height / 2, 900); await sleep(150)
      box.focus(); await sleep(300)
      for (const ch of 'make my codex feel alive') { document.execCommand('insertText', false, ch); await sleep(70 + Math.random() * 50) }
      note('typed')
      await sleep(2200)
    }
    note('done')
    cursor.style.opacity = '0'
    await sleep(400); cursor.remove(); clear(composer())
  }

  /* 'shown' when the sidebar has a hide button, 'hidden' when it has a show button */
  const sidebarState = () => [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).reduce((s, l) => /^hide sidebar$/i.test(l) ? 'shown' : /^show sidebar$/i.test(l) ? 'hidden' : s, null)
  /* hidden for the take; afterwards always shown again (an earlier failed take may have left it hidden) */
  const hideSidebar = () => { if (sidebarState() === 'shown') sidebar('hide'); D.hid = true }

  async function run() {
    /* the sidebar goes first, before the window is ever in front */
    while (!sidebarState()) await sleep(50)
    hideSidebar()
    while (!($(HOME) && $('canvas[data-codex-koi]') && $(`${HOME} [data-feature="game-source"] > span`))) await sleep(100)
    /* studio mode: a person (or a screen recorder's real cursor) plays the take; the page only hides the sidebar */
    if (window.__codexKoiDemoManual) { note('manual'); return }
    for (;;) {
      hideSidebar()
      note('armed')
      /* in front, and staying there for 1.5 s */
      for (let since = 0; ; await sleep(100)) { if (!front()) since = 0; else if (!since) since = Date.now(); else if (Date.now() - since > 1500) break }
      await take().catch(e => note('error ' + e.message))
      /* the recorder stops at 26 s: the sidebar comes back well after */
      await sleep(12000)
      if (D.hid && sidebarState() === 'hidden') sidebar('show')
      D.hid = false
      note('tidy')
      /* a retake: Codex left, then back */
      while (front()) await sleep(250)
      await sleep(200)
    }
  }
  run()
})()
