const express = require('express');
const path = require('path');
const app = express();

const CONFIG = {
  clientId: '6a25ff82-5e08-4747-bfe3-ad1c94df57fa',
  clientSecret: '8625ECFE81A480D4DF9B6C842639C15618331BC0',
  retailer: 'cr143',
  tokenUrl: 'https://id.kiotviet.vn/connect/token',
  apiBase: 'https://public.kiotapi.com'
};

let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  
  const res = await fetch(CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      scopes: 'PublicApi.Access',
      grant_type: 'client_credentials',
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret
    })
  });
  
  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000
  };
  return tokenCache.token;
}

async function kiotApi(endpoint) {
  const token = await getToken();
  const res = await fetch(`${CONFIG.apiBase}${endpoint}`, {
    headers: {
      'Retailer': CONFIG.retailer,
      'Authorization': `Bearer ${token}`
    }
  });
  return res.json();
}

// Cache all products for suggestions
let productCache = { data: [], updatedAt: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 min

async function getAllProducts() {
  if (productCache.data.length > 0 && Date.now() - productCache.updatedAt < CACHE_TTL) {
    return productCache.data;
  }
  let all = [], page = 1, pageSize = 100, total = 0;
  do {
    const data = await kiotApi(`/products?pageSize=${pageSize}&currentItem=${(page-1)*pageSize}&includeInventory=true&orderBy=name&orderDirection=ASC`);
    all = all.concat(data.data || []);
    total = data.total || 0;
    page++;
  } while (all.length < total && page < 50);
  productCache = { data: all, updatedAt: Date.now() };
  console.log(`Cached ${all.length} products`);
  return all;
}

// Preload on startup
setTimeout(() => getAllProducts().catch(console.error), 1000);

// Search products
app.get('/api/products', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const all = req.query.all === 'true';
    
    if (all || !q) {
      // Return all products (for suggestions)
      const products = await getAllProducts();
      return res.json({ total: products.length, data: products });
    }
    
    const data = await kiotApi(`/products?name=${encodeURIComponent(q)}&pageSize=50&includeInventory=true&orderBy=name&orderDirection=ASC`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get branches
app.get('/api/branches', async (req, res) => {
  try {
    const data = await kiotApi('/branches');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = 3143;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🥃 CR143 KiotViet Check — http://localhost:${PORT}`);
  console.log(`📱 Điện thoại truy cập: http://192.168.100.17:${PORT}`);
});
