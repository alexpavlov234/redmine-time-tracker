import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Create an HTTPS agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TIMER_STATE_FILE = path.join(__dirname, 'timer-state.json');
const SERVER_CONFIG_FILE = path.join(__dirname, 'server-config.json');

const app = express();

// Enable CORS for all routes (allows localhost frontend, extension, and Redmine page origin)
app.use(cors({
  origin: true,
  credentials: true
}));

// In-memory server credentials config
let serverConfig = {
  redmineUrl: '',
  apiKey: ''
};

/**
 * Loads server configuration from persistent JSON file.
 */
function loadServerConfig() {
  try {
    if (fs.existsSync(SERVER_CONFIG_FILE)) {
      const data = fs.readFileSync(SERVER_CONFIG_FILE, 'utf-8');
      serverConfig = { ...serverConfig, ...JSON.parse(data) };
      console.log('🔒 Loaded server config (Redmine URL configured:', Boolean(serverConfig.redmineUrl), ')');
    }
  } catch (error) {
    console.error('⚠️ Could not load server-config.json:', error.message);
  }
}

/**
 * Saves server configuration to persistent JSON file.
 */
function saveServerConfig() {
  try {
    fs.writeFileSync(SERVER_CONFIG_FILE, JSON.stringify(serverConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('⚠️ Could not save server-config.json:', error.message);
  }
}

loadServerConfig();

// In-memory timer state
let currentTimer = {
  isRunning: false,
  issueId: null,
  issueSubject: '',
  projectName: '',
  activityId: null,
  activityName: '',
  startTime: null,
  elapsedMs: 0,
  lastNote: null,
  activities: [],
  lastUpdated: Date.now()
};

/**
 * Loads timer state from the persistent JSON file if available.
 */
function loadTimerState() {
  try {
    if (fs.existsSync(TIMER_STATE_FILE)) {
      const data = fs.readFileSync(TIMER_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      currentTimer = { ...currentTimer, ...parsed };
      console.log('⏱️ Loaded timer state:', currentTimer);
    }
  } catch (error) {
    console.error('⚠️ Could not load timer-state.json:', error.message);
  }
}

/**
 * Saves current timer state to the persistent JSON file.
 */
function saveTimerState() {
  try {
    fs.writeFileSync(TIMER_STATE_FILE, JSON.stringify(currentTimer, null, 2), 'utf-8');
  } catch (error) {
    console.error('⚠️ Could not save timer-state.json:', error.message);
  }
}

// Initial load
loadTimerState();

// Parse JSON requests
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  // Avoid excessive logs for frequent timer polling
  if (!req.url.startsWith('/timer')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

/**
 * GET /timer - Returns the current timer state and dynamically computed elapsed seconds.
 */
app.get('/timer', (req, res) => {
  const now = Date.now();
  const sessionMs = currentTimer.isRunning && currentTimer.startTime ? Math.max(0, now - currentTimer.startTime) : 0;
  const totalMs = (currentTimer.elapsedMs || 0) + sessionMs;

  res.json({
    ...currentTimer,
    currentElapsedSeconds: Math.floor(totalMs / 1000),
    totalElapsedMs: totalMs
  });
});

/**
 * POST /timer/start - Starts or resumes timer for a task.
 */
app.post('/timer/start', (req, res) => {
  const { issueId, issueSubject, projectName, activityId, activityName } = req.body;
  const now = Date.now();

  const isSameTask = String(currentTimer.issueId) === String(issueId);

  if (currentTimer.isRunning && isSameTask) {
    // Already running this task
    return res.json({ status: 'already_running', timer: currentTimer });
  }

  // If running another task, accumulate its elapsed time first
  let newElapsedMs = 0;
  if (isSameTask) {
    newElapsedMs = currentTimer.elapsedMs || 0;
  }

  currentTimer = {
    isRunning: true,
    issueId: issueId ? String(issueId) : null,
    issueSubject: issueSubject || (isSameTask ? currentTimer.issueSubject : ''),
    projectName: projectName || (isSameTask ? currentTimer.projectName : ''),
    activityId: activityId || (isSameTask ? currentTimer.activityId : null),
    activityName: activityName || (isSameTask ? currentTimer.activityName : ''),
    startTime: now,
    elapsedMs: newElapsedMs,
    lastUpdated: now
  };

  saveTimerState();
  console.log(`▶️ Timer started for issue #${issueId}: "${currentTimer.issueSubject}"`);
  res.json({ status: 'started', timer: currentTimer });
});

/**
 * POST /timer/stop - Stops/pauses the active timer and records optional activity description.
 */
app.post('/timer/stop', (req, res) => {
  const { note } = req.body || {};
  const now = Date.now();
  let sessionMs = 0;
  if (currentTimer.isRunning && currentTimer.startTime) {
    sessionMs = Math.max(0, now - currentTimer.startTime);
    currentTimer.elapsedMs = (currentTimer.elapsedMs || 0) + sessionMs;
  }

  if (note && typeof note === 'string' && note.trim()) {
    const trimmed = note.trim();
    if (!Array.isArray(currentTimer.activities)) {
      currentTimer.activities = [];
    }
    currentTimer.activities.push({
      text: trimmed,
      timestamp: now,
      durationSeconds: Math.floor(sessionMs / 1000)
    });
    currentTimer.lastNote = trimmed;
  } else {
    currentTimer.lastNote = null;
  }

  currentTimer.isRunning = false;
  currentTimer.startTime = null;
  currentTimer.lastUpdated = now;

  saveTimerState();
  console.log(`⏹️ Timer stopped for issue #${currentTimer.issueId}${currentTimer.lastNote ? ` with note: "${currentTimer.lastNote}"` : ''}`);
  res.json({ status: 'stopped', timer: currentTimer });
});

/**
 * POST /timer/sync - Synchronizes timer state from the web app.
 */
app.post('/timer/sync', (req, res) => {
  const update = req.body;
  if (update && typeof update === 'object') {
    currentTimer = {
      ...currentTimer,
      ...update,
      lastUpdated: Date.now()
    };
    saveTimerState();
  }
  res.json({ status: 'synced', timer: currentTimer });
});

/**
 * GET /config - Returns public server configuration status.
 */
app.get('/config', (req, res) => {
  res.json({
    redmineUrl: serverConfig.redmineUrl || '',
    isConfigured: Boolean(serverConfig.apiKey && serverConfig.redmineUrl)
  });
});

/**
 * POST /config - Updates stored credentials for Redmine connection.
 */
app.post('/config', (req, res) => {
  const { redmineUrl, apiKey } = req.body || {};
  if (typeof redmineUrl === 'string') {
    serverConfig.redmineUrl = redmineUrl.replace(/\/$/, '').trim();
  }
  if (typeof apiKey === 'string') {
    serverConfig.apiKey = apiKey.trim();
  }
  saveServerConfig();
  console.log('🔒 Updated server config (Redmine URL configured:', Boolean(serverConfig.redmineUrl), ')');
  res.json({
    status: 'saved',
    isConfigured: Boolean(serverConfig.apiKey && serverConfig.redmineUrl),
    redmineUrl: serverConfig.redmineUrl
  });
});

// Manual proxy for Redmine API
app.use('/api', async (req, res) => {
  try {
    console.log(`🔄 Proxying ${req.method} ${req.url} to Redmine...`);

    // Get the Redmine URL from headers or stored configuration
    let redmineBaseUrl = req.headers['x-redmine-url'] || serverConfig.redmineUrl || process.env.REDMINE_URL;

    if (!redmineBaseUrl) {
      return res.status(400).json({
        error: 'Missing Redmine URL',
        details: 'Please configure your Redmine URL in settings. The proxy needs either the X-Redmine-URL header, server config, or REDMINE_URL environment variable.',
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

    // Prepare headers for the Redmine request
    const proxyHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': req.headers['user-agent'] || 'Redmine-Time-Tracker-Proxy/1.0'
    };

    // Forward the X-Redmine-API-Key header or use stored server apiKey
    const activeApiKey = req.headers['x-redmine-api-key'] || serverConfig.apiKey;
    if (activeApiKey) {
      proxyHeaders['X-Redmine-API-Key'] = activeApiKey;
    }

    console.log(`📤 Proxy headers:`, { ...proxyHeaders, 'X-Redmine-API-Key': activeApiKey ? '***' : 'missing' });

    // Make the request to Redmine
    const fetchOptions = {
      method: req.method,
      headers: proxyHeaders,
      timeout: 60000,
      agent: httpsAgent // Use the custom HTTPS agent that ignores SSL errors
    };

    // Add body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    console.log(`✅ Redmine response: ${response.status} ${response.statusText}`);

    // Forward the response status
    res.status(response.status);

    // Forward response headers (excluding problematic ones such as www-authenticate to prevent browser basic auth popup)
    const responseHeaders = response.headers.raw();
    Object.keys(responseHeaders).forEach(key => {
      if (!['content-encoding', 'transfer-encoding', 'connection', 'www-authenticate'].includes(key.toLowerCase())) {
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
