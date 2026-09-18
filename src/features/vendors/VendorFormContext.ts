import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { PhotoDraft, VendorAction, VendorDraft } from './formState'

export interface VendorFormValue {
  draft: VendorDraft
  dispatch: Dispatch<VendorAction>
  errors: Record<string, string>
  removePhoto: (photo: PhotoDraft) => void
}

export const VendorFormContext = createContext<VendorFormValue | null>(null)

export function useVendorForm(): VendorFormValue {
  const value = useContext(VendorFormContext)
  if (!value) throw new Error('useVendorForm must be used inside VendorForm')
  return value
}
