export function EmptyState() {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <svg className="empty__seal" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle
          cx="48"
          cy="48"
          r="43"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="7 6"
        />
        <circle cx="48" cy="48" r="32" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        <path d="M48 34v28M34 48h28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <h1 id="empty-title" className="empty__title">
        No vendors yet
      </h1>
      <p className="empty__body">
        Capture the first company you meet. A name and a photo is enough to start — you can fill in
        the rest later.
      </p>
      <div className="empty__actions">
        <a className="btn btn--primary" href="#/vendors/new">
          Add vendor
        </a>
      </div>
      <p className="empty__note">Works offline. Everything stays on this device.</p>
    </section>
  )
}
