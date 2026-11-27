/* =========================================================
   EarnWallet - Frontend App Logic
   ========================================================= */

const API_BASE = window.location.origin;
const tg = window.Telegram?.WebApp;

/* ---------- Global State ---------- */
const state = {
  user: null,
  config: {},
  tasks: [],
  ads: [],
  currentTaskTab: 'all',
  referralData: null,
  currentTask: null,
  adSession: null,
  adInterval: null,
  uploadedImage: null
};

/* =========================================================
   API HELPER
   ========================================================= */
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (tg?.initData) {
    headers['Authorization'] = `tma ${tg.initData}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    data = { success: false, error: 'Invalid response from server.' };
  }

  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

/* =========================================================
   UI HELPERS
   ========================================================= */
function el(id) {
  return document.getElementById(id);
}

function fmtUSD(n) {
  const v = Number(n || 0);
  return '$' + v.toFixed(2);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(msg, type = 'info') {
  const div = document.createElement('div');
  div.textContent = msg;
  div.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:${type === 'error' ? '#ff5c5c' : type === 'success' ? '#2ecc71' : '#141a29'};
    color:#fff; padding:10px 18px; border-radius:8px; font-size:13px;
    z-index:9999; box-shadow:0 4px 15px rgba(0,0,0,0.5);
    border:1px solid rgba(255,255,255,0.1); max-width:90%;
    animation: fadeIn 0.2s ease;
  `;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity 0.3s';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 300);
  }, 2500);
}

function openModal(id) {
  el(id)?.classList.add('active');
}

function closeModal(id) {
  el(id)?.classList.remove('active');
}

/* =========================================================
   CHANNEL GATE
   ========================================================= */
