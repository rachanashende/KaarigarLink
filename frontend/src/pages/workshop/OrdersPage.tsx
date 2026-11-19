import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useWorkshopData } from '../../hooks/useWorkshopData'
import type { OrderStatus, WorkshopOrder } from '../../types/workshop'

const orderStatuses: OrderStatus[] = ['Confirmed', 'In Production', 'Quality Check', 'Ready for Delivery', 'Dispatched', 'Completed']
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function statusClass(status: string) {
  return `status status-${status.toLowerCase().replaceAll(' ', '-')}`
}

function OrderDetail({ order, onStatusChange }: { order: WorkshopOrder; onStatusChange: (status: OrderStatus) => void }) {
  const currentIndex = orderStatuses.indexOf(order.status)
  const nextStatus = orderStatuses[currentIndex + 1]
  return (
    <>
      <div className="page-heading detail-heading">
        <div><p className="eyebrow">{order.id} · ORDER PLACED {dateFormat.format(new Date(`${order.orderDate}T00:00:00`)).toUpperCase()}</p><h1>{order.title}</h1><p className="page-subtitle">{order.buyer} · {order.quantity.toLocaleString('en-IN')} units</p></div>
        <span className={statusClass(order.status)}>{order.status}</span>
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel detail-panel">
            <div className="panel-header"><div><h2>Production timeline</h2><p>Follow this order through each production stage</p></div></div>
            <div className="timeline">
              {orderStatuses.map((status, index) => {
                const complete = index <= currentIndex
                return <div key={status} className={`timeline-step${complete ? ' complete' : ''}${index === currentIndex ? ' current' : ''}`}><span className="timeline-marker">{complete ? '✓' : index + 1}</span><div><strong>{status}</strong><small>{index === currentIndex ? 'Current stage' : index < currentIndex ? 'Completed' : 'Upcoming'}</small></div></div>
              })}
            </div>
          </section>
          <section className="panel detail-panel detail-spaced">
            <div className="panel-header"><div><h2>Product specifications</h2><p>Manufacturing and delivery details</p></div></div>
            <div className="detail-content">
              <p className="detail-description">{order.specifications}</p>
              <div className="detail-fields">
                <div><small>Material</small><strong>{order.material}</strong></div>
                <div><small>Quantity</small><strong>{order.quantity.toLocaleString('en-IN')} units</strong></div>
                <div className="detail-wide"><small>Delivery address</small><strong>{order.deliveryAddress}</strong></div>
              </div>
            </div>
          </section>
        </div>
        <aside className="detail-main">
          <section className="panel detail-panel">
            <div className="panel-header"><div><h2>Order summary</h2><p>Order and payment information</p></div></div>
            <div className="detail-content">
              <div className="detail-fields">
                <div><small>Order value</small><strong>{currency.format(order.price)}</strong></div>
                <div><small>Payment status</small><strong><span className={statusClass(order.paymentStatus)}>{order.paymentStatus}</span></strong></div>
                <div><small>Delivery deadline</small><strong>{dateFormat.format(new Date(`${order.deadline}T00:00:00`))}</strong></div>
                <div><small>Buyer</small><strong>{order.buyer}</strong></div>
                <div><small>Buyer email</small><strong>{order.buyerEmail}</strong></div>
                <div><small>Buyer phone</small><strong>{order.buyerPhone}</strong></div>
              </div>
              {nextStatus && <div className="detail-actions"><button className="primary-button full-button" onClick={() => onStatusChange(nextStatus)}>Move to {nextStatus}</button></div>}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}

export default function OrdersPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { orders, updateOrderStatus } = useWorkshopData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [sort, setSort] = useState('deadline')

  const order = orderId ? orders.find((item) => item.id === orderId) : undefined
  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase()
    return orders.filter((item) => (!term || [item.id, item.title, item.buyer].some((value) => value.toLowerCase().includes(term)))
      && (status === 'All' || item.status === status))
      .sort((a, b) => sort === 'value' ? b.price - a.price : sort === 'date' ? b.orderDate.localeCompare(a.orderDate) : a.deadline.localeCompare(b.deadline))
  }, [orders, query, sort, status])

  if (orderId) {
    if (!order) return <section className="panel detail-panel"><div className="empty-state"><h2>Order not found</h2><p>This order is not in your workshop workspace.</p><Link className="text-button" to="/workshop/orders">Back to orders</Link></div></section>
    return <><button className="back-button" onClick={() => navigate('/workshop/orders')}>← Back to orders</button><OrderDetail order={order} onStatusChange={(nextStatus) => updateOrderStatus(order.id, nextStatus)} /></>
  }

  const count = (value: string) => value === 'Total Orders' ? orders.length : value === 'Completed Orders' ? orders.filter((item) => item.status === 'Completed').length : orders.filter((item) => item.status === value).length
  const stats = [
    { label: 'Total Orders', value: count('Total Orders') },
    { label: 'In Production', value: count('In Production') },
    { label: 'Quality Check', value: count('Quality Check') },
    { label: 'Ready for Delivery', value: count('Ready for Delivery') },
    { label: 'Completed Orders', value: count('Completed Orders') },
  ]

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">WORKSHOP WORKFLOW</p><h1>My Orders</h1><p className="page-subtitle">Track and manage your manufacturing orders.</p></div></div>
      <section className="orders-stats" aria-label="Order summary">{stats.map((item) => <article className="stat-card order-stat-card" key={item.label}><div className="stat-card-top"><span>{item.label}</span></div><strong>{item.value}</strong></article>)}</section>
      <section className="panel listing-panel orders-list-panel">
        <div className="panel-header"><div><h2>All orders</h2><p>{filteredOrders.length} orders shown</p></div></div>
        <div className="list-toolbar order-toolbar">
          <label className="list-search"><span className="sr-only">Search orders</span><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by order, product or buyer" /></label>
          <div className="list-controls">
            <label className="select-label"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option>{orderStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="select-label"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="deadline">Delivery deadline</option><option value="date">Order date</option><option value="value">Order value</option></select></label>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table orders-table"><thead><tr><th>Order / Product</th><th>Buyer</th><th>Quantity</th><th>Value</th><th>Order date</th><th>Deadline</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{filteredOrders.map((item) => <tr key={item.id}>
              <td><strong>{item.id}</strong><small>{item.title}</small></td><td>{item.buyer}</td><td>{item.quantity.toLocaleString('en-IN')}</td><td>{currency.format(item.price)}</td><td>{dateFormat.format(new Date(`${item.orderDate}T00:00:00`))}</td><td>{dateFormat.format(new Date(`${item.deadline}T00:00:00`))}</td><td><span className={statusClass(item.status)}>{item.status}</span></td><td><Link className="row-action" to={`/workshop/orders/${item.id}`} aria-label={`View ${item.id}`}>→</Link></td>
            </tr>)}</tbody>
          </table>
          {!filteredOrders.length && <div className="empty-state"><h2>No orders found</h2><p>Try changing your search or status filter.</p><button className="text-button" onClick={() => { setQuery(''); setStatus('All') }}>Clear filters</button></div>}
        </div>
      </section>
    </>
  )
}
