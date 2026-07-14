// Pure function: computes cases-broken and loose-bottle deltas from a
// batch of assortment sales, using loose-first drawdown per product.
// Does not mutate any input.
//
// The math per flavor within one sale:
//   bottles_needed = item.bottles * sale.qty
//   available_loose = runningLoose[item.product_id] || 0
//   if available_loose >= bottles_needed:
//     draw entirely from loose; new_loose = available_loose - bottles_needed
//     cases_broken = 0
//   else:
//     shortfall = bottles_needed - available_loose
//     cases_broken = Math.ceil(shortfall / case_size)
//     bottles_from_cases = cases_broken * case_size
//     new_loose = bottles_from_cases - shortfall
//
// runningLoose is threaded across sales in the given order.

export function applyAssortedSales({ sales, assortments, products, initialLoose }) {
  const assortmentIndex = new Map(assortments.map(a => [a.assortment_id, a]))
  const productIndex = new Map(products.map(p => [p.product_id, p]))

  const runningLoose = { ...initialLoose }
  const casesBroken = {}
  const breakdown = []
  const touchedProducts = new Set()

  sales.forEach(sale => {
    if (!sale.qty || sale.qty <= 0) return

    const assortment = assortmentIndex.get(sale.assortment_id)
    if (!assortment) {
      throw new Error(`Unknown assortment_id: ${sale.assortment_id}`)
    }

    const effects = assortment.items.map(item => {
      const product = productIndex.get(item.product_id)
      if (!product) {
        throw new Error(`Assortment ${sale.assortment_id} references unknown product_id: ${item.product_id}`)
      }

      const bottlesNeeded = item.bottles * sale.qty
      const availableLoose = runningLoose[item.product_id] || 0
      let fromLoose
      let fromCasesBroken
      let casesForItem
      let newLoose

      if (availableLoose >= bottlesNeeded) {
        fromLoose = bottlesNeeded
        fromCasesBroken = 0
        casesForItem = 0
        newLoose = availableLoose - bottlesNeeded
      } else {
        fromLoose = availableLoose
        const shortfall = bottlesNeeded - availableLoose
        casesForItem = Math.ceil(shortfall / product.case_size)
        const bottlesFromCases = casesForItem * product.case_size
        fromCasesBroken = shortfall
        newLoose = bottlesFromCases - shortfall
      }

      runningLoose[item.product_id] = newLoose
      touchedProducts.add(item.product_id)
      if (casesForItem > 0) {
        casesBroken[item.product_id] = (casesBroken[item.product_id] || 0) + casesForItem
      }

      return {
        product_id: item.product_id,
        bottles_needed: bottlesNeeded,
        from_loose: fromLoose,
        from_cases_broken: fromCasesBroken,
        cases_broken: casesForItem,
      }
    })

    breakdown.push({
      assortment_id: sale.assortment_id,
      qty: sale.qty,
      effects,
    })
  })

  const looseChanges = {}
  touchedProducts.forEach(product_id => {
    const delta = runningLoose[product_id] - (initialLoose[product_id] || 0)
    looseChanges[product_id] = delta
  })

  return { casesBroken, looseChanges, breakdown }
}
