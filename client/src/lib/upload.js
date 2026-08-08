/**
 * Sending a video to Cloudflare.
 *
 * The file never touches our server. The API hands back a one-time upload URL
 * and the browser posts straight to Cloudflare — which is what makes a 2GB
 * upload from a phone on Tanzanian mobile data feasible at all, and why the
 * API never needs to grow to accommodate large files.
 *
 * XMLHttpRequest rather than fetch, for one reason: fetch still cannot report
 * upload progress. Somebody sending half a gigabyte over a slow connection
 * needs to see the bar move or they will assume it has hung and start again.
 */

export class UploadError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'UploadError'
    this.status = status
  }
}

/**
 * @param {File} file
 * @param {string} url        one-time Cloudflare upload URL
 * @param {(pct:number, sent:number, total:number) => void} onProgress
 * @returns {{ promise: Promise<void>, abort: () => void }}
 */
export function uploadToCloudflare(file, url, onProgress) {
  const xhr = new XMLHttpRequest()

  const promise = new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, file.name)

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return
      onProgress?.(Math.round((e.loaded / e.total) * 100), e.loaded, e.total)
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100, file.size, file.size)
        resolve()
      } else {
        reject(
          new UploadError(
            xhr.status === 0
              ? 'The upload was interrupted. Check your connection and try again.'
              : `Cloudflare rejected the upload (${xhr.status}). ${xhr.responseText || ''}`.trim(),
            { status: xhr.status }
          )
        )
      }
    })

    xhr.addEventListener('error', () =>
      reject(new UploadError('The upload failed. Check your connection and try again.'))
    )
    xhr.addEventListener('abort', () => reject(new UploadError('Upload cancelled')))
    xhr.addEventListener('timeout', () =>
      reject(new UploadError('The upload timed out. A slower connection may need a smaller file.'))
    )

    xhr.open('POST', url)
    // No timeout: a large file on a slow connection is not a stuck request,
    // and cutting it off after an arbitrary minute would be its own bug.
    xhr.timeout = 0
    xhr.send(form)
  })

  return { promise, abort: () => xhr.abort() }
}

/**
 * Wait for Cloudflare to finish encoding, reporting progress as it goes.
 *
 * Cloudflare is normally done in well under a minute for a short clip, but a
 * long one can take several. The interval backs off so a fifteen-minute encode
 * does not mean nine hundred requests.
 */
export function watchEncoding(videoId, api, { onProgress, signal } = {}) {
  let stop = false
  const cancel = () => {
    stop = true
  }
  signal?.addEventListener?.('abort', cancel)

  const promise = (async () => {
    let wait = 2000
    const startedAt = Date.now()

    while (!stop) {
      // Fifteen minutes is far longer than any legitimate encode of a file
      // this platform accepts; past that, something is wrong and saying so is
      // more useful than spinning forever.
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        throw new UploadError(
          'This is taking much longer than expected. Your video is safe — check back on My Videos in a few minutes.'
        )
      }

      let res
      try {
        res = await api.videos.status(videoId)
      } catch {
        // A blip in connectivity is not a failed encode. Wait and ask again.
        await sleep(wait)
        continue
      }

      onProgress?.(res.progress ?? 0, res.state)

      if (res.state === 'ready') return res
      if (res.state === 'failed') {
        throw new UploadError(res.error || 'Cloudflare could not process this file.')
      }

      await sleep(wait)
      wait = Math.min(wait * 1.4, 10000)
    }

    throw new UploadError('Cancelled')
  })()

  return { promise, cancel }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Human file size, for the "2.4 GB of 4 GB" line under the progress bar. */
export const fileSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * What we will accept, checked before a single byte leaves the device.
 *
 * Finding out a file is the wrong type after uploading it over mobile data is
 * an expensive way to learn.
 */
export const ACCEPTED = 'video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo'
const ACCEPTED_EXT = /\.(mp4|mov|m4v|mkv|webm|avi)$/i
const MAX_BYTES = 4 * 1024 * 1024 * 1024 // 4 GB

export function validateFile(file) {
  if (!file) return 'Choose a video file'
  const looksRight = file.type.startsWith('video/') || ACCEPTED_EXT.test(file.name)
  if (!looksRight) return 'That is not a video file. MP4, MOV, MKV, WebM and AVI all work.'
  if (file.size > MAX_BYTES) return `That file is ${fileSize(file.size)}. The limit is 4 GB.`
  if (file.size < 1024) return 'That file looks empty.'
  return null
}
