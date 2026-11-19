import { Link } from 'react-router'
import { useWorkshopData } from '../../hooks/useWorkshopData'

function TrendIcon({ direction = 'up' }: { direction?: 'up' | 'down' }) {
  return <span className={`trend ${direction}`}>{direction === 'up' ? '↗' : '↘'}</span>
}

const stats = [
  { label: 'Incoming Invitations', value: '12', detail: '4 new this week', trend: 'up' as const },
  { label: 'Pending Quotations', value: '5', detail: '2 due in 3 days', trend: 'up' as const },
  { label: 'Active Orders', value: '8', detail: '3 in production', trend: 'up' as const },
  { label: 'Completed Orders', value: '24', detail: '+18% from last month', trend: 'up' as const },
]

export default function DashboardPage() {
  const { invitations } = useWorkshopData()
  const recentInvitations = invitations.slice(0, 3)

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MONDAY, 18 NOVEMBER</p>
          <h1>Good morning, Rohan</h1>
          <p className="page-subtitle">Here is what is happening with your workshop today.</p>
        </div>
        <Link className="primary-button" to="/workshop/invitations">Browse invitations <span>→</span></Link>
      </div>

      <section className="stats-grid" aria-label="Workshop summary">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-card-top">
              <span>{stat.label}</span>
              <TrendIcon direction={stat.trend} />
            </div>
            <strong>{stat.value}</strong>
            <p>{stat.detail}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel production-panel">
          <div className="panel-header">
            <div>
              <h2>Production overview</h2>
              <p>Current order progress</p>
            </div>
            <Link className="text-button" to="/workshop/orders">View all orders →</Link>
          </div>
          <div className="production-content">
            <div className="progress-ring" aria-label="68 percent production capacity">
              <div>
                <strong>68%</strong>
                <span>Capacity</span>
              </div>
            </div>
            <div className="production-list">
              <div className="production-row">
                <span className="legend-dot teal" />
                <div><strong>In production</strong><small>5 active orders</small></div>
                <b>62%</b>
              </div>
              <div className="production-row">
                <span className="legend-dot orange" />
                <div><strong>Quality check</strong><small>2 orders pending</small></div>
                <b>25%</b>
              </div>
              <div className="production-row">
                <span className="legend-dot gray" />
                <div><strong>Ready for delivery</strong><small>1 order complete</small></div>
                <b>13%</b>
              </div>
            </div>
          </div>
        </section>

        <section className="panel deadline-panel">
          <div className="panel-header">
            <div>
              <h2>Upcoming deadlines</h2>
              <p>Next 7 days</p>
            </div>
          </div>
          <div className="deadline-list">
            <article>
              <time><strong>19</strong><span>NOV</span></time>
              <div><strong>Aluminum Valve Body</strong><p>Milestone 3 · 180 units</p></div>
              <span className="priority urgent">Due soon</span>
            </article>
            <article>
              <time><strong>21</strong><span>NOV</span></time>
              <div><strong>Drive Shaft Assembly</strong><p>Final QC · 75 units</p></div>
              <span className="priority">3 days</span>
            </article>
            <article>
              <time><strong>24</strong><span>NOV</span></time>
              <div><strong>Custom Mounting Plate</strong><p>Production · 400 units</p></div>
              <span className="priority">6 days</span>
            </article>
          </div>
        </section>
      </div>

      <section className="panel invitations-panel">
        <div className="panel-header">
          <div>
            <h2>Recent invitations</h2>
            <p>Latest manufacturing opportunities</p>
          </div>
          <Link className="text-button" to="/workshop/invitations">View all invitations →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Job</th><th>Buyer</th><th>Quantity</th><th>Deadline</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {recentInvitations.map((job) => (
                <tr key={job.id}>
                  <td><strong>{job.title}</strong><small>{job.id}</small></td>
                  <td>{job.buyer}</td>
                  <td>{job.quantity.toLocaleString('en-IN')} units</td>
                  <td>{new Intl.DateTimeFormat('en-IN', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${job.deadline}T00:00:00`))}</td>
                  <td><span className={`status ${job.status.toLowerCase() === 'new' ? 'new' : job.status.toLowerCase()}`}>{job.status}</span></td>
                  <td><Link className="row-action" to={`/workshop/invitations/${job.id}`} aria-label={`View ${job.title}`}>→</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