async function checkChannelGate() {
  try {
    const res = await api('/api/verify-channel', { method: 'POST', body: '{}' });
    if (res.joined) {
      el('channelGate').style.display = 'none';
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function verifyChannel() {
  const btn = el('verifyBtn');
  const msg = el('verifyMsg');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  msg.textContent = '';
  msg.style.color = 'var(--mut)';

  try {
    const res = await api('/api/verify-channel', { method: 'POST', body: '{}' });
    if (res.joined) {
      msg.textContent = '✅ Verified! Loading app...';
      msg.style.color = 'var(--ok)';
      el('channelGate').style.display = 'none';
      setTimeout(() => boot(), 600);
    } else {
      msg.textContent = res.error || 'You have not joined yet.';
      msg.style.color = 'var(--bad)';
    }
  } catch (e) {
    msg.textContent = e.message || 'Verification failed.';
    msg.style.color = 'var(--bad)';
  } finally {
    btn.disabled = false;
    btn.textContent = 'I have joined, Verify';
  }
}

/* =========================================================
   BOOT & INIT
   ========================================================= */
async function boot() {
  try {
    if (tg) {
      tg.ready();
      tg.expand();
      try { tg.setHeaderColor?.('#0b0f19'); } catch (_) {}
      try { tg.setBackgroundColor?.('#0b0f19'); } catch (_) {}
    }

    if (!tg?.initData) {
      el('loader').textContent = 'Please open this app from Telegram.';
      return;
    }

    // 1. Auth / Register
    const auth = await api('/api/auth', { method: 'POST', body: '{}' });
    state.user = auth.data;

    // 2. Load config
    try {
      const cfg = await api('/api/app-config');
      state.config = cfg.data || {};
    } catch (e) {
      state.config = {};
      if (e.payload?.maintenance) {
        el('loader').textContent = e.payload.error || 'Under maintenance';
        return;
      }
    }

    if (state.config.maintenance) {
      el('loader').textContent = state.config.maintenanceMessage || 'Under maintenance';
      return;
    }

    // 3. Channel gate (skip if config doesn't need it — we still enforce)
    const joined = await checkChannelGate();
    if (!joined) {
      el('loader').style.display = 'none';
      el('channelGate').style.display = 'flex';
      // Set channel URLs
      const ch1 = state.config.channels?.[0] || 'https://t.me/EarnWallet_Official';
      const ch2 = state.config.channels?.[1] || 'https://t.me/All_Official_Channal';
      el('gateChannel1').href = ch1;
      el('gateChannel2').href = ch2;
      return;
    }

    // 4. Show app
    renderUserHeader();
    renderHome();
    renderWalletMethods();
    el('loader').style.display = 'none';
    el('app-header').style.display = 'flex';
    el('app-main').style.display = 'block';
    el('app-nav').style.display = 'flex';

    // 5. Load dynamic content (parallel)
    loadTasks();
    loadAds();
    loadLiveFeed();
    loadNotificationsMarquee();
    loadLeaderboard();
    loadReferrals();
    loadHistory();
    loadBanners();

  } catch (e) {
    console.error('Boot error:', e);
    if (e.status === 403) {
      el('loader').textContent = e.message || 'Access denied';
    } else if (e.status === 503) {
      el('loader').textContent = e.payload?.error || 'Maintenance';
    } else {
      el('loader').textContent = e.message || 'Failed to load. Reopen the app.';
    }
  }
}

/* =========================================================
   RENDER: HEADER + HOME
   ========================================================= */
function renderUserHeader() {
  const u = state.user;
  if (!u) return;

  el('userName').textContent = u.firstName || u.username || 'User';
  el('headerId').textContent = `ID: ${u.telegramId || '0'}`;
  if (u.photoUrl) {
    el('userPic').src = u.photoUrl;
    el('profPic').src = u.photoUrl;
  }
  el('headerBalance').textContent = fmtUSD(u.balance);

  // Profile
  el('profName').textContent = u.firstName || u.username || 'User';
  el('profBalanceTop').textContent = Math.floor(Number(u.balance || 0));
}

function renderHome() {
  const u = state.user;
  if (!u) return;

  el('homeBalance').textContent = fmtUSD(u.balance);
  el('todayEarn').textContent = fmtUSD(u.todayEarnings);
  el('totalEarn').textContent = fmtUSD(u.totalEarnings);
}

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */
function switchPage(page, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = el('page-' + page);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) {
    navEl.classList.add('active');
  } else {
    const items = document.querySelectorAll('.nav-item');
    const map = { home: 0, tasks: 1, rank: 2, refer: 3, profile: 4, wallet: 4 };
    if (map[page] !== undefined && items[map[page]]) items[map[page]].classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   TASKS
   ========================================================= */
async function loadTasks() {
  const container = el('tasksList');
  if (!container) return;
  container.innerHTML = '<div class="muted" style="text-align:center; padding:20px;">Loading tasks...</div>';

  try {
    const res = await api('/api/tasks');
    state.tasks = res.data || [];
    renderTasks();
  } catch (e) {
    container.innerHTML = `<div class="muted" style="text-align:center; padding:20px;">${escapeHtml(e.message)}</div>`;
  }
}

function switchTaskTab(tab, btnEl) {
  state.currentTaskTab = tab;
  document.querySelectorAll('#page-tasks .tab-btn').forEach(b => b.classList.remove('active'));
  btnEl?.classList.add('active');
  renderTasks();
}

function renderTasks() {
  const container = el('tasksList');
  if (!container) return;

  const search = (el('taskSearch')?.value || '').toLowerCase().trim();
  const tab = state.currentTaskTab;

  let list = state.tasks.filter(t => {
    if (search && !String(t.title || '').toLowerCase().includes(search)) return false;
    if (tab !== 'all') {
      const url = String(t.url || '').toLowerCase();
      if (tab === 'telegram' && !url.includes('t.me') && !url.includes('telegram')) return false;
      if (tab === 'twitter' && !url.includes('twitter') && !url.includes('x.com')) return false;
      if (tab === 'youtube' && !url.includes('youtube') && !url.includes('youtu.be')) return false;
    }
    return true;
  });

  if (!list.length) {
    container.innerHTML = '<div class="muted" style="text-align:center; padding:20px;">No tasks available.</div>';
    return;
  }

  container.innerHTML = list.map(t => {
    const status = t.submissionStatus;
    const isDone = status === 'approved';
    const isPending = status === 'pending';
    const disabled = isDone || isPending;

    let btnLabel = 'Start';
    if (isDone) btnLabel = '✅ Done';
    else if (isPending) btnLabel = '⏳ Pending';
    else if (status === 'rejected') btnLabel = 'Retry';

    return `
      <div class="list-item">
        <div class="left">
          <img src="${escapeHtml(t.logoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(t.title || 'T') + '&background=141a29&color=ff7f00')}" alt="" />
          <div>
            <div class="title">${escapeHtml(t.title || 'Task')}</div>
            <div class="subtitle">${escapeHtml((t.instruction || '').slice(0, 60))}</div>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <div class="reward">+${fmtUSD(t.reward)}</div>
          <button class="btn sm" ${disabled ? 'disabled style="opacity:0.5;"' : ''} onclick="openTask('${t.id}')">${btnLabel}</button>
        </div>
      </div>
    `;
  }).join('');
}

function openTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.currentTask = task;
  state.uploadedImage = null;

  el('tmTitle').textContent = task.title || 'Task';
  el('tmInst').textContent = task.instruction || 'Complete the task and submit proof.';

  const linkWrap = el('tmLinkWrap');
  if (task.url) {
    linkWrap.innerHTML = `<a href="${escapeHtml(task.url)}" target="_blank" class="btn ghost" style="text-decoration:none;">🔗 Open Link</a>`;
  } else {
    linkWrap.innerHTML = '';
  }

  el('tmProof').value = '';
  el('uploadPreview').innerHTML = '📸 Click to upload screenshot';
  el('tmImage').value = '';
  el('tmProofWrap').style.display = task.requiresProof ? 'block' : 'block';

  openModal('taskModal');
}

function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    toast('Image too large (max 4MB)', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    state.uploadedImage = e.target.result;
    el('uploadPreview').innerHTML = `<img src="${e.target.result}" alt="preview" />`;
  };
  reader.readAsDataURL(file);
}

async function submitTask() {
  const task = state.currentTask;
  if (!task) return;

  const textProof = el('tmProof').value.trim();
  const proof = state.uploadedImage || textProof;

  if (task.requiresProof && !proof) {
    toast('Please upload screenshot or enter proof.', 'error');
    return;
  }

  try {
    await api(`/api/tasks/${task.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ proof })
    });
    toast('Task submitted for review!', 'success');
    closeModal('taskModal');
    loadTasks();
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* =========================================================
   ADS
   ========================================================= */
async function loadAds() {
  try {
    const res = await api('/api/ads');
    state.ads = res.data || [];
    renderAds();
  } catch (e) {
    state.ads = [];
    renderAds();
  }
}

function renderAds() {
  const container = el('adsList');
  if (!container) return;

  if (!state.ads.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = state.ads.map(ad => `
    <div class="list-item">
      <div class="left">
        <img src="${escapeHtml(ad.bannerUrl || 'https://ui-avatars.com/api/?name=Ad&background=141a29&color=ff7f00')}" alt="" />
        <div>
          <div class="title">${escapeHtml(ad.title)}</div>
          <div class="subtitle">⏱ ${ad.duration}s watch</div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
        <div class="reward">+${fmtUSD(ad.reward)}</div>
        <button class="btn sm" onclick="startAd('${ad.id}')">Watch</button>
      </div>
    </div>
  `).join('');
}

async function startAd(id) {
  try {
    const res = await api(`/api/ads/${id}/start`, { method: 'POST', body: '{}' });
    state.adSession = res.data;

    if (res.data.url) {
      window.open(res.data.url, '_blank');
    }

    openModal('adModal');
    el('adUrlText').textContent = 'Please wait for the timer...';

    let remaining = res.data.duration;
    el('adTimer').textContent = remaining + 's';
    el('adClaimBtn').style.display = 'none';

    clearInterval(state.adInterval);
    state.adInterval = setInterval(() => {
      remaining--;
      el('adTimer').textContent = remaining > 0 ? remaining + 's' : 'Done!';
      if (remaining <= 0) {
        clearInterval(state.adInterval);
        el('adClaimBtn').style.display = 'block';
      }
    }, 1000);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function claimAd() {
  if (!state.adSession) return;
  try {
    const res = await api('/api/ads/complete', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.adSession.sessionId })
    });

    toast(`Earned ${fmtUSD(res.data.reward)}!`, 'success');
    closeModal('adModal');
    clearInterval(state.adInterval);
    state.adSession = null;

    // Refresh user
    await refreshUser();
    loadAds();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function refreshUser() {
  try {
    const res = await api('/api/me');
    state.user = res.data;
    renderUserHeader();
    renderHome();
    renderReferralsTop();
  } catch (_) {}
}

/* =========================================================
   LIVE FEED / NOTICES / BANNERS
   ========================================================= */
async function loadLiveFeed() {
  try {
    const res = await api('/api/live-withdrawals');
    const items = res.data || [];
    const feed = el('liveFeed');
    if (!feed) return;

    if (!items.length) {
      feed.innerHTML = '<div class="live-item">No recent withdrawals.</div>';
      return;
    }

    feed.innerHTML = items.map(x => `
      <div class="live-item">
        💸 <b>${escapeHtml(x.name || 'User')}</b> withdrew ${fmtUSD(x.amount)} via ${escapeHtml(x.method || '')}
      </div>
    `).join('');
  } catch (_) {}
}

async function loadNotificationsMarquee() {
  try {
    const res = await api('/api/notifications');
    const items = res.data || [];
    const marquee = el('noticeMarquee');
    if (!marquee) return;

    if (!items.length) {
      marquee.textContent = 'Welcome to EarnWallet! Start earning now.';
      return;
    }

    const text = items
      .slice(0, 5)
      .map(n => `📢 ${n.title || ''}: ${n.message || ''}`)
      .join('   •   ');
    marquee.textContent = text;
  } catch (_) {}
}

async function loadBanners() {
  try {
    const res = await api('/api/ad-placements');
    const placements = res.data || {};
    const top = placements.top;
    const banner = el('scrollBanner');
    if (top && top.html && banner) {
      banner.innerHTML = `<div class="banner-item">${top.html}</div>`;
    }
  } catch (_) {}
}

/* =========================================================
   NOTIFICATIONS MODAL
   ========================================================= */
async function openNotificationsModal() {
  openModal('notifyModal');
  const list = el('modalNotifyList');
  list.innerHTML = '<div class="muted">Loading...</div>';

  try {
    const res = await api('/api/notifications');
    const items = res.data || [];
    if (!items.length) {
      list.innerHTML = '<div class="muted" style="text-align:center; padding:15px;">No notifications.</div>';
      return;
    }

    list.innerHTML = items.map(n => `
      <div style="background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px;">
        <div style="font-weight:700; font-size:13px; margin-bottom:4px;">${escapeHtml(n.title)}</div>
        <div style="font-size:12px; color:var(--mut);">${escapeHtml(n.message)}</div>
        <div style="font-size:10px; color:var(--mut); margin-top:6px;">${escapeHtml((n.createdAt || '').slice(0, 10))}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="muted">${escapeHtml(e.message)}</div>`;
  }
}

/* =========================================================
   LEADERBOARD
   ========================================================= */
async function loadLeaderboard() {
  const container = el('leaderboardList');
  if (!container) return;
  container.innerHTML = '<div class="muted" style="text-align:center; padding:15px;">Loading...</div>';

  try {
    const res = await api('/api/leaderboard');
    const items = res.data || [];
    if (!items.length) {
      container.innerHTML = '<div class="muted" style="text-align:center; padding:15px;">No data yet.</div>';
      return;
    }

    container.innerHTML = items.map(x => `
      <div class="rank-item">
        <div class="rank-left">
          <div class="rank-num ${x.rank === 1 ? 'top1' : x.rank === 2 ? 'top2' : x.rank === 3 ? 'top3' : ''}">#${x.rank}</div>
          <div class="rank-name">${escapeHtml(x.name || 'Anonymous')}</div>
        </div>
        <div class="rank-amount">${fmtUSD(x.amount)}</div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div class="muted" style="text-align:center; padding:15px;">${escapeHtml(e.message)}</div>`;
  }
}

/* =========================================================
   REFERRALS
   ========================================================= */
async function loadReferrals() {
  try {
    const res = await api('/api/referrals');
    state.referralData = res.data;
    renderReferralsTop();
    renderReferralList();
  } catch (_) {}
}

function renderReferralsTop() {
  const data = state.referralData;
  if (!data) return;
  el('refTotalTop').textContent = data.successfulCount ?? 0;
  el('refLinkTop').textContent = data.link || '...';
  el('refLink').textContent = data.link || '...';
}

function renderReferralList() {
  const container = el('refList');
  if (!container) return;
  const data = state.referralData;
  if (!data || !data.referrals || !data.referrals.length) {
    container.innerHTML = '<div class="muted" style="text-align:center; padding:15px;">No referrals yet. Invite friends!</div>';
    return;
  }

  container.innerHTML = data.referrals.map(r => `
    <div class="list-item">
      <div class="left">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.firstName || 'U')}&background=141a29&color=ff7f00" alt="" />
        <div>
          <div class="title">${escapeHtml(r.firstName)} ${escapeHtml(r.lastName || '')}</div>
          <div class="subtitle">${r.completedAds}/${r.requiredAds} ads completed</div>
        </div>
      </div>
      <div class="reward" style="color:${r.status === 'successful' ? 'var(--ok)' : 'var(--warn)'};">
        ${r.status === 'successful' ? '✅ Success' : '⏳ In progress'}
      </div>
    </div>
  `).join('');
}

function copyRef() {
  const link = state.referralData?.link;
  if (!link) {
    toast('Referral link not ready', 'error');
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(() => toast('Link copied!', 'success'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Link copied!', 'success');
  }
}

/* =========================================================
   WALLET / WITHDRAW
   ========================================================= */
function renderWalletMethods() {
  const select = el('wdMethod');
  if (!select) return;

  const payments = state.config.payments || {};
  select.innerHTML = '';

  const map = {
    bKash: 'bKash',
    Nagad: 'Nagad',
    USDT: 'Binance USDT'
  };

  let hasAny = false;
  for (const key of Object.keys(map)) {
    if (payments[key]?.enabled !== false) {
      const opt = document.createElement('option');
      opt.value = payments[key]?.label || map[key];
      opt.textContent = payments[key]?.label || map[key];
      select.appendChild(opt);
      hasAny = true;
    }
  }

  if (!hasAny) {
    const opt = document.createElement('option');
    opt.value = 'bKash';
    opt.textContent = 'bKash';
    select.appendChild(opt);
  }

  const minW = Number(state.config.minWithdraw || 1);
  el('minW').textContent = fmtUSD(minW);
  el('wdRuleText').textContent = `Minimum withdrawal: ${fmtUSD(minW)}. Required successful referrals: ${state.config.requiredReferrals ?? 10}.`;
}

async function requestWithdraw() {
  const amount = Number(el('wdAmount').value);
  const method = el('wdMethod').value;
  const account = el('wdAccount').value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Enter a valid amount', 'error');
    return;
  }
  if (!account) {
    toast('Enter your account details', 'error');
    return;
  }

  try {
    await api('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, method, account })
    });
    toast('Withdrawal request submitted!', 'success');
    el('wdAmount').value = '';
    el('wdAccount').value = '';
    await refreshUser();
    loadHistory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* =========================================================
   HISTORY
   ========================================================= */
async function loadHistory() {
  const container = el('historyList');
  if (!container) return;
  container.innerHTML = '<div class="muted" style="text-align:center; padding:15px;">Loading...</div>';

  try {
    const res = await api('/api/history');
    const items = res.data || [];
    if (!items.length) {
      container.innerHTML = '<div class="muted" style="text-align:center; padding:15px;">No history yet.</div>';
      return;
    }

    container.innerHTML = items.map(x => {
      const isPositive = Number(x.amount) >= 0;
      const color = isPositive ? 'var(--ok)' : 'var(--bad)';
      const sign = isPositive ? '+' : '';
      return `
        <div class="list-item">
          <div class="left">
            <div style="width:40px; height:40px; border-radius:8px; background:var(--bg); display:flex; align-items:center; justify-content:center; font-size:18px;">
              ${x.type === 'ad_reward' ? '📺' : x.type === 'task_reward' ? '✅' : x.type === 'withdrawal' ? '💸' : '💰'}
            </div>
            <div>
              <div class="title">${escapeHtml(x.note || x.type)}</div>
              <div class="subtitle">${escapeHtml((x.createdAt || '').slice(0, 16).replace('T', ' '))} • ${escapeHtml(x.status || '')}</div>
            </div>
          </div>
          <div style="color:${color}; font-weight:700;">${sign}${fmtUSD(x.amount)}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div class="muted" style="text-align:center; padding:15px;">${escapeHtml(e.message)}</div>`;
  }
}

/* =========================================================
   GLOBAL EXPORTS (for inline handlers)
   ========================================================= */
window.switchPage = switchPage;
window.switchTaskTab = switchTaskTab;
window.openTask = openTask;
window.handleImageUpload = handleImageUpload;
window.submitTask = submitTask;
window.startAd = startAd;
window.claimAd = claimAd;
window.openNotificationsModal = openNotificationsModal;
window.closeModal = closeModal;
window.copyRef = copyRef;
window.requestWithdraw = requestWithdraw;
window.verifyChannel = verifyChannel;

/* =========================================================
   START
   ========================================================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}