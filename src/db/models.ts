export type VendorType = 'supplier' | 'dealer' | 'agent' | 'factory' | 'trader' | 'other'

export type PipelineStatus =
  'lead' | 'contacted' | 'met' | 'quoted' | 'sample' | 'negotiating' | 'ordered' | 'archived'

export type Rating = 1 | 2 | 3 | 4 | 5

export type SocialPlatform =
  'wechat' | 'whatsapp' | 'alibaba' | 'linkedin' | 'instagram' | 'facebook' | 'other'

export type AttachmentKind = 'business_card' | 'product' | 'booth' | 'document' | 'other'

export type Theme = 'light' | 'dark' | 'system' | 'gruvbox' | 'oled' | 'sepia'

export interface SocialLink {
  platform: SocialPlatform
  value: string
}

export interface FairRef {
  edition?: string
  hall?: string
  booth?: string
  note?: string
}

export interface Vendor {
  id: string
  name: string
  type: VendorType
  status: PipelineStatus
  rating: Rating
  country?: string
  city?: string
  address?: string
  website?: string
  description?: string
  socials: SocialLink[]
  tags: string[]
  fair: FairRef
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface Contact {
  id: string
  vendorId: string
  name: string
  position?: string
  phone?: string
  email?: string
  wechat?: string
  whatsapp?: string
  isPrimary: boolean
  cardAttachmentId?: string
}

export interface PriceTier {
  minQty: number
  unitPrice: number
}

export interface Product {
  id: string
  vendorId: string
  name: string
  description?: string
  unit?: string
  currency: string
  price?: number
  moq?: number
  tiers: PriceTier[]
  leadTimeDays?: number
  paymentTerms?: string
  photoAttachmentIds: string[]
  createdAt: number
}

export interface Note {
  id: string
  vendorId: string
  text: string
  isTask: boolean
  done: boolean
  dueDate?: number
  createdAt: number
}

export interface Certification {
  id: string
  vendorId: string
  name: string
  number?: string
  issuer?: string
  expiry?: number
}

export interface Attachment {
  id: string
  vendorId: string
  kind: AttachmentKind
  blob: Blob
  thumb: Blob
  width: number
  height: number
  bytes: number
  createdAt: number
}

export interface Settings {
  id: 'app'
  baseCurrency: string
  rates: Record<string, number>
  travellerName?: string
  defaultFair?: FairRef
  theme: Theme
}

/* Input types — defaults are applied by the repositories. */

export interface VendorInput {
  name: string
  type?: VendorType
  status?: PipelineStatus
  rating?: Rating
  country?: string
  city?: string
  address?: string
  website?: string
  description?: string
  socials?: SocialLink[]
  tags?: string[]
  fair?: FairRef
}

export interface ContactInput {
  name: string
  position?: string
  phone?: string
  email?: string
  wechat?: string
  whatsapp?: string
  isPrimary?: boolean
  cardAttachmentId?: string
}

export interface ProductInput {
  name: string
  description?: string
  unit?: string
  currency?: string
  price?: number
  moq?: number
  tiers?: PriceTier[]
  leadTimeDays?: number
  paymentTerms?: string
  photoAttachmentIds?: string[]
}

export interface NoteInput {
  text: string
  isTask?: boolean
  done?: boolean
  dueDate?: number
}

export interface CertInput {
  name: string
  number?: string
  issuer?: string
  expiry?: number
}

export interface NewAttachment {
  kind: AttachmentKind
  blob: Blob
  thumb: Blob
  width: number
  height: number
  bytes: number
}

/** A resized image before it is associated with a vendor/kind. */
export type ProcessedImage = Omit<NewAttachment, 'kind'>

/* Import / export shapes. Attachments are inlined as base64 with explicit MIME. */

export interface ExportedAttachment extends Omit<Attachment, 'blob' | 'thumb'> {
  mime: string
  blobB64: string
  thumbMime: string
  thumbB64: string
}

export interface ExportData {
  vendors: Vendor[]
  contacts: Contact[]
  products: Product[]
  notes: Note[]
  certs: Certification[]
  attachments: ExportedAttachment[]
  settings: Settings | null
}

export interface ExportEnvelope {
  schemaVersion: number
  exportedAt: string
  app: { id: string; version: string }
  data: ExportData
}

export type ImportMode = 'merge' | 'replace'

export type MergePolicy = 'existing-wins' | 'imported-wins'
