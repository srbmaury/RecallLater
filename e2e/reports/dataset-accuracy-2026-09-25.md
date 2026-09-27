# Dataset parsing accuracy — 2026-09-25

## Scope and method

Ran the app's on-device OCR against every image and PDF in:

- `~/Downloads/RecallLater_100_realistic`: 100 images and 20 PDFs (120 files)
- `~/Downloads/RecallLater_realistic_dataset`: 16 images and 10 PDFs (26 files)

The folders contain **146 files total**. All 146 produced nonempty OCR text or barcode data. Parser results were scored against each dataset's manifest. A sample counts as fully accurate when its type and every manifest-scored field match. Field accuracy counts individual expected fields. AI-only and rules+AI numbers use existing cached AI outputs; no new model requests were made. The 100-set test split was held out from parser tuning.

## Overall

| Mode | Type | Manifest fields | Fully accurate samples |
| --- | ---: | ---: | ---: |
| Rules only | 135/146 (92.5%) | 277/331 (83.7%) | **97/146 (66.4%)** |
| Cached AI only | 143/146 (97.9%) | 306/331 (92.4%) | **120/146 (82.2%)** |
| Rules + cached AI | 146/146 (100%) | 318/331 (96.1%) | **133/146 (91.1%)** |

## Fully accurate by file type

| Mode | Images | PDFs | Total |
| --- | ---: | ---: | ---: |
| Rules only | 75/116 (64.7%) | 22/30 (73.3%) | 97/146 (66.4%) |
| Cached AI only | 93/116 (80.2%) | 27/30 (90.0%) | 120/146 (82.2%) |
| Rules + cached AI | 103/116 (88.8%) | 30/30 (100%) | 133/146 (91.1%) |

## Split breakdown

| Dataset split | Files | Rules type | Rules fields | Rules exact | Hybrid type | Hybrid fields | Hybrid exact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Realistic dataset | 26 | 21/26 | 54/74 | 11/26 | 26/26 | 74/74 | 26/26 |
| 100-realistic train | 87 | 83/87 | 185/194 | 74/87 | 87/87 | 193/194 | 86/87 |
| 100-realistic validation | 15 | 15/15 | 18/24 | 9/15 | 15/15 | 18/24 | 9/15 |
| 100-realistic test (held out) | 18 | 16/18 | 20/39 | 3/18 | 18/18 | 33/39 | 12/18 |

The held-out figures are reported for transparency and did not guide rule changes. The hybrid reaches the 9/10 target overall and on training data. The remaining misses include expected streaming platforms absent from OCR/barcode data and one OCR-confused coupon code; the parser avoids inventing unsupported values.
