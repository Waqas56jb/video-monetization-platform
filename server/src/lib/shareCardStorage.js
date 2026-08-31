import { supabaseAdmin } from './supabase.js'
import { capabilities } from '../config/env.js'
import { log } from './logger.js'
import { SHARE_CARD_BUCKET, writeCardPaths } from './shareCardObjectPath.js'

const BUCKET = SHARE_CARD_BUCKET

let bucketReady = false

async function ensureBucket() {
  if (bucketReady || !capabilities.serviceRole) return bucketReady
  try {
    const admin = supabaseAdmin()
    const { data } = await admin.storage.getBucket(BUCKET)
    if (!data) {
      const { error } = await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: '2MB',
      })
      if (error && !/already exists/i.test(error.message || '')) {
        log.warn(`share-cards bucket: ${error.message}`)
        return false
      }
    }
    bucketReady = true
    return true
  } catch (err) {
    log.warn(`share-cards bucket: ${err.message}`)
    return false
  }
}

async function putObject(path, jpeg, cacheControl) {
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    cacheControl,
    upsert: true,
  })
  if (error) {
    log.warn(`share-cards upload ${path}: ${error.message}`)
    return false
  }
  return true
}

/**
 * Upload branded JPEG to public Supabase Storage.
 *
 * Two keys, both named by `shareCardObjectPath` so the reader in
 * `client/api/og.js` and the URL in `shareMeta` cannot drift from what is
 * actually written here.
 */
export async function uploadShareCardToStorage(slug, sourceKey, jpeg) {
  if (!capabilities.serviceRole || !slug || !jpeg?.length) return false
  try {
    if (!(await ensureBucket())) return false
    const paths = writeCardPaths(slug, sourceKey)
    const latest = await putObject(paths.latest, jpeg, '3600')
    const versioned = paths.versioned
      ? await putObject(paths.versioned, jpeg, '31536000')
      : true
    return latest && versioned
  } catch (err) {
    log.warn(`share-cards upload ${slug}:`, err.message)
    return false
  }
}
