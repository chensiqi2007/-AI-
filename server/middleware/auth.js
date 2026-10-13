import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_DAYS || 7) * 86400;
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'fraud_platform_session';
const SSO_STATE_COOKIE = process.env.SSO_STATE_COOKIE_NAME || 'fraud_platform_sso_state';
const SESSION_FILE = path.join(process.cwd(), 'server', '.sessions.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const URLTIME_AUTH_BASE_URL = process.env.URLTIME_AUTH_BASE_URL || 'https://login.urltime.cn/api/v1';
const URLTIME_SSO_CLIENT_ID = process.env.URLTIME_SSO_CLIENT_ID;
const URLTIME_SSO_CLIENT_SECRET = process.env.URLTIME_SSO_CLIENT_SECRET;
const URLTIME_SSO_REDIRECT_URI = process.env.URLTIME_SSO_REDIRECT_URI;
let sessions = new Map();
try { sessions = new Map(Object.entries(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')))); } catch {}
function persist() { try { fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(sessions)), 'utf8'); } catch (e) { console.error('session persistence error:', e.message); } }
function hash(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex'); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => { const i = part.indexOf('='); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; })); }
function setCookie(res, name, value, options = {}) { const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${options.maxAge ?? SESSION_TTL_SECONDS}`, 'HttpOnly', `SameSite=${process.env.COOKIE_SAME_SITE || 'Lax'}`]; if (process.env.COOKIE_SECURE === 'true') parts.push('Secure'); res.append('Set-Cookie', parts.join('; ')); }
function clearCookie(res, name) { res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`); }
export function createSession(user) { const token = crypto.randomBytes(32).toString('base64url'); sessions.set(hash(token), { ...user, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 }); persist(); return token; }
export function attachSession(res, token) { setCookie(res, COOKIE_NAME, token); }
export function destroySession(req, res) { const token = parseCookies(req)[COOKIE_NAME]; if (token) { sessions.delete(hash(token)); persist(); } clearCookie(res, COOKIE_NAME); }
export function getSession(req) { const token = parseCookies(req)[COOKIE_NAME]; if (!token) return null; const key = hash(token); const session = sessions.get(key); if (!session) return null; if (session.expiresAt <= Date.now()) { sessions.delete(key); persist(); return null; } return session; }
export function verifyCredentials(username, password) { return username === ADMIN_USERNAME && password === ADMIN_PASSWORD; }
export function requireAuth(req, res, next) { const session = getSession(req); if (!session) return res.status(401).json({ success: false, message: '请先登录' }); req.admin = session; next(); }
export function requireAdmin(req, res, next) { return requireAuth(req, res, () => req.admin.role === 'admin' ? next() : res.status(403).json({ success: false, message: '需要管理员权限' })); }
export function isUrltimeSSOConfigured() { return !!(URLTIME_SSO_CLIENT_ID && URLTIME_SSO_CLIENT_SECRET && URLTIME_SSO_REDIRECT_URI && !URLTIME_SSO_CLIENT_SECRET.startsWith('replace_')); }
export function getUrltimeAuthUrl(state) { const params = new URLSearchParams({ response_type: 'code', client_id: URLTIME_SSO_CLIENT_ID, redirect_uri: URLTIME_SSO_REDIRECT_URI, state: state || '', scope: 'openid profile email groups' }); return `https://login.urltime.cn/oauth/authorize?${params}`; }
export function createSsoState(res, returnTo = '/') { const state = crypto.randomBytes(24).toString('base64url'); setCookie(res, SSO_STATE_COOKIE, JSON.stringify({ state, returnTo, expiresAt: Date.now() + 600000 }), { maxAge: 600 }); return state; }
export function consumeSsoState(req, res, state) { const raw = parseCookies(req)[SSO_STATE_COOKIE]; clearCookie(res, SSO_STATE_COOKIE); try { const value = JSON.parse(raw || '{}'); return value.state === state && value.expiresAt > Date.now() ? value : null; } catch { return null; } }
export async function exchangeCodeForToken(code) { try { const response = await axios.post(`${URLTIME_AUTH_BASE_URL}/oauth/token`, { grant_type: 'authorization_code', code, client_id: URLTIME_SSO_CLIENT_ID, client_secret: URLTIME_SSO_CLIENT_SECRET, redirect_uri: URLTIME_SSO_REDIRECT_URI }, { timeout: 10000 }); return { success: true, data: response.data }; } catch (error) { return { success: false, error: error.response?.data?.error_description || error.message }; } }
export async function getUrltimeUserInfo(accessToken) { try { const response = await axios.get(`${URLTIME_AUTH_BASE_URL}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }); return { success: true, user: response.data }; } catch (error) { return { success: false, error: error.response?.data?.error_description || error.message }; } }
