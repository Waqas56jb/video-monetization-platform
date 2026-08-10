import { useState } from 'react'
import { Banknote, Send, X } from 'lucide-react'
import Panel from '../Panel'
import StatCard from '../StatCard'
import Field from '@/components/ui/Field'
import TableScroll from '@/components/ui/TableScroll'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { tzs, shortDate } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'

const PILL = { pending: 'pend', approved: 'ok', paid: 'ok', rejected: 'bad', cancelled: '' }

/**
 * The money, and getting it out.
 *
 * The available balance is lifetime earnings minus anything already withdrawn
 * or currently requested — so asking twice for the same money is not possible,
 * and the number on screen is the number the server will honour.
 */
export default function EarningsTab() {
  const showToast = useToast()

  const summary = useApi(() => api.earnings.summary(), [])
  const withdrawals = useApi(() => api.earnings.withdrawals(), [])

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('mpesa')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const balance = summary.data?.balance
  const ads = summary.data?.ads
  const rows = withdrawals.data?.withdrawals || []

  const stats = [
    { icon: 'wallet', tone: 'gold', label: 'Available to withdraw', value: tzs(balance?.availableTzs) },
    { icon: 'coins', label: 'Lifetime earnings', value: tzs(balance?.lifetimeTzs) },
    { icon: 'hourglass', label: 'Awaiting payout', value: tzs(balance?.pendingWithdrawalTzs) },
    { icon: 'check-circle-2', label: 'Already paid out', value: tzs(balance?.paidOutTzs) },
  ]

  /**
   * Sales and advertising, kept apart.
   *
   * These are two different businesses to a creator. A Paid Premiere earns from
   * sales until it expires and from advertising afterwards, and a single blended
   * total hides the moment that handover happens — which is precisely the thing
   * they need to be able to see.
   */
  const sources = [
    {
      icon: 'ticket',
      label: 'From sales',
      value: tzs(balance?.fromSalesTzs),
      note: 'Pay Once and Paid Premiere sales',
    },
    {
      icon: 'megaphone',
      label: 'From advertising',
      value: tzs(balance?.fromAdsTzs),
      note: ads?.impressions
        ? `${Number(ads.impressions).toLocaleString()} ad view${ads.impressions === 1 ? '' : 's'} across ${ads.videosWithImpressions} video${ads.videosWithImpressions === 1 ? '' : 's'}`
        : ads?.videosCarryingAds
          ? `${ads.videosCarryingAds} video${ads.videosCarryingAds === 1 ? '' : 's'} carrying ads — no views yet`
          : 'Starts when a premiere expires and turns Free + Ads',
    },
  ]

  const request = async (e) => {
    e.preventDefault()
    setError(null)

    const value = Number(String(amount).replace(/[^\d]/g, ''))
    if (!value) return setError('Enter how much you want to withdraw')
    if (balance && value > balance.availableTzs) {
      return setError(`You have ${tzs(balance.availableTzs)} available`)
    }
    if (!/^[0-9+\s-]{9,15}$/.test(phone.trim())) return setError('Enter the mobile money number to send it to')

    setBusy(true)
    try {
      await api.earnings.requestWithdrawal({ amountTzs: value, method, phone: phone.trim() })
      showToast('Withdrawal requested — an administrator will review it')
      setAmount('')
      summary.reload({ quiet: true })
      withdrawals.reload({ quiet: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (w) => {
    try {
      await api.earnings.cancelWithdrawal(w.id)
      showToast('Request cancelled — the money is back in your balance')
      summary.reload({ quiet: true })
      withdrawals.reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <div>
      {summary.loading ? (
        <Skeleton rows={2} />
      ) : summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.reload} />
      ) : (
        <>
          <div className="stat-grid">
            {stats.map((s) => (
              <StatCard key={s.label} stat={s} />
            ))}
          </div>

          <Panel title="Where the money came from">
            <div className="earn-sources">
              {sources.map((s) => (
                <div className="earn-source" key={s.label}>
                  <StatCard stat={s} />
                  <small className="es-note">{s.note}</small>
                </div>
              ))}
            </div>
            <p className="field-note">
              You keep {summary.data?.splitPercent ?? 70}% of both. Advertising revenue is
              credited as adverts are watched on your Free + Ads videos.
            </p>
          </Panel>
        </>
      )}

      <Panel title="Request a withdrawal">
        <form onSubmit={request} noValidate>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-grid">
            <Field
              id="wd-amount"
              label="Amount (TZS)"
              icon="banknote"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 500000"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
            />
            <Field
              id="wd-phone"
              label="Send to (mobile money number)"
              icon="smartphone"
              type="tel"
              placeholder="0712 000 000"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setError(null)
              }}
            />
          </div>

          <div className="role-toggle" style={{ marginBottom: 16 }}>
            {[
              ['mpesa', 'M-Pesa'],
              ['airtel', 'Airtel Money'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={method === value ? 'on' : ''}
                onClick={() => setMethod(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            className="btn btn-gold"
            type="submit"
            disabled={busy || !balance?.availableTzs}
            title={balance?.availableTzs ? '' : 'You have nothing to withdraw yet'}
          >
            <Send />
            {busy ? 'Requesting…' : 'Request withdrawal'}
          </button>
        </form>
      </Panel>

      <Panel title="Withdrawal history">
        {withdrawals.loading ? (
          <Skeleton rows={3} />
        ) : withdrawals.error ? (
          <ErrorState error={withdrawals.error} onRetry={withdrawals.reload} />
        ) : !rows.length ? (
          <EmptyState
            icon={Banknote}
            title="No withdrawals yet"
            message="Once you have earnings, request a payout above and track it here."
          />
        ) : (
          <TableScroll>
            <thead>
              <tr>
                <th>Requested</th>
                <th>Amount</th>
                <th>Method</th>
                <th>To</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>{shortDate(w.requested_at)}</td>
                  <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{tzs(w.amount_tzs)}</td>
                  <td>{w.method === 'airtel' ? 'Airtel Money' : 'M-Pesa'}</td>
                  <td>{w.payout_phone || '—'}</td>
                  <td>
                    <span className={`pill ${PILL[w.status] ?? ''}`}>{w.status}</span>
                  </td>
                  <td>
                    {w.status === 'pending' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => cancel(w)}>
                        <X size={14} />
                        <span className="btn-label">Cancel</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Panel>
    </div>
  )
}
