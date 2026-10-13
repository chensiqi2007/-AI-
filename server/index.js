import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import UAPIService from './services/uapiService.js';
import XueqiuService from './services/xueqiuService.js';
import { createSession, attachSession, destroySession, requireAuth, verifyCredentials, requireAdmin, getUrltimeAuthUrl, exchangeCodeForToken, getUrltimeUserInfo, isUrltimeSSOConfigured, createSsoState, consumeSsoState } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize UAPI Service
const uapiService = new UAPIService();

// Initialize Xueqiu Service
const xueqiuService = new XueqiuService();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// In-memory storage for demo (in production, use a database)
let settings = {
  theme: 'light',
  modelType: process.env.DEFAULT_MODEL_TYPE || 'local',
  localModel: {
    baseUrl: process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434',
    modelName: process.env.LOCAL_MODEL_NAME || 'qwen2.5:latest',
    apiKey: process.env.LOCAL_MODEL_API_KEY || '',
  },
  cloudModel: {
    baseUrl: process.env.CLOUD_MODEL_BASE_URL || 'https://api.openai.com/v1',
    modelName: process.env.CLOUD_MODEL_NAME || 'gpt-4',
    apiKey: process.env.CLOUD_MODEL_API_KEY || '',
  },
  thinkingEffort: process.env.DEFAULT_THINKING_EFFORT || 'medium',
  temperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.7,
  maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS) || 2000,
};

// Mock alert data
let alerts = [
  {
    id: 'alert1',
    title: '检测到疑似资金闭环交易',
    description: '交易对手"鑫盛贸易有限公司"在T+7日内,采购款经3层中间主体最终回流至销售客户账户,闭环置信度92%',
    level: 'high',
    department: '大宗贸易部',
    amount: 23500000,
    timestamp: new Date().toISOString(),
    status: 'pending'
  },
  {
    id: 'alert2',
    title: '发现多层股权穿透关联关系',
    description: '上游供应商"华泰国际贸易"与下游客户"盛达物资"通过4层股权关系实际受同一自然人控制',
    level: 'high',
    department: '国际贸易部',
    amount: 41200000,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    status: 'pending'
  },
  {
    id: 'alert3',
    title: '仓单静态空转风险提示',
    description: '批次号"WH20261008-A523"货物在30天内产生5次仓单流转,但物流定位显示货物未发生实际移动',
    level: 'medium',
    department: '供应链金融部',
    amount: 15800000,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    status: 'pending'
  }
];

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  // Don't send API keys to frontend
  const safeSetting = {
    ...settings,
    localModel: { ...settings.localModel, apiKey: settings.localModel.apiKey ? '***' : '' },
    cloudModel: { ...settings.cloudModel, apiKey: settings.cloudModel.apiKey ? '***' : '' }
  };
  res.json(safeSetting);
});

app.put('/api/settings', (req, res) => {
  const updates = req.body;
  
  // Merge updates with existing settings
  if (updates.theme) settings.theme = updates.theme;
  if (updates.modelType) settings.modelType = updates.modelType;
  if (updates.thinkingEffort) settings.thinkingEffort = updates.thinkingEffort;
  if (updates.temperature !== undefined) settings.temperature = updates.temperature;
  if (updates.maxTokens !== undefined) settings.maxTokens = updates.maxTokens;
  
  if (updates.localModel) {
    settings.localModel = { ...settings.localModel, ...updates.localModel };
  }
  
  if (updates.cloudModel) {
    settings.cloudModel = { ...settings.cloudModel, ...updates.cloudModel };
  }
  
  res.json({ success: true, message: '设置已更新' });
});

// Alerts endpoints
app.get('/api/alerts', (req, res) => {
  const { level, status } = req.query;
  let filteredAlerts = [...alerts];
  
  if (level && level !== 'all') {
    filteredAlerts = filteredAlerts.filter(a => a.level === level);
  }
  
  if (status) {
    filteredAlerts = filteredAlerts.filter(a => a.status === status);
  }
  
  res.json(filteredAlerts);
});

