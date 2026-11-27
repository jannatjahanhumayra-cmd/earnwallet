const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const INIT = tg?.initData || '';

let state = {
  user: {},
  config: {},
  ads: [],
  tasks: [],
  currentAd: null,
  currentTask: null,
  uploadedImageBase64: null,
  filterType: 'all',
  searchQuery: ''
};

function el(id) { return document.getElementById(id); }
function h(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function toUSD(coins) { return (Number(coins) / 100).toFixed(3); } // 100 Coins = $1.00

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `tma ${INIT}`,
      ...(opts.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

// --- CHANNEL VERIFY LOGIC ---
function checkChannelGate() {
  const isVerified = localStorage.getItem('channel_verified');
  if (!isVerified) {
    el('loader').style.display = 'none';
    el('channelGate').style.display = 'flex';
    return false;
  }
  return true;
}

async function verifyChannel() {
  const btn = el('verifyBtn');
  const msg = el('verifyMsg');
  
  btn.textContent = 'Verifying...';
  btn.style.background = 'var(--mut)';
  btn.disabled = true;
  msg.textContent = '';
  
  try {
    const res = await api('/api/verify-channel', { method: 'POST' });
    
    if (res.joined) {
      localStorage.setItem('channel_verified', 'true');
      el('channelGate').style.display = 'none';
      el('loader').style.display = 'flex';
      boot(); // অ্যাপ চালু করবে
    } else {
      throw new Error(res.error || 'You have not joined all channels.');
    }
  } catch (e) {
    msg.style.color = 'var(--bad)';
    msg.textContent = e.message;
    btn.textContent = 'Try Again';
    btn.style.background = 'var(--ok)';
    btn.disabled = false;
  }
}

// --- BOOT APP ---
async function boot() {
  if (!INIT) {
    el('loader').innerHTML = '❌ Open from Telegram Bot.';
    return;
  }
  try {
    await api('/api/auth', { method: 'POST' });
    const cfg = await api('/api/app-config');
    state.config = cfg.data;
    
    if (state.config.maintenance) {
      el('loader').innerHTML = `🛠 Maintenance<br><span style="font-size:14px;color:#888;margin-top:10px;display:block;">${h(state.config.maintenanceMessage)}</span>`;
      return;
    }

    // সেটিংস থেকে চ্যানেল লিংক আপডেট
    if(state.config.channels && state.config.channels.length > 0) {
      if(el('gateChannel1')) el('gateChannel1').href = state.config.channels[0];
      if(el('gateChannel2') && state.config.channels.length > 1) el('gateChannel2').href = state.config.channels[1];
    }
    
    await loadProfile();
    
    el('loader').style.display = 'none';
    el('app-header').style.display = 'flex';
    el('app-main').style.display = 'block';
    el('app-nav').style.display = 'flex';

    loadLiveFeed();
    loadAds();
    loadTasks();
    loadReferrals();
    loadWallet();
    loadNotifications();
    loadLeaderboard();
    loadBanner(); // নতুন ব্যানার স্ক্রলার
    updatePaymentOptions();

  } catch (e) {
    el('loader').innerHTML = `❌ Error: ${h(e.message)}`;
  }
}

async function loadProfile() {
  const { data } = await api('/api/me');
  state.user = data;
  
  const picUrl = data.photoUrl || 'https://ui-avatars.com/api/?name=' + (data.firstName || 'U') + '&background=141a29&color=ff7f00';
  const usdBalance = toUSD(data.balance); 
  
  el('userName').textContent = data.firstName || 'User';
  el('headerId').textContent = 'ID: ' + data.telegramId;
  el('userPic').src = picUrl;
  el('headerBalance').innerHTML = `<span style="font-size:10px">$</span> ` + usdBalance;
  
  el('homeBalance').innerHTML = '$' + usdBalance;
  el('todayEarn').textContent = '$' + toUSD(data.todayEarnings);
  el('totalEarn').textContent = '$' + toUSD(data.totalEarnings);
  
  el('profPic').src = picUrl;
  el('profName').textContent = data.firstName || 'User';
  el('profWalletBalance').innerHTML = '$' + usdBalance;
  el('profBalanceTop').textContent = data.balance;
}

function switchPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el('page-' + pageId).classList.add('active');
  if(navEl) navEl.classList.add('active');
}

// --- NEW: LOAD SCROLL BANNER ---
async function loadBanner() {
  try {
    const { data } = await api('/api/ad-placements');
    if (data && data.top && data.top.html) {
      el('scrollBanner').innerHTML = `<div class="banner-item">${data.top.html}</div>`;
    } else {
      el('scrollBanner').innerHTML = `<div class="banner-item">Welcome to EarnWallet! Start earning now.</div>`;
    }
  } catch(e) {}
}

// --- NEW: LOAD LEADERBOARD ---
async function loadLeaderboard() {
  try {
    const { data } = await api('/api/leaderboard');
    if (!data.length) {
      el('leaderboardList').innerHTML = '<p class="muted" style="text-align:center;">No data available.</p>';
      return;
    }
    el('leaderboardList').innerHTML = data.map(u => `
      <div class="rank-item">
        <div class="rank-left">
          <div class="rank-num ${u.rank === 1 ? 'top1' : u.rank === 2 ? 'top2' : u.rank === 3 ? 'top3' : ''}">#${u.rank}</div>
          <div class="rank-name">${h(u.name)}</div>
        </div>
        <div class="rank-amount">$${toUSD(u.amount)}</div>
      </div>
    `).join('');
  } catch(e) {}
}

function switchTaskTab(type, elm) {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  elm.classList.add('active');
  state.filterType = type;
  loadTasks();
}

async function loadLiveFeed() {
  try {
    const { data } = await api('/api/live-withdrawals');
    if (!data.length) {
      el('liveFeed').innerHTML = '<div class="live-item" style="color:var(--mut)">No recent withdrawals.</div>';
      return;
    }
    el('liveFeed').innerHTML = data.map(x => `
      <div class="live-item">
        🟢 <b>${h(x.name)}</b> withdrew <b>${h(x.amount)}$</b> via ${h(x.method)}
      </div>
    `).join('');
  } catch(e) {}
}

async function loadAds() {
  try {
    const { data } = await api('/api/ads');
    state.ads = data;
    if (!data.length) {
      el('adsList').innerHTML = '<p class="muted" style="text-align:center;">No ads available.</p>';
      return;
    }
    el('adsList').innerHTML = data.map(a => `
      <div class="list-item">
        <div class="left">
          ${a.bannerUrl ? `<img src="${h(a.bannerUrl)}" onerror="this.style.display='none'" />` : `<div style="width:40px;height:40px;background:var(--line);border-radius:8px;"></div>`}
          <div>
            <div class="title">${h(a.title)}</div>
            <div class="subtitle">${a.duration} seconds</div>
          </div>
        </div>
        <div class="right">
          <div class="reward">+${h(a.reward)}</div>
          <button class="btn sm" style="margin-top:6px;" onclick='startAd("${h(a.id)}")'>Watch</button>
        </div>
      </div>
    `).join('');
  } catch(e) {}
}

async function startAd(id) {
  try {
    const { data } = await api(`/api/ads/${id}/start`, { method: 'POST' });
    state.currentAd = data;
    
    el('adModal').classList.add('active');
    el('adUrlText').innerHTML = `Opening link... <br><a href="${h(data.url)}" target="_blank" style="color:var(--acc)">Click here if not opened</a>`;
    window.open(data.url, '_blank');
    
    let timeLeft = data.duration;
    el('adTimer').textContent = timeLeft + 's';
    el('adClaimBtn').style.display = 'none';
    
    const timer = setInterval(() => {
      timeLeft--;
      el('adTimer').textContent = timeLeft + 's';
      if (timeLeft <= 0) {
        clearInterval(timer);
        el('adTimer').textContent = 'Done!';
        el('adClaimBtn').style.display = 'flex';
      }
    }, 1000);
  } catch(e) { alert(e.message); }
}

async function claimAd() {
  try {
    const { data } = await api('/api/ads/complete', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.currentAd.sessionId })
    });
    alert(`Success! You earned ${data.reward} coins.`);
    closeModal('adModal');
    loadProfile();
    loadAds();
  } catch(e) { alert(e.message); }
}

async function loadTasks() {
  try {
    const { data } = await api('/api/tasks');
    state.tasks = data;
    
    const q = (el('taskSearch')?.value || '').toLowerCase().trim();
    let filtered = data;
    
    if (state.filterType !== 'all') {
      filtered = filtered.filter(t => 
        String(t.title).toLowerCase().includes(state.filterType) || 
        String(t.instruction).toLowerCase().includes(state.filterType)
      );
    }
    
    if (q) {
      filtered = filtered.filter(t => 
        String(t.title).toLowerCase().includes(q) || 
        String(t.instruction).toLowerCase().includes(q)
      );
    }

    if (!filtered.length) {
      el('tasksList').innerHTML = '<p class="muted" style="text-align:center;">No tasks found.</p>';
      return;
    }
    
    el('tasksList').innerHTML = filtered.map(t => {
      const isDone = t