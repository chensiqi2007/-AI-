// Xueqiu API Service - Bridge layer for ES modules
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Import xueqiu modules (CommonJS)
const XueqiuInit = require('../xueqiu/init.cjs');

/**
 * 雪球API服务
 * 提供股票数据、财务报表、行业对比等金融数据分析能力
 */
class XueqiuService {
  constructor(token = null) {
    this.token = token;
    this.client = null;
    this.initClient();
  }

  initClient() {
    try {
      this.client = XueqiuInit({
        token: this.token,
        maxConcurrent: 3,
        retry: 3,
        retryIsJump: false
      });
      console.log('✅ 雪球API客户端初始化成功');
    } catch (error) {
      console.error('❌ 雪球API初始化失败:', error.message);
    }
  }

  /**
   * 获取股票主要指标
   * @param {string} scode - 股票代码 (如: 603585)
   * @param {string} type - 报表类型 (Q1/Q2/Q3/Q4/all)
   * @returns {Promise<Array>} 指标数据
   */
  async getIndicator(scode, type = 'Q4') {
    try {
      const data = await this.client.finance.indicator({ scode, type });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode,
        type
      };
    } catch (error) {
      console.error(`获取${scode}指标失败:`, error.message);
      return {
        success: false,
        error: error.message,
        scode,
        type
      };
    }
  }

  /**
   * 获取利润表
   */
  async getIncome(scode, type = 'Q4') {
    try {
      const data = await this.client.finance.income({ scode, type });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode,
        type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode,
        type
      };
    }
  }

  /**
   * 获取资产负债表
   */
  async getBalance(scode, type = 'Q4') {
    try {
      const data = await this.client.finance.balance({ scode, type });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode,
        type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode,
        type
      };
    }
  }

  /**
   * 获取现金流量表
   */
  async getCashFlow(scode, type = 'Q4') {
    try {
      const data = await this.client.finance.cashFlow({ scode, type });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode,
        type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode,
        type
      };
    }
  }

  /**
   * 获取主营业务构成
   */
  async getBusiness(scode, type = 'Q4') {
    try {
      const data = await this.client.finance.business({ scode, type });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode,
        type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode,
        type
      };
    }
  }

  /**
   * 获取行业对比数据
   */
  async getIndustryCompare(scode) {
    try {
      const data = await this.client.f10.industryCompare({ scode });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode
      };
    }
  }

  /**
   * 获取股票报价
   */
  async getQuote(scode, extend = 'detail') {
    try {
      const data = await this.client.stock.quote({ scode, extend });
      return {
        success: true,
        data,
        source: 'xueqiu',
        scode
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode
      };
    }
  }

  /**
   * 综合财务分析 - 用于风险检测
   * @param {string} scode - 股票代码
   * @returns {Promise<Object>} 综合分析结果
   */
  async comprehensiveAnalysis(scode) {
    try {
      const [indicator, income, balance, cashFlow, industryCompare] = await Promise.allSettled([
        this.getIndicator(scode),
        this.getIncome(scode),
        this.getBalance(scode),
        this.getCashFlow(scode),
        this.getIndustryCompare(scode)
      ]);

      return {
        success: true,
        scode,
        timestamp: new Date().toISOString(),
        data: {
          indicator: indicator.status === 'fulfilled' ? indicator.value : null,
          income: income.status === 'fulfilled' ? income.value : null,
          balance: balance.status === 'fulfilled' ? balance.value : null,
          cashFlow: cashFlow.status === 'fulfilled' ? cashFlow.value : null,
          industryCompare: industryCompare.status === 'fulfilled' ? industryCompare.value : null
        },
        riskIndicators: this.calculateRiskIndicators(
          indicator.status === 'fulfilled' ? indicator.value.data : null,
          income.status === 'fulfilled' ? income.value.data : null,
          balance.status === 'fulfilled' ? balance.value.data : null
        )
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scode
      };
    }
  }

  /**
   * 计算风险指标
   * 基于财务数据识别异常模式
   */
  calculateRiskIndicators(indicator, income, balance) {
    const risks = {
      overall: 'low',
      flags: []
    };

    if (!indicator || !indicator[0]) return risks;

    const latest = indicator[0];

    // 资产负债率异常高
    if (latest.assetLiabRatio && latest.assetLiabRatio[0] > 70) {
      risks.flags.push({
        type: 'high_debt',
        severity: 'high',
        value: latest.assetLiabRatio[0],
        message: '资产负债率过高，财务风险较大'
      });
      risks.overall = 'high';
    }

    // 净利润大幅下滑
    if (latest.netProfitAtsopcYoy && latest.netProfitAtsopcYoy[0] < -30) {
      risks.flags.push({
        type: 'profit_decline',
        severity: 'medium',
        value: latest.netProfitAtsopcYoy[0],
        message: '净利润同比大幅下滑'
      });
      if (risks.overall === 'low') risks.overall = 'medium';
    }

    // 营收与净利润背离
    if (latest.operatingIncomeYoy && latest.netProfitAtsopcYoy) {
      const revGrowth = latest.operatingIncomeYoy[0];
      const profitGrowth = latest.netProfitAtsopcYoy[0];
      if (Math.abs(revGrowth - profitGrowth) > 20) {
        risks.flags.push({
          type: 'revenue_profit_divergence',
          severity: 'medium',
          message: '营收增长与利润增长严重背离，需关注利润质量'
        });
        if (risks.overall === 'low') risks.overall = 'medium';
      }
    }

    // 现金流异常
    if (latest.ncfFromOaToTotalLiab && latest.ncfFromOaToTotalLiab[0] < 0.5) {
      risks.flags.push({
        type: 'weak_cashflow',
        severity: 'medium',
        value: latest.ncfFromOaToTotalLiab[0],
        message: '经营现金流偏弱，偿债能力存疑'
      });
      if (risks.overall === 'low') risks.overall = 'medium';
    }

    return risks;
  }

  /**
   * 批量分析多个股票
   */
  async batchAnalysis(scodes) {
    const results = await Promise.allSettled(
      scodes.map(scode => this.comprehensiveAnalysis(scode))
    );

    return results.map((result, index) => ({
      scode: scodes[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }
}

export default XueqiuService;
