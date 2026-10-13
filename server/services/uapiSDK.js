/**
 * UAPI SDK Implementation
 * Official SDK-style wrapper for UAPI (uapis.cn)
 * Implements unified error handling, parameter validation, and timeout management
 */

import fetch from 'node-fetch';

const UAPI_BASE_URL = 'https://uapis.cn/api/v1';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * UAPI Error Class
 * Matches official SDK error structure
 */
class UapiError extends Error {
    constructor(code, message, details = {}, statusCode = null) {
        super(message);
        this.name = 'UapiError';
        this.code = code;
        this.details = details;
        this.statusCode = statusCode;
    }
}

/**
 * UAPI SDK Client
 */
class UapiSDK {
    constructor(apiKey = null) {
        this.apiKey = apiKey || process.env.UAPI_API_KEY || '';
        this.baseUrl = UAPI_BASE_URL;
        this.timeout = DEFAULT_TIMEOUT;
    }

    /**
     * Internal request method with error handling
     */
    async _request(method, endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
            ...options.headers
        };

        const config = {
            method,
            headers,
            timeout: options.timeout || this.timeout
        };

        if (options.body) {
            config.body = typeof options.body === 'string' 
                ? options.body 
                : JSON.stringify(options.body);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);
            
            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Handle non-2xx responses
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    throw new UapiError(
                        'HTTP_ERROR',
                        `HTTP ${response.status}: ${response.statusText}`,
                        {},
                        response.status
                    );
                }

                throw new UapiError(
                    errorData.code || 'API_ERROR',
                    errorData.message || 'API request failed',
                    errorData.details || {},
                    response.status
                );
            }

            // Parse response
            const data = await response.json();
            return data;

        } catch (error) {
            // Handle timeout
            if (error.name === 'AbortError') {
                throw new UapiError(
                    'TIMEOUT',
                    `Request timeout after ${config.timeout}ms`,
                    { url, timeout: config.timeout }
                );
            }

            // Handle network errors
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new UapiError(
                    'NETWORK_ERROR',
                    'Network request failed, please check your connection',
                    { originalError: error.message }
                );
            }

            // Re-throw UapiError
            if (error instanceof UapiError) {
                throw error;
            }

            // Wrap unknown errors
            throw new UapiError(
                'UNKNOWN_ERROR',
                error.message || 'Unknown error occurred',
                { originalError: error }
            );
        }
    }

    /**
     * GET request
     */
    async get(endpoint, params = {}, options = {}) {
        const queryString = new URLSearchParams(params).toString();
        const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this._request('GET', fullEndpoint, options);
    }

    /**
     * POST request
     */
    async post(endpoint, body = {}, options = {}) {
        return this._request('POST', endpoint, { ...options, body });
    }

    // ==================== Hotboard APIs ====================

    /**
     * Get hotboard for a specific platform
     * @param {string} type - Platform type (weibo, zhihu, etc.)
     * @param {object} options - Optional parameters (time, keyword, time_start, time_end, limit)
     */
    async getHotboard(type, options = {}) {
        if (!type) {
            throw new UapiError('INVALID_ARGUMENT', 'Platform type is required');
        }

        const params = { type, ...options };
        return this.get('/misc/hotboard', params);
    }

    /**
     * Get hotboard snapshot at a specific time (Time Machine Mode)
     */
    async getHotboardSnapshot(type, timestamp) {
        if (!type || !timestamp) {
            throw new UapiError('INVALID_ARGUMENT', 'Type and timestamp are required');
        }

        return this.get('/misc/hotboard', { type, time: timestamp });
    }

    /**
     * Search hotboard history (Search Mode)
     */
    async searchHotboard(type, keyword, timeStart, timeEnd, limit = 50) {
        if (!type || !keyword || !timeStart || !timeEnd) {
            throw new UapiError('INVALID_ARGUMENT', 'Type, keyword, time_start and time_end are required');
        }

        return this.get('/misc/hotboard', {
            type,
            keyword,
            time_start: timeStart,
            time_end: timeEnd,
            limit: Math.min(limit, 200)
        });
    }

    // ==================== Network APIs ====================

    /**
     * Get current IP information
     */
    async getMyIP() {
        return this.get('/network/myip');
    }

    /**
     * Query IP information
     */
    async queryIP(ip) {
        if (!ip) {
            throw new UapiError('INVALID_ARGUMENT', 'IP address is required');
        }
        return this.get(`/network/ip/${encodeURIComponent(ip)}`);
    }

    /**
     * Ping a host
     */
    async pingHost(host) {
        if (!host) {
            throw new UapiError('INVALID_ARGUMENT', 'Host is required');
        }
        return this.get('/network/ping', { host });
    }

    /**
     * DNS lookup
     */
    async dnsLookup(domain, recordType = 'A') {
        if (!domain) {
            throw new UapiError('INVALID_ARGUMENT', 'Domain is required');
        }
        return this.get('/network/dns', { domain, type: recordType });
    }

    /**
     * Check URL accessibility
     */
    async checkUrlStatus(url) {
        if (!url) {
            throw new UapiError('INVALID_ARGUMENT', 'URL is required');
        }
        return this.get('/network/url-check', { url });
    }

    // ==================== Text Processing APIs ====================

    /**
     * Detect sensitive words (fast mode)
     */
    async detectSensitiveWords(text) {
        if (!text) {
            throw new UapiError('INVALID_ARGUMENT', 'Text is required');
        }
        return this.post('/text/sensitive-words/detect', { text });
    }

    /**
     * Analyze sensitive words
     */
    async analyzeSensitiveWords(text) {
        if (!text) {
            throw new UapiError('INVALID_ARGUMENT', 'Text is required');
        }
        return this.post('/text/sensitive-words/analyze', { text });
    }

    /**
     * Translate text
     */
    async translate(text, from = 'auto', to = 'zh') {
        if (!text) {
            throw new UapiError('INVALID_ARGUMENT', 'Text is required');
        }
        return this.post('/text/translate', { text, from, to });
    }

    /**
     * AI translation
     */
    async aiTranslate(text, targetLang = 'zh', sourceLang = 'auto') {
        if (!text) {
            throw new UapiError('INVALID_ARGUMENT', 'Text is required');
        }
        return this.post('/text/ai-translate', { 
            text, 
            target_lang: targetLang,
            source_lang: sourceLang 
        });
    }

    // ==================== Random/Utility APIs ====================

    /**
     * Get a random quote (一言)
     */
    async getRandomQuote() {
        return this.get('/random/quote');
    }

    /**
     * Get random image
     */
    async getRandomImage(category = null) {
        const params = category ? { category } : {};
        return this.get('/random/image', params);
    }

    /**
     * Generate random string
     */
    async generateRandomString(length = 16, charset = 'alphanumeric') {
        return this.get('/random/string', { length, charset });
    }

    // ==================== Weather API ====================

    /**
     * Query weather
     */
    async getWeather(city) {
        if (!city) {
            throw new UapiError('INVALID_ARGUMENT', 'City is required');
        }
        return this.get('/weather/query', { city });
    }

    // ==================== Batch Operations ====================

    /**
     * Batch get hotboards from multiple platforms
     */
    async getBatchHotboards(types) {
        if (!Array.isArray(types) || types.length === 0) {
            throw new UapiError('INVALID_ARGUMENT', 'Types must be a non-empty array');
        }

        const requests = types.map(type => 
            this.getHotboard(type)
                .then(data => ({ type, status: 'fulfilled', data, error: null }))
                .catch(error => ({ 
                    type, 
                    status: 'rejected', 
                    data: null, 
                    error: { 
                        code: error.code, 
                        message: error.message 
                    }
                }))
        );

        const results = await Promise.all(requests);
        return {
            success: true,
            results,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Create a new UAPI SDK instance
 */
export function createUapiClient(apiKey = null) {
    return new UapiSDK(apiKey);
}

/**
 * Default export
 */
export default UapiSDK;
export { UapiError };
