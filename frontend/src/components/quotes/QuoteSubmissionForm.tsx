import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { saveDemoQuote } from '../../services/demoQuoteStorage'
import type { Invitation } from '../../types/workshop'
import type { DemoQuote, QuoteInput } from '../../types/quote'

type QuoteFormValues = {
  materialCost: string
  labourCost: string
  otherExpenses: string
  productionDays: string
  expectedCompletionDate: string
  notes: string
}

type QuoteField = keyof QuoteFormValues

type Props = {
  invitation: Invitation
  existingQuote?: DemoQuote
  onCancel: () => void
  onSaved: (quote: DemoQuote) => void
}

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function QuoteSubmissionForm({ invitation, existingQuote, onCancel, onSaved }: Props) {
  const [values, setValues] = useState<QuoteFormValues>({
    materialCost: existingQuote?.materialCost.toString() ?? '',
    labourCost: existingQuote?.labourCost.toString() ?? '',
    otherExpenses: existingQuote?.otherExpenses.toString() ?? '',
    productionDays: existingQuote?.productionDays.toString() ?? '',
    expectedCompletionDate: existingQuote?.expectedCompletionDate ?? '',
    notes: existingQuote?.notes ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<QuoteField | 'total', string>>>({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const total = useMemo(() => (
    Number(values.materialCost || 0)
    + Number(values.labourCost || 0)
    + Number(values.otherExpenses || 0)
  ), [values.labourCost, values.materialCost, values.otherExpenses])

  function updateField(field: QuoteField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      delete next.total
      return next
    })
    setFormError('')
  }

  function validate(): Partial<Record<QuoteField | 'total', string>> {
    const nextErrors: Partial<Record<QuoteField | 'total', string>> = {}
    const costs: Array<[keyof Pick<QuoteFormValues, 'materialCost' | 'labourCost' | 'otherExpenses'>, string]> = [
      ['materialCost', 'Material cost'],
      ['labourCost', 'Labour cost'],
      ['otherExpenses', 'Other expenses'],
    ]

    for (const [field, label] of costs) {
      const value = values[field].trim()
      if (!value) {
        nextErrors[field] = `Enter ${label.toLowerCase()} (use 0 if not applicable).`
      } else if (!Number.isFinite(Number(value)) || Number(value) < 0) {
        nextErrors[field] = `${label} must be zero or a positive amount.`
      }
    }

    if (total <= 0) nextErrors.total = 'The estimated total price must be greater than ₹0.'

    const productionDays = Number(values.productionDays)
    if (!values.productionDays.trim() || !Number.isInteger(productionDays) || productionDays <= 0) {
      nextErrors.productionDays = 'Production duration must be a whole number of days greater than zero.'
    }

    const completionDate = values.expectedCompletionDate
    const parsedCompletionDate = Date.parse(`${completionDate}T00:00:00`)
    if (!completionDate || !Number.isFinite(parsedCompletionDate)) {
      nextErrors.expectedCompletionDate = 'Enter a valid expected completion date.'
    } else if (completionDate < localDateString()) {
      nextErrors.expectedCompletionDate = 'Completion date must be today or later.'
    } else if (completionDate > invitation.deadline) {
      nextErrors.expectedCompletionDate = 'Completion date cannot be later than the job deadline.'
    }

    if (values.notes.length > 500) nextErrors.notes = 'Notes must be 500 characters or fewer.'
    return nextErrors
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const validationErrors = validate()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return

    const confirmation = existingQuote
      ? `Update your quote to ${currency.format(total)}?`
      : `Submit a quote for ${currency.format(total)}? You can edit or withdraw it while the invitation remains open.`
    if (!window.confirm(confirmation)) return

    setIsSubmitting(true)
    setFormError('')
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      const input: QuoteInput = {
        invitationId: invitation.id,
        estimatedTotalPrice: total,
        materialCost: Number(values.materialCost),
        labourCost: Number(values.labourCost),
        otherExpenses: Number(values.otherExpenses),
        productionDays: Number(values.productionDays),
        expectedCompletionDate: values.expectedCompletionDate,
        notes: values.notes.trim(),
      }
      const result = saveDemoQuote(input, invitation.buyer, invitation.title)
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      onSaved(result.quote)
    } catch (error) {
      console.error('Quote submission failed unexpectedly.', error)
      setFormError('The quote could not be submitted. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel quote-form-panel" aria-labelledby="quote-form-title">
      <div className="panel-header">
        <div><h2 id="quote-form-title">{existingQuote ? 'Edit submitted quote' : 'Prepare your quote'}</h2><p>Demo quote for {invitation.id} · {invitation.title}</p></div>
        <span className="quote-demo-tag">DEMO</span>
      </div>
      <form className="quote-form" noValidate onSubmit={submit}>
        <p className="quote-form-intro">Provide your production costs and expected completion. The estimated total is calculated from the breakdown.</p>
        <div className="quote-fields">
          <label className="quote-field">
            <span>Material cost <i>*</i></span>
            <span className="currency-input"><b>₹</b><input type="number" min="0" step="0.01" value={values.materialCost} onChange={(event) => updateField('materialCost', event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.materialCost)} /></span>
            {errors.materialCost && <small className="quote-field-error">{errors.materialCost}</small>}
          </label>
          <label className="quote-field">
            <span>Labour cost <i>*</i></span>
            <span className="currency-input"><b>₹</b><input type="number" min="0" step="0.01" value={values.labourCost} onChange={(event) => updateField('labourCost', event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.labourCost)} /></span>
            {errors.labourCost && <small className="quote-field-error">{errors.labourCost}</small>}
          </label>
          <label className="quote-field">
            <span>Other expenses <i>*</i></span>
            <span className="currency-input"><b>₹</b><input type="number" min="0" step="0.01" value={values.otherExpenses} onChange={(event) => updateField('otherExpenses', event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.otherExpenses)} /></span>
            {errors.otherExpenses && <small className="quote-field-error">{errors.otherExpenses}</small>}
          </label>
          <div className="quote-total" aria-live="polite">
            <span>Estimated total price</span>
            <strong>{currency.format(total)}</strong>
            {errors.total && <small className="quote-field-error">{errors.total}</small>}
          </div>
          <label className="quote-field">
            <span>Production duration <i>*</i></span>
            <span className="quote-suffix-input"><input type="number" min="1" step="1" value={values.productionDays} onChange={(event) => updateField('productionDays', event.target.value)} placeholder="e.g. 14" aria-invalid={Boolean(errors.productionDays)} /><b>days</b></span>
            {errors.productionDays && <small className="quote-field-error">{errors.productionDays}</small>}
          </label>
          <label className="quote-field">
            <span>Expected completion date <i>*</i></span>
            <input type="date" min={localDateString()} max={invitation.deadline} value={values.expectedCompletionDate} onChange={(event) => updateField('expectedCompletionDate', event.target.value)} aria-invalid={Boolean(errors.expectedCompletionDate)} />
            <small className={errors.expectedCompletionDate ? 'quote-field-error' : 'quote-field-help'}>{errors.expectedCompletionDate ?? `Must be on or before ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${invitation.deadline}T00:00:00`))}.`}</small>
          </label>
          <label className="quote-field quote-field-wide">
            <span>Additional notes <small>(optional)</small></span>
            <textarea rows={3} maxLength={500} value={values.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Add assumptions, material details or other information for the buyer." aria-invalid={Boolean(errors.notes)} />
            <small className={errors.notes ? 'quote-field-error' : 'quote-field-help'}>{errors.notes ?? `${values.notes.length}/500 characters`}</small>
          </label>
        </div>
        {formError && <p className="quote-form-error" role="alert">{formError}</p>}
        <div className="quote-form-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting && <span className="login-spinner" aria-hidden="true" />}
            {isSubmitting ? 'Saving quote…' : existingQuote ? 'Update quote' : 'Submit quote'}
          </button>
        </div>
      </form>
    </section>
  )
}
