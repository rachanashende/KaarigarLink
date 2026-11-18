import { createContext } from 'react'
import type { WorkshopDataValue } from '../types/workshop'

export const WorkshopDataContext = createContext<WorkshopDataValue | null>(null)
