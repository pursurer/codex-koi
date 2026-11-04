// The Chrome DevTools Protocol over --remote-debugging-pipe: the app reads
// commands on its fd 3 and writes replies and events on its fd 4, each JSON
// message ended by a NUL. `writer` and `reader` are our ends of those two pipes.
export function pipeClient(writer, reader) {
  let next = 1, buf = ''
  const waiting = new Map(), listeners = []
  reader.setEncoding('utf8')
  reader.on('data', chunk => {
    buf += chunk
    let end
    while ((end = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, end)); buf = buf.slice(end + 1)
      if (msg.id && waiting.has(msg.id)) { const { ok, ko } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? ko(new Error(msg.error.message)) : ok(msg.result) }
      else for (const fn of listeners) fn(msg)
    }
  })
  return {
    send(method, params = {}, sessionId) {
      const id = next++
      writer.write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + '\0')
      return new Promise((ok, ko) => waiting.set(id, { ok, ko }))
    },
    on(fn) { listeners.push(fn) },
  }
}
