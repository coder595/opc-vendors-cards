import { TextField } from '../../components/Field'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { newKey, type ProductDraft } from './formState'
import { useVendorForm } from './VendorFormContext'

function ProductRow({ product }: { product: ProductDraft }) {
  const { draft, dispatch, errors, removePhoto } = useVendorForm()
  const id = `product-${product.key}`
  const update = (patch: Partial<ProductDraft>) =>
    dispatch({ type: 'updateProduct', key: product.key, patch })
  const photos = draft.photos.filter((photo) => product.photoKeys.includes(photo.key))

  return (
    <fieldset className="subform">
      <legend>Product</legend>
      <TextField
        id={`${id}-name`}
        label="Product name"
        value={product.name}
        onChange={(name) => update({ name })}
        error={errors[`products.${product.key}.name`]}
      />
      <TextField
        id={`${id}-unit`}
        label="Unit"
        value={product.unit}
        onChange={(unit) => update({ unit })}
      />
      <TextField
        id={`${id}-currency`}
        label="Currency"
        hint="Three-letter code, for example CNY"
        mono
        value={product.currency}
        onChange={(currency) => update({ currency: currency.toUpperCase() })}
        error={errors[`products.${product.key}.currency`]}
      />
      <TextField
        id={`${id}-price`}
        label="Price"
        inputMode="decimal"
        mono
        value={product.price}
        onChange={(price) => update({ price })}
        error={errors[`products.${product.key}.price`]}
      />
      <TextField
        id={`${id}-moq`}
        label="MOQ"
        inputMode="numeric"
        mono
        value={product.moq}
        onChange={(moq) => update({ moq })}
        error={errors[`products.${product.key}.moq`]}
      />
      <TextField
        id={`${id}-lead`}
        label="Lead time in days"
        inputMode="numeric"
        mono
        value={product.leadTimeDays}
        onChange={(leadTimeDays) => update({ leadTimeDays })}
        error={errors[`products.${product.key}.leadTimeDays`]}
      />
      <TextField
        id={`${id}-terms`}
        label="Payment terms"
        value={product.paymentTerms}
        onChange={(paymentTerms) => update({ paymentTerms })}
      />
      <div className="photo-row">
        <PhotoPicker
          id={`${id}-photo`}
          label="Product photo"
          kind="product"
          multiple
          onAdd={(photo) => dispatch({ type: 'addPhoto', photo, productKey: product.key })}
        />
        {photos.map((photo) => (
          <PhotoThumb key={photo.key} photo={photo} onRemove={() => removePhoto(photo)} />
        ))}
      </div>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => dispatch({ type: 'removeProduct', key: product.key })}
      >
        Remove product
      </button>
    </fieldset>
  )
}

export function ProductFields() {
  const { draft, dispatch } = useVendorForm()

  const addProduct = () => {
    const key = newKey()
    dispatch({ type: 'addProduct', key })
    window.setTimeout(() => document.getElementById(`product-${key}-name`)?.focus(), 0)
  }

  return (
    <section className="form-section" aria-labelledby="products-heading">
      <h2 id="products-heading">Products</h2>
      {draft.products.map((product) => (
        <ProductRow key={product.key} product={product} />
      ))}
      <button type="button" className="btn btn--ghost" onClick={addProduct}>
        Add product
      </button>
    </section>
  )
}
