// Admin Dashboard JavaScript
const API_BASE_URL = window.location.origin;
const RETURN_KEY = 'admin_login_return_to';

function safeReturnPath(value) {
    if (!value) return '/';
    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin || url.username || url.password) return '/';
        if (!['/', '/index.html'].includes(url.pathname)) return '/';
        return url.pathname + url.search + url.hash;
    } catch {
        return '/';
    }
}

function finishLogin() {
    const destination = safeReturnPath(sessionStorage.getItem(RETURN_KEY));
    sessionStorage.removeItem(RETURN_KEY);
    window.location.replace(destination);
}

// State management
const adminState = {
    token: null,
    stats: null,
    config: null,
    logs: []
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check for SSO callback token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (urlParams.has('returnTo')) {
        sessionStorage.setItem(RETURN_KEY, safeReturnPath(urlParams.get('returnTo')));
    } else if (!error) {
        sessionStorage.setItem(RETURN_KEY, safeReturnPath(document.referrer));
    }
    
    if (error) {
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) {
            showError(errorDiv, error);
        }
        window.history.replaceState({}, '', '/admin.html');
    }
    
    // Check if already logged in (reuse token variable from above)
    fetch(API_BASE_URL + '/api/auth/me', { credentials: 'same-origin' }).then(response => {
      if (response.ok) {
        showAdminView();
        loadDashboardData();
      }
    }).catch(() => {});
    
    // Setup login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Setup theme toggle
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon();
    
    // Setup config inputs
    setupConfigListeners();
    
    // Check SSO status and show button if configured
    checkSSOStatus();
});

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            finishLogin();
        } else {
            showError(errorDiv, data.message || '登录失败');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(errorDiv, '网络错误，请稍后重试');
    }
}

// Show admin view
function showAdminView() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');
}

// Logout
function logout() {
    adminState.token = null;
    fetch(API_BASE_URL + '/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('login-form').reset();
}

// Load dashboard data
async function loadDashboardData() {
    await Promise.all([
        loadStats(),
        loadConfig(),
        loadLogs()
    ]);
}

// Load system statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
            headers: {
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to load stats');
        }
        
        const data = await response.json();
        adminState.stats = data.stats;
        renderStats();
    } catch (error) {
        console.error('Load stats error:', error);
        showErrorMessage('加载统计数据失败');
    }
}

// Render statistics
function renderStats() {
    if (!adminState.stats) return;
    
    const { totalAlerts, pendingAlerts, resolvedAlerts, systemUptime, apiStatus } = adminState.stats;
    
    // Update stat cards
    document.getElementById('stat-total-alerts').textContent = totalAlerts || 0;
    document.getElementById('stat-pending-alerts').textContent = pendingAlerts || 0;
    document.getElementById('stat-resolved-alerts').textContent = resolvedAlerts || 0;
    
    // Format uptime
    const uptimeHours = Math.floor(systemUptime / 3600);
    const uptimeMinutes = Math.floor((systemUptime % 3600) / 60);
    document.getElementById('stat-uptime').textContent = `${uptimeHours}h ${uptimeMinutes}m`;
    
    // Update API status
    document.getElementById('api-status-uapi').textContent = apiStatus.uapi === 'active' ? '✅ 运行中' : '❌ 离线';
    document.getElementById('api-status-xueqiu').textContent = apiStatus.xueqiu === 'active' ? '✅ 运行中' : '❌ 离线';
}

