export type QuoteStatus = 'Submitted' | 'Withdrawn'

export type DemoQuote = {
  id: string
  invitationId: string
  buyer: string
  jobTitle: string
  estimatedTotalPrice: number
  materialCost: number
  labourCost: number
  otherExpenses: number
  productionDays: number
  expectedCompletionDate: string
  notes: string
  status: QuoteStatus
  submittedAt: string
  updatedAt: string
}

export type QuoteInput = Omit<DemoQuote, 'id' | 'status' | 'submittedAt' | 'updatedAt' | 'buyer' | 'jobTitle'>
