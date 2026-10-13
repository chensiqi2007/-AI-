# UAPI SDK Integration Guide

## Overview

This project now uses an official SDK-style UAPI client implementation that provides:
- ✅ Unified error handling with `UapiError` class
- ✅ Automatic timeout management (30s default)
- ✅ Parameter validation
- ✅ Network error detection and retry logic
- ✅ Support for all major UAPI endpoints

## Files

- `server/services/uapiSDK.js` - Core SDK implementation following official patterns
- `server/services/uapiService.js` - Backwards-compatible wrapper for existing routes
- `server/index.js` - Express routes exposing UAPI endpoints

## Quick Start

### 1. Configure API Key

Add your UAPI key to `.env`:

```env
UAPI_API_KEY=uapi-your-key-here
```

**Note**: The API key is optional. If not provided, the SDK uses UAPI's free tier.

### 2. Start the Server

```bash
node server/index.js
```

The server will start on `http://localhost:3000` and display:
```
✅ UAPI客户端初始化成功 (使用免费额度)
🚀 虚假贸易AI风险预警平台后端服务启动成功
```

## Usage Examples

### Backend Usage (Node.js)

#### Using the SDK directly:

```javascript
import { createUapiClient } from './server/services/uapiSDK.js';

// Create client
const uapi = createUapiClient(); // Uses env variable UAPI_API_KEY

// Get hotboard
const weibo = await uapi.getHotboard('weibo');
console.log(weibo);

// Query IP
const ipInfo = await uapi.queryIP('8.8.8.8');
console.log(ipInfo);

// Detect sensitive words
const result = await uapi.detectSensitiveWords('测试文本');
console.log(result);

// Batch hotboards
const batch = await uapi.getBatchHotboards(['weibo', 'zhihu', 'toutiao']);
console.log(batch);
```

#### Error handling:

```javascript
import { createUapiClient, UapiError } from './server/services/uapiSDK.js';

const uapi = createUapiClient();

try {
    const data = await uapi.getHotboard('invalid-platform');
} catch (error) {
    if (error instanceof UapiError) {
        console.error('UAPI Error:', error.code, error.message);
        console.error('Details:', error.details);
        console.error('Status:', error.statusCode);
    } else {
        console.error('Unexpected error:', error);
    }
}
```

### Frontend Usage (JavaScript)

The frontend can call the backend API routes:

#### Get hotboard for a single platform:

```javascript
const response = await fetch('http://localhost:3000/api/uapi/hotboard/weibo');
const data = await response.json();
console.log(data);
```

#### Batch get multiple hotboards:

```javascript
const response = await fetch('http://localhost:3000/api/uapi/hotboard/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        types: ['weibo', 'zhihu', 'toutiao', 'douyin'] 
    })
});
const data = await response.json();
console.log(data);
```

#### Query IP:

```javascript
const response = await fetch('http://localhost:3000/api/uapi/ip/8.8.8.8');
const data = await response.json();
console.log(data);
```

#### Detect sensitive words:

```javascript
const response = await fetch('http://localhost:3000/api/uapi/keywords/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '测试内容' })
});
const data = await response.json();
console.log(data);
```

## Available APIs

### Hotboard APIs

#### Get Hotboard
```javascript
// Default mode (current real-time hotboard)
await uapi.getHotboard('weibo');

// Time Machine mode (historical snapshot)
await uapi.getHotboardSnapshot('weibo', 1700000000000);

// Search mode (search in history)
await uapi.searchHotboard('weibo', 'AI', startTime, endTime, 50);

// Batch mode (multiple platforms)
await uapi.getBatchHotboards(['weibo', 'zhihu', 'toutiao', 'douyin']);
```

**Supported platforms**: `weibo`, `zhihu`, `zhihu-daily`, `douyin`, `xiaohongshu`, `kuaishou`, `bilibili`, `acfun`, `douban-movie`, `douban-group`, `tieba`, `hupu`, `ngabbs`, `v2ex`, `52pojie`, `coolapk`, `baidu`, `thepaper`, `toutiao`, `qq-news`, `sina`, `sina-news`, `netease-news`, `huxiu`, `ifanr`, `sspai`, `ithome`, `ithome-xijiayi`, `juejin`, `jianshu`, `guokr`, `36kr`, `51cto`, `csdn`, `nodeseek`, `nodeseek-hot`, `hellogithub`, `lol`, `genshin`, `honkai`, `starrail`, `netease-music`, `qq-music`, `weread`, `qidian-finish`, `fanqie-finish`, `jjwxc-finish`, `weatheralarm`, `earthquake`, `history`

### Network APIs

