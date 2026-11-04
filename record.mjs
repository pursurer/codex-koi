// Records the promo footage: Codex with the koi, its interface in English for this run only
// (--lang=en-US), the sidebar hidden, and a scripted cut played with real input events: the koi
// swim, food lands on the heading so they crowd under it and light it up, the cat's paw scatters
// them, then a prompt is typed (never sent). The renderer is captured as a screencast; frames and
// a timeline (cursor path, clicks) go to KOI_OUT for the edit (edit.py).
//
//   KOI_OUT=/path/to/dir node record.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchCodex, log } from './codex-pipe.mjs'

const OUT = process.env.KOI_OUT
if (!OUT) { console.error('set KOI_OUT'); process.exit(2) }
mkdirSync(join(OUT, 'frames'), { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const now = () => Date.now() / 1000

let main = null
const codex = await launchCodex({ args: ['--lang=en-US'], onPage(info, sessionId) { if (info.url.endsWith('/index.html')) main = sessionId } })
const send = (method, params = {}) => codex.cdp.send(method, params, main)
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value

/* wait for the new-chat page and the pond on it */
for (let i = 0; i < 120 && !(main && await evaluate(`!!document.querySelector('[data-testid="home-icon"]') && !!document.querySelector('canvas[data-codex-koi]')`).catch(() => false)); i++) await sleep(250)
if (!main) { log('no main page'); process.exit(1) }

process.on('unhandledRejection', e => { log('error', e?.message || e); process.exit(1) })

/* a minimised or hidden window paints nothing: wait until it is on screen */
for (let i = 0; i < 240 && await evaluate('document.hidden'); i++) { if (i % 20 === 0) log('waiting for the window to show'); await sleep(250) }
await sleep(800)

/* the sidebar lists private threads: hide it for the take, and put it back after */
log('sidebar buttons:', JSON.stringify(await evaluate(`[...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).filter(l => /sidebar/i.test(l))`)))
const toggleSidebar = () => evaluate(`(() => { const b = [...document.querySelectorAll('button[aria-label]')].find(b => /^(hide|show|toggle|collapse|expand|open|close)\\b.*sidebar/i.test(b.getAttribute('aria-label')) && !/option|project/i.test(b.getAttribute('aria-label'))); if (b) b.click(); return b ? b.getAttribute('aria-label') : null })()`)
log('sidebar toggle:', await toggleSidebar())
await sleep(2500)

const layout = await evaluate(`(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } }
  const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])')
  const title = home?.querySelector('[data-feature="game-source"] > span')
  const composer = document.querySelector('[contenteditable="true"], textarea')
  return { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, home: home && r(home), title: title && r(title), titleText: title?.textContent, composer: composer && r(composer) }
})()`)
log('layout', JSON.stringify(layout))

/* the screencast: every frame Codex paints, with its time */
const frames = []
codex.cdp.on(msg => {
  if (msg.method !== 'Page.screencastFrame' || msg.sessionId !== main) return
  const { data, metadata, sessionId } = msg.params
  const file = `f${String(frames.length).padStart(5, '0')}.jpg`
  writeFileSync(join(OUT, 'frames', file), Buffer.from(data, 'base64'))
  frames.push({ t: metadata.timestamp, file })
  codex.cdp.send('Page.screencastFrameAck', { sessionId }, main).catch(() => {})
})

/* input, as a person's: the cursor glides (60 moves a second, eased), presses, types */
const cursor = [], clicks = []
let at = { x: layout.vw * 0.72, y: layout.vh * 0.78 }
const move = async (x, y, ms) => {
  const from = { ...at }, n = Math.max(1, Math.round(ms / 16))
  for (let i = 1; i <= n; i++) {
    const u = i / n, e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2
    at = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e }
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
    cursor.push({ t: now(), ...at })
    await sleep(16)
  }
}
const click = async (button = 'left') => {
  const b = button === 'right' ? 2 : 1
  clicks.push({ t: now(), ...at, button })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button, buttons: b, clickCount: 1 })
  await sleep(70)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button, buttons: 0, clickCount: 1 })
}
const hold = async ms => { const end = Date.now() + ms; while (Date.now() < end) { cursor.push({ t: now(), ...at }); await sleep(33) } }

const T = layout.title, H = layout.home
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1200, everyNthFrame: 1 })
log('screencast on, hidden:', await evaluate('document.hidden'))
const t0 = now()
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
await hold(7600)                                                        // the koi swim, the cursor rests
await move(T.x + T.w * 0.3, T.y + T.h * 0.55, 900)                       // to the heading
await hold(250)
await click('right')                                                    // food on the words
await hold(4200)                                                        // the koi crowd in and light them up
await move(T.x + T.w * 0.12, T.y + T.h + 90, 700)                        // just under the crowd
await hold(200)
await click('left')                                                     // the cat's paw
await hold(2600)                                                        // they scatter
if (layout.composer) {
  const C = layout.composer
  await move(C.x + 40, C.y + C.h / 2, 900)
  await click('left')
  await hold(300)
  for (const ch of 'make my codex feel alive') { await send('Input.insertText', { text: ch }); cursor.push({ t: now(), ...at }); await sleep(70 + Math.random() * 50) }
  await hold(2200)
}
await send('Page.stopScreencast')
const t1 = now()
log('recorded', frames.length, 'frames in', (t1 - t0).toFixed(1), 's')

/* leave Codex as it was: the prompt cleared, the sidebar back */
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4, commands: ['selectAll'] })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 })
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
await toggleSidebar()

writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ t0, t1, layout, frames, cursor, clicks }, null, 0))
await codex.leave()
log('record done ->', OUT)
process.exit(0)
