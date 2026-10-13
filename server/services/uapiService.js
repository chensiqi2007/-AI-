/**
 * UAPI 服务层
 * 提供热榜查询、IP查询、网络工具等真实信息来源
 * 文档: https://uapis.cn/docs/api-reference/introduction
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const UAPI_BASE_URL = 'https://uapis.cn/api/v1';
const UAPI_TIMEOUT = 30000; // 30秒超时
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒

/**
 * UAPI 错误类
 */
class UAPIError extends Error {
  constructor(message, code, statusCode, details = {}) {
    super(message);
    this.name = 'UAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * UAPI 客户端服务
 */
class UAPIService {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.UAPI_API_KEY;
    this.client = axios.create({
      baseURL: UAPI_BASE_URL,
      timeout: UAPI_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FraudDetectionPlatform/1.0'
      }
    });

    // 添加请求拦截器
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      return config;
    });

    // 添加响应拦截器
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );

    console.log(`✅ UAPI客户端初始化${this.apiKey ? '成功 (已配置API密钥)' : '成功 (使用免费额度)'}`);
  }

  /**
   * 统一错误处理
   */
  handleError(error) {
    if (error.response) {
      // HTTP 错误响应
      const { status, data } = error.response;
      const code = data?.code || 'UNKNOWN_ERROR';
      const message = data?.message || error.message;
      const details = data?.details || {};

      throw new UAPIError(message, code, status, details);
    } else if (error.request) {
      // 网络错误
      throw new UAPIError(
        '网络请求失败，请检查网络连接',
        'NETWORK_ERROR',
        0,
        { originalError: error.message }
      );
    } else {
      // 其他错误
      throw new UAPIError(
        error.message || '未知错误',
        'UNKNOWN_ERROR',
        0
      );
    }
  }

  /**
   * 带重试的请求方法
   */
  async requestWithRetry(method, url, data = null, params = null, retries = MAX_RETRIES) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const config = { params };
        if (data) {
          config.data = data;
        }

        const response = await this.client.request({
          method,
          url,
          ...config
        });

        return response.data;
      } catch (error) {
        lastError = error;

        // 不重试客户端错误 (4xx)
        if (error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // 限流错误 (429) 使用更长的延迟
        if (error.statusCode === 429) {
          const delay = RETRY_DELAY * Math.pow(2, attempt);
          console.warn(`⚠️ UAPI限流,${delay}ms后重试 (${attempt}/${retries})`);
          await this.sleep(delay);
          continue;
        }

        // 服务器错误 (5xx) 或网络错误才重试
        if (attempt < retries) {
          const delay = RETRY_DELAY * attempt;
          console.warn(`⚠️ UAPI请求失败,${delay}ms后重试 (${attempt}/${retries}): ${error.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 延迟辅助函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 查询热榜 - 默认模式
   * @param {string} type - 热榜平台类型
   * @returns {Promise<Object>} 热榜数据
   */
  async getHotboard(type) {
    try {
      const data = await this.requestWithRetry(
        'GET',
        '/misc/hotboard',
        null,
        { type }
      );

      return {
        success: true,
        type,
        updateTime: data.update_time,
        list: data.list || [],
        source: 'uapi',
        mode: 'realtime'
      };
    } catch (error) {
      console.error(`❌ 获取${type}热榜失败:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code,
        type
      };
    }
  }

  /**
   * 查询热榜 - 时光机模式
   * @param {string} type - 热榜平台类型
   * @param {number} time - 毫秒时间戳
   * @returns {Promise<Object>} 历史热榜数据
   */
  async getHotboardSnapshot(type, time) {
    try {
      const data = await this.requestWithRetry(
        'GET',
        '/misc/hotboard',
        null,
        { type, time }
      );

      return {
        success: true,
        type,
        updateTime: data.update_time,
        snapshotTime: data.snapshot_time,
        list: data.list || [],
        source: 'uapi',
        mode: 'snapshot'
      };
    } catch (error) {
      console.error(`❌ 获取${type}历史热榜失败:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code,
        type,
        time
      };
    }
  }

  /**
   * 查询热榜 - 搜索模式
   * @param {string} type - 热榜平台类型
   * @param {string} keyword - 搜索关键词
   * @param {number} timeStart - 起始时间戳(毫秒)
   * @param {number} timeEnd - 结束时间戳(毫秒)
   * @param {number} limit - 最大返回条数(默认50,最大200)
   * @returns {Promise<Object>} 搜索结果
   */
  async searchHotboard(type, keyword, timeStart, timeEnd, limit = 50) {
    try {
      // 参数校验
      if (!keyword || keyword.trim().length === 0) {
        throw new UAPIError('搜索关键词不能为空', 'INVALID_ARGUMENT', 400);
      }

      if (timeEnd <= timeStart) {
        throw new UAPIError('结束时间必须晚于起始时间', 'INVALID_ARGUMENT', 400);
      }

      if (limit < 1 || limit > 200) {
        throw new UAPIError('limit必须在1-200之间', 'INVALID_ARGUMENT', 400);
      }

      const data = await this.requestWithRetry(
        'GET',
        '/misc/hotboard',
        null,
        {
          type,
          keyword,
          time_start: timeStart,
          time_end: timeEnd,
          limit
        }
      );

      return {
        success: true,
        type,
        keyword,
        count: data.count || 0,
        results: data.results || [],
        source: 'uapi',
        mode: 'search'
      };
    } catch (error) {
      console.error(`❌ 搜索${type}热榜失败:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code,
        type,
        keyword
      };
    }
  }

  /**
   * 批量获取多个平台的热榜
   * @param {Array<string>} types - 平台类型数组
   * @returns {Promise<Array>} 各平台热榜数据
   */
  async batchGetHotboards(types) {
    const results = await Promise.allSettled(
      types.map(type => this.getHotboard(type))
    );

    return results.map((result, index) => ({
      type: types[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }

  /**
   * 获取当前IP信息
   * @returns {Promise<Object>} IP信息
   */
  async getMyIP() {
    try {
      const data = await this.requestWithRetry('GET', '/network/myip');

      return {
        success: true,
        data,
        source: 'uapi'
      };
    } catch (error) {
      console.error('❌ 获取IP信息失败:', error.message);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 查询指定IP信息
   * @param {string} ip - IP地址
   * @returns {Promise<Object>} IP信息
   */
  async queryIP(ip) {
    try {
      // 简单的IP格式校验
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
        throw new UAPIError('无效的IP地址格式', 'INVALID_ARGUMENT', 400);
      }

      const data = await this.requestWithRetry(
        'GET',
        '/network/ip',
        null,
        { ip }
      );

      return {
        success: true,
        ip,
        data,
        source: 'uapi'
      };
    } catch (error) {
      console.error(`❌ 查询IP ${ip} 失败:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code,
        ip
      };
    }
  }

  /**
   * 获取支持的热榜平台列表
   * @returns {Array<Object>} 平台列表
   */
  getSupportedPlatforms() {
    return [
      { type: 'weibo', name: '微博热搜', category: '社交媒体' },
      { type: 'zhihu', name: '知乎热榜', category: '社交媒体' },
      { type: 'bilibili', name: 'B站热门', category: '视频平台' },
      { type: 'douyin', name: '抖音热点', category: '视频平台' },
      { type: 'xiaohongshu', name: '小红书热门', category: '社交媒体' },
      { type: 'baidu', name: '百度热搜', category: '搜索引擎' },
      { type: 'toutiao', name: '今日头条', category: '新闻资讯' },
      { type: 'thepaper', name: '澎湃新闻', category: '新闻资讯' },
      { type: 'sina-news', name: '新浪新闻', category: '新闻资讯' },
      { type: '36kr', name: '36氪', category: '科技商业' },
      { type: 'ithome', name: 'IT之家', category: '科技' },
      { type: 'juejin', name: '掘金', category: '技术社区' },
      { type: 'csdn', name: 'CSDN', category: '技术社区' },
      { type: 'v2ex', name: 'V2EX', category: '技术社区' },
      { type: 'github', name: 'GitHub Trending', category: '开发者' }
    ];
  }

  /**
   * 风险检测辅助 - 分析热榜中的关键词
   * @param {string} type - 平台类型
   * @param {Array<string>} keywords - 风险关键词列表
   * @returns {Promise<Object>} 匹配结果
   */
  async detectRiskKeywords(type, keywords) {
    try {
      const hotboardData = await this.getHotboard(type);

      if (!hotboardData.success) {
        return hotboardData;
      }

      const matches = [];
      const list = hotboardData.list || [];

      for (const item of list) {
        const title = item.title || '';
        const matchedKeywords = keywords.filter(kw =>
          title.toLowerCase().includes(kw.toLowerCase())
        );

        if (matchedKeywords.length > 0) {
          matches.push({
            ...item,
            matchedKeywords,
            riskLevel: matchedKeywords.length >= 2 ? 'high' : 'medium'
          });
        }
      }

      return {
        success: true,
        type,
        totalItems: list.length,
        matchCount: matches.length,
        matches,
        keywords,
        updateTime: hotboardData.updateTime
      };
    } catch (error) {
      console.error(`❌ 风险关键词检测失败:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code,
        type,
        keywords
      };
    }
  }
}

export default UAPIService;
