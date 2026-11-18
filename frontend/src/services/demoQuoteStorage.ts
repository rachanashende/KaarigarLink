import type { DemoQuote, QuoteInput } from '../types/quote'

const STORAGE_KEY = 'kaarigarlink-demo-quotes-v1'

function isDemoQuote(value: unknown): value is DemoQuote {
  if (!value || typeof value !== 'object') return false
  const quote = value as Partial<DemoQuote>
  return typeof quote.id === 'string'
    && typeof quote.invitationId === 'string'
    && typeof quote.buyer === 'string'
    && typeof quote.jobTitle === 'string'
    && typeof quote.estimatedTotalPrice === 'number'
    && typeof quote.materialCost === 'number'
    && typeof quote.labourCost === 'number'
    && typeof quote.otherExpenses === 'number'
    && typeof quote.productionDays === 'number'
    && typeof quote.expectedCompletionDate === 'string'
    && typeof quote.notes === 'string'
    && (quote.status === 'Submitted' || quote.status === 'Withdrawn')
    && typeof quote.submittedAt === 'string'
    && typeof quote.updatedAt === 'string'
}

export function loadDemoQuotes(): DemoQuote[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isDemoQuote)) return parsed
    console.error('Stored demo quotes have an unexpected format; loading an empty quote history.')
  } catch (error) {
    console.error('Could not load demo quote history.', error)
  }
  return []
}

export function saveDemoQuote(input: QuoteInput, buyer: string, jobTitle: string):
  | { ok: true; quote: DemoQuote }
  | { ok: false; message: string } {
  try {
    const quotes = loadDemoQuotes()
    const existing = quotes.find((quote) => quote.invitationId === input.invitationId)
    if (existing?.status === 'Withdrawn') {
      return { ok: false, message: 'A withdrawn quote cannot be resubmitted in this demo workflow.' }
    }

    const now = new Date().toISOString()
    const quote: DemoQuote = {
      ...input,
      buyer,
      jobTitle,
      id: existing?.id ?? `DEMO-QUOTE-${crypto.randomUUID()}`,
      status: 'Submitted',
      submittedAt: existing?.submittedAt ?? now,
      updatedAt: now,
    }
    const nextQuotes = existing
      ? quotes.map((item) => item.id === existing.id ? quote : item)
      : [...quotes, quote]

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextQuotes))
    return { ok: true, quote }
  } catch (error) {
    console.error('Could not save the demo quote.', error)
    return { ok: false, message: 'The quote could not be saved in this browser. Check storage settings and try again.' }
  }
}

export function withdrawDemoQuote(quoteId: string):
  | { ok: true; quote: DemoQuote }
  | { ok: false; message: string } {
  try {
    const quotes = loadDemoQuotes()
    const existing = quotes.find((quote) => quote.id === quoteId)
    if (!existing || existing.status !== 'Submitted') {
      return { ok: false, message: 'Only a submitted quote can be withdrawn.' }
    }
    const quote: DemoQuote = { ...existing, status: 'Withdrawn', updatedAt: new Date().toISOString() }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(
      quotes.map((item) => item.id === quote.id ? quote : item),
    ))
    return { ok: true, quote }
  } catch (error) {
    console.error('Could not withdraw the demo quote.', error)
    return { ok: false, message: 'The quote could not be withdrawn in this browser. Please try again.' }
  }
}
