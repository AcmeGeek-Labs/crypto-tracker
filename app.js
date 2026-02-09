/**
 * Crypto Tracker - Main Application
 * UI Layer by Solon
 */

// State
let currentCoin = null;
let currentDays = 7;
let chart = null;
let lineSeries = null;
let watchlist = JSON.parse(localStorage.getItem('cryptoWatchlist') || '[]');

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const coinDetail = document.getElementById('coin-detail');
const chartSection = document.getElementById('chart-section');
const watchlistEl = document.getElementById('watchlist');
const moversList = document.getElementById('movers-list');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadTopMovers();
    renderWatchlist();
});

function initEventListeners() {
    // Search
    searchBtn.addEventListener('click', () => handleSearch(searchInput.value));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch(searchInput.value);
    });
    searchInput.addEventListener('input', debounce(handleSearchInput, 300));
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-section')) {
            searchResults.classList.add('hidden');
        }
    });

    // Chart time buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.time-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentDays = parseInt(btn.dataset.days);
            if (currentCoin) loadChart(currentCoin.id);
        });
    });

    // Mover tabs
    document.querySelectorAll('.mover-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.mover-tab.active').classList.remove('active');
            tab.classList.add('active');
            renderMovers(tab.dataset.type);
        });
    });

    // Watchlist button
    document.getElementById('watchlist-btn').addEventListener('click', toggleWatchlist);
}

// Debounce helper
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// Format helpers
function formatPrice(price) {
    if (price >= 1) {
        return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    }
}

function formatLargeNumber(num) {
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    return '$' + num.toLocaleString();
}

function formatChange(change) {
    const sign = change >= 0 ? '+' : '';
    return sign + change.toFixed(2) + '%';
}

// Search
async function handleSearchInput(e) {
    const query = searchInput.value.trim();
    if (query.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }
    
    try {
        const results = await CryptoAPI.searchCoins(query);
        renderSearchResults(results);
    } catch (error) {
        console.error('Search error:', error);
    }
}

async function handleSearch(query) {
    if (!query.trim()) return;
    
    try {
        const results = await CryptoAPI.searchCoins(query);
        if (results.length > 0) {
            selectCoin(results[0].id);
            searchResults.classList.add('hidden');
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

function renderSearchResults(results) {
    if (results.length === 0) {
        searchResults.classList.add('hidden');
        return;
    }
    
    searchResults.innerHTML = results.map(coin => `
        <div class="search-result-item" data-id="${coin.id}">
            <img src="${coin.thumb}" alt="${coin.name}">
            <span class="name">${coin.name}</span>
            <span class="symbol">${coin.symbol}</span>
        </div>
    `).join('');
    
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            selectCoin(item.dataset.id);
            searchResults.classList.add('hidden');
            searchInput.value = '';
        });
    });
    
    searchResults.classList.remove('hidden');
}

// Coin Detail
async function selectCoin(coinId) {
    try {
        const coin = await CryptoAPI.getCoinData(coinId);
        currentCoin = coin;
        renderCoinDetail(coin);
        loadChart(coinId);
        coinDetail.classList.remove('hidden');
        chartSection.classList.remove('hidden');
    } catch (error) {
        console.error('Failed to load coin:', error);
    }
}

function renderCoinDetail(coin) {
    document.getElementById('coin-icon').src = coin.image;
    document.getElementById('coin-icon').alt = coin.name;
    document.getElementById('coin-name').textContent = coin.name;
    document.getElementById('coin-symbol').textContent = coin.symbol;
    document.getElementById('coin-price').textContent = formatPrice(coin.currentPrice);
    
    const changeEl = document.getElementById('coin-change');
    changeEl.textContent = formatChange(coin.priceChange24h);
    changeEl.className = 'change ' + (coin.priceChange24h >= 0 ? 'positive' : 'negative');
    
    document.getElementById('market-cap').textContent = formatLargeNumber(coin.marketCap);
    document.getElementById('volume').textContent = formatLargeNumber(coin.volume24h);
    document.getElementById('high-24h').textContent = formatPrice(coin.high24h);
    document.getElementById('low-24h').textContent = formatPrice(coin.low24h);
    
    // Update watchlist button
    const watchlistBtn = document.getElementById('watchlist-btn');
    const isInWatchlist = watchlist.some(c => c.id === coin.id);
    watchlistBtn.textContent = isInWatchlist ? '★' : '☆';
    watchlistBtn.classList.toggle('active', isInWatchlist);
}

