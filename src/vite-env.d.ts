/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface BarcodeDetectorOptions {
  formats: string[]
}

interface DetectedBarcode {
  rawValue: string
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions)
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>
}
