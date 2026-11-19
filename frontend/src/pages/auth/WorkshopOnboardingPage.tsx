import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadOnboardingStore, saveOnboardingDraft, submitWorkshopRegistration } from '../../services/onboardingStorage'
import type { OnboardingDraft } from '../../types/onboarding'

type FieldName = keyof OnboardingDraft
type Field = {
  name: FieldName
  label: string
  type?: 'text' | 'email' | 'tel' | 'number'
  placeholder?: string
  required?: boolean
  multiline?: boolean
  wide?: boolean
  helper?: string
}

const stepNames = ['Basic information', 'Location', 'Capabilities', 'Business information', 'Review and submit']

const stepFields: Field[][] = [
  [
    { name: 'workshopName', label: 'Workshop name', required: true, placeholder: 'e.g. Precision Works' },
    { name: 'ownerName', label: 'Owner name', required: true, placeholder: 'Full name' },
    { name: 'email', label: 'Email address', type: 'email', required: true, placeholder: 'you@workshop.com' },
    { name: 'phone', label: 'Phone number', type: 'tel', required: true, placeholder: '+91 98765 43210', helper: 'Use 7–15 digits; country code is optional.' },
    { name: 'description', label: 'Workshop description', required: true, multiline: true, wide: true, placeholder: 'Describe your workshop and the work you specialize in.' },
  ],
  [
    { name: 'address', label: 'Street address', required: true, wide: true, placeholder: 'Building, street and industrial area' },
    { name: 'city', label: 'City', required: true, placeholder: 'City' },
    { name: 'state', label: 'State', required: true, placeholder: 'State' },
    { name: 'pinCode', label: 'PIN code', required: true, placeholder: '6-digit PIN code', helper: 'Enter a 6-digit PIN code.' },
  ],
  [
    { name: 'categories', label: 'Manufacturing categories', required: true, multiline: true, wide: true, placeholder: 'e.g. CNC machining, sheet metal fabrication' },
    { name: 'machinery', label: 'Available machinery', required: true, multiline: true, wide: true, placeholder: 'List the machines available at your workshop.' },
    { name: 'machineSpecifications', label: 'Machine specifications', required: true, multiline: true, wide: true, placeholder: 'Add machine models, work envelope, tolerances or other relevant specifications.' },
    { name: 'services', label: 'Services offered', required: true, multiline: true, wide: true, placeholder: 'e.g. milling, turning, prototyping, inspection' },
    { name: 'productionCapacity', label: 'Production capacity (units / month)', type: 'number', required: true, placeholder: 'e.g. 2000' },
    { name: 'minimumOrder', label: 'Minimum order quantity (units)', type: 'number', required: true, placeholder: 'e.g. 25' },
    { name: 'monthlyProduction', label: 'Maximum monthly production (units)', type: 'number', required: true, placeholder: 'e.g. 2000' },
  ],
  [
    { name: 'experience', label: 'Years of experience', type: 'number', required: true, placeholder: 'e.g. 12' },
    { name: 'employees', label: 'Number of employees', type: 'number', required: true, placeholder: 'e.g. 18' },
    { name: 'workingHours', label: 'Working hours', required: true, placeholder: 'e.g. Mon–Sat, 9 AM–6 PM' },
    { name: 'registration', label: 'Business registration details', wide: true, placeholder: 'Udyam, GST or other registration (optional)', helper: 'Optional. Add details you are comfortable sharing.' },
  ],
]

const reviewSections: Array<{ title: string; step: number; fields: Field[] }> = [
  { title: 'Basic information', step: 0, fields: stepFields[0] },
  { title: 'Location', step: 1, fields: stepFields[1] },
  { title: 'Manufacturing capabilities', step: 2, fields: stepFields[2] },
  { title: 'Business information', step: 3, fields: stepFields[3] },
]

