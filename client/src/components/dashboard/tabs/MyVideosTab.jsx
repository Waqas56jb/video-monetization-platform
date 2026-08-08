import { Plus } from 'lucide-react'
import Panel from '../Panel'
import { MY_VIDEOS } from '@/data/content'

export default function MyVideosTab({ onNewUpload }) {
  return (
    <Panel
      title="My Published Videos"
      action={
        <button className="btn btn-gold btn-sm" onClick={onNewUpload}>
          <Plus />
          New Upload
        </button>
      }
    >
      <div className="table-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Video</th>
              <th>Type</th>
              <th>Price</th>
              <th>Views</th>
              <th>Revenue</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {MY_VIDEOS.map((v) => (
              <tr key={v.title}>
                <td style={{ fontWeight: 700 }}>{v.title}</td>
                <td>{v.type}</td>
                <td>{v.price}</td>
                <td>{v.views}</td>
                <td style={{ color: 'var(--green)', fontWeight: 700 }}>{v.revenue}</td>
                <td>
                  <span className={`pill ${v.pill}`}>{v.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
