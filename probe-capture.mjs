// Dev check: can the pipe capture frames and send input? Runs an isolated, signed-out Codex
// (its own profile and CODEX_HOME), so the everyday Codex is never touched.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pipeClient } from './cdp-pipe.mjs'
const scratch = process.argv[2], flags = process.argv.slice(3)
const ud = mkdtempSync(join(scratch, 'ud-')), home = mkdtempSync(join(scratch, 'home-'))
const child = spawn('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', ['--remote-debugging-pipe', `--user-data-dir=${ud}`, ...flags], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME: home } })
const cdp = pipeClient(child.stdio[3], child.stdio[4])
const race = (p, ms, what) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error(what + ' timed out')), ms))])
const done = code => { try { child.kill('SIGTERM') } catch {} ; setTimeout(() => process.exit(code), 800) }
try {
  await new Promise(r => setTimeout(r, 5000))
  const { targetInfos } = await cdp.send('Target.getTargets')
  const page = targetInfos.find(t => t.type === 'page' && t.url.startsWith('app://'))
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
  let frames = 0
  cdp.on(m => { if (m.method === 'Page.screencastFrame' && m.sessionId === sessionId) { frames++; cdp.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }, sessionId) } })
  for (const step of ['Page.enable', 'Runtime.enable']) console.log(step, await race(cdp.send(step, {}, sessionId).then(() => 'ok'), 5000, step).catch(e => e.message))
  console.log('hidden', (await cdp.send('Runtime.evaluate', { expression: 'document.hidden + " " + document.visibilityState', returnByValue: true }, sessionId)).result.value)
  console.log('screencast', await race(cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280 }, sessionId).then(() => 'ok'), 5000, 'screencast').catch(e => e.message))
  await new Promise(r => setTimeout(r, 2500))
  console.log('frames after 2.5 s', frames)
  console.log('mouse', await race(cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 300 }, sessionId).then(() => 'ok'), 5000, 'mouse').catch(e => e.message))
  console.log('shot', await race(cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 }, sessionId).then(r => 'ok ' + r.data.length), 8000, 'shot').catch(e => e.message))
  done(0)
} catch (e) { console.log('ERR', e.message); done(1) }
