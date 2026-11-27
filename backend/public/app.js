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
  
  // Home Page (Only USD)
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
    
    // ফিল্টার এবং সার্চ লজিক
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
      const isDone = t.submissionStatus === 'pending' || t.submissionStatus === 'approved';
      const statusStr = t.submissionStatus === 'pending' ? 'Under Review' : (t.submissionStatus === 'approved' ? 'Completed' : 'Available');
      
      return `
      <div class="list-item">
        <div class="left">
          ${t.logoUrl ? `<img src="${h(t.logoUrl)}" onerror="this.style.display='none'" />` : `<div style="width:40px;height:40px;background:var(--line);border-radius:8px;"></div>`}
          <div>
            <div class="title">${h(t.title)}</div>
            <div class="subtitle">${statusStr}</div>
          </div>
        </div>
        <div class="right">
          <div class="reward">+${h(t.reward)}</div>
          ${isDone 
            ? `<button class="btn sm ghost" disabled style="margin-top:6px;">Done</button>`
            : `<button class="btn sm" style="margin-top:6px;" onclick='openTask("${h(t.id)}")'>Start</button>`}
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

function openTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  state.currentTask = t;
  state.uploadedImageBase64 = null;
  
  el('tmTitle').textContent = t.title;
  el('tmInst').textContent = t.instruction || 'Complete the task to earn reward.';
  
  if (t.url) {
    el('tmLinkWrap').innerHTML = `<a href="${h(t.url)}" target="_blank" class="btn ghost" style="text-decoration:none;">Go to Link 🔗</a>`;
  } else {
    el('tmLinkWrap').innerHTML = '';
  }
  
  el('tmProofWrap').style.display = t.requiresProof ? 'block' : 'none';
  el('tmProof').value = '';
  el('uploadPreview').innerHTML = '📸 Click to upload screenshot';
  el('tmImage').value = '';
  
  el('taskModal').classList.add('active');
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    state.uploadedImageBase64 = e.target.result;
    el('uploadPreview').innerHTML = `<img src="${e.target.result}" />`;
    el('uploadPreview').style.color = '#fff';
  };
  reader.readAsDataURL(file);
}

async function submitTask() {
  const textProof = el('tmProof').value.trim();
  const hasImage = state.uploadedImageBase64 !== null;
  
  if (state.currentTask.requiresProof && !textProof && !hasImage) {
    return alert('Please provide a screenshot or code as proof.');
  }
  
  const finalProof = hasImage ? state.uploadedImageBase64 : textProof;
  
  if (hasImage && finalProof.length > 900000) {
    return alert('Image is too large. Please select a smaller screenshot.');
  }

  try {
    await api(`/api/tasks/${state.currentTask.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ proof: finalProof })
    });
    alert('Task submitted successfully! Please wait for admin approval.');
    closeModal('taskModal');
    loadTasks();
  } catch(e) { alert(e.message); }
}

async function loadReferrals() {
  try {
    const { data } = await api('/api/referrals');
    el('refLink').textContent = data.link;
    el('refLinkTop').textContent = data.link;
    el('refTotalTop').textContent = data.totalCount;
    
    if (!data.referrals.length) {
      el('refList').innerHTML = '<p class="muted" style="text-align:center; font-size:12px;">No referrals yet.</p>';
      return;
    }
    el('refList').innerHTML = data.referrals.map(r => `
      <div class="list-item" style="padding:10px;">
        <div class="left">
          <div>
            <div class="title" style="font-size:13px;">${h(r.firstName)} ${h(r.lastName)}</div>
            <div class="subtitle" style="font-size:11px;">ID: ${h(r.telegramId)}</div>
          </div>
        </div>
        <div class="right">
          <div style="font-size:11px; font-weight:bold; color:${r.status === 'successful' ? 'var(--ok)' : 'var(--warn)'}">${h(r.status)}</div>
        </div>
      </div>
    `).join('');
  } catch(e) {}
}

function copyRef() {
  const link = el('refLink').textContent;
  navigator.clipboard.writeText(link).then(() => {
    alert('Referral link copied!');
  });
}

