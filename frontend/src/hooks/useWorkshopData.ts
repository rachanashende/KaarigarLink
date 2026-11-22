import { useContext } from 'react'
import { WorkshopDataContext } from '../context/workshopContextValue'

export function useWorkshopData() {
  const context = useContext(WorkshopDataContext)
  if (!context) throw new Error('useWorkshopData must be used inside WorkshopDataProvider.')
  return context
}
