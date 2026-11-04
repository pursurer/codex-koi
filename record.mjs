// Records promo footage of the real Codex with the koi: its interface in English for this run only
// (--lang=en-US), and demo.js playing the take inside the page (an in-page cursor feeds the koi on
// the heading, sends the cat's paw, types a prompt that is never sent). macOS itself records the
// window (screencapture -v), so what is filmed is what is on screen.
//
//   KOI_OUT=/path/to/dir node record.mjs [--restart]                   starts Codex and films one take
//                                                                       (--restart: quit an open Codex first)
//   KOI_OUT=/path/to/dir KOI_RECT=x,y,w,h node record.mjs --again      a retake in the same Codex
//   KOI_OUT=/path/to/dir node record.mjs --studio [--restart]          Codex with the koi and the sidebar hidden,
//                                                                       for a screen recorder and a real cursor; films nothing
//
// The pipe is used only in the first two seconds (koi, demo, the window's place): a few seconds
// in, Codex starts its computer-use helper, which inherits the pipe and makes large messages
// unreliable. The take starts when Codex is the front app; leave it there, pointer off the
// window, until "take done". For a retake, switch away from Codex and back.
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchCodex, log } from './codex-pipe.mjs'

const OUT = process.env.KOI_OUT
if (!OUT) { console.error('set KOI_OUT'); process.exit(2) }
const SECONDS = Number(process.env.KOI_SECONDS || 26)
const again = process.argv.includes('--again'), studio = process.argv.includes('--studio')
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const front = () => {
  try { return /bundleID="com\.openai\.codex"/.test(execFileSync('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', execFileSync('/usr/bin/lsappinfo', ['front']).toString().trim()]).toString()) }
  catch { return false }
}

let rect
if (!again) {
  /* the take starts its own Codex: an open one would take over and get no koi. --restart quits it first */
  const open = () => { try { execFileSync('/usr/bin/pgrep', ['-f', '^/Applications/ChatGPT.app/Contents/MacOS/ChatGPT']); return true } catch { return false } }
  if (open()) {
    if (!process.argv.includes('--restart')) { log('Codex is open: quit it (⌘Q), or run with --restart'); process.exit(2) }
    log('quitting the open Codex (answer its dialog if it asks)…')
    try { execFileSync('/usr/bin/osascript', ['-e', 'tell application id "com.openai.codex" to if it is running then quit'], { timeout: 5000 }) } catch {}
    for (let i = 0; open(); i++) { if (i > 1200) { log('Codex is still open: quit it (⌘Q), then run again'); process.exit(2) } await sleep(100) }
    await sleep(1500)
  }
  let main = null
  const codex = await launchCodex({ args: ['--lang=en-US'], onPage(info, sessionId) { if (info.url.split('?')[0].endsWith('/index.html')) main = sessionId } })
  for (let i = 0; i < 80 && !main; i++) await sleep(50)
  if (!main) { log('no main page'); process.exit(1) }
  const demo = readFileSync(new URL('./demo.js', import.meta.url), 'utf8')
  const send = (method, params) => Promise.race([codex.cdp.send(method, params, main), sleep(3000).then(() => { throw new Error(`${method} did not answer`) })])
  const source = (studio ? 'window.__codexKoiDemoManual = true;\n' : '') + demo
  await send('Page.addScriptToEvaluateOnNewDocument', { source })
  await send('Runtime.evaluate', { expression: source })
  /* a reply cut short by the helper must not end the take: the demo is already in */
  process.on('uncaughtException', e => log('pipe:', e.message.slice(0, 80)))
  const value = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value
  /* only once the sidebar is hidden may the window come forward */
  const READY = studio ? 'manual' : 'armed'
  for (let i = 0; i < 60; i++) { if (await value('window.__codexKoiDemo?.state').catch(() => null) === READY) break; await sleep(250) }
  rect = await value('[screenX, screenY, outerWidth, outerHeight].join()').catch(() => null)
  const armed = await value('window.__codexKoiDemo?.state').catch(() => null) === READY
  await codex.leave()
  log('demo', armed ? 'armed' : 'not confirmed', '| window at', rect)
  if (!rect || !armed) { log('not ready: Codex stays behind; nothing filmed'); process.exit(1) }
  if (studio) { writeFileSync(join(OUT, 'rect.json'), JSON.stringify(rect)); log('studio: koi on, sidebar hidden; record with your screen recorder'); process.exit(0) }
  /* bring it forward; if it does not come, a click on its title bar does */
  execFileSync('/usr/bin/osascript', ['-e', 'tell application id "com.openai.codex" to if it is running then activate'])
} else {
  rect = process.env.KOI_RECT
  if (!rect) { console.error('set KOI_RECT=x,y,w,h (from the first take\'s rect.json)'); process.exit(2) }
  log('retake: switch away from Codex, then back')
  while (front()) await sleep(150)
}
writeFileSync(join(OUT, 'rect.json'), JSON.stringify(rect))

log('>>> waiting for Codex in front (pointer off the window, then leave it)')
for (let i = 0; !front(); i++) { if (i % 60 === 0 && i) log('still waiting'); if (i > 3000) { log('Codex never came to the front'); process.exit(1) } await sleep(100) }
log('Codex in front: filming', SECONDS, 's')
const take = join(OUT, 'take.mov')
const code = await new Promise(done => spawn('/usr/sbin/screencapture', ['-v', '-V', String(SECONDS), '-x', `-R${rect}`, take], { stdio: 'inherit' }).on('exit', done))
log(code === 0 ? 'take done ->' : `screencapture exit ${code} ->`, take)
process.exit(code ?? 1)
