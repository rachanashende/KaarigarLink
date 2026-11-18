import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useWorkshopData } from '../../hooks/useWorkshopData'
import type { InvitationStatus } from '../../types/workshop'
import QuoteSubmissionForm from '../../components/quotes/QuoteSubmissionForm'
import QuoteHistory from '../../components/quotes/QuoteHistory'
import { loadDemoQuotes, withdrawDemoQuote } from '../../services/demoQuoteStorage'
import type { DemoQuote } from '../../types/quote'

const tabs: Array<'All' | InvitationStatus> = ['All', 'New', 'Accepted', 'Rejected']
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function InvitationsPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { invitations, acceptInvitation, rejectInvitation, notify } = useWorkshopData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All' | InvitationStatus>('All')
  const [deadline, setDeadline] = useState('all')
  const [now] = useState(() => Date.now())
  const [quotes, setQuotes] = useState(loadDemoQuotes)
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [editingQuote, setEditingQuote] = useState(false)
  const [today] = useState(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })

  const selectedInvitation = jobId ? invitations.find((item) => item.id === jobId) : undefined
  const currentQuote = selectedInvitation
    ? quotes.find((quote) => quote.invitationId === selectedInvitation.id)
    : undefined
  const quoteActionsAllowed = Boolean(
    selectedInvitation
    && selectedInvitation.status === 'New'
    && selectedInvitation.deadline >= today,
  )
  const filteredInvitations = useMemo(() => {
    const term = query.trim().toLowerCase()
    return invitations.filter((invitation) => {
      const matchesTerm = !term || [
        invitation.id, invitation.title, invitation.buyer, invitation.description,
      ].some((value) => value.toLowerCase().includes(term))
      const matchesStatus = status === 'All' || invitation.status === status
      const daysUntilDeadline = (Date.parse(`${invitation.deadline}T00:00:00`) - now) / 86400000
      const matchesDeadline = deadline === 'all'
        || (deadline === '7' && daysUntilDeadline >= 0 && daysUntilDeadline <= 7)
        || (deadline === '30' && daysUntilDeadline >= 0 && daysUntilDeadline <= 30)
      return matchesTerm && matchesStatus && matchesDeadline
    })
  }, [deadline, invitations, now, query, status])

  function reject(id: string) {
    if (window.confirm('Reject this invitation? This action cannot be undone.')) rejectInvitation(id)
  }

  function withdrawQuote(quote: DemoQuote) {
    if (!window.confirm('Withdraw this quote? A withdrawn quote cannot be resubmitted in this demo workflow.')) return
    const result = withdrawDemoQuote(quote.id)
    if (!result.ok) {
      notify(result.message, 'error')
      return
    }
    setQuotes(loadDemoQuotes())
    notify('Quote withdrawn. It remains in your quote history.')
  }

  if (jobId) {
    if (!selectedInvitation) {
      return (
        <section className="panel detail-panel">
          <div className="empty-state"><h2>Invitation not found</h2><p>It may have been removed from this demo workspace.</p><Link className="text-button" to="/invitations">Back to invitations</Link></div>
        </section>
      )
    }
    return (
      <>
        <button className="back-button" onClick={() => navigate('/invitations')}>← Back to invitations</button>
        <div className="page-heading detail-heading">
          <div>
            <p className="eyebrow">{selectedInvitation.id} · RECEIVED {dateFormat.format(new Date(`${selectedInvitation.receivedAt}T00:00:00`)).toUpperCase()}</p>
            <h1>{selectedInvitation.title}</h1>
            <p className="page-subtitle">{selectedInvitation.buyer} · {selectedInvitation.quantity.toLocaleString('en-IN')} units</p>
          </div>
          <span className={`status status-${selectedInvitation.status.toLowerCase()}`}>{selectedInvitation.status}</span>
        </div>
        <div className="detail-layout">
          <div className="detail-main">
            <section className="panel detail-panel">
              <div className="panel-header"><div><h2>Job information</h2><p>Manufacturing requirements and delivery expectations</p></div></div>
              <div className="detail-content">
                <p className="detail-description">{selectedInvitation.description}</p>
                <div className="detail-fields">
                  <div><small>Buyer</small><strong>{selectedInvitation.buyer}</strong></div>
                  <div><small>Quantity required</small><strong>{selectedInvitation.quantity.toLocaleString('en-IN')} units</strong></div>
                  <div><small>Offered value</small><strong>{currency.format(selectedInvitation.price)}</strong></div>
                  <div><small>Delivery deadline</small><strong>{dateFormat.format(new Date(`${selectedInvitation.deadline}T00:00:00`))}</strong></div>
                  <div><small>Material</small><strong>{selectedInvitation.material}</strong></div>
                  <div><small>Invitation received</small><strong>{dateFormat.format(new Date(`${selectedInvitation.receivedAt}T00:00:00`))}</strong></div>
                  <div className="detail-wide"><small>Manufacturing requirements</small><strong>{selectedInvitation.quantity.toLocaleString('en-IN')} units of {selectedInvitation.material}; manufacture and deliver by {dateFormat.format(new Date(`${selectedInvitation.deadline}T00:00:00`))}.</strong></div>
                  <div className="detail-wide"><small>Required machinery</small><div className="tag-list">{selectedInvitation.machines.map((machine) => <span className="tag" key={machine}>{machine}</span>)}</div></div>
                  <div className="detail-wide"><small>Technical specifications</small><strong>{selectedInvitation.technicalSpecifications ?? 'No additional technical specifications supplied in this demo invitation.'}</strong></div>
                  <div className="detail-wide"><small>Delivery location</small><strong>{selectedInvitation.deliveryAddress}</strong></div>
                </div>
              </div>
            </section>
          </div>
          <aside className="panel detail-sidebar">
            <div className="panel-header"><div><h2>Invitation response</h2><p>Choose whether to take this job</p></div></div>
            <div className="detail-content">
              <div className="price-summary"><small>Offered project value</small><strong>{currency.format(selectedInvitation.price)}</strong><span>Delivery by {dateFormat.format(new Date(`${selectedInvitation.deadline}T00:00:00`))}</span></div>
              {selectedInvitation.status === 'New' ? (
                <div className="detail-actions">
                  <button className="primary-button full-button" onClick={() => acceptInvitation(selectedInvitation.id)}>Accept invitation</button>
                  <button className="secondary-button full-button" onClick={() => reject(selectedInvitation.id)}>Reject invitation</button>
                </div>
              ) : <p className="inline-note">This invitation has been {selectedInvitation.status.toLowerCase()}.</p>}
              <div className="quote-action-block">
                {!currentQuote && quoteActionsAllowed && (
                  <button className="secondary-button full-button quote-action-button" onClick={() => { setEditingQuote(false); setShowQuoteForm(true) }}>Submit a quote</button>
                )}
                {currentQuote && <div className="current-quote-summary">
                  <div className="current-quote-heading"><strong>Your quote</strong><span className={`status status-${currentQuote.status.toLowerCase()}`}>{currentQuote.status}</span></div>
                  <p><strong>{currency.format(currentQuote.estimatedTotalPrice)}</strong><small>{currentQuote.productionDays} production days · due {dateFormat.format(new Date(`${currentQuote.expectedCompletionDate}T00:00:00`))}</small></p>
                  {currentQuote.status === 'Submitted' && quoteActionsAllowed
                    ? <div className="detail-actions quote-manage-actions">
                      <button className="secondary-button full-button" onClick={() => { setEditingQuote(true); setShowQuoteForm(true) }}>Edit quote</button>
                      <button className="quiet-button" onClick={() => withdrawQuote(currentQuote)}>Withdraw quote</button>
                    </div>
                    : <p className="quote-workflow-note">{currentQuote.status === 'Withdrawn'
                      ? 'This quote is withdrawn and cannot be submitted again.'
                      : 'Quote management is unavailable because this invitation is no longer open.'}</p>}
                </div>}
                {!quoteActionsAllowed && !currentQuote && <p className="quote-workflow-note">Quotes are available only while an invitation is open and before its deadline.</p>}
              </div>
            </div>
          </aside>
        </div>
        {showQuoteForm && selectedInvitation && (
          <div className="quote-form-wrap">
            <QuoteSubmissionForm
              invitation={selectedInvitation}
              existingQuote={editingQuote ? currentQuote : undefined}
              onCancel={() => setShowQuoteForm(false)}
              onSaved={(quote) => {
                setQuotes(loadDemoQuotes())
                setShowQuoteForm(false)
                setEditingQuote(false)
                notify(editingQuote ? 'Quote updated successfully.' : `Quote for ${quote.jobTitle} submitted successfully.`)
              }}
            />
          </div>
        )}
        {currentQuote && <QuoteHistory quotes={[currentQuote]} invitations={invitations} />}
      </>
    )
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">WORKSHOP OPPORTUNITIES</p><h1>Invitations</h1><p className="page-subtitle">Manage incoming manufacturing job invitations.</p></div>
      </div>
      <section className="panel listing-panel">
        <div className="list-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="Filter invitations by status">
            {tabs.map((tab) => <button key={tab} role="tab" aria-selected={status === tab} className={`filter-tab${status === tab ? ' selected' : ''}`} onClick={() => setStatus(tab)}>{tab}<span>{tab === 'All' ? invitations.length : invitations.filter((item) => item.status === tab).length}</span></button>)}
          </div>
          <div className="list-controls">
            <label className="list-search"><span className="sr-only">Search invitations</span><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invitations" /></label>
            <label className="select-label"><span>Deadline</span><select value={deadline} onChange={(event) => setDeadline(event.target.value)}><option value="all">Any time</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option></select></label>
          </div>
        </div>
        <div className="invitation-cards">
          {filteredInvitations.length ? filteredInvitations.map((invitation) => (
            <article className="invitation-card" key={invitation.id}>
              <div className="invitation-card-main">
                <div className="invitation-card-title">
                  <div><p className="eyebrow">{invitation.id} · RECEIVED {dateFormat.format(new Date(`${invitation.receivedAt}T00:00:00`))}</p><h2>{invitation.title}</h2><p>{invitation.buyer}</p></div>
                  <span className={`status status-${invitation.status.toLowerCase()}`}>{invitation.status}</span>
                </div>
                <p className="invitation-description">{invitation.description}</p>
                <div className="invitation-meta">
                  <span><small>Quantity</small><strong>{invitation.quantity.toLocaleString('en-IN')} units</strong></span>
                  <span><small>Offered value</small><strong>{currency.format(invitation.price)}</strong></span>
                  <span><small>Deadline</small><strong>{dateFormat.format(new Date(`${invitation.deadline}T00:00:00`))}</strong></span>
                </div>
                <div className="invitation-actions">
                  <Link className="secondary-button" to={`/invitations/${invitation.id}`}>View details <span>→</span></Link>
                  {invitation.status === 'New' && <>
                    <button className="primary-button" onClick={() => acceptInvitation(invitation.id)}>Accept</button>
                    <button className="quiet-button" onClick={() => reject(invitation.id)}>Reject</button>
                  </>}
                </div>
              </div>
            </article>
          )) : <div className="empty-state"><h2>No invitations found</h2><p>Try changing the status, deadline, or search terms.</p><button className="text-button" onClick={() => { setQuery(''); setStatus('All'); setDeadline('all') }}>Clear filters</button></div>}
        </div>
      </section>
      <QuoteHistory quotes={quotes} invitations={invitations} />
    </>
  )
}
