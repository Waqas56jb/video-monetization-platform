/**
 * What a creator application is allowed to claim.
 *
 * Stage name, category and a paragraph were not enough to decide who publishes
 * on MTONYO+. The fields here are the assessment set: format, audience, sample
 * work, and why they want in. Kept in one file so the API and the admin list
 * cannot drift from each other.
 */

export const CONTENT_TYPES = [
  'Long-form video',
  'Series / episodic',
  'Short-form clips',
  'Live recordings',
  'Audio / podcasts',
  'Music videos',
  'Mixed / other',
]

export function isKnownContentType(value) {
  return CONTENT_TYPES.includes(String(value || '').trim())
}

export function shapeApplication(row) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    fullName: row.full_name,
    stageName: row.stage_name,
    email: row.email,
    phone: row.phone,
    location: row.location || '',
    contentType: row.content_type || '',
    category: row.category,
    bio: row.bio || '',
    description: row.description,
    whyJoin: row.why_join || '',
    followers: row.followers || '',
    engagement: row.engagement || '',
    socials: row.socials || [],
    sampleWork: row.sample_work || [],
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    termsAcceptedAt: row.terms_accepted_at,
    accessEndedAt: row.access_ended_at || null,
    accessEndNote: row.access_end_note || null,
  }
}
