import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { WorkshopDataContext } from './workshopContextValue'
import type {
  OrderStatus,
  Toast,
  WorkshopData,
  WorkshopOrder,
  WorkshopPreferences,
  WorkshopProfile,
} from '../types/workshop'

const STORAGE_KEY = 'kaarigarlink-workshop-data-v1'

const initialData: WorkshopData = {
  invitations: [
    {
      id: 'KL-2841',
      title: 'CNC Machined Housing',
      buyer: 'Apex Components',
      description: 'Precision aluminum housing for a compact hydraulic assembly.',
      quantity: 250,
      price: 187500,
      deadline: '2026-11-28',
      receivedAt: '2026-11-17',
      status: 'New',
      material: 'Aluminum 6061-T6',
      machines: ['3-axis CNC mill', 'CNC lathe'],
      deliveryAddress: 'Plot 18, Industrial Estate, Pune, Maharashtra 411019',
      technicalSpecifications: 'Drawing revision C; dimensional tolerance ±0.05 mm; surface finish Ra 1.6.',
    },
    {
      id: 'KL-2838',
      title: 'Stainless Steel Brackets',
      buyer: 'Metro Fabrications',
      description: 'Laser-cut and bent mounting brackets with a brushed finish.',
      quantity: 500,
      price: 142000,
      deadline: '2026-12-02',
      receivedAt: '2026-11-16',
      status: 'New',
      material: 'Stainless steel 304',
      machines: ['CNC press brake', 'Fiber laser cutter'],
      deliveryAddress: 'Unit 4, Sector 6, Noida, Uttar Pradesh 201301',
      technicalSpecifications: '2 mm sheet; deburred edges; bend angle tolerance ±1°; brushed finish.',
    },
    {
      id: 'KL-2829',
      title: 'Precision Gear Assembly',
      buyer: 'Vega Industries',
      description: 'Hardened steel gear set, machined to supplied drawings.',
      quantity: 120,
      price: 264000,
      deadline: '2026-12-08',
      receivedAt: '2026-11-14',
      status: 'New',
      material: 'Alloy steel 4140',
      machines: ['CNC gear hobbing machine', 'Cylindrical grinder'],
      deliveryAddress: '88 Peenya Industrial Area, Bengaluru, Karnataka 560058',
      technicalSpecifications: 'Hardened to 58–62 HRC; gear profile tolerance ISO 8; supplied drawing controls.',
    },
  ],
  orders: [
    {
      id: 'ORD-2794',
      title: 'Aluminum Valve Body',
      buyer: 'Northstar Hydraulics',
      quantity: 180,
      price: 216000,
      orderDate: '2026-11-08',
      deadline: '2026-11-24',
      status: 'In Production',
      material: 'Aluminum 6061-T6',
      specifications: 'CNC-machined valve body; drawing revision C; surface finish Ra 1.6.',
      deliveryAddress: '21 MIDC Road, Nashik, Maharashtra 422010',
      buyerEmail: 'procurement@northstar.example',
      buyerPhone: '+91 253 555 0142',
      paymentStatus: 'Deposit received',
    },
    {
      id: 'ORD-2768',
      title: 'Drive Shaft Assembly',
      buyer: 'Apex Components',
      quantity: 75,
      price: 318750,
      orderDate: '2026-11-02',
      deadline: '2026-11-21',
      status: 'Quality Check',
      material: 'Alloy steel 4140',
      specifications: 'Ground shaft assembly; concentricity within 0.02 mm; final inspection required.',
      deliveryAddress: 'Plot 18, Industrial Estate, Pune, Maharashtra 411019',
      buyerEmail: 'orders@apexcomponents.example',
      buyerPhone: '+91 20 5550 1800',
      paymentStatus: 'Deposit received',
    },
    {
      id: 'ORD-2712',
      title: 'Custom Mounting Plate',
      buyer: 'Metro Fabrications',
      quantity: 400,
      price: 168000,
      orderDate: '2026-10-25',
      deadline: '2026-11-27',
      status: 'Ready for Delivery',
      material: 'Mild steel IS 2062',
      specifications: 'Laser cut plate, deburred and powder-coated; batch packed.',
      deliveryAddress: 'Unit 4, Sector 6, Noida, Uttar Pradesh 201301',
      buyerEmail: 'supply@metrofab.example',
      buyerPhone: '+91 120 555 0110',
      paymentStatus: 'Pending',
    },
    {
      id: 'ORD-2655',
      title: 'Pump Coupling Set',
      buyer: 'Vega Industries',
      quantity: 90,
      price: 94500,
      orderDate: '2026-10-12',
      deadline: '2026-10-30',
      status: 'Completed',
      material: 'Cast iron FG260',
      specifications: 'Balanced coupling halves, machined keyways, dimensional report included.',
      deliveryAddress: '88 Peenya Industrial Area, Bengaluru, Karnataka 560058',
      buyerEmail: 'buying@vegaindustries.example',
      buyerPhone: '+91 80 5550 0418',
      paymentStatus: 'Paid',
    },
  ],
  profile: {
    workshopName: 'Precision Works',
    ownerName: 'Rohan Sharma',
    email: 'rohan@precisionworks.example',
    phone: '+91 98765 43210',
    description: 'A precision manufacturing partner focused on reliable CNC machining and small-to-medium production runs.',
    address: 'Plot 12, Phase 2, Industrial Estate',
    city: 'Pune',
    state: 'Maharashtra',
    pinCode: '411019',
    categories: 'CNC machining, Sheet metal fabrication, Turning',
    machinery: '3-axis CNC mill, CNC lathe, Fiber laser cutter',
    services: 'CNC milling, Turning, Prototyping, Inspection',
    productionCapacity: '2,000 parts / month',
    minimumOrder: '25 units',
    monthlyProduction: '2,000 units',
    experience: '12 years',
    employees: '18',
    workingHours: 'Mon–Sat, 9:00 AM–6:00 PM',
    registration: 'Udyam-MH-26-0012345',
  },
  preferences: {
    emailNotifications: true,
    invitationAlerts: true,
    weeklySummary: false,
  },
}