function updatePaymentOptions() {
  const payments = state.config.payments || {};
  const select = el('wdMethod');
  select.innerHTML = '';
  
  let hasMethod = false;
  if (payments.bKash?.enabled) {
    select.innerHTML += `<option value="bKash">bKash</option>`;
    hasMethod = true;
  }
  if (payments.Nagad?.enabled) {
    select.innerHTML += `<option value="Nagad">Nagad</option>`;
    hasMethod = true;
  }
  if (payments.USDT?.enabled) {
    select.innerHTML += `<option value="Binance USDT">Binance USDT</option>`;
    hasMethod = true;
  }
  
  if (!hasMethod) {
    select.innerHTML = `<option value="">No payment methods available</option>`;
  }
}

async function loadWallet() {
  el('minW').textContent = '$' + toUSD(state.config.minWithdraw || 100);
  const reqRef = state.config.requiredReferrals !== undefined ? state.config.requiredReferrals : 10;
  el('wdRuleText').textContent = `You need at least ${reqRef} successful referral(s) to enable withdrawal.`;
  
  try {
    const { data } = await api('/api/history');
    if (!data.length) {
      el('historyList').innerHTML = '<p class="muted" style="text-align:center;">No history found.</p>';
      return;
    }
    el('historyList').innerHTML = data.map(x => {
      let typeName = x.type.toUpperCase().replace('_', ' ');
      return `
      <div class="list-item" style="padding:10px;">
        <div class="left">
          <div>
            <div class="title" style="font-size:13px;">${h(typeName)}</div>
            <div class="subtitle" style="font-size:11px;">${new Date(x.createdAt).toLocaleString()}</div>
          </div>
        </div>
        <div class="right">
          <div style="font-size:14px; font-weight:bold; color:${x.amount > 0 ? 'var(--ok)' : 'var(--bad)'}">
            ${x.amount > 0 ? '+' : ''}${x.amount}
          </div>
          <div style="font-size:10px; color:var(--mut);">${h(x.status)}</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

async function requestWithdraw() {
  const amount = Number(el('wdAmount').value);
  const method = el('wdMethod').value;
  const account = el('wdAccount').value.trim();
  
  if (!amount || !account || !method) return alert('Please fill all fields.');
  
  try {
    await api('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, method, account })
    });
    alert('Withdrawal requested! Wait for admin approval.');
    el('wdAmount').value = '';
    el('wdAccount').value = '';
    loadWallet();
    loadProfile();
  } catch(e) { alert(e.message); }
}

async function loadNotifications() {
  try {
    const { data } = await api('/api/notifications');
    
    // মেইন হোম পেজের নোটিশ বক্স
    if (data && data.length > 0) {
      el('noticeMarquee').innerHTML = `<span>${h(data[0].title)}: ${h(data[0].message)}</span>`;
    } else {
      el('noticeMarquee').innerHTML = `<span>No new notices.</span>`;
    }

    // পপআপের ভেতরের নোটিশ লিস্ট
    if (!data || data.length === 0) {
      el('modalNotifyList').innerHTML = '<p class="muted" style="text-align:center; font-size:12px;">No notifications.</p>';
    } else {
      el('modalNotifyList').innerHTML = data.map(n => `
        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-left: 3px solid var(--acc);">
          <div style="font-weight: 700; color: var(--acc); margin-bottom: 4px; font-size:13px;">${h(n.title)}</div>
          <div style="font-size: 12px; color: var(--txt); margin-bottom: 6px;">${h(n.message)}</div>
          <div style="font-size: 10px; color: var(--mut);">${new Date(n.createdAt).toLocaleString()}</div>
        </div>
      `).join('');
    }
  } catch(e) {}
}

function openNotificationsModal() {
  el('notifyModal').classList.add('active');
}

function closeModal(id) {
  el(id).classList.remove('active');
}

// --- STARTUP LOGIC ---
window.addEventListener('load', () => {
  if (checkChannelGate()) {
    boot();
  }
});