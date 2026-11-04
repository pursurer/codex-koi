// Starting Codex with the koi, shared by the launcher and the recorder.
//
// The official Codex (ChatGPT.app) starts with a DevTools pipe instead of a port. The pipe is two
// FIFOs that Codex itself holds open at both ends (read-write), so when the caller exits Codex sees
// no end of the connection: it keeps running, and the injected script stays registered for every
// reload of its pages. Nothing in the app bundle changes.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, openSync, closeSync, mkdtempSync, rmSync } from 'node:fs'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeClient } from './cdp-pipe.mjs'

const APP = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
const PID_FILE = new URL('./codex.pid', import.meta.url)
export const log = (...a) => console.log(new Date().toISOString(), ...a)

/* the page's own pond.js (a byte-for-byte copy of ASCII Koi's), read fresh on every launch, then the overlay that places it */
export const koiSource = () => readFileSync(new URL('./pond.js', import.meta.url), 'utf8') + '\n;\n' +
  readFileSync(new URL('./overlay.js', import.meta.url), 'utf8')

/*
 * Starts Codex and puts the koi in every app page it opens until `stop()`.
 * `onPage(info, sessionId)` hears of each page once the koi are in. `leave()` stops listening
 * and closes this side of the pipe, so the caller can exit while Codex runs on.
 */
export async function launchCodex({ args = [], onPage } = {}) {
  const source = koiSource()
  const dir = mkdtempSync(join(tmpdir(), 'codex-koi-'))
  const toApp = join(dir, 'in'), fromApp = join(dir, 'out')
  execFileSync('/usr/bin/mkfifo', [toApp, fromApp])
  const appIn = openSync(toApp, 'r+'), appOut = openSync(fromApp, 'r+')
  const child = spawn(APP, ['--remote-debugging-pipe', ...args], { stdio: ['ignore', 'ignore', 'ignore', appIn, appOut], detached: true })
  child.unref()
  writeFileSync(PID_FILE, String(child.pid))
  /* non-blocking pipe handles, so nothing waits on the FIFOs when the caller leaves */
  const writer = new Socket({ fd: openSync(toApp, 'w'), readable: false, writable: true })
  const reader = new Socket({ fd: openSync(fromApp, 'r'), readable: true, writable: false })
  closeSync(appIn); closeSync(appOut)
  /* the open ends keep the FIFOs alive; their names are no longer needed */
  rmSync(dir, { recursive: true, force: true })

  const cdp = pipeClient(writer, reader)
  const seen = new Set()
  const attach = async info => {
    if (info.type !== 'page' || !info.url.startsWith('app://') || seen.has(info.targetId)) return
    seen.add(info.targetId)
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: info.targetId, flatten: true })
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId)
      await cdp.send('Runtime.evaluate', { expression: source }, sessionId)
      log('koi in', info.url)
      if (onPage) onPage(info, sessionId)
    } catch (e) { seen.delete(info.targetId); log('skip', info.url, e.message) }
  }
  cdp.on(msg => {
    if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') attach(msg.params.targetInfo)
  })
  await cdp.send('Target.setDiscoverTargets', { discover: true })
  log('codex started, pid', child.pid)

  return {
    cdp, child, seen,
    /* stop listening for new pages (so Codex has nothing more to send) and close our side */
    async leave() {
      await cdp.send('Target.setDiscoverTargets', { discover: false }).catch(() => {})
      writer.end(); reader.destroy()
    },
  }
}
