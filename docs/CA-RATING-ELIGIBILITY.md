# California carrier quote review

The agency review screen displays **Carrier quote required** for all six filings. Registry `ca-program-review-2026-11-27.4` records the public filing status alongside the evidence available to the licensed agent. A transaction needs an authorized carrier quote before the agency records a quoted premium. Delivering evidence of insurance requires the corresponding carrier confirmation.

| California filing | Program | SERFF tracking number | Status checked November 27, 2026 | Next dependency |
|---|---|---|---|---|
| 24-1139 | Integon Preferred Value auto | `GMMX-134127116` | Closed - Approved May 29, 2025. The disposition lists July 15, 2025 for both terms. The carrier subsequently gave August 1. | Confirm how the carrier implemented the manual, symbols and dates and compare coverage premiums. |
| 26-1481 | Integon National Summit auto | `GMMX-135019770` | Pending with Waiver. Requested October 20, 2026. | Subsequent disposition and applicable manual. |
| 26-1598 | Mercury auto | `MERY-135039801` | Pending with Waiver. Requested July 1, 2027. | Subsequent disposition and applicable manual. |
| 26-1599 | California Automobile Insurance Company auto | `MERY-135039802` | Pending with Waiver. Requested July 1, 2027. | Subsequent disposition and applicable manual. |
| 26-486 | Coast National Basic auto | `BRWS-134878085` | Pending with Waiver. Requested June 30, 2026. | Subsequent disposition and complete Basic manual. |
| 25-2014 | California Automobile Insurance Company homeowners | `MERY-134655346` | Closed - Approved June 2, 2026. Both effective dates are October 15, 2026. | Separate homeowners manual and carrier comparison. |

The operator searched each exact tracking number through the register's ordinary public interface. The list above records the status of the specified filing at the time of the search. Each individual policy still requires a carrier quote. [California SERFF Filing Access](https://serff-sfa.naic.org/serff/sfa/home/CA)

## Integon Value source pages

All references use physical PDF pages in the 1,612-page filing `GMMX-134127116`. Page 72 lists `2025_05_CA IP Exhibit 12_Rate Manual_.pdf` and predecessor `GMMX-133321311`. The manual follows on pages **73–83**, labeled CDI-00016569 through CDI-00016579. The filing SHA-256 is `b246df7adc0322573d2f161e647b24dc44d70a6530c0241bc27838f29a273df9`.

| Filing pages | Contents | Use in the pilot |
| --- | --- | --- |
| 73–74 | Base rates, Value Option bases, policy terms, coverage-specific discounts, limits, deductibles and optional coverages | Page 73 gives 19.12 for Value Option towing. Page 74 gives 10.64 in the towing table. The agency-only synthetic exercise uses the page 74 base and its corresponding limit factor. The carrier must identify the applicable table before rating a policy. |
| 75–76 | Vehicle symbols, stated values, model years and driving-record factors | A vehicle needs a confirmed symbol or supported classification. Page 54 cites the associated minimum-limit and annual-symbol revisions. |
| 77–81 | Driver-class relativities, experience, mileage, frequency and severity factors | The factor tables require the matching coverage column and the applicable driver and vehicle classifications. |
| 82–83 | Coverage-specific calculation order, discounts and whole-dollar rounding down | Read each coverage's A–H or A–D sequence from the rendered tables. Some discount rows visible on the page disappear from text extraction. |

Page 6 gives July 15, 2025 for new and renewal business. The carrier's June 5 note on page 68 gives August 1, 2025. The rules manual beginning on page 708 carries a June 2022 revision. The premium reconciliation is on page 1500. Review these dates, predecessor rules and any later amendments with the licensed carrier before using the factors for a transaction.

The register lists the May 28 replacement attachment `2025_05_CA IP Exhibit 12_Rate Manual_.pdf`, SHA-256 `43904320fafdd8998130f1e5478ae33b5c727b5138dc50ffb94dd0e7c01b3785`. Its 11 pages match the text on physical pages 73–83 of the CDI copy after removing whitespace and the added public-records stamps. The exhibit extracted from that CDI copy also matches the original 11 pages in text, geometry, and rendered pixels.

### Related records in the California register

