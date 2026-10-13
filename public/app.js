// Configuration
const API_BASE_URL = window.location.origin;
let currentUser = null;

function renderAccount() {
    document.getElementById('account-button').textContent = currentUser ? '退出登录' : '登录';
    document.getElementById('ai-auth-status').textContent = currentUser ? '已登录：' + currentUser.username : '登录后可使用 AI 分析';
}

async function refreshAccount() {
    currentUser = null;
    try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (response.ok) currentUser = (await response.json()).user;
    } catch { /* Retry authentication on the next action. */ }
    renderAccount();
}

function goToLogin() {
    sessionStorage.setItem('ai_prompt_draft', document.getElementById('analysisPrompt').value);
    const target = location.pathname + location.search + '#analysis';
    location.assign('/admin.html?returnTo=' + encodeURIComponent(target));
}

function handleAccount() {
    if (!currentUser) return goToLogin();
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    currentUser = null;
    document.getElementById('analysisResult').textContent = '';
    renderAccount();
}

// Application State
let appState = {
    currentView: 'dashboard',
    theme: 'light',
    settings: {},
    alerts: [],
    statistics: {},
    networkGraph: null,
    hotboards: {},
    xueqiuData: {}
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    refreshAccount();
    const draft = sessionStorage.getItem('ai_prompt_draft');
    if (draft !== null) {
        document.getElementById('analysisPrompt').value = draft;
        sessionStorage.removeItem('ai_prompt_draft');
    }
    if (location.hash === '#analysis') showView('analysis');
    await loadSettings();
    await loadStatistics();
    await loadAlerts();
    await loadNetworkGraph();
    await loadHotboards();
    await loadXueqiuData();
    initializeEventListeners();
    renderTrendChart();
    
    // Auto-refresh data every 30 seconds
    setInterval(async () => {
        await loadStatistics();
        await loadAlerts();
        await loadHotboards();
    }, 30000);
});

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/settings`);
        if (response.ok) {
            appState.settings = await response.json();
            applyTheme(appState.settings.theme);
            updateSettingsUI();
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Load Statistics
async function loadStatistics() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/statistics`);
        if (response.ok) {
            appState.statistics = await response.json();
            updateStatistics();
        }
    } catch (error) {
        console.error('Failed to load statistics:', error);
    }
}

// Load Alerts
async function loadAlerts(level = 'all') {
    try {
        const url = level === 'all' 
            ? `${API_BASE_URL}/api/alerts` 
            : `${API_BASE_URL}/api/alerts?level=${level}`;
        const response = await fetch(url);
        if (response.ok) {
            appState.alerts = await response.json();
            renderAlerts();
        }
    } catch (error) {
        console.error('Failed to load alerts:', error);
    }
}