app.get('/api/alerts/:id', (req, res) => {
  const alert = alerts.find(a => a.id === req.params.id);
  if (!alert) {
    return res.status(404).json({ error: '预警不存在' });
  }
  res.json(alert);
});

app.put('/api/alerts/:id/status', (req, res) => {
  const { status } = req.body;
  const alert = alerts.find(a => a.id === req.params.id);
  
  if (!alert) {
    return res.status(404).json({ error: '预警不存在' });
  }
  
  alert.status = status;
  res.json({ success: true, alert });
});

// Statistics endpoint
app.get('/api/statistics', (req, res) => {
  const stats = {
    highRisk: alerts.filter(a => a.level === 'high' && a.status === 'pending').length,
    mediumRisk: alerts.filter(a => a.level === 'medium' && a.status === 'pending').length,
    lowRisk: alerts.filter(a => a.level === 'low' && a.status === 'pending').length,
    todayScanned: 1247,
    blockedAmount: 86500000,
    trend: [18, 24, 21, 15, 28, 33, 40]
  };
  
  res.json(stats);
});

// AI Analysis endpoint
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.admin.username, role: req.admin.role, source: req.admin.source } });
});
app.post('/api/auth/logout', (req, res) => { destroySession(req, res); res.json({ success: true }); });

app.post('/api/analyze', requireAuth, async (req, res) => {
  try {
    const { prompt, context } = req.body;
    const currentModel = settings.modelType === 'local' ? settings.localModel : settings.cloudModel;
    
    // Construct the API request based on model type
    const apiUrl = `${currentModel.baseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (currentModel.apiKey) {
      headers['Authorization'] = `Bearer ${currentModel.apiKey}`;
    }
    
    const requestData = {
      model: currentModel.modelName,
      messages: [
        {
          role: 'system',
          content: '你是虚假贸易AI风险预警平台的智能分析助手。请基于提供的数据进行专业的风险分析。'
        },
        {
          role: 'user',
          content: prompt + (context ? `\n\n上下文信息: ${JSON.stringify(context)}` : '')
        }
      ],
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
    };
    
    // Add thinking effort for compatible models
    if (settings.thinkingEffort && settings.modelType === 'cloud') {
      requestData.thinking = settings.thinkingEffort;
    }
    
    const response = await axios.post(apiUrl, requestData, { 
      headers,
      timeout: 60000 
    });
    
    res.json({
      success: true,
      analysis: response.data.choices[0].message.content,
      model: currentModel.modelName,
      modelType: settings.modelType
    });
    
  } catch (error) {
    console.error('AI Analysis error:', error.message);
    res.status(500).json({
      success: false,
      error: '分析失败',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

// Network graph data
app.get('/api/network-graph', (req, res) => {
  const graphData = {
    nodes: [
      { id: 'core', label: '核心企业', type: 'core', x: 0.5, y: 0.5 },
      { id: 'supplier1', label: '供应商A', type: 'supplier', x: 0.2, y: 0.3 },
      { id: 'supplier2', label: '供应商B', type: 'supplier', x: 0.25, y: 0.7 },
      { id: 'customer1', label: '客户X', type: 'customer', x: 0.75, y: 0.25 },
      { id: 'customer2', label: '客户Y', type: 'customer', x: 0.8, y: 0.65 },
      { id: 'middle1', label: '中间商1', type: 'suspicious', x: 0.4, y: 0.2 },
      { id: 'middle2', label: '中间商2', type: 'suspicious', x: 0.6, y: 0.75 }
    ],
    edges: [
      { from: 'supplier1', to: 'core', suspicious: false },
      { from: 'supplier2', to: 'middle2', suspicious: true },
      { from: 'middle2', to: 'core', suspicious: true },
      { from: 'core', to: 'customer1', suspicious: false },
      { from: 'core', to: 'middle1', suspicious: true },
      { from: 'middle1', to: 'customer2', suspicious: true },
      { from: 'customer2', to: 'supplier1', suspicious: true }
    ]
  };
  
  res.json(graphData);
});

// ==================== UAPI Endpoints ====================

// 获取热榜 - 默认模式
app.get('/api/uapi/hotboard/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const result = await uapiService.getHotboard(type);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.code === 'INVALID_ARGUMENT' ? 400 : 502).json(result);
    }
  } catch (error) {
    console.error('热榜查询错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取热榜 - 时光机模式
app.get('/api/uapi/hotboard/:type/snapshot', async (req, res) => {
  try {
    const { type } = req.params;
    const { time } = req.query;
    
    if (!time) {
      return res.status(400).json({
        success: false,
        error: '缺少time参数'
      });
    }
    
    const result = await uapiService.getHotboardSnapshot(type, parseInt(time));
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.code === 'INVALID_ARGUMENT' ? 400 : 502).json(result);
    }
  } catch (error) {
    console.error('历史热榜查询错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 搜索热榜
app.get('/api/uapi/hotboard/:type/search', async (req, res) => {
  try {
    const { type } = req.params;
    const { keyword, time_start, time_end, limit } = req.query;
    
    if (!keyword || !time_start || !time_end) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: keyword, time_start, time_end'
      });
    }
    
    const result = await uapiService.searchHotboard(
      type,
      keyword,
      parseInt(time_start),
      parseInt(time_end),
      limit ? parseInt(limit) : 50
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.code === 'INVALID_ARGUMENT' ? 400 : 502).json(result);
    }
  } catch (error) {
    console.error('热榜搜索错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 批量获取多个平台热榜
app.post('/api/uapi/hotboard/batch', async (req, res) => {
  try {
    const { types } = req.body;
    
    if (!types || !Array.isArray(types) || types.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'types必须是非空数组'
      });
    }
    
    const results = await uapiService.batchGetHotboards(types);
    res.json({ success: true, results });
  } catch (error) {
    console.error('批量热榜查询错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取支持的平台列表
app.get('/api/uapi/platforms', (req, res) => {
  const platforms = uapiService.getSupportedPlatforms();
  res.json({
    success: true,
    count: platforms.length,
    platforms
  });
});

// 获取当前IP信息
app.get('/api/uapi/myip', async (req, res) => {
  try {
    const result = await uapiService.getMyIP();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(502).json(result);
    }
  } catch (error) {
    console.error('IP查询错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 查询指定IP
app.get('/api/uapi/ip/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    const result = await uapiService.queryIP(ip);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.code === 'INVALID_ARGUMENT' ? 400 : 502).json(result);
    }
  } catch (error) {
    console.error('IP查询错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 风险关键词检测
app.post('/api/uapi/detect-risk', async (req, res) => {
  try {
    const { type, keywords } = req.body;
    
    if (!type || !keywords || !Array.isArray(keywords)) {
      return res.status(400).json({
        success: false,
        error: 'type和keywords(数组)为必填参数'
      });
    }
    
    const result = await uapiService.detectRiskKeywords(type, keywords);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(502).json(result);
    }
  } catch (error) {
    console.error('风险检测错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Xueqiu Endpoints ====================

// 获取股票综合财务分析
app.get('/api/xueqiu/comprehensive/:scode', async (req, res) => {
  try {
    const { scode } = req.params;
    const result = await xueqiuService.comprehensiveAnalysis(scode);
    res.json(result);
  } catch (error) {
    console.error('雪球综合分析错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取股票报价
app.get('/api/xueqiu/quote/:scode', async (req, res) => {
  try {
    const { scode } = req.params;
    const result = await xueqiuService.getQuote(scode);
    res.json(result);
  } catch (error) {
    console.error('雪球报价查询错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 批量分析多个股票
app.post('/api/xueqiu/batch-analysis', async (req, res) => {
  try {
    const { scodes } = req.body;
    if (!scodes || !Array.isArray(scodes)) {
      return res.status(400).json({
        success: false,
        error: 'scodes必须是数组'
      });
    }
    const results = await xueqiuService.batchAnalysis(scodes);
    res.json({ success: true, results });
  } catch (error) {
    console.error('批量分析错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Admin Endpoints ====================

// Admin login
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }
    
    if (verifyCredentials(username, password)) {
      const token = createSession({ username, role: 'admin', source: 'local' });
      attachSession(res, token);
      res.json({
        success: true,
        message: '登录成功'
      });
    } else {
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get URLTime SSO status
app.get('/api/auth/sso-status', (req, res) => {
  res.json({
    success: true,
    enabled: isUrltimeSSOConfigured()
  });
});

// Initiate URLTime SSO login
app.get('/api/auth/sso-login', (req, res) => {
  if (!isUrltimeSSOConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'URLTime SSO未配置'
    });
  }
  const state = createSsoState(res, req.query.returnTo || '/');
  const authUrl = getUrltimeAuthUrl(state);
  res.json({ success: true, authUrl, state });
});

// URLTime SSO callback
app.get('/api/auth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  if (error) {
    return res.redirect(`/admin.html?error=${encodeURIComponent(error_description || error)}`);
  }
  
  if (!code) {
    return res.redirect('/admin.html?error=missing_code');
  }
  const stateData = consumeSsoState(req, res, state);
  if (!stateData) return res.redirect('/admin.html?error=invalid_sso_state');
  
  const tokenResult = await exchangeCodeForToken(code);
  if (!tokenResult.success) {
    return res.redirect(`/admin.html?error=${encodeURIComponent(tokenResult.error)}`);
  }
  
  const userResult = await getUrltimeUserInfo(tokenResult.data.access_token);
  if (!userResult.success) {
    return res.redirect(`/admin.html?error=${encodeURIComponent(userResult.error)}`);
  }
  
  const user = userResult.user;
  const role = (user.groups && user.groups.includes('admin')) ? 'admin' : 'user';
  const token = createSession({ username: user.email || user.username, role, source: 'urltime' });
  attachSession(res, token);
  res.redirect(stateData.returnTo || '/');
});

// Get system statistics (admin only)
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = {
      totalAlerts: alerts.length,
      pendingAlerts: alerts.filter(a => a.status === 'pending').length,
      resolvedAlerts: alerts.filter(a => a.status === 'resolved').length,
      systemUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      currentSettings: settings,
      apiStatus: {
        uapi: uapiService ? 'active' : 'inactive',
        xueqiu: xueqiuService ? 'active' : 'inactive'
      }
    };
    res.json({ success: true, stats });
  } catch (error) {
    console.error('获取系统统计错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get configuration (admin only)
app.get('/api/admin/config', requireAdmin, (req, res) => {
  try {
    const config = {
      ...settings,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: PORT,
        hasUapiKey: !!process.env.UAPI_API_KEY
      }
    };
    res.json({ success: true, config });
  } catch (error) {
    console.error('获取配置错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update configuration (admin only)
app.put('/api/admin/config', requireAdmin, (req, res) => {
  try {
    const { theme, modelType, modelConfig, riskThreshold } = req.body;
    
    if (theme) settings.theme = theme;
    if (modelType) settings.modelType = modelType;
    if (modelConfig) settings.modelConfig = { ...settings.modelConfig, ...modelConfig };
    if (riskThreshold !== undefined) settings.riskThreshold = riskThreshold;
    
    res.json({
      success: true,
      message: '配置更新成功',
      settings
    });
  } catch (error) {
    console.error('更新配置错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get audit logs (admin only)
app.get('/api/admin/logs', requireAdmin, (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    // Mock audit logs (in production, fetch from database)
    const logs = [
      { id: 1, timestamp: new Date(), action: '配置更新', user: 'admin', details: '主题切换为深色模式' },
      { id: 2, timestamp: new Date(Date.now() - 3600000), action: '警报处理', user: 'admin', details: '处理警报 #ALT-001' },
      { id: 3, timestamp: new Date(Date.now() - 7200000), action: '系统登录', user: 'admin', details: '管理员登录' }
    ];
    
    res.json({
      success: true,
      logs: logs.slice(Number(offset), Number(offset) + Number(limit)),
      total: logs.length
    });
  } catch (error) {
    console.error('获取日志错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 虚假贸易AI风险预警平台后端服务启动成功`);
  console.log(`📡 服务器运行在: http://localhost:${PORT}`);
  console.log(`🔧 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 默认模型类型: ${settings.modelType}`);
  console.log(`✅ 雪球API客户端已就绪`);
});
