import Panel from '@/components/ui/Panel'
import { useAdminData } from '@/context/AdminDataContext'
import { useConfirm } from '@/context/ConfirmContext'
import { useToast } from '@/context/ToastContext'
import { TOASTS } from '@/data/adminData'

function ModCard({ item, children }) {
  return (
    <div className={`mod-card ${item.exiting ? 'row-exit' : ''}`.trim()}>
      <img src={item.image} alt="" loading="lazy" />
      <div className="m-info">
        <b>{item.title}</b>
        {item.requester ? (
          <small>
            <b style={{ color: '#fff' }}>{item.requester}</b> {item.requestNote}
          </small>
        ) : (
          <small>{item.note}</small>
        )}
        {item.warning && (
          <small style={{ color: item.warningTone, marginTop: 4 }}>{item.warning}</small>
        )}
      </div>
      <div className="actions">{children}</div>
    </div>
  )
}

export default function ModerationTab() {
  const { deletionRequests, flagged } = useAdminData()
  const confirm = useConfirm()
  const showToast = useToast()

  const resolve = (collection, item, msg) => {
    collection.remove(item.id)
    showToast(msg)
  }

  const dangerous = (collection, item) =>
    confirm({
      title: item.confirmTitle,
      text: item.confirmText,
      onConfirm: () => {
        collection.remove(item.id)
        showToast(TOASTS.modDone)
      },
    })

  return (
    <div className="tab">
      <Panel
        title="Deletion Requests from Creators"
        action={
          <span className="badge">Admin approval required — purchased content is protected</span>
        }
      >
        {deletionRequests.items.length === 0 && (
          <p style={{ color: 'var(--muted2)', fontSize: 13 }}>
            No open deletion requests — nothing waiting on you.
          </p>
        )}
        {deletionRequests.items.map((item) => (
          <ModCard item={item} key={item.id}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => resolve(deletionRequests, item, item.unpublishMsg)}
            >
              Unpublish Only
            </button>
            <button className="btn btn-red btn-sm" onClick={() => dangerous(deletionRequests, item)}>
              Approve Delete
            </button>
          </ModCard>
        ))}
      </Panel>

      <Panel title="Flagged Content">
        {flagged.items.length === 0 && (
          <p style={{ color: 'var(--muted2)', fontSize: 13 }}>
            No flagged content — the queue is clear.
          </p>
        )}
        {flagged.items.map((item) => (
          <ModCard item={item} key={item.id}>
            <button
              className="btn btn-green btn-sm"
              onClick={() => resolve(flagged, item, item.dismissMsg)}
            >
              {item.dismissLabel}
            </button>
            <button className="btn btn-red btn-sm" onClick={() => dangerous(flagged, item)}>
              Take Down
            </button>
          </ModCard>
        ))}
      </Panel>
    </div>
  )
}
