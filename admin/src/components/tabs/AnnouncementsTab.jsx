import { useCallback, useEffect, useMemo, useState } from 'react'
import { Megaphone, Search, Send, Trash2, Users } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Field from '@/components/ui/Field'
import { Async } from '@/components/ui/States'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirm } from '@/context/ConfirmContext'

/**
 * Talk to the platform.
 *
 * An announcement goes to one named person, to every viewer, to every creator,
 * to the moderation team, or to everyone. Each recipient gets their own copy in
 * their inbox, so "read" means read by that person rather than read by anybody.
 *
 * A sub-admin may address groups but not a named individual. Choosing one
 * person means first browsing the list of people, and browsing accounts is
 * precisely what a sub-admin is not allowed to do. The server enforces this
 * too — the option is simply not offered here rather than being offered and
 * then refused.
 */

const GROUP_AUDIENCES = [
  { value: 'all_users', label: 'All viewers', hint: 'Everyone with a viewer account' },
  { value: 'all_creators', label: 'All creators', hint: 'Everyone who uploads' },
  { value: 'sub_admins', label: 'The moderation team', hint: 'Sub-admins only' },
  { value: 'everyone', label: 'Everyone', hint: 'The whole platform' },
]

const AUDIENCE_LABEL = {
  user: 'One viewer',
  creator: 'One creator',
  all_users: 'All viewers',
  all_creators: 'All creators',
  sub_admins: 'Moderation team',
  everyone: 'Everyone',
}

