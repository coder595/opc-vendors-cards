import type { PipelineStatus, Rating } from '../db/models'
import { STATUS_ABBR, STATUS_LABEL, STATUS_TONE } from '../db/labels'

interface StatusSealProps {
  status: PipelineStatus
  rating?: Rating
  size?: 'sm' | 'md' | 'lg'
  /** Decorative when adjacent text already states the status (list rows). */
  decorative?: boolean
  animate?: boolean
}

export function StatusSeal({
  status,
  rating,
  size = 'md',
  decorative = false,
  animate = false,
}: StatusSealProps) {
  const label = `Status: ${STATUS_LABEL[status]}${rating ? `. Rating ${rating} of 5.` : '.'}`
  return (
    <svg
      className={`seal seal--${size}${animate ? ' seal--animate' : ''}`}
      data-tone={STATUS_TONE[status]}
      viewBox="0 0 96 96"
      fill="none"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <circle
        cx="48"
        cy="48"
        r="44"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="6 5"
      />
      <circle cx="48" cy="48" r="34" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <text
        x="48"
        y={rating ? 45 : 52}
        textAnchor="middle"
        className="seal__status"
        fill="currentColor"
      >
        {STATUS_ABBR[status]}
      </text>
      {rating ? (
        <text x="48" y="64" textAnchor="middle" className="seal__rating" fill="currentColor">
          {'★'.repeat(rating)}
        </text>
      ) : null}
    </svg>
  )
}
