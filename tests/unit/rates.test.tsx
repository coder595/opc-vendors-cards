import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings, updateSettings } from '../../src/data/settings'
import { RatesScreen } from '../../src/features/rates/RatesScreen'
import { crossRate } from '../../src/lib/currency'
import { resetDb } from './helpers/db'

describe('crossRate', () => {
  it('converts between two non-base currencies through the base', () => {
    const settings = { baseCurrency: 'USD', rates: { OMR: 0.3845, CNY: 6.6908 } }
    expect(crossRate(settings, 'OMR', 'CNY')).toBeCloseTo(17.4013, 4)
    expect(crossRate(settings, 'CNY', 'USD')).toBeCloseTo(1 / 6.6908)
    expect(crossRate(settings, 'OMR', 'EUR')).toBeNull()
  })
})

describe('RatesScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    return resetDb()
  })
  afterEach(resetDb)

  it('saves a base currency and a rate', async () => {
    const user = userEvent.setup()
    render(<RatesScreen />)
    await screen.findByRole('heading', { name: /exchange rates/i })

    await user.click(screen.getByRole('button', { name: /add rate/i }))
    await user.type(screen.getByLabelText('Currency 1'), 'CNY')
    await user.type(screen.getByLabelText(/units per 1/i), '7.2')
    await user.click(screen.getByRole('button', { name: /save rates/i }))

    await waitFor(async () => {
      const settings = await getSettings()
      expect(settings.baseCurrency).toBe('USD')
      expect(settings.rates).toEqual({ CNY: 7.2 })
    })
  })

  it('rejects a zero rate without saving', async () => {
    const user = userEvent.setup()
    render(<RatesScreen />)
    await screen.findByRole('heading', { name: /exchange rates/i })

    await user.click(screen.getByRole('button', { name: /add rate/i }))
    await user.type(screen.getByLabelText('Currency 1'), 'CNY')
    await user.type(screen.getByLabelText(/units per 1/i), '0')
    await user.click(screen.getByRole('button', { name: /save rates/i }))

    expect(await screen.findByText(/positive number/i)).toBeInTheDocument()
    expect((await getSettings()).rates).toEqual({})
  })

  it('converts OMR to CNY by default, swaps, and remembers the pair', async () => {
    await updateSettings({ baseCurrency: 'OMR', rates: { CNY: 17.4 } })
    const user = userEvent.setup()
    const { unmount } = render(<RatesScreen />)

    const amount = await screen.findByLabelText('Amount in OMR')
    await user.clear(amount)
    await user.type(amount, '100')
    expect(screen.getByTestId('convert-result')).toHaveTextContent('1,740.00')

    await user.click(screen.getByRole('button', { name: /swap/i }))
    expect(screen.getByLabelText('Amount in CNY')).toBeInTheDocument()
    expect(screen.getByTestId('convert-result')).toHaveTextContent('5.747') // 100 / 17.4, 3 decimals
    unmount()

    render(<RatesScreen />)
    expect(await screen.findByLabelText('Amount in CNY')).toBeInTheDocument()
  })

  it('says which rate is missing instead of inventing a number', async () => {
    render(<RatesScreen />)
    expect(await screen.findByText(/No rate for OMR and CNY yet/)).toBeInTheDocument()
  })
})
