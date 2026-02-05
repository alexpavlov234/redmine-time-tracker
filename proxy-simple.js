import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';

// Create an HTTPS agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175'],
  credentials: true
}));

// Parse JSON requests
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Manual proxy for Redmine API
app.use('/api', async (req, res) => {
  try {
    console.log(`🔄 Proxying ${req.method} ${req.url} to Redmine...`);

    // Get the Redmine URL from headers (sent by the frontend)
    let redmineBaseUrl = req.headers['x-redmine-url'];

    // Fallback to environment variable if available
    if (!redmineBaseUrl) {
      redmineBaseUrl = process.env.REDMINE_URL;
    }

    if (!redmineBaseUrl) {
      return res.status(400).json({
        error: 'Missing Redmine URL',
        details: 'Please configure your Redmine URL in settings. The proxy needs either the X-Redmine-URL header or REDMINE_URL environment variable.',
        timestamp: new Date().toISOString()
      });
    }

    // Ensure the URL doesn't end with a slash
    redmineBaseUrl = redmineBaseUrl.replace(/\/$/, '');

    // Build the target URL
    const targetPath = req.url.replace('/api', '');
    const targetUrl = `${redmineBaseUrl}${targetPath}${req.url.includes('?') ? '' : ''}`;

    console.log(`🎯 Redmine Base URL: ${redmineBaseUrl}`);
    console.log(`🎯 Target URL: ${targetUrl}`);
    console.log(`📋 Original headers:`, req.headers);

    // Prepare headers for the Redmine request
    const proxyHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': req.headers['user-agent'] || 'Redmine-Time-Tracker-Proxy/1.0'
    };

    // Forward the X-Redmine-API-Key header
    if (req.headers['x-redmine-api-key']) {
      proxyHeaders['X-Redmine-API-Key'] = req.headers['x-redmine-api-key'];
    }

    console.log(`📤 Proxy headers:`, proxyHeaders);

    // Make the request to Redmine
    const fetchOptions = {
      method: req.method,
      headers: proxyHeaders,
      timeout: 30000,
      agent: httpsAgent // Use the custom HTTPS agent that ignores SSL errors
    };

    // Add body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    console.log(`✅ Redmine response: ${response.status} ${response.statusText}`);
    console.log(`📥 Response headers:`, response.headers.raw());

    // Forward the response status
    res.status(response.status);

    // Forward response headers (excluding problematic ones)
    const responseHeaders = response.headers.raw();
    Object.keys(responseHeaders).forEach(key => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        const headerValue = Array.isArray(responseHeaders[key])
          ? responseHeaders[key][0]
          : responseHeaders[key];
        res.set(key, headerValue);
      }
    });

    // Get the response body
    const responseText = await response.text();
    console.log(`📄 Response body length: ${responseText.length} chars`);

    // Try to parse as JSON, fallback to text
    try {
      const jsonData = JSON.parse(responseText);
      res.json(jsonData);
    } catch (e) {
      res.send(responseText);
    }

  } catch (error) {
    console.error('=== PROXY ERROR ===');
    console.error('Error:', error.message);
    console.error('Error type:', error.name);
    console.error('Stack:', error.stack);
    console.error('==================');

    res.status(500).json({
      error: 'Proxy error',
      details: error.message,
      type: error.name,
      url: req.url,
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Custom proxy server running on http://localhost:${PORT}`);
  console.log(`🔗 Redmine API accessible via http://localhost:${PORT}/api/`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});