function isAppData(value: unknown): value is WorkshopData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<WorkshopData>
  return Array.isArray(data.invitations)
    && Array.isArray(data.orders)
    && Boolean(data.profile && typeof data.profile === 'object')
    && Boolean(data.preferences && typeof data.preferences === 'object')
}

function loadData(): WorkshopData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return initialData
    const parsed: unknown = JSON.parse(stored)
    if (isAppData(parsed)) return parsed
    console.error('Stored workshop data has an unexpected format; loading demo data.')
  } catch (error) {
    console.error('Could not load stored workshop data; loading demo data.', error)
  }
  return initialData
}

export function WorkshopDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkshopData>(loadData)
  const [toast, setToast] = useState<Toast | null>(null)

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    setToast({ message, kind })
    window.setTimeout(() => setToast(null), 3600)
  }, [])

  const commit = useCallback((next: WorkshopData, message: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setData(next)
      notify(message)
      return true
    } catch (error) {
      console.error('Could not save workshop data.', error)
      notify('Changes could not be saved in this browser. Please check storage settings and try again.', 'error')
      return false
    }
  }, [notify])

  const acceptInvitation = useCallback((id: string) => {
    const invitation = data.invitations.find((item) => item.id === id)
    if (!invitation || invitation.status !== 'New') {
      notify('This invitation is no longer available to accept.', 'error')
      return false
    }
    const orderId = `ORD-${invitation.id.slice(-4)}`
    const newOrder: WorkshopOrder = {
      id: orderId,
      invitationId: invitation.id,
      title: invitation.title,
      buyer: invitation.buyer,
      quantity: invitation.quantity,
      price: invitation.price,
      orderDate: new Date().toISOString().slice(0, 10),
      deadline: invitation.deadline,
      status: 'Confirmed',
      material: invitation.material,
      specifications: `${invitation.description} ${invitation.technicalSpecifications ?? ''}`.trim(),
      deliveryAddress: invitation.deliveryAddress,
      buyerEmail: 'purchasing@buyer.example',
      buyerPhone: 'Contact details shared after award',
      paymentStatus: 'Pending',
    }
    return commit({
      ...data,
      invitations: data.invitations.map((item) => item.id === id ? { ...item, status: 'Accepted' } : item),
      orders: data.orders.some((item) => item.invitationId === id) ? data.orders : [newOrder, ...data.orders],
    }, `${invitation.title} accepted and added to My Orders.`)
  }, [commit, data, notify])

  const rejectInvitation = useCallback((id: string) => {
    const invitation = data.invitations.find((item) => item.id === id)
    if (!invitation || invitation.status !== 'New') {
      notify('This invitation is no longer available to reject.', 'error')
      return false
    }
    return commit({
      ...data,
      invitations: data.invitations.map((item) => item.id === id ? { ...item, status: 'Rejected' } : item),
    }, 'Invitation rejected.')
  }, [commit, data, notify])

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    const order = data.orders.find((item) => item.id === id)
    const progression: OrderStatus[] = ['Confirmed', 'In Production', 'Quality Check', 'Ready for Delivery', 'Dispatched', 'Completed']
    if (!order || progression.indexOf(status) !== progression.indexOf(order.status) + 1) {
      notify('Orders can only move to the next production status.', 'error')
      return false
    }
    const updated = data.orders.map((item) => item.id === id
      ? { ...item, status, paymentStatus: status === 'Completed' ? 'Paid' as const : item.paymentStatus }
      : item)
    return commit({ ...data, orders: updated }, `Order ${id} updated to ${status}.`)
  }, [commit, data, notify])

  const saveProfile = useCallback((profile: WorkshopProfile) => (
    commit({ ...data, profile }, 'Workshop profile saved successfully.')
  ), [commit, data])

  const savePreferences = useCallback((preferences: WorkshopPreferences) => (
    commit({ ...data, preferences }, 'Settings saved successfully.')
  ), [commit, data])

  const value = useMemo(() => ({
    ...data,
    toast,
    notify,
    acceptInvitation,
    rejectInvitation,
    updateOrderStatus,
    saveProfile,
    savePreferences,
    clearToast: () => setToast(null),
  }), [data, toast, notify, acceptInvitation, rejectInvitation, updateOrderStatus, saveProfile, savePreferences])

  return <WorkshopDataContext.Provider value={value}>{children}</WorkshopDataContext.Provider>
}
