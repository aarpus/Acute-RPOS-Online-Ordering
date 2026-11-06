export type TaxRounding = 'No Rounding' | 'Round Up' | 'Round Down';

/** Calculates the illustrative $10 item in the static tax-rule editor. */
export function calculateTaxPreview(rate: number, rounding: TaxRounding, active = true) {
  const priceCents = 1000;
  const validRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0;
  const rawTaxCents = active ? priceCents * validRate / 100 : 0;
  const taxCents = Math.max(0, rounding === 'Round Up' ? Math.ceil(rawTaxCents - 1e-9) : rounding === 'Round Down' ? Math.floor(rawTaxCents + 1e-9) : Math.round(rawTaxCents));
  return { price: priceCents / 100, tax: taxCents / 100, total: (priceCents + taxCents) / 100 };
}
