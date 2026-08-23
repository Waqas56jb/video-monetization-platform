import { supabaseAdmin } from './supabase.js'
import { capabilities } from '../config/env.js'
import { log } from './logger.js'

const BUCKET = 'share-cards'

/** Upload branded JPEG to public Supabase Storage (CDN-backed, no serverless on hot path). */
export async function uploadShareCardToStorage(slug, sourceKey, jpeg) {
  if (!capabilities.serviceRole || !slug || !sourceKey || !jpeg?.length) return false
  try {
    const path = `${slug}-${sourceKey}.jpg`
    const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, jpeg, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    })
    if (error) {
      log.warn(`share-cards upload ${slug}: ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    log.warn(`share-cards upload ${slug}:`, err.message)
    return false
  }
}
