import { useState } from 'react'
import { BadgeCheck, Check, ExternalLink, Mail, Phone, UserPlus, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { Async } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'

const FILTERS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Declined' },
  { key: '', label: 'All' },
]

const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Who has asked to sell on MTONYO+.
 *
 * Approving is the only thing on the platform that turns a viewer into a
 * creator, so this screen is where that decision is made and recorded. A
 * decision is final for that application — somebody who is declined applies
 * again, which is why the reason is worth writing.
 */
export default function CreatorApplicationsTab() {
  const [filter, setFilter] = useState('pending')
  const [note, setNote] = useState({})
  const [busy, setBusy] = useState(null)
  const [problem, setProblem] = useState(null)

  const list = useApi(
    () => api.admin.creatorApplications(filter ? { status: filter } : {}),
    [filter]
  )
  const rows = list.data?.applications || []
  const counts = list.data?.counts || {}

  const decide = async (row, decision) => {
    if (busy) return
    setBusy(row.id)
    setProblem(null)
    try {
      await api.admin.decideCreatorApplication(row.id, {
        decision,
        note: (note[row.id] || '').trim() || undefined,
      })
      setNote((n) => ({ ...n, [row.id]: '' }))
      list.reload()
    } catch (err) {
      setProblem(err?.message || 'Could not save that decision')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (row) => {
    if (busy) return
    setBusy(row.id)
    setProblem(null)
    try {
      await api.admin.revokeCreator(row.userId, {
        note: (note[row.id] || '').trim() || undefined,
      })
      list.reload()
    } catch (err) {
      setProblem(err?.message || 'Could not remove creator access')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tab">
      <Panel
        title="Creator applications"
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
            icon: UserPlus,
            title: filter === 'pending' ? 'Nobody is waiting' : 'Nothing here',
            hint:
              filter === 'pending'
                ? 'Applications from viewers who want to sell on MTONYO+ appear here.'
                : 'Try another filter.',
          }}
        >
          <div className="app-list">
            {rows.map((a) => (
              <article className={`app-card is-${a.status}`} key={a.id}>
                <header className="app-head">
                  <div>
                    <b>{a.stageName}</b>
                    <span className={`pill ${a.status === 'pending' ? 'warn' : a.status === 'approved' ? 'good' : 'bad'}`}>
                      {a.status === 'pending' ? 'Waiting' : a.status === 'approved' ? 'Approved' : 'Declined'}
                    </span>
                    {a.currentRole === 'creator' && (
                      <span className="pill info">
                        <BadgeCheck size={12} /> Creator now
                      </span>
                    )}
                  </div>
                  <small>Applied {when(a.createdAt)}</small>
                </header>

                <dl className="app-facts">
                  <div>
                    <dt>Full name</dt>
                    <dd>{a.fullName}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{a.category}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>
                      <a href={`mailto:${a.email}`}>
                        <Mail size={12} /> {a.email}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      <Phone size={12} /> {a.phone}
                    </dd>
                  </div>
                </dl>

                <p className="app-about">{a.description}</p>

                {a.socials?.length > 0 && (
                  <ul className="app-links">
                    {a.socials.map((s) => (
                      <li key={s}>
                        <a href={s} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={12} />
                          {s.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                <small className="app-terms">
                  Creator Terms accepted {when(a.termsAcceptedAt)}
                </small>

                {a.status === 'pending' ? (
                  <div className="app-decide">
                    <input
                      placeholder="Reason — sent to them if you decline"
                      value={note[a.id] || ''}
                      onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-gold btn-sm"
                      disabled={busy === a.id}
                      onClick={() => decide(a, 'approve')}
                    >
                      <Check size={14} />
                      Approve
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy === a.id}
                      onClick={() => decide(a, 'reject')}
                    >
                      <X size={14} />
                      Decline
                    </button>
                  </div>
                ) : (
                  <footer className="app-decided">
                    <span>
                      {a.status === 'approved' ? 'Approved' : 'Declined'} {when(a.decidedAt)}
                      {a.decidedByEmail ? ` by ${a.decidedByEmail}` : ''}
                      {a.decisionNote ? ` — “${a.decisionNote}”` : ''}
                    </span>
                    {a.currentRole === 'creator' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === a.id}
                        onClick={() => revoke(a)}
                        title="Return this account to a viewer. Their purchases are untouched."
                      >
                        Remove creator access
                      </button>
                    )}
                  </footer>
                )}
              </article>
            ))}
          </div>
        </Async>
      </Panel>
    </div>
  )
}
