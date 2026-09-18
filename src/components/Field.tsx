import type { ReactNode } from 'react'
import type { Rating } from '../db/models'
import { LIMITS } from '../lib/validate'

interface FieldBaseProps {
  id: string
  label: string
  hint?: string
  error?: string
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: FieldBaseProps & { children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface TextFieldProps extends FieldBaseProps {
  value: string
  onChange: (value: string) => void
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'url' | 'tel'
  placeholder?: string
  autoComplete?: string
  list?: string
  mono?: boolean
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  inputMode,
  placeholder,
  autoComplete,
  list,
  mono,
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={mono ? 'mono' : undefined}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        list={list}
        maxLength={LIMITS.maxStringLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  )
}

interface TextAreaFieldProps extends FieldBaseProps {
  value: string
  onChange: (value: string) => void
  rows?: number
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  rows,
}: TextAreaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={rows ?? 3}
        value={value}
        maxLength={LIMITS.maxStringLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  )
}

interface SelectFieldProps<T extends string> extends FieldBaseProps {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  error,
}: SelectFieldProps<T>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function RatingField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: Rating
  onChange: (value: Rating) => void
}) {
  return (
    <fieldset className="field field--rating">
      <legend>{label}</legend>
      <div className="rating">
        {([1, 2, 3, 4, 5] as const).map((score) => (
          <label key={score} className="rating__option">
            <input
              type="radio"
              name={id}
              value={score}
              checked={value === score}
              aria-label={`${label}: ${score} of 5`}
              onChange={() => onChange(score)}
            />
            <span className="mono">{score}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
