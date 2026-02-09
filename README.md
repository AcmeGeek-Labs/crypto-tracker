# Crypto Tracker 📈

A cryptocurrency price tracker and analysis webapp built with pure HTML, CSS, and JavaScript.

## Features

- **Search coins** by name or symbol
- **Price details**: current price, 24h change, market cap, volume, high/low
- **Interactive charts** with 7D/30D/90D/1Y timeframes (TradingView Lightweight Charts)
- **Watchlist** saved to localStorage
- **Top movers**: Daily gainers and losers

## Live Demo

Visit: https://acmegeek-labs.github.io/crypto-tracker/

## Tech Stack

- Pure HTML/CSS/JavaScript (no build step)
- [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) for TradingView-style charts
- [CoinGecko API](https://www.coingecko.com/en/api) for data (free, no key required)

## Project Structure

```
├── index.html      # Main HTML structure
├── style.css       # Dark theme styling
├── data.js         # CoinGecko API integration (Chilon)
├── app.js          # UI logic and interactions (Solon)
└── README.md
```

## Development

Just open `index.html` in a browser. No build step needed.

```bash
# Or use a local server to avoid CORS issues
python -m http.server 8000
# Then visit http://localhost:8000
```

## API Rate Limits

CoinGecko free tier allows ~50 calls/minute. The app includes a simple cache to reduce API calls:
- Search results: 5 min cache
- Coin data: 1 min cache
- Price history: 1-10 min cache (longer for longer timeframes)
- Market data: 2 min cache

## Built By

[Seven Sages](https://github.com/AcmeGeek-Labs/seven-sages) 🦉⚖️

| Contributor | Role |
|-------------|------|
| Solon ⚖️ | UI layer, app logic, styling |
| Chilon 🦉 | Data layer, API integration |

---

*"Know thyself."* — Chilon  
*"Nothing in excess."* — Solon
