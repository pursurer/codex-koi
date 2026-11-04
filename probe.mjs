import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeClient } from './cdp-pipe.mjs'
const scratch = process.argv[2]
const ud = mkdtempSync(join(scratch, 'ud-')), home = mkdtempSync(join(scratch, 'codexhome-'))
const child = spawn('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', ['--remote-debugging-pipe', `--user-data-dir=${ud}`], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME: home } })
let err = ''; child.stderr.on('data', d => { err += d })
const cdp = pipeClient(child.stdio[3], child.stdio[4])
const done = (code) => { try { child.kill('SIGTERM') } catch {} ; setTimeout(() => process.exit(code), 500) }
setTimeout(() => { console.log('TIMEOUT; stderr tail:', err.slice(-600)); done(1) }, 25000)
try {
  const v = await cdp.send('Browser.getVersion'); console.log('version', v.product, v.userAgent?.slice(0, 80))
  await new Promise(r => setTimeout(r, 6000))
  const { targetInfos } = await cdp.send('Target.getTargets')
  for (const t of targetInfos) console.log('target', t.type, t.url.slice(0, 120), '|', t.title.slice(0, 40))
  const page = targetInfos.find(t => t.type === 'page')
  if (page) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
    const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({href: location.href, title: document.title, h: [...document.querySelectorAll("h1,h2")].map(e=>e.textContent.trim()).slice(0,5)})', returnByValue: true }, sessionId)
    console.log('page', r.result.value)
  }
  done(0)
} catch (e) { console.log('ERR', e.message, err.slice(-400)); done(1) }
