export type InvitationStatus = 'New' | 'Accepted' | 'Rejected'
export type OrderStatus =
  | 'Confirmed'
  | 'In Production'
  | 'Quality Check'
  | 'Ready for Delivery'
  | 'Dispatched'
  | 'Completed'

export type Invitation = {
  id: string
  title: string
  buyer: string
  description: string
  quantity: number
  price: number
  deadline: string
  receivedAt: string
  status: InvitationStatus
  material: string
  machines: string[]
  deliveryAddress: string
  technicalSpecifications?: string
}

export type WorkshopOrder = {
  id: string
  invitationId?: string
  title: string
  buyer: string
  quantity: number
  price: number
  orderDate: string
  deadline: string
  status: OrderStatus
  material: string
  specifications: string
  deliveryAddress: string
  buyerEmail: string
  buyerPhone: string
  paymentStatus: 'Pending' | 'Deposit received' | 'Paid'
}

export type WorkshopProfile = {
  workshopName: string
  ownerName: string
  email: string
  phone: string
  description: string
  address: string
  city: string
  state: string
  pinCode: string
  categories: string
  machinery: string
  services: string
  productionCapacity: string
  minimumOrder: string
  monthlyProduction: string
  experience: string
  employees: string
  workingHours: string
  registration: string
}

export type WorkshopPreferences = {
  emailNotifications: boolean
  invitationAlerts: boolean
  weeklySummary: boolean
}

export type WorkshopData = {
  invitations: Invitation[]
  orders: WorkshopOrder[]
  profile: WorkshopProfile
  preferences: WorkshopPreferences
}

export type Toast = { message: string; kind: 'success' | 'error' }
export type WorkshopDataValue = WorkshopData & {
  toast: Toast | null
  notify: (message: string, kind?: Toast['kind']) => void
  acceptInvitation: (id: string) => boolean
  rejectInvitation: (id: string) => boolean
  updateOrderStatus: (id: string, status: OrderStatus) => boolean
  saveProfile: (profile: WorkshopProfile) => boolean
  savePreferences: (preferences: WorkshopPreferences) => boolean
  clearToast: () => void
}