// Load Network Graph
async function loadNetworkGraph() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/network-graph`);
        if (response.ok) {
            appState.networkGraph = await response.json();
            // Don't render immediately - wait until user switches to network view
        }
    } catch (error) {
        console.error('Failed to load network graph:', error);
    }
}

// Update Statistics Display
function updateStatistics() {
    const stats = appState.statistics;
    document.getElementById('highRiskCount').textContent = stats.highRisk || 0;
    document.getElementById('mediumRiskCount').textContent = stats.mediumRisk || 0;
    document.getElementById('todayScanned').textContent = (stats.todayScanned || 0).toLocaleString();
    document.getElementById('blockedAmount').textContent = Math.round((stats.blockedAmount || 0) / 10000).toLocaleString();
}

// Render Alerts
function renderAlerts() {
    const container = document.getElementById('alertsList');
    if (!container) return;
    
    if (appState.alerts.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 60px 20px;">
                <p style="color: var(--text-secondary); font-size: 16px;">暂无预警信息</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appState.alerts.map(alert => `
        <div class="alert-item ${alert.level}" data-alert-id="${alert.id}">
            <div class="alert-header">
                <div class="alert-title">${alert.title}</div>
                <span class="alert-level ${alert.level}">${getLevelText(alert.level)}</span>
            </div>
            <div class="alert-description">${alert.description}</div>
            <div class="alert-meta">
                <span>🏢 ${alert.department}</span>
                <span>💵 ${(alert.amount / 10000).toFixed(0)}万元</span>
                <span>⏰ ${formatTimestamp(alert.timestamp)}</span>
            </div>
            <div class="alert-actions">
                <button class="btn btn-primary btn-small" onclick="viewAlertDetail('${alert.id}')">
                    查看详情
                </button>
                <button class="btn btn-secondary btn-small" onclick="handleAlert('${alert.id}')">
                    ${alert.status === 'pending' ? '标记处理' : '已处理'}
                </button>
            </div>
        </div>
    `).join('');
}

// Render Network Graph
function renderNetworkGraph() {
    const container = document.getElementById('networkGraph');
    if (!container || !appState.networkGraph) return;
    
    // Clear container and force explicit dimensions
    container.innerHTML = '';
    container.style.minHeight = '500px';
    container.style.height = '500px';
    container.style.width = '100%';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    
    // Force a reflow to ensure dimensions are applied
    void container.offsetHeight;
    
    // Get actual container dimensions
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 800);
    const height = 500;
    
    console.log('Network graph container dimensions:', {width, height, rectWidth: rect.width});
    
    const { nodes, edges } = appState.networkGraph;
    
    // Draw edges
    edges.forEach(edge => {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        
        if (fromNode && toNode) {
            const line = document.createElement('div');
            line.className = `connection-line ${edge.suspicious ? 'suspicious' : ''}`;
            
            const x1 = fromNode.x * width;
            const y1 = fromNode.y * height;
            const x2 = toNode.x * width;
            const y2 = toNode.y * height;
            
            const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
            
            line.style.width = length + 'px';
            line.style.left = x1 + 'px';
            line.style.top = y1 + 'px';
            line.style.transform = `rotate(${angle}deg)`;
            line.style.position = 'absolute';
            line.style.height = edge.suspicious ? '3px' : '2px';
            line.style.background = edge.suspicious ? '#ed8936' : '#cbd5e0';
            line.style.transformOrigin = '0 0';
            
            container.appendChild(line);
        }
    });
    
    // Draw nodes
    nodes.forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'node ' + node.type;
        nodeEl.textContent = node.label;
        
        // Set explicit dimensions for proper rendering
        const nodeWidth = node.type === 'core' ? 80 : 60;
        const nodeHeight = node.type === 'core' ? 80 : 60;
        
        nodeEl.style.position = 'absolute';
        nodeEl.style.width = nodeWidth + 'px';
        nodeEl.style.height = nodeHeight + 'px';
        nodeEl.style.left = (node.x * width - nodeWidth / 2) + 'px';
        nodeEl.style.top = (node.y * height - nodeHeight / 2) + 'px';
        nodeEl.onclick = () => showNodeDetail(node);
        container.appendChild(nodeEl);
    });
}

// CSS for network nodes
const networkStyles = `
.node {
    position: absolute;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px var(--shadow);
    text-align: center;
    padding: 5px;
}

.node:hover {
    transform: scale(1.2);
    box-shadow: 0 6px 20px var(--shadow-hover);
}

.node.core {
    background: #f56565;
    width: 80px;
    height: 80px;
    font-size: 13px;
}

.node.supplier {
    background: #4299e1;
}

.node.customer {
    background: #48bb78;
}