// Chart
async function loadChart(coinId) {
    try {
        const history = await CryptoAPI.getPriceHistory(coinId, currentDays);
        renderChart(history);
    } catch (error) {
        console.error('Failed to load chart:', error);
    }
}

function renderChart(data) {
    const container = document.getElementById('chart-container');
    
    if (chart) {
        lineSeries.setData(data);
        chart.timeScale().fitContent();
        return;
    }
    
    chart = LightweightCharts.createChart(container, {
        layout: {
            background: { type: 'solid', color: '#161b22' },
            textColor: '#8b949e',
        },
        grid: {
            vertLines: { color: '#21262d' },
            horzLines: { color: '#21262d' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#30363d',
        },
        timeScale: {
            borderColor: '#30363d',
            timeVisible: true,
        },
        handleScroll: { vertTouchDrag: false },
    });
    
    lineSeries = chart.addAreaSeries({
        topColor: 'rgba(88, 166, 255, 0.4)',
        bottomColor: 'rgba(88, 166, 255, 0.0)',
        lineColor: '#58a6ff',
        lineWidth: 2,
    });
    
    lineSeries.setData(data);
    chart.timeScale().fitContent();
    
    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);
}

// Watchlist
function toggleWatchlist() {
    if (!currentCoin) return;
    
    const index = watchlist.findIndex(c => c.id === currentCoin.id);
    if (index >= 0) {
        watchlist.splice(index, 1);
    } else {
        watchlist.push({
            id: currentCoin.id,
            name: currentCoin.name,
            symbol: currentCoin.symbol,
            image: currentCoin.image
        });
    }
    
    localStorage.setItem('cryptoWatchlist', JSON.stringify(watchlist));
    renderCoinDetail(currentCoin);
    renderWatchlist();
}

async function renderWatchlist() {
    if (watchlist.length === 0) {
        watchlistEl.innerHTML = '<p class="empty-state">No coins in watchlist. Search and add some!</p>';
        return;
    }
    
    try {
        const ids = watchlist.map(c => c.id);
        const prices = await CryptoAPI.getSimplePrices(ids);
        
        watchlistEl.innerHTML = watchlist.map(coin => {
            const priceData = prices[coin.id] || {};
            const price = priceData.usd || 0;
            const change = priceData.usd_24h_change || 0;
            
            return `
                <div class="watchlist-item" data-id="${coin.id}">
                    <img src="${coin.image}" alt="${coin.name}">
                    <div class="info">
                        <div class="name">${coin.name}</div>
                        <div class="price">${formatPrice(price)} <span class="change ${change >= 0 ? 'positive' : 'negative'}">${formatChange(change)}</span></div>
                    </div>
                    <button class="remove-btn" data-id="${coin.id}" title="Remove">×</button>
                </div>
            `;
        }).join('');
        
        // Add click handlers
        watchlistEl.querySelectorAll('.watchlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-btn')) {
                    selectCoin(item.dataset.id);
                }
            });
        });
        
        watchlistEl.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromWatchlist(btn.dataset.id);
            });
        });
    } catch (error) {
        console.error('Failed to load watchlist prices:', error);
    }
}

function removeFromWatchlist(coinId) {
    watchlist = watchlist.filter(c => c.id !== coinId);
    localStorage.setItem('cryptoWatchlist', JSON.stringify(watchlist));
    renderWatchlist();
    
    if (currentCoin && currentCoin.id === coinId) {
        renderCoinDetail(currentCoin);
    }
}

// Top Movers
let moversData = { gainers: [], losers: [] };

async function loadTopMovers() {
    try {
        moversData = await CryptoAPI.getTopMovers();
        renderMovers('gainers');
    } catch (error) {
        moversList.innerHTML = '<p class="empty-state">Failed to load market data</p>';
        console.error('Failed to load movers:', error);
    }
}

function renderMovers(type) {
    const coins = moversData[type] || [];
    
    if (coins.length === 0) {
        moversList.innerHTML = '<p class="loading">Loading...</p>';
        return;
    }
    
    moversList.innerHTML = coins.map((coin, i) => `
        <div class="mover-item" data-id="${coin.id}">
            <span class="rank">${i + 1}</span>
            <img src="${coin.image}" alt="${coin.name}">
            <span class="name">${coin.name}</span>
            <span class="change ${coin.priceChange24h >= 0 ? 'positive' : 'negative'}">${formatChange(coin.priceChange24h)}</span>
        </div>
    `).join('');
    
    moversList.querySelectorAll('.mover-item').forEach(item => {
        item.addEventListener('click', () => selectCoin(item.dataset.id));
    });
}
