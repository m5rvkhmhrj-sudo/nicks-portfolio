# Nick's Portfolio

Phone-first portfolio tracker mockup for Nick. Dark UI, purple accent, Robinhood-style chart, Cal AI-style cards and bottom bar.

## Files
- `index.html`, `styles.css`, `app.js` - the working app (open index.html, or serve the folder)
- `data.js` - generated price history (weekly since purchase, daily last year) and holdings
- `data/fetch.py` - pulls history from Yahoo Finance via yfinance; `data/prices.json` is the raw output
- `canva-import.html` - static export of all 5 screens, one `data-document-role="page"` per screen, for Canva import
- `reference/` - Canva mockup pages, style screenshots Bill picked, app screenshots

## Holdings (from the Canva mockup)
| Company | Bought | Ticker used |
|---|---|---|
| Nvidia | Apr 2020 | NVDA |
| SpaceX | May 2023 | SPCX (IPO June 2026; May 2023 to June 2026 estimated from published tender valuations divided by post-IPO share count) |
| S&P 500 | Apr 2018 | ^GSPC index level |
| Apple | Jul 2023 | AAPL |

Each holding assumes $1,000 invested at purchase. Change `invested` in `data.js` to use real amounts.

## Score
Each stock scores 0 to 100. 50 means flat.
- recent = 50 + 50 * tanh(6-month return / 0.20)
- since = 50 + 50 * tanh(yearly return since purchase / 0.35)
- stock score = (since + 2 * recent) / 3   (past 6 months counts twice)
- portfolio score = average of stock scores

## Deep links
`index.html?screen=stock&sym=NVDA&range=1Y` and `&fit=1` for a bare 390x844 frame (screenshots).

## Refresh data
```
python3 data/fetch.py   # then regenerate data.js with the build snippet in data/build.py
```