function validateStep(step: number, draft: OnboardingDraft) {
  const errors: Partial<Record<FieldName, string>> = {}
  for (const field of stepFields[step]) {
    const value = draft[field.name].trim()
    if (field.required && !value) {
      errors[field.name] = `${field.label} is required.`
      continue
    }
    if (!value) continue
    if (field.name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.email = 'Enter a valid email address.'
    } else if (field.name === 'phone') {
      const digits = value.replace(/\D/g, '')
      if (!/^\+?[0-9\s()-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
        errors.phone = 'Enter a valid phone number with 7–15 digits.'
      }
    } else if (field.name === 'pinCode' && !/^\d{6}$/.test(value)) {
      errors.pinCode = 'Enter a valid 6-digit PIN code.'
    } else if (field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) < (field.name === 'experience' ? 0 : 1))) {
      errors[field.name] = field.name === 'experience' ? 'Experience cannot be negative.' : 'Enter a number greater than zero.'
    }
  }
  if (!errors.minimumOrder && !errors.monthlyProduction && draft.minimumOrder && draft.monthlyProduction
    && Number(draft.minimumOrder) > Number(draft.monthlyProduction)) {
    errors.minimumOrder = 'Minimum order cannot exceed maximum monthly production.'
  }
  return errors
}

export default function WorkshopOnboardingPage() {
  const navigate = useNavigate()
  const [initialStore] = useState(loadOnboardingStore)
  const [draft, setDraft] = useState<OnboardingDraft>(initialStore.draft)
  const [currentStep, setCurrentStep] = useState(initialStore.currentStep)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function changeField(name: FieldName, value: string) {
    const updated = { ...draft, [name]: value }
    setDraft(updated)
    setErrors((previous) => ({ ...previous, [name]: undefined }))
    if (!saveOnboardingDraft(updated, currentStep)) {
      setNotice({ type: 'error', message: 'Progress could not be saved in this browser. Check storage settings and try again.' })
    }
  }

  function saveProgress() {
    if (saveOnboardingDraft(draft, currentStep)) {
      setNotice({ type: 'success', message: 'Your onboarding progress is saved in this browser.' })
    } else {
      setNotice({ type: 'error', message: 'Progress could not be saved in this browser. Check storage settings and try again.' })
    }
  }

  function continueToNextStep() {
    const validationErrors = validateStep(currentStep, draft)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) {
      setNotice({ type: 'error', message: 'Please fix the highlighted fields before continuing.' })
      return
    }
    setNotice(null)
    const nextStep = Math.min(currentStep + 1, stepNames.length - 1)
    setCurrentStep(nextStep)
    if (!saveOnboardingDraft(draft, nextStep)) {
      setNotice({ type: 'error', message: 'Your next step could not be saved in this browser.' })
    }
  }

  function editSection(step: number) {
    setNotice(null)
    setErrors({})
    setCurrentStep(step)
    if (!saveOnboardingDraft(draft, step)) {
      setNotice({ type: 'error', message: 'Your progress could not be saved in this browser.' })
    }
  }

  function previousStep() {
    const previous = Math.max(currentStep - 1, 0)
    setCurrentStep(previous)
    setNotice(null)
    if (!saveOnboardingDraft(draft, previous)) {
      setNotice({ type: 'error', message: 'Your progress could not be saved in this browser.' })
    }
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    const result = submitWorkshopRegistration(draft)
    setSubmitting(false)

    if (!result.ok) {
      setNotice({ type: 'error', message: 'Registration could not be saved in this browser. Please try again.' })
      return
    }

    const message = result.updatedExisting
      ? 'Your demo registration was updated. No duplicate workshop record was created.'
      : 'Your demo workshop registration was saved successfully.'
    navigate('/login', { replace: true, state: { registrationSuccess: message } })
  }

  function renderField(field: Field) {
    const fieldError = errors[field.name]
    return (
      <label className={`onboarding-field${field.wide ? ' onboarding-field-wide' : ''}`} key={field.name}>
        <span className="onboarding-field-label">{field.label}{field.required && <i aria-hidden="true"> *</i>}</span>
        {field.multiline ? (
          <textarea
            value={draft[field.name]}
            onChange={(event) => changeField(field.name, event.target.value)}
            placeholder={field.placeholder}
            rows={field.name === 'description' ? 4 : 3}
            required={field.required}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? `${field.name}-error` : field.helper ? `${field.name}-help` : undefined}
          />
        ) : (
          <input
            type={field.type ?? 'text'}
            value={draft[field.name]}
            onChange={(event) => changeField(field.name, event.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            min={field.type === 'number' ? field.name === 'experience' ? 0 : 1 : undefined}
            step={field.type === 'number' ? field.name === 'experience' ? 0.5 : 1 : undefined}
            inputMode={field.type === 'tel' ? 'tel' : undefined}
            autoComplete={field.name === 'email' ? 'email' : field.name === 'phone' ? 'tel' : undefined}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? `${field.name}-error` : field.helper ? `${field.name}-help` : undefined}
          />
        )}
        {fieldError && <small className="onboarding-field-error" id={`${field.name}-error`}>{fieldError}</small>}
        {!fieldError && field.helper && <small className="onboarding-field-help" id={`${field.name}-help`}>{field.helper}</small>}
      </label>
    )
  }

  const progressPercent = currentStep / (stepNames.length - 1) * 100

  return (
    <main className="onboarding-page">
      <header className="onboarding-topbar">
        <Link className="brand onboarding-brand" to="/login" aria-label="KaarigarLink sign in">
          <span className="brand-mark">K</span>
          <span>Kaarigar<span>Link</span></span>
        </Link>
        <Link className="onboarding-signin-link" to="/login">Already registered? <strong>Sign in</strong></Link>
      </header>

      <div className="onboarding-content">
        <div className="onboarding-heading">
          <p className="eyebrow">WORKSHOP REGISTRATION · DEMO</p>
          <h1>Tell us about your workshop</h1>
          <p>Set up your workshop profile so buyers can understand your capabilities and production capacity.</p>
        </div>

        <div className="onboarding-demo-note" role="note">
          <span className="demo-indicator" />
          Demo registration only — information is stored in this browser and is not sent to a backend.
        </div>

        <nav className="onboarding-stepper" aria-label="Workshop registration steps">
          <div className="onboarding-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
          {stepNames.map((name, index) => (
            <button
              className={`onboarding-step${index === currentStep ? ' current' : ''}${index < currentStep ? ' completed' : ''}`}
              type="button"
              key={name}
              onClick={() => index < currentStep && editSection(index)}
              disabled={index > currentStep}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              <span className="onboarding-step-number">{index < currentStep ? '✓' : index + 1}</span>
              <span className="onboarding-step-label">{name}</span>
            </button>
          ))}
        </nav>

        {notice && <div className={`onboarding-notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</div>}

        <form className="panel onboarding-panel" onSubmit={submitRegistration}>
          <div className="onboarding-panel-heading">
            <div>
              <p className="eyebrow">STEP {currentStep + 1} OF {stepNames.length}</p>
              <h2>{stepNames[currentStep]}</h2>
              <p>{currentStep === 4 ? 'Review the information before saving your demo registration.' : 'Fields marked with an asterisk are required.'}</p>
            </div>
            <span className="draft-indicator"><i /> Draft saved locally</span>
          </div>

          {currentStep < 4 ? (
            <div className="onboarding-fields">
              {stepFields[currentStep].map(renderField)}
            </div>
          ) : (
            <div className="onboarding-review">
              {reviewSections.map((section) => (
                <section className="review-section" key={section.title}>
                  <div className="review-section-heading"><h3>{section.title}</h3><button type="button" className="text-button" onClick={() => editSection(section.step)}>Edit</button></div>
                  <dl className="review-grid">
                    {section.fields.map((field) => (
                      <div className={field.wide ? 'review-wide' : ''} key={field.name}>
                        <dt>{field.label}</dt>
                        <dd>{draft[field.name].trim() || 'Not provided'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}

          <div className="onboarding-form-footer">
            <div className="onboarding-footer-left">
              {currentStep === 0
                ? <Link className="onboarding-back-link" to="/login">← Back to sign in</Link>
                : <button type="button" className="secondary-button" onClick={previousStep}>← Previous</button>}
              <button type="button" className="text-button save-progress-button" onClick={saveProgress}>Save progress</button>
            </div>
            {currentStep < 4
              ? <button type="button" className="primary-button" onClick={continueToNextStep}>Continue <span>→</span></button>
              : <button type="submit" className="primary-button onboarding-submit" disabled={submitting}>{submitting ? 'Saving…' : 'Submit registration'}</button>}
          </div>
        </form>

        <p className="onboarding-footnote">Your draft stays on this device. Demo registrations are updated by email so repeated submissions won’t create duplicate records.</p>
      </div>
      <footer className="onboarding-copyright">© 2026 KaarigarLink <span>·</span> Workshop workspace demo</footer>
    </main>
  )
}
