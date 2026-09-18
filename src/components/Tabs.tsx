import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
  label: string
  children: ReactNode
}

export function Tabs({ items, active, onChange, label, children }: TabsProps) {
  const baseId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    const item = items[next]
    if (item) {
      onChange(item.id)
      refs.current[next]?.focus()
    }
  }

  const activeItem = items.find((item) => item.id === active) ?? items[0]

  return (
    <>
      <div className="tabs" role="tablist" aria-label={label}>
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={active === item.id}
            tabIndex={active === item.id ? 0 : -1}
            className="tab"
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="tabpanel"
        role="tabpanel"
        aria-labelledby={activeItem ? `${baseId}-tab-${activeItem.id}` : undefined}
      >
        {children}
      </div>
    </>
  )
}
