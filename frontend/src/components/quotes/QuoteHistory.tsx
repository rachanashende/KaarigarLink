import { Link } from 'react-router-dom'
import type { DemoQuote } from '../../types/quote'
import type { Invitation } from '../../types/workshop'

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function QuoteHistory({ quotes, invitations }: { quotes: DemoQuote[]; invitations: Invitation[] }) {
  const sortedQuotes = [...quotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <section className="panel quote-history-panel">
      <div className="panel-header">
        <div><h2>Quote history</h2><p>Demo quotations sent for your workshop invitations</p></div>
        <span className="quote-history-count">{quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}</span>
      </div>
      {sortedQuotes.length ? (
        <div className="table-wrap">
          <table className="quote-history-table">
            <thead><tr><th>Job</th><th>Buyer</th><th>Estimated total</th><th>Completion</th><th>Last updated</th><th>Status</th><th /></tr></thead>
            <tbody>{sortedQuotes.map((quote) => {
              const invitationExists = invitations.some((invitation) => invitation.id === quote.invitationId)
              return (
                <tr key={quote.id}>
                  <td><strong>{quote.jobTitle}</strong><small>{quote.invitationId}</small></td>
                  <td>{quote.buyer}</td>
                  <td>{currency.format(quote.estimatedTotalPrice)}</td>
                  <td>{dateFormat.format(new Date(`${quote.expectedCompletionDate}T00:00:00`))}</td>
                  <td>{dateFormat.format(new Date(quote.updatedAt))}</td>
                  <td><span className={`status status-${quote.status.toLowerCase()}`}>{quote.status}</span></td>
                  <td>{invitationExists
                    ? <Link className="row-action" to={`/invitations/${quote.invitationId}`} aria-label={`View quote for ${quote.jobTitle}`}>→</Link>
                    : <span className="quote-archived-label">Archived</span>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state quote-empty-state"><h2>No quotes submitted yet</h2><p>Open an invitation and submit a quote to see it here.</p></div>
      )}
    </section>
  )
}
