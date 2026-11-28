/* =========================================================
   EarnWallet - Frontend App Logic (Fixed + Secure)
   ========================================================= */

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
try { tg?.setHeaderColor?.('#0a0a0f'); } catch (_) {}
try { tg?.setBackgroundColor?.('#0a0a0f'); } catch (_) {}

const INIT = tg?.initData || '';

/* ---------- Global State ---------- */
const state = {
  user: {},
  config: {},
  ads: [],
  tasks: [],
  currentAd: null,
  currentTask: null,
  uploadedImageBase64: null,
  filterType: 'all',
  adsFilterType: 'all',
  adTimer: null,
  adInterval: null,
  booted: false
};

/* =========================================================
   SAFE HELPERS
   ========================================================= */
function el(id) {
  return document.getElementById(id);
}

function h(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function toUSD(coins) {
  return (Number(coins) / 100).toFixed(3);
}

function safeSet(id, text) {
  const node = el(id);
  if (!node) { console.warn('[DOM] missing #' + id); return false; }
  node.textContent = text;
  return true;
}

function safeHtml(id, html) {
  const node = el(id);
  if (!node) { console.warn('[DOM] missing #' + id); return false; }
  node.innerHTML = html;
  return true;
}

function safeShow(id, display = 'block') {
  const node = el(id);
  if (!node) return false;
  node.style.display = display;
  return true;
}

function safeOnclickId(s) {
  return String(s ?? '').replace(/[^a-zA-Z0-9_\-]/g, '');
}

/* ---------- Toast ---------- */
function toast(msg, type = 'info') {
  const div = document.createElement('div');
  div.textContent = String(msg).slice(0, 200);
  const bg = type === 'error' ? '#ff4757'
           : type === 'success' ? '#2ecc71'
           : '#15151e';
  div.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:${bg};color:#fff;padding:10px 18px;border-radius:8px;
    font-size:13px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.5);
    border:1px solid rgba(255,255,255,0.1);max-width:90%;
    word-break:break-word;pointer-events:none;text-align:center;
  `;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity 0.3s';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 300);
  }, 2500);
}

/* =========================================================
   API HELPER
   ========================================================= */
async function api(path, opts = {}) {
  if (!INIT) throw new Error('Open from Telegram bot');

  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `tma ${INIT}`,
      ...(opts.headers || {})
    },
    cache: 'no-store'
  });

  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `API Error (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/* =========================================================
   CHANNEL GATE
   ========================================================= */
async function checkChannelGate() {
  try {
    const res = await api('/api/verify-channel', { method: 'POST', body: '{}' });
    return res.joined === true;
  } catch (_) {
    return false;
  }
}

async function verifyChannel() {
  const btn = el('verifyBtn');
  const msg = el('verifyMsg');
  if (!btn || !msg) return;

  btn.textContent = 'Verifying...';
  btn.disabled = true;
  msg.textContent = '';
  msg.style.color = 'var(--txt-muted)';

  try {
    const res = await api('/api/verify-channel', { method: 'POST', body: '{}' });
    if (res.joined) {
      msg.textContent = ' Verified! Loading...';
      msg.style.color = 'var(--ok)';
      safeShow('channelGate', 'none');
      safeShow('loader', 'flex');
      state.booted = false;
      boot();
    } else {
      throw new Error(res.error || 'You have not joined all channels.');
    }
  } catch (e) {
    msg.style.color = 'var(--bad)';
    msg.textContent = String(e.message || 'Verification failed').slice(0, 200);
    btn.textContent = 'Try Again';
    btn.disabled = false;
  }
}

/* =========================================================
   BOOT
   ========================================================= */
async function boot() {
  if (state.booted) return;
  state.booted = true;

  if (!INIT) {
    safeSet('loader', '❌ Open from Telegram Bot.');
    return;
  }

  try {
    await api('/api/auth', { method: 'POST', body: '{}' });

    const cfg = await api('/api/app-config');
    state.config = cfg.data || {};

    if (state.config.maintenance) {
      safeHtml('loader', `🛠 Maintenance<br><span style="font-size:14px;color:#888;margin-top:10px;display:block;">${h(state.config.maintenanceMessage)}</span>`);
      return;
    }

    // Update gate channel links from config
    if (Array.isArray(state.config.channels) && state.config.channels.length > 0) {
      const ch1 = el('gateChannel1');
      const ch2 = el('gateChannel2');
      if (ch1 && typeof state.config.channels[0] === 'string') ch1.href = state.config.channels[0];
      if (ch2 && state.config.channels.length > 1 && typeof state.config.channels[1] === 'string') ch2.href = state.config.channels[1];
    }

    // Channel gate (server-verified)
    const joined = await checkChannelGate();
    if (!joined) {
      safeShow('loader', 'none');
      safeShow('channelGate', 'flex');
      return;
    }

    await loadProfile();

    safeShow('loader', 'none');
    safeShow('app-header', 'flex');
    safeShow('app-main', 'block');
    safeShow('app-nav', 'flex');

    // Load content in parallel
    await Promise.allSettled([
      safeCall(loadLiveFeed, 'liveFeed'),
      safeCall(loadAds, 'ads'),
      safeCall(loadAdsForPage, 'adsPage'),
      safeCall(loadTasks, 'tasks'),
      safeCall(loadReferrals, 'referrals'),
      safeCall(loadWallet, 'wallet'),
      safeCall(loadNotifications, 'notifications'),
      safeCall(loadLeaderboard, 'leaderboard'),
      safeCall(loadBanner, 'banner')
    ]);

    updatePaymentOptions();

  } catch (e) {
    console.error('Boot failed:', e);
    if (e.status === 503) {
      safeHtml('loader', `🛠 ${h(e.message || 'Maintenance')}`);
    } else if (e.status === 403) {
      safeSet('loader', '❌ ' + String(e.message || 'Access denied').slice(0, 200));
    } else {
      safeSet('loader', '❌ Error: ' + String(e.message || 'Unknown').slice(0, 200));
    }
    state.booted = false;
  }
}

async function safeCall(fn, name) {
  try { await fn(); }
  catch (e) { console.warn(`[${name}] failed:`, e.message); }
}

/* =========================================================
   PROFILE
   ========================================================= */
async function loadProfile() {
  const { data } = await api('/api/me');
  state.user = data;

  const picUrl = (typeof data.photoUrl === 'string' && data.photoUrl.startsWith('https://'))
    ? data.photoUrl
    : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.firstName || 'U') + '&background=141a29&color=ff7f00';

  const usdBalance = toUSD(data.balance);

  safeSet('userName', data.firstName || 'User');
  safeSet('headerId', 'ID: ' + String(data.telegramId || '0').slice(0, 20));
  const up = el('userPic'); if (up) up.src = picUrl;
  safeHtml('headerBalance', `<span style="font-size:10px">$</span> ${usdBalance}`);

  safeHtml('homeBalance', `$${usdBalance}`);
  safeSet('todayEarn', '$' + toUSD(data.todayEarnings));
  safeSet('totalEarn', '$' + toUSD(data.totalEarnings));

  const pp = el('profPic'); if (pp) pp.src = picUrl;
  safeSet('profName', data.firstName || 'User');
  safeSet('profBalanceTop', String(data.balance || 0));
  safeSet('profWalletBalance', String(Math.floor(data.balance / 100) || 0));
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function switchPage(pageId, navEl) {
  const allowed = ['home', 'tasks', 'rank', 'ads', 'refer', 'profile', 'wallet'];
  if (!allowed.includes(pageId)) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = el('page-' + pageId);
  if (target) target.classList.add('active');
  if (navEl) navEl.classList.add('active');

  // Load page-specific data
  if (pageId === 'ads') {
    loadAdsForPage();
  } else if (pageId === 'tasks') {
    loadTasks();
  } else if (pageId === 'rank') {
    loadLeaderboard();
  } else if (pageId === 'refer') {
    loadReferrals();
  } else if (pageId === 'wallet') {
    loadWallet();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   BANNER
   ========================================================= */
async function loadBanner() {
  if (!el('scrollBanner')) return;
  try {
    const { data } = await api('/api/ad-placements');
    if (data?.top?.html) {
      const clean = String(data.top.html).replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 5000);
      safeHtml('scrollBanner', `<div class="banner-item">${clean}</div>`);
    } else {
      safeHtml('scrollBanner', `<div class="banner-item">Welcome to EarnWallet! Start earning now.</div>`);
    }
  } catch (_) {
    safeHtml('scrollBanner', `<div class="banner-item">Welcome to EarnWallet!</div>`);
  }
}

/* =========================================================
   LEADERBOARD
   ========================================================= */
async function loadLeaderboard() {
  if (!el('leaderboardList')) return;
  try {
    const { data } = await api('/api/leaderboard');
    const items = Array.isArray(data) ? data : [];
    if (!items.length) {
      safeHtml('leaderboardList', '<p class="muted" style="text-align:center;">No data available.</p>');
      return;
    }
    safeHtml('leaderboardList', items.map(u => {
      const rank = Number(u.rank) || 0;
      const cls = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      return `
        <div class="rank-item">
          <div class="rank-left">
            <div class="rank-num ${cls}">#${rank}</div>
            <div class="rank-name">${h(u.name || 'Anonymous')}</div>
          </div>
          <div class="rank-amount">$${toUSD(u.amount)}</div>
        </div>
      `;
    }).join(''));
  } catch (_) {
    safeHtml('leaderboardList', '<p class="muted" style="text-align:center;">Could not load.</p>');
  }
}

/* =========================================================
   TASKS
   ========================================================= */
function switchTaskTab(type, elm) {
  const allowed = ['all', 'telegram', 'twitter', 'youtube'];
  if (!allowed.includes(type)) return;
  document.querySelectorAll('#page-tasks .tab-btn').forEach(t => t.classList.remove('active'));
  if (elm) elm.classList.add('active');
  state.filterType = type;
  loadTasks();
}

async function loadTasks() {
  if (!el('tasksList')) return;
  try {
    const { data } = await api('/api/tasks');
    state.tasks = Array.isArray(data) ? data : [];

    const q = (el('taskSearch')?.value || '').toLowerCase().trim();
    let filtered = state.tasks;

    if (state.filterType !== 'all') {
      filtered = filtered.filter(t =>
        String(t.title || '').toLowerCase().includes(state.filterType) ||
        String(t.instruction || '').toLowerCase().includes(state.filterType) ||
        String(t.url || '').toLowerCase().includes(state.filterType)
      );
    }

    if (q) {
      filtered = filtered.filter(t =>
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.instruction || '').toLowerCase().includes(q)
      );
    }

    if (!filtered.length) {
      safeHtml('tasksList', '<p class="muted" style="text-align:center;">No tasks found.</p>');
      return;
    }

    safeHtml('tasksList', filtered.map(t => {
      const isDone = t.submissionStatus === 'pending' || t.submissionStatus === 'approved';
      const statusStr = t.submissionStatus === 'pending' ? 'Under Review'
                     : t.submissionStatus === 'approved' ? 'Completed'
                     : 'Available';
      const idSafe = safeOnclickId(t.id);
      const logo = (typeof t.logoUrl === 'string' && t.logoUrl.startsWith('http'))
        ? t.logoUrl
        : '';

      return `
        <div class="list-item">
          <div class="left">
            ${logo
              ? `<img src="${h(logo)}" onerror="this.style.display='none'" />`
              : `<div style="width:40px;height:40px;background:var(--line);border-radius:8px;"></div>`}
            <div>
              <div class="title">${h(t.title || 'Task')}</div>
              <div class="subtitle">${h(statusStr)}</div>
            </div>
          </div>
          <div class="right">
            <div class="reward">+${h(t.reward)}</div>
            ${isDone
              ? `<button class="btn sm ghost" disabled style="margin-top:4px;">Done</button>`
              : `<button class="btn sm" style="margin-top:4px;" onclick="openTask('${idSafe}')">Start</button>`}
          </div>
        </div>
      `;
    }).join(''));
  } catch (_) {
    safeHtml('tasksList', '<p class="muted" style="text-align:center;">Could not load tasks.</p>');
  }
}

function openTask(id) {
  const cleanId = safeOnclickId(id);
  const t = state.tasks.find(x => safeOnclickId(x.id) === cleanId);
  if (!t) return;

  state.currentTask = t;
  state.uploadedImageBase64 = null;

  safeSet('tmTitle', t.title || 'Task');
  safeSet('tmInst', t.instruction || 'Complete the task to earn reward.');

  const linkWrap = el('tmLinkWrap');
  if (linkWrap) {
    linkWrap.innerHTML = (typeof t.url === 'string' && /^https?:\/\//i.test(t.url))
      ? `<a href="${h(t.url)}" target="_blank" rel="noopener noreferrer" class="btn ghost" style="text-decoration:none;font-size:12px;padding:8px 14px;">Go to Link 🔗</a>`
      : '';
  }

  const proofWrap = el('tmProofWrap');
  if (proofWrap) proofWrap.style.display = t.requiresProof ? 'block' : 'none';

  const proofInput = el('tmProof');
  if (proofInput) proofInput.value = '';

  const preview = el('uploadPreview');
  if (preview) {
    preview.innerHTML = '📸 Click to upload screenshot';
    preview.style.color = 'var(--txt-muted)';
  }

  const imgInput = el('tmImage');
  if (imgInput) imgInput.value = '';

  el('taskModal')?.classList.add('active');
}

function handleImageUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    toast('Only JPG/PNG/WEBP/GIF allowed', 'error');
    event.target.value = '';
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    toast('Image too large (max 3MB)', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const result = e.target?.result;
    if (typeof result !== 'string') return;
    state.uploadedImageBase64 = result;

    const preview = el('uploadPreview');
    if (preview) {
      const img = document.createElement('img');
      img.src = result;
      img.alt = 'preview';
      preview.innerHTML = '';
      preview.appendChild(img);
      preview.style.color = '#fff';
    }
  };
  reader.onerror = () => toast('Failed to read image', 'error');
  reader.readAsDataURL(file);
}

async function submitTask() {
  const task = state.currentTask;
  if (!task) return;

  const textProof = (el('tmProof')?.value || '').trim().slice(0, 1000);
  const hasImage = state.uploadedImageBase64 !== null;

  if (task.requiresProof && !textProof && !hasImage) {
    toast('Please provide screenshot or code as proof', 'error');
    return;
  }

  const finalProof = hasImage ? state.uploadedImageBase64 : textProof;

  if (hasImage && finalProof.length > 800000) {
    toast('Image too large. Pick a smaller screenshot.', 'error');
    return;
  }

  const btn = document.querySelector('#taskModal .btn:not(.ghost)');
  if (btn?.disabled) return;

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    await api(`/api/tasks/${encodeURIComponent(safeOnclickId(task.id))}/submit`, {
      method: 'POST',
      body: JSON.stringify({ proof: finalProof })
    });

    toast('Task submitted! Wait for admin approval.', 'success');
    closeModal('taskModal');
    state.currentTask = null;
    state.uploadedImageBase64 = null;
    loadTasks();
  } catch (e) {
    toast(String(e.message || 'Submit failed').slice(0, 150), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Task'; }
  }
}

/* =========================================================
   ADS PAGE
   ========================================================= */
function switchAdsTab(type, elm) {
  const allowed = ['all', 'video', 'banner', 'offer'];
  if (!allowed.includes(type)) return;
  document.querySelectorAll('#page-ads .tab-btn').forEach(t => t.classList.remove('active'));
  if (elm) elm.classList.add('active');
  state.adsFilterType = type;
  loadAdsForPage();
}

async function loadAdsForPage() {
  const container = el('adsListPage');
  if (!container) return;

  try {
    const { data } = await api('/api/ads');
    state.ads = Array.isArray(data) ? data : [];

    let filtered = state.ads;

    if (state.adsFilterType !== 'all') {
      filtered = filtered.filter(a =>
        String(a.type || '').toLowerCase() === state.adsFilterType ||
        String(a.title || '').toLowerCase().includes(state.adsFilterType) ||
        String(a.category || '').toLowerCase() === state.adsFilterType
      );
    }

    if (!filtered.length) {
      safeHtml('adsListPage', '<p class="muted" style="text-align:center;padding:20px;">No ads available.</p>');
      return;
    }

    safeHtml('adsListPage', filtered.map(a => {
      const idSafe = safeOnclickId(a.id);
      const banner = (typeof a.bannerUrl === 'string' && a.bannerUrl.startsWith('http'))
        ? a.bannerUrl
        : '';
      const duration = Math.max(20, Math.min(300, Number(a.duration) || 20));
      const progress = Math.min(100, Math.max(0, Number(a.progress) || 0));
      const isWatched = a.watched === true || a.status === 'completed';

      return `
        <div class="ad-list-item">
          <div class="left">
            ${banner
              ? `<img src="${h(banner)}" onerror="this.style.display='none'" alt="" />`
              : `<div style="width:44px;height:44px;background:var(--bg);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🎬</div>`}
            <div>
              <div class="title">${h(a.title || 'Ad')}</div>
              <div class="subtitle">${duration}s • ${h(a.category || 'Video')}</div>
              <div class="reward-row">
                <span class="reward-usdt">💲 +${h(a.usdtReward || '0.04')}</span>
                <span class="reward-coin">🪙 +${h(a.reward || '0.32')}</span>
                <div class="progress-mini"><div class="progress-mini-fill" style="width:${progress}%"></div></div>
                <span class="ad-id">#${h(a.adId || a.id || '0').toString().slice(-5)}</span>
              </div>
            </div>
          </div>
          <div class="right">
            ${isWatched
              ? `<button class="watch-btn" disabled style="opacity:0.5;background:var(--line);">✓ Done</button>`
              : `<button class="watch-btn" onclick="startAd('${idSafe}')">Watch</button>`}
          </div>
        </div>
      `;
    }).join(''));

    // Update ads stats if elements exist
    const watchedCount = state.ads.filter(a => a.watched === true || a.status === 'completed').length;
    const totalAds = state.ads.length;
    safeSet('adsWatched', `${watchedCount}/${totalAds || 20}`);

    const totalUsdt = state.ads.reduce((sum, a) => sum + (parseFloat(a.usdtReward) || 0), 0);
    const totalFg = state.ads.reduce((sum, a) => sum + (parseFloat(a.reward) || 0), 0);
    safeSet('adsEarnedUSDT', totalUsdt.toFixed(2));
    safeSet('adsEarnedFG', totalFg.toFixed(2));

  } catch (_) {
    safeHtml('adsListPage', '<p class="muted" style="text-align:center;padding:20px;">Could not load ads.</p>');
  }
}

/* =========================================================
   ADS (Old - for Tasks page compatibility)
   ========================================================= */
async function loadAds() {
  // This loads ads for the old hidden adsList in tasks page
  const container = el('adsList');
  if (!container) return;
  try {
    const { data } = await api('/api/ads');
    state.ads = Array.isArray(data) ? data : [];

    if (!state.ads.length) {
      safeHtml('adsList', '<p class="muted" style="text-align:center;">No ads available.</p>');
      return;
    }

    safeHtml('adsList', state.ads.map(a => {
      const idSafe = safeOnclickId(a.id);
      const banner = (typeof a.bannerUrl === 'string' && a.bannerUrl.startsWith('http'))
        ? a.bannerUrl
        : '';
      return `
        <div class="list-item">
          <div class="left">
            ${banner
              ? `<img src="${h(banner)}" onerror="this.style.display='none'" />`
              : `<div style="width:40px;height:40px;background:var(--line);border-radius:8px;"></div>`}
            <div>
              <div class="title">${h(a.title)}</div>
              <div class="subtitle">${Math.max(20, Math.min(300, Number(a.duration) || 20))} seconds</div>
            </div>
          </div>
          <div class="right">
            <div class="reward">+${h(a.reward)}</div>
            <button class="btn sm" style="margin-top:4px;" onclick="startAd('${idSafe}')">Watch</button>
          </div>
        </div>
      `;
    }).join(''));
  } catch (_) {
    safeHtml('adsList', '<p class="muted" style="text-align:center;">Could not load ads.</p>');
  }
}

async function startAd(id) {
  const cleanId = safeOnclickId(id);
  if (!cleanId) return;

  try {
    const { data } = await api(`/api/ads/${encodeURIComponent(cleanId)}/start`, {
      method: 'POST',
      body: '{}'
    });

    if (!data?.sessionId) throw new Error('Invalid ad session');
    state.currentAd = data;

    if (typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
      try {
        if (tg?.openLink) tg.openLink(data.url);
        else window.open(data.url, '_blank', 'noopener,noreferrer');
      } catch (_) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    }

    el('adModal')?.classList.add('active');

    const urlText = el('adUrlText');
    if (urlText) {
      urlText.innerHTML = `Opening link...<br><a href="${h(data.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--acc)">Click here if not opened</a>`;
    }

    let timeLeft = Math.max(1, Math.floor(Number(data.duration) || 20));
    safeSet('adTimer', timeLeft + 's');
    safeShow('adClaimBtn', 'none');
    const claimBtn = el('adClaimBtn');
    if (claimBtn) claimBtn.disabled = true;

    if (state.adInterval) clearInterval(state.adInterval);

    state.adInterval = setInterval(() => {
      timeLeft--;
      safeSet('adTimer', timeLeft > 0 ? timeLeft + 's' : 'Done!');
      if (timeLeft <= 0) {
        clearInterval(state.adInterval);
        state.adInterval = null;
        safeShow('adClaimBtn', 'flex');
        if (claimBtn) claimBtn.disabled = false;
      }
    }, 1000);

  } catch (e) {
    toast(String(e.message || 'Could not start ad').slice(0, 150), 'error');
  }
}

async function claimAd() {
  if (!state.currentAd?.sessionId) {
    toast('No active session', 'error');
    return;
  }

  const btn = el('adClaimBtn');
  if (btn?.disabled) return;

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Claiming...'; }

    const { data } = await api('/api/ads/complete', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.currentAd.sessionId })
    });

    toast(`Success! Earned ${data.reward} coins.`, 'success');
    closeModal('adModal');
    state.currentAd = null;

    if (state.adInterval) { clearInterval(state.adInterval); state.adInterval = null; }

    await loadProfile();
    loadAds();
    loadAdsForPage();
  } catch (e) {
    toast(String(e.message || 'Claim failed').slice(0, 150), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Claim Reward'; }
  }
}

/* =========================================================
   LIVE FEED
   ========================================================= */
async function loadLiveFeed() {
  if (!el('liveFeed')) return;
  try {
    const { data } = await api('/api/live-withdrawals');
    const items = Array.isArray(data) ? data : [];
    if (!items.length) {
      safeHtml('liveFeed', '<div class="live-item" style="color:var(--txt-muted)">No recent withdrawals.</div>');
      return;
    }
    safeHtml('liveFeed', items.map(x => `
      <div class="live-item">
        🟢 <b>${h(x.name || 'User')}</b> withdrew <b>${h(x.amount)}$</b> via ${h(x.method || '')}
      </div>
    `).join(''));
  } catch (_) {}
}

/* =========================================================
   REFERRALS
   ========================================================= */
async function loadReferrals() {
  try {
    const { data } = await api('/api/referrals');
    const link = (typeof data.link === 'string' && data.link.startsWith('https://'))
      ? data.link
      : '...';

    safeSet('refLink', link);
    safeSet('refLinkTop', link);
    safeSet('refTotalTop', String(Math.max(0, Number(data.totalCount) || 0)));
    safeSet('refCount', `${Math.max(0, Number(data.totalCount) || 0)}/20`);

    if (!Array.isArray(data.referrals) || !data.referrals.length) {
      safeHtml('refList', '<p class="muted" style="text-align:center; font-size:12px;">No referrals yet.</p>');
      return;
    }

    safeHtml('refList', data.referrals.map(r => {
      const success = r.status === 'successful';
      return `
        <div class="list-item" style="padding:10px;">
          <div class="left">
            <div>
              <div class="title" style="font-size:13px;">${h(r.firstName)} ${h(r.lastName || '')}</div>
              <div class="subtitle" style="font-size:11px;">ID: ${h(r.telegramId)} • ${Number(r.completedAds) || 0}/${Number(r.requiredAds) || 20} ads</div>
            </div>
          </div>
          <div class="right">
            <div style="font-size:11px;font-weight:bold;color:${success ? 'var(--ok)' : 'var(--warn)'}">
              ${h(r.status)}
            </div>
          </div>
        </div>
      `;
    }).join(''));
  } catch (_) {}
}

async function copyRef() {
  const link = el('refLink')?.textContent || el('refLinkTop')?.textContent || '';
  if (!link || !link.startsWith('https://')) {
    toast('Referral link not ready', 'error');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Referral link copied!', 'success');
  } catch (_) {
    toast('Copy failed', 'error');
  }
}

/* =========================================================
   WALLET
   ========================================================= */
function updatePaymentOptions() {
  const select = el('wdMethod');
  if (!select) return;

  const payments = state.config.payments || {};
  select.innerHTML = '';

  const methods = [
    { key: 'bKash', label: 'bKash' },
    { key: 'Nagad', label: 'Nagad' },
    { key: 'USDT', label: 'Binance USDT (TRC20)' },
    { key: 'LTC', label: 'Litecoin (LTC)' },
    { key: 'ETH', label: 'Ethereum (ETH)' }
  ];

  let hasMethod = false;
  methods.forEach(m => {
    if (payments[m.key]?.enabled === true) {
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = m.label;
      select.appendChild(opt);
      hasMethod = true;
    }
  });

  if (!hasMethod) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No payment methods available';
    select.appendChild(opt);
  }
}

async function loadWallet() {
  safeSet('minW', '$' + toUSD(state.config.minWithdraw || 100));

  const reqRef = state.config.requiredReferrals !== undefined
    ? Number(state.config.requiredReferrals)
    : 10;
  safeSet('wdRuleText', `You need at least ${reqRef} successful referral(s) to enable withdrawal.`);

  const container = el('historyList');
  if (!container) return;
  safeHtml('historyList', '<p class="muted" style="text-align:center;">Loading...</p>');

  try {
    const { data } = await api('/api/history');
    const items = Array.isArray(data) ? data : [];

    if (!items.length) {
      safeHtml('historyList', '<p class="muted" style="text-align:center;">No history found.</p>');
      return;
    }

    safeHtml('historyList', items.map(x => {
      const typeName = String(x.type || '').toUpperCase().replace(/_/g, ' ');
      const amt = Number(x.amount) || 0;
      const isPos = amt >= 0;
      const dt = x.createdAt ? new Date(x.createdAt).toLocaleString() : '';
      return `
        <div class="list-item" style="padding:10px;">
          <div class="left">
            <div>
              <div class="title" style="font-size:13px;">${h(typeName)}</div>
              <div class="subtitle" style="font-size:11px;">${h(dt)}</div>
            </div>
          </div>
          <div class="right">
            <div style="font-size:14px;font-weight:bold;color:${isPos ? 'var(--ok)' : 'var(--bad)'}">
              ${isPos ? '+' : ''}${amt}
            </div>
            <div style="font-size:10px;color:var(--txt-muted);">${h(x.status || '')}</div>
          </div>
        </div>
      `;
    }).join(''));
  } catch (_) {
    safeHtml('historyList', '<p class="muted" style="text-align:center;">Could not load history.</p>');
  }
}

async function requestWithdraw() {
  const amount = Number(el('wdAmount')?.value);
  const method = el('wdMethod')?.value || '';
  const account = (el('wdAccount')?.value || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Enter a valid amount', 'error');
    return;
  }
  if (!account || account.length < 5) {
    toast('Enter a valid account', 'error');
    return;
  }
  if (!method) {
    toast('Select a payment method', 'error');
    return;
  }

  const btn = document.querySelector('#page-wallet .btn');
  if (btn?.disabled) return;

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    await api('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, method, account })
    });

    toast('Withdrawal requested! Wait for admin approval.', 'success');
    if (el('wdAmount')) el('wdAmount').value = '';
    if (el('wdAccount')) el('wdAccount').value = '';

    await loadProfile();
    loadWallet();
  } catch (e) {
    toast(String(e.message || 'Withdraw failed').slice(0, 150), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Request Withdraw'; }
  }
}

/* =========================================================
   NOTIFICATIONS
   ========================================================= */
async function loadNotifications() {
  try {
    const { data } = await api('/api/notifications');
    const items = Array.isArray(data) ? data : [];

    if (items.length > 0) {
      const first = items[0];
      safeSet('noticeMarquee', `${first.title || ''}: ${first.message || ''}`);
    } else {
      safeSet('noticeMarquee', 'No new notices.');
    }

    if (!items.length) {
      safeHtml('modalNotifyList', '<p class="muted" style="text-align:center; font-size:12px;">No notifications.</p>');
      return;
    }

    safeHtml('modalNotifyList', items.map(n => {
      const dt = n.createdAt ? new Date(n.createdAt).toLocaleString() : '';
      return `
        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-left: 3px solid var(--acc);">
          <div style="font-weight: 700; color: var(--acc); margin-bottom: 4px; font-size:13px;">${h(n.title)}</div>
          <div style="font-size: 12px; color: var(--txt); margin-bottom: 6px;">${h(n.message)}</div>
          <div style="font-size: 10px; color: var(--txt-muted);">${h(dt)}</div>
        </div>
      `;
    }).join(''));
  } catch (_) {}
}

function openNotificationsModal() {
  el('notifyModal')?.classList.add('active');
}

function closeModal(id) {
  const node = el(id);
  if (node) node.classList.remove('active');

  if (id === 'adModal' && state.adInterval) {
    clearInterval(state.adInterval);
    state.adInterval = null;
  }
}

/* =========================================================
   STARTUP
   ========================================================= */
window.addEventListener('load', async () => {
  if (!tg) {
    safeSet('loader', '❌ Open this app from Telegram');
    return;
  }
  if (!INIT) {
    safeSet('loader', '❌ Open this app from Telegram bot');
    return;
  }
  boot();
});