| Record | Public observation on November 27 | Use in the pilot |
| --- | --- | --- |
| Value symbols, `24-2128`, `GMMX-134286985` | Auto Class Plan approved April 22, 2025. The five selected SymbolSet5 PDFs contain 504, 1,124, 752, 905 and 662 pages in model-year order. The disposition leaves the effective-date fields blank and specifies the same implementation date for new business and renewals. | An exact masked vehicle key and model year can identify a filed symbol reference. A carrier must still confirm its applicability to the quote. |
| Value minimum limits, `23-1661`, `GMMX-133699991` | Rule approved June 24, 2024. Its disposition records January 1, 2025 for both terms. The current attachment in this filing is the 11-page `2025_01_01_CA IP Exhibit 12_Rate Manual_Final_v3.pdf`, SHA-256 `de053b2375029582a36ef1a8a9dd90f99138fc99e03a7c1c67490be7919ef1fc`. | Reconcile these amendments with the later Value rate manual before applying them to a policy. |
| Listed predecessor, `GMMX-133321311` | SERFF identifies the filing as a **Cornerstone** rate/rule filing, approved September 20, 2023. | Establish precisely which rules Value incorporates with the carrier. |
| Value forms, `25-193`, `GMMX-134404390` | Form approval dated May 12, 2026. | Review the policy-form change separately from the rate tables. |
| Integon class plan, `25-1742`, `GMMX-134642447` | Filed August 18, 2025. The September 3, 2026 disposition records the company's withdrawal. Its proposed rate manual and five SS10 vehicle sheets appear as replacements in the attachment schedule. | Exclude the SS10 sheets and the proposed rates. The agency lookup accepts only the five approved SS5 file hashes. |
| Cornerstone/Value conversion, `GMMX-135164367` | Rate/Rule/Form submitted November 20, 2026. The November 23 state status was **Intake** and the disposition was blank. Its attachment list includes a proposed November 2026 rate manual. | Excluded from the pilot calculation. Check for a subsequent disposition before considering its rates. |

The November 27 search for NAIC company 31488 and product names containing "Value" returned 16 records. A second search by company number alone, with submission dates January 1, 2025 through November 27, 2026, returned four records across all product names. Its sole auto class plan was the withdrawn SS10 filing. The only approved record in those four was the Value form change. [California public filing register](https://serff-sfa.naic.org/serff/sfa/home/CA) · [CDI monthly approval lists](https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0100-rate-filing-lists/rate-filing-approvals/)

Two supporting attachments in the withdrawn filing document what the carrier submitted on August 18, 2025. The three-page `Current_IP_Value_UW Guidelines_.pdf` (SHA-256 `fa8ec47ddef36133f4f044c80c4b990b7f242e6e4ab7ddc76d6a83ed1d8a16a2`) carries a June 2022 revision. All three pages match the text on physical pages 725-727 of the CDI Value filing after removal of the public-record stamps and whitespace. The 11-page attachment labeled “Current Manual” and dated February 15, 2025 (SHA-256 `65dc2f89fb8f2ce835c24a8b0324c49c4cbfd4797565d6286522e4760868a091`) differs from the approved May replacement attachment on pages 1, 3 and 4. Neither attachment resolves which version the carrier uses for an individual quote. [Class-plan disposition and attachment list](https://serff-sfa.naic.org/serff/sfa/search/filingSummary.xhtml?filingId=134642447)

### Using a filed vehicle-symbol sheet

In the licensed agency owner's opportunity desk, open the Integon vehicle-symbol reference, select the appropriate local SS5 PDF, and enter the **published ten-character mask** and model year. A matching file must have the exact approved SHA-256 and page count. The lookup reads the PDF on the device. A unique match identifies the file, page, make, model and SymbolSet5. Missing and conflicting matches go to carrier review.

The app's PDF reader and an independent PDFium check each counted 201,181 filed rows across 3,947 pages. The lookup also returned the last printed vehicle on the last page of each of the five files. Their model years span 1981-2025. The latest sheet contains 33,756 rows. Its first page gives SymbolSet5 `721011` for the public 2024 Ford F-150 mask `1FTFW2K5*R`. The observed 2026 and 2027 model-year row count was zero. Three historical rows contain a literal ampersand in the mask. The local lookup reproduced the published 2000 Ford F-250 Super symbol `C41618` for `3FT&X21L*Y`. The carrier still needs to supply its applicable newer vehicle data for a new-car pilot.

## Calculator status

The eligibility check accepts new and renewal dates, identifies missing vehicle symbols and routes unresolved risk flags to the licensed agent. In the designated agency owner's opportunity screen, the synthetic page 74 diagnostic calculates the exact unrounded product of the displayed base and one of three displayed limit factors. It returns its source cells and uses no customer record for the calculation. Completing the rater requires confirmation of the applicable rule and symbol versions, deductible and discount eligibility, fees and minimums, plus authorized comparison quotes by coverage and total.
