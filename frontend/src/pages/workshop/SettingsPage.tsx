import { useState } from 'react'
import { useWorkshopData } from '../../hooks/useWorkshopData'
import type { WorkshopPreferences } from '../../types/workshop'

const preferenceFields: Array<{ key: keyof WorkshopPreferences; title: string; description: string }> = [
  { key: 'emailNotifications', title: 'Email notifications', description: 'Receive important workshop updates by email.' },
  { key: 'invitationAlerts', title: 'New invitation alerts', description: 'Get notified when a buyer sends your workshop a job invitation.' },
  { key: 'weeklySummary', title: 'Weekly activity summary', description: 'Receive a weekly recap of orders, deadlines and workshop activity.' },
]

export default function SettingsPage() {
  const { preferences, savePreferences } = useWorkshopData()
  const [draft, setDraft] = useState(preferences)
  const [dirty, setDirty] = useState(false)

  function update(key: keyof WorkshopPreferences, checked: boolean) {
    setDraft((current) => ({ ...current, [key]: checked }))
    setDirty(true)
  }

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">ACCOUNT</p><h1>Settings</h1><p className="page-subtitle">Manage your workshop notifications and preferences.</p></div></div>
      <section className="panel settings-panel">
        <div className="panel-header"><div><h2>Notifications</h2><p>Choose which updates you want to receive.</p></div></div>
        <div className="settings-options">
          {preferenceFields.map((field) => <label className="setting-row" key={field.key}>
            <span><strong>{field.title}</strong><small>{field.description}</small></span>
            <input type="checkbox" checked={draft[field.key]} onChange={(event) => update(field.key, event.target.checked)} />
          </label>)}
        </div>
        {dirty && <div className="settings-actions"><button className="secondary-button" onClick={() => { setDraft(preferences); setDirty(false) }}>Cancel</button><button className="primary-button" onClick={() => { if (savePreferences(draft)) setDirty(false) }}>Save preferences</button></div>}
      </section>
    </>
  )
}
