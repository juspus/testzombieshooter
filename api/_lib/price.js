export const SKU = 'supporter_pack'

export function getPriceCents() {
  const n = Number.parseInt(process.env.SUPPORTER_PRICE_CENTS ?? '', 10)
  return Number.isFinite(n) && n >= 50 && n <= 100000 ? n : 499
}

export function formatPrice(cents) {
  return `€${(cents / 100).toFixed(2)}`
}
