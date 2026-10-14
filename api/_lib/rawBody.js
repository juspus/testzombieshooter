// Read the unparsed request body (needed for Stripe signature verification).
export async function readRawBody(req, maxBytes = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > maxBytes) throw new Error('body_too_large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}
