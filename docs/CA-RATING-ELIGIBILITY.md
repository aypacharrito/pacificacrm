# California carrier quote review

The agency review screen displays **Carrier quote required** for all six filings. Registry `ca-program-review-2026-11-27.2` records the evidence available to the licensed agent. A transaction needs an authorized carrier quote before the agency records a quoted premium. Delivering evidence of insurance requires the corresponding carrier confirmation.

| California filing | Program | Disposition printed in the downloaded copy | Pilot action |
|---|---|---|---|
| 24-1139 | Integon Preferred Value auto | Approved May 29, 2025. The disposition lists July 15, 2025 for new business and renewal. A subsequent carrier note specifies August 1, 2025. | Reconcile the governing date, manual and vehicle symbols with the carrier. |
| 26-1481 | Integon National Summit auto | Pending with waiver. Requested October 20, 2026. | Obtain subsequent disposition and the applicable manual. |
| 26-1598 | Mercury auto | Pending with waiver. Requested July 1, 2027. | Obtain subsequent disposition and the applicable manual. |
| 26-1599 | California Automobile Insurance Company auto | Pending with waiver. Requested July 1, 2027. | Obtain subsequent disposition and the applicable manual. |
| 26-486 | Coast National Basic auto | Pending with waiver. Requested June 30, 2026. | Obtain subsequent disposition and the complete Basic manual. |
| 25-2014 | California Automobile Insurance Company homeowners | Approved June 2, 2026. Both effective dates are October 15, 2026. | Review separately as a homeowners change filing. |

## Integon Value source pages

All references use physical PDF pages in the 1,612-page filing `GMMX-134127116`. Page 72 lists `2025_05_CA IP Exhibit 12_Rate Manual_.pdf` and predecessor `GMMX-133321311`. The manual follows on pages **73–83**, labeled CDI-00016569 through CDI-00016579. The filing SHA-256 is `b246df7adc0322573d2f161e647b24dc44d70a6530c0241bc27838f29a273df9`.

| Filing pages | Contents | Use in the pilot |
| --- | --- | --- |
| 73–74 | Base rates, Value Option bases, policy terms, coverage-specific discounts, limits, deductibles and optional coverages | Page 73 gives 19.12 for Value Option towing. Page 74 gives 10.64 in the towing table. The agency-only synthetic exercise uses the page 74 base and its corresponding limit factor. The carrier must identify the applicable table before rating a policy. |
| 75–76 | Vehicle symbols, stated values, model years and driving-record factors | A vehicle needs a confirmed symbol or supported classification. Page 54 cites the associated minimum-limit and annual-symbol revisions. |
| 77–81 | Driver-class relativities, experience, mileage, frequency and severity factors | The factor tables require the matching coverage column and the applicable driver and vehicle classifications. |
| 82–83 | Coverage-specific calculation order, discounts and whole-dollar rounding down | Read each coverage's A–H or A–D sequence from the rendered tables. Some discount rows visible on the page disappear from text extraction. |

Page 6 gives July 15, 2025 for new and renewal business. The carrier's June 5 note on page 68 gives August 1, 2025. The rules manual beginning on page 708 carries a June 2022 revision. The premium reconciliation is on page 1500. Review these dates, predecessor rules and any later amendments with the licensed carrier before using the factors for a transaction.

The regulator’s closed-filings workbook through October 31, 2026 lists CAIC homeowners 25-2014 at row 445. Row 1333 is a separate Integon Value **forms** approval, 25-193 (`GMMX-134404390`). The four filings printed as pending have no matching entries in that workbook. The workbook cutoff precedes the November 27 review. [California Department of Insurance, October 2026 closed filings](https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0100-rate-filing-lists/rate-filing-approvals/upload/Approval-Closed-List-YTD-10-31-26.xlsx)

## Calculator status

The eligibility check accepts new and renewal dates, identifies missing vehicle symbols and routes unresolved risk flags to the licensed agent. In the designated agency owner's opportunity screen, the synthetic page 74 diagnostic calculates the exact unrounded product of the displayed base and one of three displayed limit factors. It returns its source cells and uses no customer record for the calculation. Completing the rater requires confirmation of the applicable rule and symbol versions, deductible and discount eligibility, fees and minimums, plus authorized comparison quotes by coverage and total.
