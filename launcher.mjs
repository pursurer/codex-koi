// Codex Koi launcher: starts the official Codex with the ASCII Koi pond behind its new-chat page,
// waits for the windows Codex opens at start, and leaves. Quitting Codex and opening it normally
// removes it all. How the koi get in: codex-pipe.mjs.
import { launchCodex, log } from './codex-pipe.mjs'

/* how long to keep adding windows Codex opens at start (a detached window comes a few seconds after the main one) */
const SETTLE_MS = 8000

const codex = await launchCodex({
  /* KOI_EVAL=<expression>: a look at each page while developing, logged 6.5 s after the koi go in */
  onPage(info, sessionId) {
    if (!process.env.KOI_EVAL) return
    setTimeout(async () => {
      const r = await codex.cdp.send('Runtime.evaluate', { expression: process.env.KOI_EVAL, returnByValue: true }, sessionId).catch(e => ({ result: { value: e.message } }))
      log('eval', info.url, JSON.stringify(r.result?.value ?? r.exceptionDetails?.text))
    }, 6500)
  },
})

setTimeout(async () => {
  await codex.leave()
  log('launcher done; koi stay with', codex.seen.size, 'page(s)')
  process.exit(0)
}, SETTLE_MS)
