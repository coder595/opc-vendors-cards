import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoViewer } from '../../src/components/PhotoViewer'
import type { Attachment } from '../../src/db/models'

const photo: Attachment = {
  id: 'a1',
  vendorId: 'v1',
  kind: 'booth',
  blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  thumb: new Blob(['jpeg'], { type: 'image/jpeg' }),
  width: 10,
  height: 10,
  bytes: 4,
  createdAt: 0,
  updatedAt: 0,
}

describe('PhotoViewer share', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close ??= function () {}
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
  })

  it('downloads the photo when the browser cannot share files', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<PhotoViewer attachments={[photo]} initialIndex={0} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(click).toHaveBeenCalled()
  })

  it('opens the share sheet with the photo file when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share, canShare: () => true })
    render(<PhotoViewer attachments={[photo]} initialIndex={0} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await vi.waitFor(() => expect(share).toHaveBeenCalled())
    const file = share.mock.calls[0]![0].files[0] as File
    expect(file.name).toBe('booth-photo-1.jpg')
    expect(file.type).toBe('image/jpeg')
  })
})
