// Read the unparsed request body (needed for Stripe signature verification).
//
// On Vercel's Node runtime the default request helpers (@vercel/node addHelpers)
// drain the stream BEFORE the handler runs, then replay it by patching only
// req.on('data'|'end') and req.read. `export const config = { api: { bodyParser: false } }`
// is a Next.js option and is NOT read for plain api/*.js functions. So:
//   - read via 'data'/'end' events (works on a raw IncomingMessage and on the
//     replayed stream; `for await (… of req)` sees an empty body under the helpers),
//   - if the stream yields nothing, accept req.body only if it is a Buffer/string
//     (raw bytes); a parsed object is never re-serialized, so signature
//     verification fails closed,
//   - time out instead of hanging if the stream was consumed with no replay.
export function readRawBody(req, { maxBytes = 1024 * 1024, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    let timer
    const finish = (err, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(value)
    }
    // Raw bytes already captured by the runtime (Buffer/string only — never a parsed object).
    const bufferedBody = () => {
      let body
      try { body = req.body } catch { return null } // Vercel's lazy JSON getter can throw
      if (Buffer.isBuffer(body)) return body
      if (typeof body === 'string') return Buffer.from(body, 'utf8')
      return null
    }
    timer = setTimeout(() => {
      const body = bufferedBody()
      if (body) finish(null, body)
      else finish(new Error('body_timeout'))
    }, timeoutMs)

    req.on('data', (chunk) => {
      if (done) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > maxBytes) return finish(new Error('body_too_large'))
      chunks.push(buf)
    })
    req.on('error', (err) => finish(err))
    req.on('end', () => {
      if (size > 0) return finish(null, Buffer.concat(chunks))
      finish(null, bufferedBody() ?? Buffer.alloc(0)) // parsed object or nothing: fails verification
    })
  })
}
