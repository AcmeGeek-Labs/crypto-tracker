/**
 * CoinGecko API Data Layer
 * 
 * Enhanced with:
 * - User-friendly error messages
 * - Rate limit detection and exponential backoff
 * - Request queue to prevent hammering
 * 
 * API Docs: https://www.coingecko.com/en/api/documentation
 * 
 * @author Solon (initial), Chilon (enhancements)
 */

const API_BASE = 'https://api.coingecko.com/api/v3';

// ============================================
// Error Handling
// ============================================

class APIError extends Error {
    constructor(message, code, userMessage) {
        super(message);
        this.name = 'APIError';
        this.code = code;
        this.userMessage = userMessage || message;
    }
}

const ERROR_MESSAGES = {
    NETWORK: 'Unable to connect. Please check your internet connection.',
    RATE_LIMIT: 'Too many requests. Please wait a moment and try again.',
    NOT_FOUND: 'Coin not found. Please check the symbol and try again.',
    SERVER: 'CoinGecko is having issues. Please try again later.',
    UNKNOWN: 'Something went wrong. Please try again.'
};

function handleAPIError(response, context = '') {
    const status = response.status;
    
    if (status === 429) {
        return new APIError(
            `Rate limited${context ? ` during ${context}` : ''}`,
            'RATE_LIMIT',
            ERROR_MESSAGES.RATE_LIMIT
        );
    }
    if (status === 404) {
        return new APIError(
            `Not found${context ? ` during ${context}` : ''}`,
            'NOT_FOUND',
            ERROR_MESSAGES.NOT_FOUND
        );
    }
    if (status >= 500) {
        return new APIError(
            `Server error ${status}${context ? ` during ${context}` : ''}`,
            'SERVER',
            ERROR_MESSAGES.SERVER
        );
    }
    
    return new APIError(
        `HTTP ${status}${context ? ` during ${context}` : ''}`,
        'UNKNOWN',
        ERROR_MESSAGES.UNKNOWN
    );
}

// ============================================
// Rate Limiting & Request Queue
// ============================================

const rateLimiter = {
    queue: [],
    processing: false,
    lastRequest: 0,
    minInterval: 1200,  // ~50 requests/min = 1.2s between requests
    backoffMultiplier: 1,
    maxBackoff: 60000,
    
    async enqueue(fn, priority = 0) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject, priority });
            this.queue.sort((a, b) => b.priority - a.priority);
            this.processQueue();
        });
    },
    
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const now = Date.now();
            const waitTime = Math.max(0, 
                this.lastRequest + (this.minInterval * this.backoffMultiplier) - now
            );
            
            if (waitTime > 0) {
                await new Promise(r => setTimeout(r, waitTime));
            }
            
            const { fn, resolve, reject } = this.queue.shift();
            
            try {
                this.lastRequest = Date.now();
                const result = await fn();
                this.backoffMultiplier = Math.max(1, this.backoffMultiplier * 0.9);
                resolve(result);
            } catch (error) {
                if (error.code === 'RATE_LIMIT') {
                    this.backoffMultiplier = Math.min(
                        this.maxBackoff / this.minInterval,
                        this.backoffMultiplier * 2
                    );
                    console.warn(`Rate limited. Backing off to ${this.minInterval * this.backoffMultiplier}ms`);
                }
                reject(error);
            }
        }
        
        this.processing = false;
    },
    
    getStatus() {
        return {
            queueLength: this.queue.length,
            backoffMultiplier: this.backoffMultiplier,
            effectiveInterval: this.minInterval * this.backoffMultiplier
        };
    }
};

// ============================================
// Cache (unchanged from Solon's implementation)
// ============================================

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
    },
    clear() {
        this.data = {};
    }
};

// ============================================
// API Wrapper with retry logic
// ============================================

async function fetchWithRetry(url, context, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw handleAPIError(response, context);
            }
            
            return await response.json();
        } catch (error) {
            lastError = error;
            
            if (error instanceof APIError) {
                if (error.code === 'RATE_LIMIT' && attempt < maxRetries) {
                    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
                    console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw error;
            }
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new APIError(
                    'Network error',
                    'NETWORK',
                    ERROR_MESSAGES.NETWORK
                );
            }
            
            throw new APIError(
                error.message,
                'UNKNOWN',
                ERROR_MESSAGES.UNKNOWN
            );
        }
    }
    
    throw lastError;
}

// ============================================
// API Functions
// ============================================

/**
 * Search for coins by query
 */
async function searchCoins(query) {
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return rateLimiter.enqueue(async () => {
        const data = await fetchWithRetry(
            `${API_BASE}/search?query=${encodeURIComponent(query)}`,
            'coin search'
        );
        
        const results = data.coins.slice(0, 10).map(coin => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            thumb: coin.thumb,
            marketCapRank: coin.market_cap_rank
        }));
        
        cache.set(cacheKey, results, 300000); // 5 min cache
        return results;
    });
}

/**
 * Get detailed coin data
 */
async function getCoinData(coinId) {
    const cacheKey = `coin:${coinId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return rateLimiter.enqueue(async () => {
        const data = await fetchWithRetry(
            `${API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
            'coin details'
        );
        
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
    }, 1); // Higher priority for detail views
}

/**
 * Get price history for charts
 */
async function getPriceHistory(coinId, days = 7) {
    const cacheKey = `history:${coinId}:${days}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return rateLimiter.enqueue(async () => {
        const data = await fetchWithRetry(
            `${API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
            'price history'
        );
        
        const result = data.prices.map(([timestamp, price]) => ({
            time: Math.floor(timestamp / 1000),
            value: price
        }));
        
        // Cache longer for longer timeframes
        const ttl = days <= 7 ? 60000 : days <= 30 ? 300000 : 600000;
        cache.set(cacheKey, result, ttl);
        return result;
    }, 1); // Higher priority for chart data
}

/**
 * Get top gainers and losers
 */
async function getTopMovers() {
    const cacheKey = 'movers';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return rateLimiter.enqueue(async () => {
        const data = await fetchWithRetry(
            `${API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=24h`,
            'market data'
        );
        
        const coins = data.map(coin => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            image: coin.image,
            currentPrice: coin.current_price,
            priceChange24h: coin.price_change_percentage_24h || 0
        }));

        const sorted = [...coins].sort((a, b) => b.priceChange24h - a.priceChange24h);
        const result = {
            gainers: sorted.slice(0, 5),
            losers: sorted.slice(-5).reverse()
        };
        
        cache.set(cacheKey, result, 120000); // 2 min cache
        return result;
    });
}

/**
 * Get simple price for multiple coins (for watchlist)
 */
async function getSimplePrices(coinIds) {
    if (coinIds.length === 0) return {};
    
    const cacheKey = `prices:${coinIds.sort().join(',')}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return rateLimiter.enqueue(async () => {
        const data = await fetchWithRetry(
            `${API_BASE}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`,
            'watchlist prices'
        );
        
        cache.set(cacheKey, data, 60000); // 1 min cache
        return data;
    });
}

// ============================================
// Exports
// ============================================

window.CryptoAPI = {
    searchCoins,
    getCoinData,
    getPriceHistory,
    getTopMovers,
    getSimplePrices,
    // Utilities for debugging/monitoring
    getQueueStatus: () => rateLimiter.getStatus(),
    clearCache: () => cache.clear(),
    ERROR_MESSAGES
};
