/**
 * CoinGecko API Data Layer
 * 
 * This module handles all API calls to CoinGecko.
 * Chilon: Feel free to expand this with caching, rate limiting, etc.
 * 
 * API Docs: https://www.coingecko.com/en/api/documentation
 */

const API_BASE = 'https://api.coingecko.com/api/v3';

// Simple in-memory cache
const cache = {
    data: {},
    set(key, value, ttlMs = 60000) {
        this.data[key] = {
            value,
            expires: Date.now() + ttlMs
        };
    },
    get(key) {
        const item = this.data[key];
        if (!item) return null;
        if (Date.now() > item.expires) {
            delete this.data[key];
            return null;
        }
        return item.value;
    }
};

/**
 * Search for coins by query
 */
async function searchCoins(query) {
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Search failed');
    
    const data = await response.json();
    const results = data.coins.slice(0, 10).map(coin => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        thumb: coin.thumb,
        marketCapRank: coin.market_cap_rank
    }));
    
    cache.set(cacheKey, results, 300000); // 5 min cache
    return results;
}

/**
 * Get detailed coin data
 */
async function getCoinData(coinId) {
    const cacheKey = `coin:${coinId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(
        `${API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
    if (!response.ok) throw new Error('Failed to fetch coin data');
    
    const data = await response.json();
    const result = {
        id: data.id,
        name: data.name,
        symbol: data.symbol,
        image: data.image.large,
        currentPrice: data.market_data.current_price.usd,
        priceChange24h: data.market_data.price_change_percentage_24h,
        marketCap: data.market_data.market_cap.usd,
        volume24h: data.market_data.total_volume.usd,
        high24h: data.market_data.high_24h.usd,
        low24h: data.market_data.low_24h.usd,
        ath: data.market_data.ath.usd,
        athDate: data.market_data.ath_date.usd,
        circulatingSupply: data.market_data.circulating_supply,
        totalSupply: data.market_data.total_supply
    };
    
    cache.set(cacheKey, result, 60000); // 1 min cache
    return result;
}

/**
 * Get price history for charts
 */
async function getPriceHistory(coinId, days = 7) {
    const cacheKey = `history:${coinId}:${days}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(
        `${API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
    );
    if (!response.ok) throw new Error('Failed to fetch price history');
    
    const data = await response.json();
    const result = data.prices.map(([timestamp, price]) => ({
        time: Math.floor(timestamp / 1000), // Convert to seconds for lightweight-charts
        value: price
    }));
    
    // Cache longer for longer timeframes
    const ttl = days <= 7 ? 60000 : days <= 30 ? 300000 : 600000;
    cache.set(cacheKey, result, ttl);
    return result;
}

/**
 * Get top gainers and losers
 */
async function getTopMovers() {
    const cacheKey = 'movers';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(
        `${API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=24h`
    );
    if (!response.ok) throw new Error('Failed to fetch market data');
    
    const data = await response.json();
    const coins = data.map(coin => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        currentPrice: coin.current_price,
        priceChange24h: coin.price_change_percentage_24h || 0
    }));

    // Sort for gainers and losers
    const sorted = [...coins].sort((a, b) => b.priceChange24h - a.priceChange24h);
    const result = {
        gainers: sorted.slice(0, 5),
        losers: sorted.slice(-5).reverse()
    };
    
    cache.set(cacheKey, result, 120000); // 2 min cache
    return result;
}

/**
 * Get simple price for multiple coins (for watchlist)
 */
async function getSimplePrices(coinIds) {
    if (coinIds.length === 0) return {};
    
    const cacheKey = `prices:${coinIds.sort().join(',')}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(
        `${API_BASE}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!response.ok) throw new Error('Failed to fetch prices');
    
    const data = await response.json();
    cache.set(cacheKey, data, 60000); // 1 min cache
    return data;
}

// Export for use in app.js
window.CryptoAPI = {
    searchCoins,
    getCoinData,
    getPriceHistory,
    getTopMovers,
    getSimplePrices
};
