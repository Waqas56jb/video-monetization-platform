/**
 * When a failed refresh actually means "you are signed out".
 *
 * `POST /api/auth/refresh` failing is not one event. It can mean the server
 * looked at the refresh token and rejected it — the session really is over — or
 * it can mean the request never got a verdict: the API was restarting, a proxy
 * answered, or the rate limiter turned it away.
 *
 * Those were treated identically: any non-2xx cleared the tokens and announced
 * an expiry. So a single 429 or a 502 during a deploy signed the viewer out
 * mid-session, and because the apps then look anonymous, a video they had paid
 * for came back showing Unlock. Nothing on screen said they had been logged out.
 *
 * That distinction became sharper when the API moved to Railway. One process
 * restarts on every deploy, so 502 is now a real answer during a redeploy where
 * a serverless host would simply have cold-started. And the rate limiter is keyed
 * on client IP, which makes a 429 a shared, not a personal, event: several
 * viewers behind one address, or a misconfigured proxy depth, can spend a bucket
 * that was never theirs.
 *
 * Only a verdict ends a session. Anything else keeps the tokens and lets the
 * next request try again — the worst case is one more failed call, against a
 * viewer being thrown out of a video they are watching.
 */
export function refreshTokenRejected(status) {
  return status === 400 || status === 401 || status === 403 || status === 422
}
