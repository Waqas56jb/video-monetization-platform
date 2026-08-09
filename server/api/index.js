/**
 * Serverless entry point (Vercel, and anything with the same shape).
 *
 * The platform hands us a request; there is no port to bind and no process to
 * keep alive. So this exports the app and nothing else — importing
 * `src/index.js` here would call listen(), which on a serverless host makes a
 * deployment look like it started and then answer nothing at all.
 *
 * Database connections come from the transaction pooler, which is what makes
 * this safe: a normal Postgres connection per invocation would exhaust the
 * server's connection limit within minutes of real traffic.
 */
export { default } from '../src/app.js'
