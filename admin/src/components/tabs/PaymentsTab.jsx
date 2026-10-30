import { useMemo, useState } from 'react'
import { CreditCard, Undo2 } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { StatGrid } from '@/components/ui/StatCard'
import { EmptyRow, TableWrap } from '@/components/ui/Table'
import { FilterRow, FilterSelect, SearchBar } from '@/components/ui/Filters'
import { Async } from '@/components/ui/States'
import useApi, { tzs, compact, dateTime } from '@/hooks/useApi'
import api from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'

const MONO = { fontFamily: 'monospace', color: 'var(--muted)' }
const PILL = { success: 'ok', pending: 'pend', failed: 'bad', cancelled: '', expired: '', refunded: 'pend' }
const METHOD = { mpesa: 'M-Pesa', airtel: 'Airtel Money', card: 'Card' }

/* Which gateway settled it. "sandbox" is MTONYO+'s internal test gateway — no
   money moved — and must never be mistaken for a real AirPay transaction. */
const GATEWAY_FILTER = { AirPay: 'airpay', 'Test payments (no money)': 'sandbox' }
function GatewayPill({ provider }) {
  if (provider === 'airpay') return <span className="pill ok" title="Settled through AirPay">AirPay</span>
  return <span className="pill" title="MTONYO+ internal test payment — no money moved">TEST</span>
}
const SOURCE = {
  whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', twitter: 'X / Twitter',
  youtube: 'YouTube', telegram: 'Telegram', search: 'Search', other: 'Other site', direct: 'Direct', unknown: 'Not recorded',
}