.node.suspicious {
    background: #ed8936;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% {
        box-shadow: 0 4px 12px rgba(237, 137, 54, 0.4);
    }
    50% {
        box-shadow: 0 4px 24px rgba(237, 137, 54, 0.8);
    }
}
`;

// Add network styles to document
if (!document.getElementById('network-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'network-styles';
    styleEl.textContent = networkStyles;
    document.head.appendChild(styleEl);
}

// Render Trend Chart
function renderTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const data = appState.statistics.trend || [18, 24, 21, 15, 28, 33, 40];
    const labels = ['10/03', '10/04', '10/05', '10/06', '10/07', '10/08', '10/09'];
    
    const padding = 40;
    const chartWidth = rect.width - padding * 2;
    const chartHeight = rect.height - padding * 2;
    const barWidth = chartWidth / data.length - 10;
    const maxValue = Math.max(...data);
    
    // Draw bars
    data.forEach((value, index) => {
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + index * (barWidth + 10);
        const y = rect.height - padding - barHeight;
        
        // Gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Value label
        ctx.fillStyle = 'var(--text-primary)';
        ctx.font = '14px -apple-system';
        ctx.textAlign = 'center';
        ctx.fillText(value.toString(), x + barWidth / 2, y - 5);
        
        // Date label
        ctx.fillStyle = 'var(--text-secondary)';
        ctx.font = '12px -apple-system';
        ctx.fillText(labels[index], x + barWidth / 2, rect.height - padding + 20);
    });
}

// Event Listeners
function initializeEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const level = this.dataset.level;
            loadAlerts(level === 'all' ? undefined : level);
        });
    });
    
    // Segmented control for model type
    document.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const modelType = this.dataset.model;
            document.getElementById('localModelConfig').style.display = 
                modelType === 'local' ? 'block' : 'none';
            document.getElementById('cloudModelConfig').style.display = 
                modelType === 'cloud' ? 'block' : 'none';
        });
    });
}

// View Management
function showView(viewName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('onclick') === "showView('" + viewName + "')") item.classList.add('active');
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(viewName + '-view')?.classList.add('active');
    
    appState.currentView = viewName;
    
    // Render network graph when switching to network view
    if (viewName === 'network' && appState.networkGraph) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            setTimeout(renderNetworkGraph, 50);
        });
    }
    
    // Render hotboard when switching to hotboard view
    if (viewName === 'hotboard') {
        renderHotboards();
    }
    
    // Render financial data when switching to financial view
    if (viewName === 'financial') {
        renderXueqiuData();
    }
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

// Settings Modal
function openSettings() {
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function updateSettingsUI() {
    const settings = appState.settings;
    
    // Theme
    document.getElementById('darkModeToggle').checked = settings.theme === 'dark';
    
    // Model type
    document.querySelectorAll('.seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.model === settings.modelType);
    });
    
    // Show/hide model configs
    document.getElementById('localModelConfig').style.display = 
        settings.modelType === 'local' ? 'block' : 'none';
    document.getElementById('cloudModelConfig').style.display = 
        settings.modelType === 'cloud' ? 'block' : 'none';
    
    // Local model
    if (settings.localModel) {
        document.getElementById('localBaseUrl').value = settings.localModel.baseUrl || '';
        document.getElementById('localModelName').value = settings.localModel.modelName || '';
    }
    
    // Cloud model
    if (settings.cloudModel) {
        document.getElementById('cloudBaseUrl').value = settings.cloudModel.baseUrl || '';
        document.getElementById('cloudModelName').value = settings.cloudModel.modelName || '';
    }
    
    // Other settings
    document.getElementById('thinkingEffort').value = settings.thinkingEffort || 'medium';
    document.getElementById('temperature').value = settings.temperature || 0.7;
    document.getElementById('tempValue').textContent = settings.temperature || 0.7;
    document.getElementById('maxTokens').value = settings.maxTokens || 2000;
}

async function saveSettings() {
    const modelType = document.querySelector('.seg-btn.active').dataset.model;
    
    const settings = {
        theme: document.getElementById('darkModeToggle').checked ? 'dark' : 'light',
        modelType: modelType,
        localModel: {
            baseUrl: document.getElementById('localBaseUrl').value,
            modelName: document.getElementById('localModelName').value,
            apiKey: document.getElementById('localApiKey').value
        },
        cloudModel: {
            baseUrl: document.getElementById('cloudBaseUrl').value,
            modelName: document.getElementById('cloudModelName').value,
            apiKey: document.getElementById('cloudApiKey').value
        },
        thinkingEffort: document.getElementById('thinkingEffort').value,
        temperature: parseFloat(document.getElementById('temperature').value),
        maxTokens: parseInt(document.getElementById('maxTokens').value)
    };
    
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            appState.settings = settings;
            applyTheme(settings.theme);
            closeSettings();
            showNotification('设置已保存', 'success');
        } else {
            showNotification('保存失败', 'error');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        showNotification('保存失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Theme Management
function toggleDarkMode() {
    const isDark = document.getElementById('darkModeToggle').checked;
    applyTheme(isDark ? 'dark' : 'light');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    appState.theme = theme;
}

function updateTempValue(value) {
    document.getElementById('tempValue').textContent = value;
}

// AI Analysis
async function performAnalysis() {
    await refreshAccount();
    if (!currentUser) return goToLogin();
    const prompt = document.getElementById('analysisPrompt').value.trim();
    
    if (!prompt) {
        showNotification('请输入分析请求', 'warning');
        return;
    }
    
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api/analyze`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                context: {
                    alerts: appState.alerts,
                    statistics: appState.statistics
                }
            })
        });
        
        const result = await response.json();
        
        if (response.status === 401) {
            currentUser = null;
            renderAccount();
            showNotification('登录已失效，请重新登录', 'warning');
            return;
        }
        if (result.success) {
            displayAnalysisResult(result);
        } else {
            showNotification('分析失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Analysis failed:', error);
        showNotification('分析失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayAnalysisResult(result) {
    const container = document.getElementById('analysisResult');
    container.innerHTML = `
        <h4>AI分析结果</h4>
        <div style="margin-bottom: 12px;">
            <span style="font-size: 13px; color: var(--text-secondary);">
                模型: ${result.model} (${result.modelType === 'local' ? '本地' : '云端'})
            </span>
        </div>
        <p style="white-space: pre-wrap;">${result.analysis}</p>
    `;
    container.classList.add('active');
}

// Alert Actions
async function viewAlertDetail(alertId) {
    const alert = appState.alerts.find(a => a.id === alertId);
    if (!alert) return;
    
    showNotification(`查看预警详情: ${alert.title}`, 'info');
    // In a real app, this would open a detailed modal
}

async function handleAlert(alertId) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'handled' })
        });
        
        if (response.ok) {
            await loadAlerts();
            await loadStatistics();
            showNotification('预警已标记为处理', 'success');
        }
    } catch (error) {
        console.error('Failed to handle alert:', error);
        showNotification('操作失败', 'error');
    } finally {
        hideLoading();
    }
}