// Load configuration
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/config`, {
            headers: {
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to load config');
        }
        
        const data = await response.json();
        adminState.config = data.config;
        renderConfig();
    } catch (error) {
        console.error('Load config error:', error);
        showErrorMessage('加载配置失败');
    }
}

// Render configuration
function renderConfig() {
    if (!adminState.config) return;
    
    const { theme, modelType, modelConfig, riskThreshold, environment } = adminState.config;
    
    // Set config inputs
    document.getElementById('config-theme').value = theme || 'light';
    document.getElementById('config-model-type').value = modelType || 'local';
    
    if (riskThreshold !== undefined) {
        document.getElementById('config-risk-threshold').value = riskThreshold;
        document.getElementById('risk-threshold-value').textContent = riskThreshold;
    }
    
    if (modelConfig) {
        document.getElementById('config-base-url').value = modelConfig.baseURL || '';
        document.getElementById('config-reasoning-effort').value = modelConfig.reasoningEffort || 'medium';
    }
    
    // Update environment info
    if (environment) {
        document.getElementById('api-status-env').textContent = environment.nodeEnv || 'unknown';
        document.getElementById('api-status-port').textContent = environment.port || 'unknown';
    }
}

// Setup configuration listeners
function setupConfigListeners() {
    const riskThresholdInput = document.getElementById('config-risk-threshold');
    if (riskThresholdInput) {
        riskThresholdInput.addEventListener('input', (e) => {
            document.getElementById('risk-threshold-value').textContent = e.target.value;
        });
    }
}

// Update configuration
async function updateConfig() {
    const theme = document.getElementById('config-theme').value;
    const modelType = document.getElementById('config-model-type').value;
    const riskThreshold = parseInt(document.getElementById('config-risk-threshold').value);
    const baseURL = document.getElementById('config-base-url').value;
    const reasoningEffort = document.getElementById('config-reasoning-effort').value;
    
    const configUpdate = {
        theme,
        modelType,
        riskThreshold,
        modelConfig: {
            baseURL: baseURL || undefined,
            reasoningEffort
        }
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(configUpdate)
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to update config');
        }
        
        const data = await response.json();
        showSuccessMessage('配置更新成功');
        
        // Reload config
        await loadConfig();
    } catch (error) {
        console.error('Update config error:', error);
        showErrorMessage('配置更新失败');
    }
}

// Load audit logs
async function loadLogs() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/logs?limit=20`, {
            headers: {
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to load logs');
        }
        
        const data = await response.json();
        adminState.logs = data.logs || [];
        renderLogs();
    } catch (error) {
        console.error('Load logs error:', error);
        showErrorMessage('加载日志失败');
    }
}

// Render audit logs
function renderLogs() {
    const tbody = document.getElementById('logs-tbody');
    if (!tbody) return;
    
    if (adminState.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: var(--spacing-xl);">暂无日志记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = adminState.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <tr>
                <td>${time}</td>
                <td>${log.action}</td>
                <td>${log.user}</td>
                <td>${log.details}</td>
            </tr>
        `;
    }).join('');
}

// Theme toggle
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const theme = document.documentElement.getAttribute('data-theme');
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// Show error message
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function showErrorMessage(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccessMessage(message) {
    const successDiv = document.getElementById('success-message');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }
}

// Auto-refresh
setInterval(() => {
    if (adminState.token) {
        loadStats();
        loadLogs();
    }
}, 30000); // Refresh every 30 seconds

// ==================== URLTime SSO Functions ====================

// Check SSO status and show button if configured
async function checkSSOStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/sso-status`);
        const data = await response.json();
        if (data.success && data.enabled) {
            const ssoBtn = document.getElementById('sso-login-btn');
            const ssoDivider = document.getElementById('sso-divider');
            if (ssoBtn) {
                ssoBtn.style.display = 'block';
                ssoBtn.addEventListener('click', handleSSOLogin);
            }
            if (ssoDivider) {
                ssoDivider.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('SSO status check failed:', error);
    }
}

// Handle SSO login button click
async function handleSSOLogin() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/sso-login`);
        const data = await response.json();
        if (data.success && data.authUrl) {
            window.location.href = data.authUrl;
        } else {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) {
                showError(errorDiv, data.message || 'SSO登录失败');
            }
        }
    } catch (error) {
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) {
            showError(errorDiv, 'SSO登录失败');
        }
    }
}
