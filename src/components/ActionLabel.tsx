interface ActionLabelProps<K extends string> {
  /** Every label the button can show, e.g. { idle: 'Save rates', busy: 'Saving…', done: 'Saved ✓' }. */
  labels: Record<K, string>
  show: K
}

/**
 * Button text that switches between states without the button changing width: all labels
 * sit stacked in one grid cell and only `show` is visible, so the widest one sets the size.
 * Hidden labels are `visibility: hidden` and `aria-hidden`, so the accessible name is
 * only the shown one (also in jsdom, which loads no CSS).
 */
export function ActionLabel<K extends string>({ labels, show }: ActionLabelProps<K>) {
  return (
    <span className="action-label">
      {(Object.keys(labels) as K[]).map((key) => (
        <span
          key={key}
          className="action-label__text"
          data-shown={key === show || undefined}
          aria-hidden={key === show ? undefined : true}
        >
          {labels[key]}
        </span>
      ))}
    </span>
  )
}
