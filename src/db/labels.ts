import type { AttachmentKind, PipelineStatus, VendorType } from './models'

export const VENDOR_TYPES: { value: VendorType; label: string }[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'factory', label: 'Factory' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'agent', label: 'Agent' },
  { value: 'trader', label: 'Trader' },
  { value: 'other', label: 'Other' },
]

export const TYPE_LABEL: Record<VendorType, string> = {
  supplier: 'Supplier',
  factory: 'Factory',
  dealer: 'Dealer',
  agent: 'Agent',
  trader: 'Trader',
  other: 'Other',
}

export const STATUSES: { value: PipelineStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'met', label: 'Met' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'sample', label: 'Sample' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'archived', label: 'Archived' },
]

export const STATUS_LABEL: Record<PipelineStatus, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  met: 'Met',
  quoted: 'Quoted',
  sample: 'Sample',
  negotiating: 'Negotiating',
  ordered: 'Ordered',
  archived: 'Archived',
}

export const STATUS_ABBR: Record<PipelineStatus, string> = {
  lead: 'LEAD',
  contacted: 'CNTCT',
  met: 'MET',
  quoted: 'QUOTE',
  sample: 'SMPL',
  negotiating: 'NEGO',
  ordered: 'ORDR',
  archived: 'ARCH',
}

export type SealTone = 'slate' | 'amber' | 'brand' | 'jade'

export const STATUS_TONE: Record<PipelineStatus, SealTone> = {
  lead: 'slate',
  contacted: 'slate',
  archived: 'slate',
  quoted: 'amber',
  sample: 'amber',
  met: 'brand',
  negotiating: 'brand',
  ordered: 'jade',
}

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  business_card: 'Business card',
  product: 'Product',
  booth: 'Booth',
  document: 'Document',
  other: 'Other',
}
