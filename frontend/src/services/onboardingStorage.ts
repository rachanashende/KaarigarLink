import { EMPTY_ONBOARDING_DRAFT } from '../types/onboarding'
import type { OnboardingDraft, OnboardingStore, WorkshopRegistration } from '../types/onboarding'

const STORAGE_KEY = 'kaarigarlink-demo-onboarding-v1'

function isDraft(value: unknown): value is OnboardingDraft {
  if (!value || typeof value !== 'object') return false
  return Object.keys(EMPTY_ONBOARDING_DRAFT).every((key) => (
    typeof (value as Record<string, unknown>)[key] === 'string'
  ))
}

function isRegistration(value: unknown): value is WorkshopRegistration {
  return Boolean(
    value
    && typeof value === 'object'
    && isDraft(value)
    && typeof (value as WorkshopRegistration).id === 'string'
    && typeof (value as WorkshopRegistration).registeredAt === 'string',
  )
}

function isStore(value: unknown): value is OnboardingStore {
  if (!value || typeof value !== 'object') return false
  const store = value as Partial<OnboardingStore>
  return isDraft(store.draft)
    && Array.isArray(store.registrations)
    && store.registrations.every(isRegistration)
    && (store.currentStep === undefined || (Number.isInteger(store.currentStep) && store.currentStep >= 0 && store.currentStep <= 4))
}

export function loadOnboardingStore(): OnboardingStore {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { draft: { ...EMPTY_ONBOARDING_DRAFT }, currentStep: 0, registrations: [] }
    const parsed: unknown = JSON.parse(stored)
    if (isStore(parsed)) return { ...parsed, currentStep: parsed.currentStep ?? 0 }
    console.error('Stored onboarding data has an unexpected format; using an empty draft.')
  } catch (error) {
    console.error('Could not load demo onboarding data.', error)
  }
  return { draft: { ...EMPTY_ONBOARDING_DRAFT }, currentStep: 0, registrations: [] }
}

export function saveOnboardingDraft(draft: OnboardingDraft, currentStep = 0): boolean {
  try {
    const store = loadOnboardingStore()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, draft, currentStep }))
    return true
  } catch (error) {
    console.error('Could not save the demo onboarding draft.', error)
    return false
  }
}

export function submitWorkshopRegistration(draft: OnboardingDraft):
  | { ok: true; updatedExisting: boolean }
  | { ok: false } {
  try {
    const store = loadOnboardingStore()
    const normalizedEmail = draft.email.trim().toLowerCase()
    const existing = store.registrations.find((registration) => (
      registration.email.trim().toLowerCase() === normalizedEmail
    ))
    const registration: WorkshopRegistration = {
      ...draft,
      email: normalizedEmail,
      id: existing?.id ?? `DEMO-${crypto.randomUUID()}`,
      registeredAt: existing?.registeredAt ?? new Date().toISOString(),
    }
    const registrations = existing
      ? store.registrations.map((item) => item.id === existing.id ? registration : item)
      : [...store.registrations, registration]

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, draft, currentStep: 4, registrations }))
    return { ok: true, updatedExisting: Boolean(existing) }
  } catch (error) {
    console.error('Could not save the demo workshop registration.', error)
    return { ok: false }
  }
}
