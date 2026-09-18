import type { ProcessedImage } from '../db/models'

export const MAX_EDGE = 1600
export const THUMB_EDGE = 256
export const JPEG_QUALITY = 0.75

export interface Dimensions {
  width: number
  height: number
}

/** Scales a box down so its longest edge is at most `maxEdge`; never upscales. */
export function fitDimensions(width: number, height: number, maxEdge: number): Dimensions {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export type Rasterizer = (file: Blob) => Promise<ProcessedImage>

/**
 * Decodes an image (EXIF orientation applied) and produces a resized JPEG plus a
 * 256px thumbnail. The rasterizer is injectable so unit tests never touch canvas.
 */
export async function resizePhoto(
  file: Blob,
  rasterize: Rasterizer = defaultRasterizer,
): Promise<ProcessedImage> {
  return rasterize(file)
}

interface DecodedSource {
  image: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decode(file: Blob): Promise<DecodedSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      }
    } catch {
      // Fall through to the <img> path (older Safari, odd formats).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

async function rasterizeToJpeg(source: DecodedSource, size: Dimensions): Promise<Blob> {
  const canvas = createCanvas(size.width, size.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.drawImage(source.image, 0, 0, size.width, size.height)
  return canvasToJpeg(canvas)
}

async function defaultRasterizer(file: Blob): Promise<ProcessedImage> {
  const source = await decode(file)
  try {
    const full = fitDimensions(source.width, source.height, MAX_EDGE)
    const thumb = fitDimensions(source.width, source.height, THUMB_EDGE)
    const blob = await rasterizeToJpeg(source, full)
    const thumbBlob = await rasterizeToJpeg(source, thumb)
    return {
      blob,
      thumb: thumbBlob,
      width: full.width,
      height: full.height,
      bytes: blob.size,
    }
  } finally {
    source.close()
  }
}
