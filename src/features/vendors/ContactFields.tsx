import { TextField } from '../../components/Field'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { newKey } from '../../lib/app'
import type { ContactDraft, PhotoDraft } from './formState'
import { useVendorForm } from './VendorFormContext'

function ContactRow({ contact }: { contact: ContactDraft }) {
  const { draft, dispatch, errors, removePhoto } = useVendorForm()
  const id = `contact-${contact.key}`
  const update = (patch: Partial<ContactDraft>) =>
    dispatch({ type: 'updateContact', key: contact.key, patch })
  const card = draft.photos.find((photo) => photo.key === contact.cardPhotoKey)

  const addCard = (photo: PhotoDraft) => {
    if (card) URL.revokeObjectURL(card.previewUrl)
    dispatch({ type: 'addPhoto', photo, contactKey: contact.key })
  }

  return (
    <fieldset className="subform">
      <legend>Person</legend>
      <TextField
        id={`${id}-name`}
        label="Person name"
        autoComplete="name"
        value={contact.name}
        onChange={(name) => update({ name })}
        error={errors[`contacts.${contact.key}.name`]}
      />
      <TextField
        id={`${id}-position`}
        label="Position"
        autoComplete="organization-title"
        value={contact.position}
        onChange={(position) => update({ position })}
      />
      <TextField
        id={`${id}-phone`}
        label="Phone"
        inputMode="tel"
        autoComplete="tel"
        mono
        value={contact.phone}
        onChange={(phone) => update({ phone })}
      />
      <TextField
        id={`${id}-email`}
        label="Email"
        inputMode="email"
        autoComplete="email"
        mono
        value={contact.email}
        onChange={(email) => update({ email })}
      />
      <TextField
        id={`${id}-wechat`}
        label="WeChat"
        mono
        value={contact.wechat}
        onChange={(wechat) => update({ wechat })}
      />
      <TextField
        id={`${id}-whatsapp`}
        label="WhatsApp"
        inputMode="tel"
        mono
        value={contact.whatsapp}
        onChange={(whatsapp) => update({ whatsapp })}
      />
      <div className="photo-row">
        <PhotoPicker
          id={`${id}-card`}
          label="Business card photo"
          kind="business_card"
          onAdd={addCard}
        />
        {card ? (
          <PhotoThumb
            photo={card}
            label="Remove business card photo"
            onRemove={() => removePhoto(card)}
          />
        ) : null}
      </div>
      <div className="subform__actions">
        <label className="checkbox">
          <input
            type="radio"
            name="primary-contact"
            checked={contact.isPrimary}
            aria-label={`Primary contact${contact.name.trim() ? `: ${contact.name.trim()}` : ''}`}
            onChange={() => dispatch({ type: 'setPrimaryContact', key: contact.key })}
          />
          Primary contact
        </label>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => dispatch({ type: 'removeContact', key: contact.key })}
        >
          Remove person
        </button>
      </div>
    </fieldset>
  )
}

export function ContactFields() {
  const { draft, dispatch } = useVendorForm()

  const addContact = () => {
    const key = newKey()
    dispatch({ type: 'addContact', key })
    window.setTimeout(() => document.getElementById(`contact-${key}-name`)?.focus(), 0)
  }

  return (
    <section className="form-section" aria-labelledby="people-heading">
      <h2 id="people-heading">People</h2>
      {draft.contacts.map((contact) => (
        <ContactRow key={contact.key} contact={contact} />
      ))}
      <button type="button" className="btn btn--ghost" onClick={addContact}>
        Add person
      </button>
    </section>
  )
}
