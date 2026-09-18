import { describe, expect, it, vi } from 'vitest'
import { fitDimensions, resizePhoto, type Rasterizer } from '../../src/lib/images'

describe('fitDimensions', () => {
  it('returns the original size when already within bounds', () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('scales a landscape image to the max edge', () => {
    expect(fitDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 })
  })

  it('scales a portrait image to the max edge', () => {
    expect(fitDimensions(1600, 3200, 1600)).toEqual({ width: 800, height: 1600 })
  })

  it('scales squares', () => {
    expect(fitDimensions(4000, 4000, 256)).toEqual({ width: 256, height: 256 })
  })

  it('never produces a zero dimension', () => {
    expect(fitDimensions(10000, 1, 1600)).toEqual({ width: 1600, height: 1 })
  })
})

describe('resizePhoto', () => {
  it('delegates to the injected rasterizer', async () => {
    const image = {
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      thumb: new Blob(['y'], { type: 'image/jpeg' }),
      width: 1600,
      height: 1200,
      bytes: 1,
    }
    const rasterize = vi.fn<Rasterizer>().mockResolvedValue(image)
    const result = await resizePhoto(new Blob(['z']), rasterize)
    expect(result).toEqual(image)
    expect(rasterize).toHaveBeenCalledOnce()
  })
})
