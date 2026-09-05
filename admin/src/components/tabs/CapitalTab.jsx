import { useState } from 'react'
import { BadgeCheck, Check, Landmark, PauseCircle, ShieldCheck, Wallet, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { Async } from '@/components/ui/States'
import useApi, { tzs } from '@/hooks/useApi'
import api from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'

const FILTERS = [
  { key: 'under_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'repaid', label: 'Repaid' },
  { key: 'declined', label: 'Declined' },
  { key: '', label: 'All' },
]

const STATUS_PILL = {
  under_review: { className: 'pend', label: 'Under review' },
  approved: { className: 'info', label: 'Approved — offer not yet published' },
  active: { className: 'ok', label: 'Active' },
  paused: { className: 'gold', label: 'Paused' },
  repaid: { className: 'ok', label: 'Repaid' },
  declined: { className: 'bad', label: 'Declined' },
  building: { className: '', label: 'Building eligibility' },
}

const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Creator Capital — manual review only.
 *
 * MTONYO+ never decides who is approved or for how much. AirPay does; this
 * screen is where an admin, standing in for that decision, records it —
 * Review, Approve or Decline, then Publish Offer once AirPay's terms are
 * ready, then Pause or Mark Repaid as the balance moves. No interest, no
 * schedule math: the only arithmetic anywhere here is amount repaid against
 * amount approved.
 */
export default function CapitalTab() {
  const confirm = useConfirm()
  const [filter, setFilter] = useState('under_review')
  const [busy, setBusy] = useState(null)
  const [problem, setProblem] = useState(null)
  const [form, setForm] = useState({})

  const list = useApi(() => api.admin.capital(filter ? { status: filter } : {}), [filter])
  const rows = list.data?.applications || []
  const counts = list.data?.counts || {}

  const setField = (id, key) => (e) => setForm((f) => ({ ...f, [id]: { ...f[id], [key]: e.target.value } }))

  const run = async (id, fn) => {
    if (busy) return
    setBusy(id)
    setProblem(null)
    try {
      await fn()
      list.reload()
    } catch (err) {
      setProblem(err?.message || 'Could not save that')
    } finally {
      setBusy(null)
    }
  }

  const approve = (row) => {
    const f = form[row.id] || {}
    if (!f.approvedAmountTzs) return setProblem('An approved amount is required to approve a request')
    run(row.id, () =>
      api.admin.decideCapital(row.id, {
        decision: 'approve',
        approvedAmountTzs: Number(f.approvedAmountTzs),
        purpose: f.purpose || undefined,
        repaymentTerms: f.repaymentTerms || undefined,
      })
    )
  }

  const decline = (row) =>
    confirm({
      title: `Decline this Creator Capital request?`,
      text: `${row.creatorName} will be notified. They may request review again once eligible.`,
      onConfirm: () => run(row.id, () => api.admin.decideCapital(row.id, { decision: 'decline', note: (form[row.id]?.note || '').trim() || undefined })),
    })

  const publishOffer = (row) => run(row.id, () => api.admin.publishCapitalOffer(row.id))

  const pause = (row) =>
    confirm({
      title: `Pause repayment for ${row.creatorName}?`,
      text: 'The balance is untouched — this only marks repayment as on hold.',
      onConfirm: () => run(row.id, () => api.admin.pauseCapital(row.id, { note: (form[row.id]?.note || '').trim() || undefined })),
    })

  const markRepaid = (row) => {
    const amount = Number(form[row.id]?.repayAmountTzs || 0)
    if (!amount) return setProblem('Enter an amount to record')
    run(row.id, () => api.admin.markCapitalRepaid(row.id, amount))
  }

  return (
    <div className="tab">
      <Panel
        title="Creator Capital"
        action={
          <div className="chip-row">
            {FILTERS.map((f) => (
              <button
                key={f.key || 'all'}
                className={`chip ${filter === f.key ? 'on' : ''}`.trim()}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.key && counts[f.key] > 0 && ` (${counts[f.key]})`}
              </button>
            ))}
          </div>
        }
      >
        <p className="field-note" style={{ marginTop: -4 }}>
          <ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          MTONYO+ is not the lender — AirPay decides eligibility and approval. Actions here record
          that decision; they do not disburse or collect money.
        </p>

        {problem && (
          <p className="form-error" role="alert">
            {problem}
          </p>
        )}

        <Async
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={!rows.length}
          rows={3}
          emptyProps={{
            icon: Landmark,
            title: filter === 'under_review' ? 'Nobody is waiting' : 'Nothing here',
            hint:
              filter === 'under_review'
                ? 'Creators who request a review after 6 months of verified earnings appear here.'
                : 'Try another filter.',
          }}
        >
          <div className="app-list">
            {rows.map((r) => {
              const pill = STATUS_PILL[r.status] || { className: '', label: r.status }
              const f = form[r.id] || {}
              return (
                <article className={`app-card is-${r.status}`} key={r.id}>
                  <header className="app-head">
                    <div>
                      <b>{r.creatorName || r.creatorEmail}</b>
                      <span className={`pill ${pill.className}`}>{pill.label}</span>
                      {r.verified && (
                        <span className="pill info">
                          <BadgeCheck size={12} /> Verified
                        </span>
                      )}
                    </div>
                    <small>Requested {when(r.requestedAt)}</small>
                  </header>

                  <dl className="app-facts">
                    <div>
                      <dt>Months verified</dt>
                      <dd>
                        {r.monthsWithEarnings} of {r.monthsRequired}
                      </dd>
                    </div>
                    <div>
                      <dt>Lifetime earnings</dt>
                      <dd>{tzs(r.lifetimeCreatorTzs)}</dd>
                    </div>
                    <div>
                      <dt>Last 90 days</dt>
                      <dd>{tzs(r.recent90dCreatorTzs)}</dd>
                    </div>
                    <div>
                      <dt>Paying viewers</dt>
                      <dd>{r.payingViewers}</dd>
                    </div>
                    <div>
                      <dt>Repeat buyers</dt>
                      <dd>{r.repeatBuyers}</dd>
                    </div>
                    <div>
                      <dt>Refund rate</dt>
                      <dd>{r.refundRatePercent}%</dd>
                    </div>
                    {r.approvedAmountTzs != null && (
                      <>
                        <div>
                          <dt>Approved amount</dt>
                          <dd>{tzs(r.approvedAmountTzs)}</dd>
                        </div>
                        <div>
                          <dt>Repaid / remaining</dt>
                          <dd>
                            {tzs(r.amountRepaidTzs)} / {tzs(r.remainingBalanceTzs)}
                          </dd>
                        </div>
                      </>
                    )}
                    {r.purpose && (
                      <div>
                        <dt>Purpose</dt>
                        <dd>{r.purpose}</dd>
                      </div>
                    )}
                    {r.repaymentTerms && (
                      <div>
                        <dt>Repayment terms</dt>
                        <dd>{r.repaymentTerms}</dd>
                      </div>
                    )}
                  </dl>

                  {r.status === 'under_review' && (
                    <div className="app-actions">
                      <input
                        type="number"
                        placeholder="AirPay's approved amount (TZS)"
                        value={f.approvedAmountTzs || ''}
                        onChange={setField(r.id, 'approvedAmountTzs')}
                      />
                      <input
                        type="text"
                        placeholder="Purpose (optional)"
                        value={f.purpose || ''}
                        onChange={setField(r.id, 'purpose')}
                      />
                      <input
                        type="text"
                        placeholder="Repayment terms, from AirPay (optional)"
                        value={f.repaymentTerms || ''}
                        onChange={setField(r.id, 'repaymentTerms')}
                      />
                      <button className="btn btn-sm btn-gold" type="button" disabled={busy === r.id} onClick={() => approve(r)}>
                        <Check size={14} /> Approve
                      </button>
                      <button className="btn btn-sm btn-ghost" type="button" disabled={busy === r.id} onClick={() => decline(r)}>
                        <X size={14} /> Decline
                      </button>
                    </div>
                  )}

                  {r.status === 'approved' && (
                    <div className="app-actions">
                      <button className="btn btn-sm btn-gold" type="button" disabled={busy === r.id} onClick={() => publishOffer(r)}>
                        <Wallet size={14} /> Publish Offer
                      </button>
                    </div>
                  )}

                  {(r.status === 'active' || r.status === 'paused') && (
                    <div className="app-actions">
                      <input
                        type="number"
                        placeholder="Repayment amount to record (TZS)"
                        value={f.repayAmountTzs || ''}
                        onChange={setField(r.id, 'repayAmountTzs')}
                      />
                      <button className="btn btn-sm btn-gold" type="button" disabled={busy === r.id} onClick={() => markRepaid(r)}>
                        <Check size={14} /> Mark Repaid
                      </button>
                      {r.status === 'active' && (
                        <button className="btn btn-sm btn-ghost" type="button" disabled={busy === r.id} onClick={() => pause(r)}>
                          <PauseCircle size={14} /> Pause
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </Async>
      </Panel>
    </div>
  )
}
