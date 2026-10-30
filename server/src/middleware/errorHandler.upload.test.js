import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import multer from 'multer'
import { errorHandler } from './errorHandler.js'

/**
 * An upload multer refuses is the uploader's mistake, not a server fault.
 *
 * A 7 MB sponsor banner (multer's cap is 6 MB) answered 500 on production on
 * 2026-10-30: MulterError carries `code` but no `status`. Same for avatars and
 * video thumbnails, which use the same limits.
 */
async function post(form) {
  const app = express()
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024, files: 1 } })
  app.post('/up', upload.single('image'), (_req, res) => res.json({ ok: true }))
  app.use(errorHandler)
  const server = app.listen(0)
  try {
    await new Promise((r) => server.once('listening', r))
    const res = await fetch(`http://127.0.0.1:${server.address().port}/up`, { method: 'POST', body: form })
    return { status: res.status, body: await res.json() }
  } finally {
    await new Promise((r) => server.close(r))
  }
}
const file = (bytes) => new Blob([Buffer.alloc(bytes, 1)], { type: 'image/png' })

test('a file over the cap is a 413 with a message a person can act on', async () => {
  const f = new FormData()
  f.append('image', file(4096), 'big.png')
  const res = await post(f)
  assert.equal(res.status, 413)
  assert.equal(res.body.error.code, 'UPLOAD_REJECTED')
  assert.match(res.body.error.message, /too large/)
})

test('two files, or a file under an unexpected field, is a 400 — not a 500', async () => {
  const two = new FormData()
  two.append('image', file(10), 'a.png')
  two.append('image', file(10), 'b.png')
  assert.equal((await post(two)).status, 400)
  const wrong = new FormData()
  wrong.append('photo', file(10), 'a.png')
  const res = await post(wrong)
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'UPLOAD_REJECTED')
})

test('a file within the cap still goes through', async () => {
  const f = new FormData()
  f.append('image', file(100), 'ok.png')
  assert.deepEqual(await post(f), { status: 200, body: { ok: true } })
})