// Network Graph
function showNodeDetail(node) {
    showNotification(`${node.label}\n类型: ${node.type}`, 'info');
}

// Utility Functions
function getLevelText(level) {
    const map = {
        high: '高风险',
        medium: '中风险',
        low: '低风险'
    };
    return map[level] || level;
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}小时前`;
    
    return date.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showNotification(message, type = 'info') {
    // Simple alert for demo - in production, use a toast library
    const typeEmoji = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    alert(`${typeEmoji[type]} ${message}`);
}

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderTrendChart();
        renderNetworkGraph();
    }, 250);
});

// Load Hotboards Data
async function loadHotboards() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/uapi/hotboard/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                types: ['weibo', 'zhihu', 'toutiao', 'douyin']
            })
        });
        
        if (response.ok) {
            appState.hotboards = await response.json();
            if (appState.currentView === 'hotboard') {
                renderHotboards();
            }
        }
    } catch (error) {
        console.error('Failed to load hotboards:', error);
    }
}

// Load Xueqiu Financial Data
async function loadXueqiuData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/xueqiu/batch-analysis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scodes: ['603585', '600519']
            })
        });
        
        if (response.ok) {
            appState.xueqiuData = await response.json();
            if (appState.currentView === 'financial') {
                renderXueqiuData();
            }
        }
    } catch (error) {
        console.error('Failed to load Xueqiu data:', error);
    }
}

// Render Hotboards
function renderHotboards() {
    const container = document.getElementById('hotboardsContainer');
    if (!container) return;
    
    const platformNames = {
        weibo: '微博热搜',
        zhihu: '知乎热榜',
        toutiao: '今日头条',
        douyin: '抖音热点'
    };
    
    if (!appState.hotboards || Object.keys(appState.hotboards).length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-secondary);">暂无热榜数据</div>';
        return;
    }
    
    container.innerHTML = Object.entries(appState.hotboards).map(([type, data]) => {
        if (!data || !data.list) return '';
        
        const list = data.list.slice(0, 10).map((item, index) => `
            <div class="hotboard-item" onclick="window.open('${item.url}', '_blank')">
                <span class="hotboard-index">${index + 1}</span>
                <span class="hotboard-title">${item.title}</span>
                <span class="hotboard-value">${item.hot_value || ''}</span>
            </div>
        `).join('');
        
        return `
            <div class="hotboard-card">
                <div class="hotboard-header">
                    <h4>${platformNames[type] || type}</h4>
                    <span class="hotboard-time">${formatTimestamp(new Date(data.update_time).getTime())}</span>
                </div>
                <div class="hotboard-list">
                    ${list}
                </div>
            </div>
        `;
    }).join('');
}

// Render Xueqiu Financial Data
function renderXueqiuData() {
    const container = document.getElementById('financialContainer');
    if (!container) return;
    
    if (!appState.xueqiuData || Object.keys(appState.xueqiuData).length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-secondary);">暂无财务数据</div>';
        return;
    }
    
    container.innerHTML = Object.entries(appState.xueqiuData).map(([scode, data]) => {
        if (!data) return '';
        
        const riskLevel = data.riskLevel || 'low';
        const riskColors = {
            high: 'var(--danger)',
            medium: 'var(--warning)',
            low: 'var(--success)'
        };
        
        return `
            <div class="financial-card">
                <div class="financial-header">
                    <h4>股票代码: ${scode}</h4>
                    <span class="risk-badge" style="background: ${riskColors[riskLevel]}20; color: ${riskColors[riskLevel]};">
                        ${getLevelText(riskLevel)}
                    </span>
                </div>
                <div class="financial-metrics">
                    ${data.metrics ? Object.entries(data.metrics).slice(0, 6).map(([key, value]) => `
                        <div class="financial-metric">
                            <div class="financial-metric-label">${key}</div>
                            <div class="financial-metric-value">${value}</div>
                        </div>
                    `).join('') : '<p style="color: var(--text-secondary);">暂无指标数据</p>'}
                </div>
            </div>
        `;
    }).join('');
}