export default function AnnouncementsTab() {
  const { isAdmin, user } = useAuth()
  const showToast = useToast()
  const confirm = useConfirm()

  const [audience, setAudience] = useState('all_creators')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState(null)

  /* -------- picking one named person (admins only) -------- */
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])
  const [picked, setPicked] = useState(null)
  const [searching, setSearching] = useState(false)

  const targeted = audience === 'user' || audience === 'creator'

  useEffect(() => {
    if (!targeted || !isAdmin) return
    let alive = true
    setSearching(true)
    const t = setTimeout(() => {
      api.admin
        .users({ q: search, role: audience === 'creator' ? 'creator' : 'viewer', limit: 20 })
        .then((res) => alive && setPeople(res.users || []))
        .catch(() => alive && setPeople([]))
        .finally(() => alive && setSearching(false))
    }, 250) // wait for them to stop typing rather than firing on every key
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [search, audience, targeted, isAdmin])

  /* -------- what has already been sent -------- */
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const loadSent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.staff.announcements({ limit: 50 })
      setSent(res.announcements || [])
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSent()
  }, [loadSent])

  const audiences = useMemo(
    () =>
      isAdmin
        ? [
            { value: 'user', label: 'One viewer', hint: 'Pick a specific person' },
            { value: 'creator', label: 'One creator', hint: 'Pick a specific creator' },
            ...GROUP_AUDIENCES,
          ]
        : GROUP_AUDIENCES,
    [isAdmin]
  )

  const onSend = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (title.trim().length < 3) return setFormError('Give the announcement a title')
    if (body.trim().length < 3) return setFormError('Write the announcement')
    if (targeted && !picked) return setFormError('Choose who this announcement is for')

    setSending(true)
    try {
      const res = await api.staff.announce({
        audience,
        targetUserId: targeted ? picked.id : undefined,
        title: title.trim(),
        body: body.trim(),
        alsoEmail,
      })
      showToast(
        `Sent to ${res.delivered} ${res.delivered === 1 ? 'person' : 'people'}` +
          (res.emailed ? ' · emailed too' : '')
      )
      setTitle('')
      setBody('')
      setPicked(null)
      setSearch('')
      loadSent()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSending(false)
    }
  }

  const onDelete = (a) =>
    confirm({
      title: 'Delete this announcement?',
      text: `"${a.title}" will disappear from every inbox it was delivered to.`,
      onConfirm: async () => {
        try {
          await api.staff.deleteAnnouncement(a.id)
          showToast('Announcement deleted')
          loadSent()
        } catch (err) {
          showToast(err.message)
        }
      },
    })

  return (
    <div className="tab">
      <div className="two-col">
        {/* ------------------------------- compose ------------------------------ */}
        <Panel title="New announcement">
          <form onSubmit={onSend} noValidate>
            {formError && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}

            <div className="field">
              <label>Send to</label>
              <div className="aud-grid">
                {audiences.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className={`aud ${audience === a.value ? 'on' : ''}`.trim()}
                    onClick={() => {
                      setAudience(a.value)
                      setPicked(null)
                    }}
                  >
                    <b>{a.label}</b>
                    <small>{a.hint}</small>
                  </button>
                ))}
              </div>
              {!isAdmin && (
                <p className="field-note">
                  Addressing one named person requires an administrator — it means browsing
                  accounts, which sub-admins cannot do.
                </p>
              )}
            </div>

            {targeted && (
              <div className="field">
                <label htmlFor="ann-search">
                  {audience === 'creator' ? 'Which creator?' : 'Which viewer?'}
                </label>
                {picked ? (
                  <div className="picked">
                    <span>
                      <b>{picked.full_name || picked.fullName || picked.email}</b>
                      <em>{picked.email}</em>
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="input-wrap">
                      <Search size={16} />
                      <input
                        id="ann-search"
                        type="search"
                        placeholder="Search by name or email…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="pick-list">
                      {searching && <div className="pick-empty">Searching…</div>}
                      {!searching && !people.length && (
                        <div className="pick-empty">
                          {search ? 'Nobody matches that' : 'Start typing to find someone'}
                        </div>
                      )}
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="pick"
                          onClick={() => setPicked(p)}
                        >
                          <b>{p.full_name || p.fullName || p.email}</b>
                          <em>{p.email}</em>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <Field
              id="ann-title"
              label="Title"
              icon="megaphone"
              type="text"
              placeholder="Scheduled maintenance on Sunday"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setFormError(null)
              }}
              maxLength={140}
              required
            />

            <div className="field">
              <label htmlFor="ann-body">Message</label>
              <textarea
                id="ann-body"
                rows={6}
                placeholder="Write what you want them to know…"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  setFormError(null)
                }}
                maxLength={4000}
              />
              <p className="field-note">{body.length}/4000</p>
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={alsoEmail}
                onChange={(e) => setAlsoEmail(e.target.checked)}
              />
              <span>
                Email it as well
                <small>Otherwise it only appears in their inbox on the platform</small>
              </span>
            </label>

            <button className="btn btn-gold btn-block" type="submit" disabled={sending}>
              <Send />
              {sending ? 'Sending…' : 'Send announcement'}
            </button>
          </form>
        </Panel>

        {/* --------------------------------- sent ------------------------------- */}
        <Panel title={isAdmin ? 'Everything sent' : 'What you have sent'}>
          <Async
            loading={loading}
            error={loadError}
            onRetry={loadSent}
            empty={!sent.length}
            rows={4}
            emptyProps={{
              icon: Megaphone,
              title: 'No announcements yet',
              hint: 'Anything you send will be listed here with who received it.',
            }}
          >
            <ul className="ann-list">
              {sent.map((a) => (
                <li key={a.id} className="ann">
                  <div className="ann-head">
                    <b>{a.title}</b>
                    <span className="pill">{AUDIENCE_LABEL[a.audience] || a.audience}</span>
                  </div>
                  <p>{a.body}</p>
                  <div className="ann-meta">
                    <span>
                      <Users size={13} />
                      {a.recipientCount} {a.recipientCount === 1 ? 'recipient' : 'recipients'}
                    </span>
                    <span>
                      {a.author?.name || 'Unknown'}
                      {a.author?.id === user?.id ? ' (you)' : ''}
                    </span>
                    <time>{new Date(a.createdAt).toLocaleString()}</time>
                    {isAdmin && (
                      <button className="link-danger" onClick={() => onDelete(a)}>
                        <Trash2 size={13} />
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Async>
        </Panel>
      </div>
    </div>
  )
}
