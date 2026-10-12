import { useEffect, useState } from 'react'

/** Renders a stored image blob without object URLs (payload-safe under StrictMode). */
export function BlobImage({ blob, alt, size = 72 }: { blob: Blob; alt: string; size?: number }) {
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    let active = true
    const reader = new FileReader()
    reader.onload = () => {
      if (active && typeof reader.result === 'string') setSrc(reader.result)
    }
    reader.onerror = () => {
      if (active) setSrc(undefined)
    }
    reader.readAsDataURL(blob)
    return () => {
      active = false
      if (reader.readyState === FileReader.LOADING) reader.abort()
    }
  }, [blob])

  if (!src) return null
  return <img className="blob-image" src={src} alt={alt} width={size} height={size} loading="lazy" />
}
