import { useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkshopData } from '../../hooks/useWorkshopData'
import type { WorkshopProfile } from '../../types/workshop'

type FieldName = keyof WorkshopProfile
type Field = { name: FieldName; label: string; type?: 'email' | 'tel' | 'textarea'; required?: boolean; wide?: boolean; placeholder?: string }

const sections: Array<{ title: string; description: string; fields: Field[] }> = [
  {
    title: 'Basic information',
    description: 'How buyers identify and contact your workshop.',
    fields: [
      { name: 'workshopName', label: 'Workshop name', required: true },
      { name: 'ownerName', label: 'Owner name', required: true },
      { name: 'email', label: 'Email address', type: 'email', required: true },
      { name: 'phone', label: 'Phone number', type: 'tel', required: true },
      { name: 'description', label: 'Workshop description', type: 'textarea', wide: true },
    ],
  },
  {
    title: 'Workshop location',
    description: 'Your location helps buyers plan collection and delivery.',
    fields: [
      { name: 'address', label: 'Street address', wide: true, required: true },
      { name: 'city', label: 'City', required: true },
      { name: 'state', label: 'State', required: true },
      { name: 'pinCode', label: 'PIN code', required: true },
    ],
  },
  {
    title: 'Manufacturing capabilities',
    description: 'Help us match your machinery and capacity to the right jobs.',
    fields: [
      { name: 'categories', label: 'Manufacturing categories', placeholder: 'Separate capabilities with commas', wide: true },
      { name: 'machinery', label: 'Available machinery', placeholder: 'Machine names and key specifications', wide: true },
      { name: 'services', label: 'Services offered', placeholder: 'Separate services with commas', wide: true },
      { name: 'productionCapacity', label: 'Production capacity' },
      { name: 'minimumOrder', label: 'Minimum order quantity' },
      { name: 'monthlyProduction', label: 'Maximum monthly production' },
    ],
  },
  {
    title: 'Business information',
    description: 'Business details allow buyers to understand your production experience.',
    fields: [
      { name: 'experience', label: 'Years of experience' },
      { name: 'employees', label: 'Number of employees' },
      { name: 'workingHours', label: 'Working hours' },
      { name: 'registration', label: 'Business registration details', wide: true },
    ],
  },
]

function completion(profile: WorkshopProfile) {
  const required: FieldName[] = ['workshopName', 'ownerName', 'email', 'phone', 'description', 'address', 'city', 'state', 'pinCode', 'categories', 'machinery', 'services', 'productionCapacity', 'minimumOrder', 'monthlyProduction', 'experience', 'employees', 'workingHours', 'registration']
  return Math.round(required.filter((field) => profile[field].trim().length > 0).length / required.length * 100)
}

export default function WorkshopProfilePage() {
  const { profile, saveProfile } = useWorkshopData()
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const progress = completion(editing ? draft : profile)

  function cancelEdit() {
    setDraft(profile)
    setEditing(false)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveProfile(draft)) setEditing(false)
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">YOUR WORKSHOP</p><h1>Workshop Profile</h1><p className="page-subtitle">Manage your workshop information and business details.</p></div>
        {!editing && <button className="primary-button" onClick={() => setEditing(true)}>Edit profile</button>}
      </div>
      <section className="panel completion-panel">
        <div className="completion-copy"><div><strong>Profile completion</strong><p>A complete profile helps buyers find the right manufacturing partner.</p></div><b>{progress}%</b></div>
        <div className="completion-track"><span style={{ width: `${progress}%` }} /></div>
      </section>
      <form className="profile-form" onSubmit={save}>
        {sections.map((section) => (
          <section className="panel profile-section" key={section.title}>
            <div className="panel-header"><div><h2>{section.title}</h2><p>{section.description}</p></div></div>
            <div className="profile-fields">
              {section.fields.map((field) => (
                <label key={field.name} className={`profile-field${field.wide ? ' field-wide' : ''}`}>
                  <span>{field.label}{field.required && <i aria-hidden="true"> *</i>}</span>
                  {field.type === 'textarea'
                    ? <textarea rows={4} value={draft[field.name]} disabled={!editing} required={field.required} onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })} />
                    : <input type={field.type ?? 'text'} value={draft[field.name]} disabled={!editing} required={field.required} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })} />}
                </label>
              ))}
            </div>
          </section>
        ))}
        {editing && <div className="form-actions"><button type="button" className="secondary-button" onClick={cancelEdit}>Cancel</button><button type="submit" className="primary-button">Save changes</button></div>}
      </form>
    </>
  )
}