/** Every transaction, as it happened. */
export default function PaymentsTab() {
  const showToast = useToast()
  const { isAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [gateway, setGateway] = useState('')
  const [busyId, setBusyId] = useState(null)

  const { data, loading, error, reload } = useApi(
    () => api.admin.payments({ status: status.toLowerCase(), limit: 200 }),
    [status]
  )

  const sources = useApi(() => api.admin.paymentSources(30), [], { refetchOnFocus: true })
  const all = data?.payments || []

  // Filtering by text happens here rather than on the server: the result set is
  // already capped at 200 rows, and this keeps typing instant.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const want = GATEWAY_FILTER[gateway]
    return all.filter(
      (p) =>
        (!want || p.provider === want) &&
        (!q ||
          [p.id, p.merchant_order_id, p.provider_ref, p.user_name, p.user_email, p.video_title, p.method]
            .join(' ')
            .toLowerCase()
            .includes(q))
    )
  }, [all, gateway, query])

  /**
   * Record a refund.
   *
   * The money itself is returned by hand in the provider's portal — nothing here
   * can move it. What this does is make the platform agree with what happened:
   * the payment reads refunded, the buyer loses access, and the creator's credit
   * is reversed so they cannot withdraw against a sale that no longer exists.
   */
  const refund = async (p) => {
    const reason = window.prompt(
      `Refund ${tzs(p.amount_tzs)} to ${p.user_name || p.user_email || 'this customer'}?\n\n` +
        'This removes their access to the video and reverses the creator’s share.\n' +
        'It does NOT send the money back — do that in the provider’s portal.\n\n' +
        'Reason (the customer sees this):'
    )
    if (reason === null) return

    setBusyId(p.id)
    try {
      const res = await api.admin.refundPayment(p.id, reason.trim() || undefined)
      showToast(res.message || 'Refund recorded')
      reload({ quiet: true })
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const succeeded = all.filter((p) => p.status === 'success')
  const stats = [
    { icon: 'credit-card', label: 'Transactions', value: compact(all.length) },
    { icon: 'check-circle-2', label: 'Successful', value: compact(succeeded.length) },
    { icon: 'coins', tone: 'gold', label: 'Collected', value: tzs(succeeded.reduce((n, p) => n + (p.amount_tzs || 0), 0)) },
    { icon: 'hourglass', label: 'Pending', value: compact(all.filter((p) => p.status === 'pending').length) },
  ]

  return (
    <div className="tab">
      <StatGrid stats={stats} />

      <Panel title="Sales by traffic source" action={<span className="pill">Last 30 days</span>}>
        <Async loading={sources.loading} error={sources.error} onRetry={sources.reload} empty={!sources.data?.sources?.length} rows={3}
          emptyProps={{ icon: CreditCard, title: 'No payments in the last 30 days', hint: 'Each payment records where the viewer came from — WhatsApp, Facebook, Instagram, TikTok or a campaign link.' }}>
          <TableWrap>
            <thead>
              <tr><th>Source</th><th>Payment attempts</th><th>Paid</th><th>Conversion</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {(sources.data?.sources || []).map((s) => (
                <tr key={s.source}>
                  <td>{SOURCE[s.source] || s.source}</td>
                  <td>{compact(s.attempts)}</td>
                  <td>{compact(s.paid)}</td>
                  <td>{s.attempts ? `${Math.round((s.paid / s.attempts) * 100)}%` : '—'}</td>
                  <td className="money">{tzs(s.revenue_tzs)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>

      <Panel
        title="All Transactions"
        action={
          <FilterRow>
            <SearchBar value={query} onChange={setQuery} placeholder="Search reference, user, video…" />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={['Success', 'Pending', 'Failed', 'Cancelled', 'Expired', 'Refunded']}
              allLabel="All Status"
            />
            <FilterSelect value={gateway} onChange={setGateway} options={Object.keys(GATEWAY_FILTER)} allLabel="All gateways" />
          </FilterRow>
        }
      >
        <Async
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!rows.length}
          rows={6}
          emptyProps={{
            icon: CreditCard,
            title: query || status || gateway ? 'Nothing matches that' : 'No transactions yet',
            hint:
              query || status || gateway
                ? 'Try a different search or clear the filter.'
                : 'Every purchase lands here the moment it is attempted, successful or not.',
          }}
        >
          <TableWrap>
            <thead>
              <tr>
                <th>Order / gateway ID</th>
                <th>User</th>
                <th>Video</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Split (C/P)</th>
                <th>When</th>
                <th>Status</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <EmptyRow colSpan={isAdmin ? 9 : 8}>No transactions match this search.</EmptyRow>
              )}
              {rows.map((p) => (
                <tr key={p.id}>
                  {/* Ours, then the gateway's: the two ids a payment is traced by.
                      (This used to read `provider_reference`, a column that does
                      not exist, so it only ever showed our internal uuid.) */}
                  <td style={MONO}>
                    {p.merchant_order_id || p.id.slice(0, 14)}{' '}
                    <GatewayPill provider={p.provider} />
                    <br />
                    <small style={{ opacity: 0.7 }}>{p.provider_ref || '—'}</small>
                  </td>
                  <td>{p.user_name || '—'}</td>
                  <td>{p.video_title || '—'}</td>
                  <td>
                    {METHOD[p.method] || p.method}
                    {p.traffic_source && (
                      <>
                        <br />
                        <small style={{ opacity: 0.7 }} title={[p.traffic_campaign, p.traffic_referrer].filter(Boolean).join(' · ') || undefined}>
                          via {SOURCE[p.traffic_source] || p.traffic_source}
                        </small>
                      </>
                    )}
                  </td>
                  <td className="money">{tzs(p.amount_tzs)}</td>
                  <td>
                    {p.creator_amount_tzs != null
                      ? `${tzs(p.creator_amount_tzs)} / ${tzs(p.platform_amount_tzs)}`
                      : '—'}
                  </td>
                  <td>{dateTime(p.created_at)}</td>
                  <td>
                    <span className={`pill ${PILL[p.status] ?? ''}`}>{p.status}</span>
                    {p.refund_due && (
                      <span className="pill bad" style={{ marginLeft: 6 }} title={p.failure_reason || 'Charged without new access — refund in the gateway portal, then record it here'}>
                        refund due
                      </span>
                    )}
                  </td>
                  {/* Refunding is money leaving the platform, so it stays with
                      the administrator rather than the moderation team. */}
                  {isAdmin && (
                    <td>
                      {p.status === 'success' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => refund(p)}
                          disabled={busyId === p.id}
                          title="Record a refund and remove access"
                        >
                          <Undo2 size={14} />
                          <span className="btn-label">
                            {busyId === p.id ? 'Refunding…' : 'Refund'}
                          </span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Async>
      </Panel>
    </div>
  )
}