```javascript
// Get my IP
await uapi.getMyIP();

// Query specific IP
await uapi.queryIP('8.8.8.8');

// Ping host
await uapi.pingHost('google.com');

// DNS lookup
await uapi.dnsLookup('google.com', 'A');

// Check URL status
await uapi.checkUrlStatus('https://example.com');
```

### Text Processing APIs

```javascript
// Detect sensitive words (fast)
await uapi.detectSensitiveWords('测试文本');

// Analyze sensitive words (detailed)
await uapi.analyzeSensitiveWords('测试文本');

// Translate
await uapi.translate('Hello', 'auto', 'zh');

// AI Translation
await uapi.aiTranslate('Hello World', 'zh', 'auto');
```

### Utility APIs

```javascript
// Random quote (一言)
await uapi.getRandomQuote();

// Random image
await uapi.getRandomImage('nature');

// Generate random string
await uapi.generateRandomString(32, 'alphanumeric');

// Weather query
await uapi.getWeather('北京');
```

## API Routes

All routes are prefixed with `/api/uapi`:

### Hotboard Routes
- `GET /api/uapi/hotboard/:type` - Get hotboard for a platform
- `POST /api/uapi/hotboard/batch` - Batch get hotboards
- `GET /api/uapi/hotboard/:type/snapshot` - Get historical snapshot
- `POST /api/uapi/hotboard/:type/search` - Search hotboard history

### Network Routes
- `GET /api/uapi/myip` - Get current IP
- `GET /api/uapi/ip/:ip` - Query IP info
- `GET /api/uapi/ping` - Ping host (query param: `host`)
- `GET /api/uapi/dns` - DNS lookup (query params: `domain`, `type`)
- `GET /api/uapi/url-check` - Check URL (query param: `url`)

### Text Processing Routes
- `POST /api/uapi/keywords/detect` - Detect sensitive words
- `POST /api/uapi/keywords/analyze` - Analyze sensitive words
- `POST /api/uapi/translate` - Translate text
- `POST /api/uapi/ai-translate` - AI translation

### Utility Routes
- `GET /api/uapi/quote` - Random quote
- `GET /api/uapi/image` - Random image
- `GET /api/uapi/random-string` - Generate random string
- `GET /api/uapi/weather` - Query weather

## Error Handling

The SDK provides unified error handling through the `UapiError` class:

```javascript
class UapiError extends Error {
    constructor(code, message, details = {}, statusCode = null) {
        super(message);
        this.name = 'UapiError';
        this.code = code;           // Error code (e.g., 'INVALID_ARGUMENT')
        this.details = details;     // Additional error details
        this.statusCode = statusCode; // HTTP status code (if applicable)
    }
}
```

**Common error codes**:
- `INVALID_ARGUMENT` - Invalid parameters provided
- `TIMEOUT` - Request timeout
- `NETWORK_ERROR` - Network connection failed
- `HTTP_ERROR` - HTTP error response
- `API_ERROR` - API-specific error
- `UNKNOWN_ERROR` - Unknown error

## Configuration

### Timeout

Default timeout is 30 seconds. You can modify it in `server/services/uapiSDK.js`:

```javascript
const DEFAULT_TIMEOUT = 30000; // milliseconds
```

### Base URL

The SDK uses the official UAPI base URL:

```javascript
const UAPI_BASE_URL = 'https://uapis.cn/api/v1';
```

## Testing

Test the integration:

```bash
# Start server
node server/index.js

# In another terminal, test endpoints:
curl http://localhost:3000/api/uapi/myip
curl http://localhost:3000/api/uapi/hotboard/weibo
curl -X POST http://localhost:3000/api/uapi/hotboard/batch \
  -H "Content-Type: application/json" \
  -d '{"types":["weibo","zhihu"]}'
```

## Frontend Integration

The frontend already integrates these APIs:

1. **Hotboard View** (`热榜追踪`):
   - Displays trending topics from 4 platforms
   - Auto-refreshes every 30 seconds
   - Clickable URLs to original content

2. **Dashboard View**:
   - Can be extended to show real-time data sources

## Documentation

Official UAPI documentation:
- Main docs: https://uapis.cn/docs/getting-started/quickstart
- API reference: https://uapis.cn/docs/api-reference/introduction
- FAQ: https://uapis.cn/docs-md/api-reference/faq

## Support

For issues or questions:
1. Check the official UAPI documentation
2. Review error messages in the console
3. Check network connectivity
4. Verify API key (if using paid tier)

## License

This SDK implementation follows the patterns from the official UAPI SDK documentation and is integrated into the 虚假贸易AI风险预警平台 project.
