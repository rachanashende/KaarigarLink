export type OnboardingDraft = {
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
  machineSpecifications: string
  services: string
  productionCapacity: string
  minimumOrder: string
  monthlyProduction: string
  experience: string
  employees: string
  workingHours: string
  registration: string
}

export type WorkshopRegistration = OnboardingDraft & {
  id: string
  registeredAt: string
}

export type OnboardingStore = {
  draft: OnboardingDraft
  currentStep: number
  registrations: WorkshopRegistration[]
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  workshopName: '',
  ownerName: '',
  email: '',
  phone: '',
  description: '',
  address: '',
  city: '',
  state: '',
  pinCode: '',
  categories: '',
  machinery: '',
  machineSpecifications: '',
  services: '',
  productionCapacity: '',
  minimumOrder: '',
  monthlyProduction: '',
  experience: '',
  employees: '',
  workingHours: '',
  registration: '',
}
