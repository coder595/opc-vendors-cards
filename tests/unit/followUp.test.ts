import { describe, expect, it } from 'vitest'
import { followUpLinks, followUpText } from '../../src/lib/followUp'
import type { Contact } from '../../src/db/models'
import { makeVendor } from './helpers/fixtures'

const vendor = makeVendor({
  name: 'Guangzhou Lighting',
  fair: { edition: 'Canton Fair 138', hall: '1.2', booth: 'A14' },
})
const contact: Contact = {
  id: 'c1',
  vendorId: vendor.id,
  name: 'Li Wei',
  isPrimary: true,
  phone: '+86 138 0000 1111',
  email: 'li@example.com',
  updatedAt: 1,
}

describe('followUpText', () => {
  it('mentions the fair, booth, products and sender', () => {
    const text = followUpText(contact, vendor, ['LED panel', 'Driver'], 'Sama')
    expect(text).toBe(
      'Hello Li, it was good to meet you at Canton Fair 138 (booth 1.2 A14). ' +
        'Could you please send your quotation for LED panel, Driver?\n\nBest regards,\nSama',
    )
  })

  it('drops parts that are unknown', () => {
    const bare = makeVendor({ name: 'X' })
    expect(followUpText({ ...contact, name: 'Anna' }, bare, [], undefined)).toBe(
      'Hello Anna, it was good to meet you. Could you please send your quotation?\n\nBest regards',
    )
  })
})

describe('followUpLinks', () => {
  it('builds wa.me from whatsapp (falling back to phone) and a mailto with subject', () => {
    const links = followUpLinks(contact, vendor, 'Hi & bye')
    expect(links.whatsapp).toBe('https://wa.me/8613800001111?text=Hi%20%26%20bye')
    expect(links.email).toBe(
      'mailto:li@example.com?subject=Quotation%20request%20%E2%80%94%20Guangzhou%20Lighting&body=Hi%20%26%20bye',
    )
  })

  it('omits channels the contact lacks', () => {
    const links = followUpLinks({ ...contact, phone: undefined, email: undefined }, vendor, 'x')
    expect(links).toEqual({ whatsapp: null, email: null })
  })
})
