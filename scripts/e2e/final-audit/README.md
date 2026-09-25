# Final audit probes (2026-09-25)

The scripts behind `FINAL-AUDIT.md`. Each one runs against production and reads every
credential from the environment (see `E2E-ACCOUNTS.md`, which is not committed):

    PLAYWRIGHT_MODULE=file:///… BASE=… API=… ADMIN_WEB=… AUD=<output dir>
    E2E_EMAIL / E2E_PASSWORD · CREATOR_EMAIL / CREATOR_PASSWORD · ADMIN_EMAIL / ADMIN_PASSWORD
    VIEWER_ONLY_EMAIL / VIEWER_ONLY_PASSWORD (secC only)

`secF.mjs`, `secG.mjs`, `secC.mjs` and `secL.mjs` change live settings or records through the
admin API and restore them in a `finally` block; `secL.mjs` makes real sandbox purchases, which
must be refunded afterwards through `POST /api/admin/payments/:id/refund`. `secF.mjs` and
`secG.mjs` import the server's `pg`/`dotenv` and are meant to be run from `server/`.
Evidence from the run is in `scripts/e2e/evidence/final-audit-2026-09-25/`.
