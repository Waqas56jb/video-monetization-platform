import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Check,
  ExternalLink,
  Mail,
  Pause,
  Phone,
  RotateCcw,
  UserPlus,
  X,
} from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { Async } from '@/components/ui/States'
import useApi from '@/hooks/useApi'
import api from '@/lib/api'
import { useConfirm } from '@/context/ConfirmContext'

const FILTERS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'rejected', label: 'Declined' },
  { key: 'revoked', label: 'Revoked' },
  { key: '', label: 'All' },
]

const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const links = (list) => (Array.isArray(list) ? list.filter(Boolean) : [])

/**
 * Who has asked to sell on MTONYO+.
 *
 * Approving is the only thing that turns a viewer into a creator. From this
 * same queue staff can also decline, suspend an active creator, or revoke
 * access entirely.
 */
export default function CreatorApplicationsTab() {
  const confirm = useConfirm()
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

  const run = async (id, fn) => {
    if (busy) return
    setBusy(id)
    setProblem(null)
    try {
      await fn()
      setNote((n) => ({ ...n, [id]: '' }))
      list.reload()
    } catch (err) {
      setProblem(err?.message || 'Could not save that')
    } finally {
      setBusy(null)
    }
  }

  const decide = (row, decision) =>
    run(row.id, () =>
      api.admin.decideCreatorApplication(row.id, {
        decision,
        note: (note[row.id] || '').trim() || undefined,
      })
    )

  const suspend = (row) =>
    confirm({
      title: `Suspend ${row.stageName}?`,
      text: 'They can still sign in and their videos stay up, but they cannot upload or change anything until you restore them.',
      onConfirm: () =>
        run(row.id, () =>
          api.admin.suspendCreator(row.userId, {
            note: (note[row.id] || '').trim() || undefined,
          })
        ),
    })

  const restore = (row) =>
    run(row.id, () => api.admin.restoreCreator(row.userId))

  const revoke = (row) =>
    confirm({
      title: `Revoke creator access for ${row.stageName}?`,
      text: 'The account returns to a viewer. Purchases stay. Videos are not taken down here.',
      onConfirm: () =>
        run(row.id, () =>
          api.admin.revokeCreator(row.userId, {
            note: (note[row.id] || '').trim() || undefined,
          })
        ),
    })

  const pillFor = (row) => {
    if (row.accessEndedAt || (row.status === 'approved' && row.currentRole !== 'creator')) {
      return { className: 'bad', label: 'Revoked' }
    }
    if (row.status === 'approved' && row.accountStatus && row.accountStatus !== 'active') {
      return { className: 'gold', label: 'Suspended' }
    }
    if (row.status === 'pending') return { className: 'pend', label: 'Waiting' }
    if (row.status === 'approved') return { className: 'ok', label: 'Approved' }
    return { className: 'bad', label: 'Declined' }
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
            {rows.map((a) => {
              const pill = pillFor(a)
              const activeCreator =
                a.currentRole === 'creator' && !a.accessEndedAt && a.status === 'approved'
              const suspended = activeCreator && a.accountStatus && a.accountStatus !== 'active'
              const socials = links(a.socials)
              const samples = links(a.sampleWork)
              return (
                <article className={`app-card is-${a.status}`} key={a.id}>
                  <header className="app-head">
                    <div>
                      <b>{a.stageName}</b>
                      <span className={`pill ${pill.className}`}>{pill.label}</span>
                      {activeCreator && !suspended && (
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
                      <dt>Location</dt>
                      <dd>{a.location || '—'}</dd>
                    </div>
                    <div>
                      <dt>Type of content</dt>
                      <dd>{a.contentType || '—'}</dd>
                    </div>
                    <div>
                      <dt>Main category</dt>
                      <dd>{a.category}</dd>
                    </div>
                    <div>
                      <dt>Followers</dt>
                      <dd>{a.followers || '—'}</dd>
                    </div>
                    <div>
                      <dt>Engagement</dt>
                      <dd>{a.engagement || '—'}</dd>
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

                  {a.bio ? (
                    <div className="app-block">
                      <small>Bio</small>
                      <p>{a.bio}</p>
                    </div>
                  ) : null}

                  <div className="app-block">
                    <small>What they will publish</small>
                    <p className="app-about">{a.description}</p>
                  </div>

                  {a.whyJoin ? (
                    <div className="app-block">
                      <small>Why MTONYO+</small>
                      <p>{a.whyJoin}</p>
                    </div>
                  ) : null}

                  {samples.length > 0 && (
                    <div className="app-block">
                      <small>Sample work</small>
                      <ul className="app-links">
                        {samples.map((s) => (
                          <li key={s}>
                            <a href={s} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={12} />
                              {s.replace(/^https?:\/\/(www\.)?/, '')}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {socials.length > 0 && (
                    <ul className="app-links">
                      {socials.map((s) => (
                        <li key={s}>
                          <a href={s} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={12} />
                            {s.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  <small className="app-terms">Creator Terms accepted {when(a.termsAcceptedAt)}</small>

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
                        {a.accessEndedAt ? ` · Revoked ${when(a.accessEndedAt)}` : ''}
                        {a.accessEndNote ? ` — “${a.accessEndNote}”` : ''}
                      </span>
                      {activeCreator && (
                        <div className="app-actions">
                          <input
                            placeholder="Note (optional)"
                            value={note[a.id] || ''}
                            onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))}
                          />
                          {suspended ? (
                            <button
                              className="btn btn-gold btn-sm"
                              disabled={busy === a.id}
                              onClick={() => restore(a)}
                            >
                              <RotateCcw size={14} />
                              Restore
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy === a.id}
                              onClick={() => suspend(a)}
                            >
                              <Pause size={14} />
                              Suspend
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy === a.id}
                            onClick={() => revoke(a)}
                            title="Return this account to a viewer. Their purchases are untouched."
                          >
                            <Ban size={14} />
                            Revoke
                          </button>
                        </div>
                      )}
                    </footer>
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
