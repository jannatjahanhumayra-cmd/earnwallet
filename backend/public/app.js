const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const INIT = tg?.initData || '';

let state = {
  user: {},
  config: {},
  ads: [],
  tasks: [],
  currentAd: null,
  currentTask: null
};

function el(id) { return document.getElementById(id); }
function h(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 }); }

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

async function boot() {
  if (!INIT) {
    el('loader').innerHTML = '❌ টেলিগ্রাম বট থেকে ওপেন করুন।';
    return;
  }
  try {
    await api('/api/auth', { method: 'POST' });
    const cfg = await api('/api/app-config');
    state.config = cfg.data;
    
    if (state.config.maintenance) {
      el('loader').innerHTML = `🛠 মেইনটেন্যান্স<br><span style="font-size:14px;color:#888;margin-top:10px;display:block;">${h(state.config.maintenanceMessage)}</span>`;
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
    el('loader').innerHTML = `❌ এরর: ${h(e.message)}`;
  }
}

async function loadProfile() {
  const { data } = await api('/api/me');
  state.user = data;
  
  const picUrl = data.photoUrl || 'https://ui-avatars.com/api/?name=' + (data.firstName || 'U') + '&background=141a29&color=ff7f00';
  const usdBalance = (Number(data.balance) / 100).toFixed(3); 
  
  el('userName').textContent = data.firstName || 'User';
  el('headerId').textContent = 'ID: ' + data.telegramId;
  el('userPic').src = picUrl;
  el('headerBalance').innerHTML = `<span style="font-size:10px">$</span> ` + usdBalance;
  
  el('homeBalance').innerHTML = usdBalance + ' <span>USDT</span>';
  el('todayEarn').textContent = fmt(data.todayEarnings);
  el('totalEarn').textContent = fmt(data.totalEarnings);
  
  el('profPic').src = picUrl;
  el('profName').textContent = data.firstName || 'User';
  el('profWalletBalance').innerHTML = usdBalance + ' <span>USDT</span>';
  el('profBalanceTop').textContent = data.balance;
}

function switchPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el('page-' + pageId).classList.add('active');
  if(navEl) navEl.classList.add('active');
}

function switchTaskTab(type, elm) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  elm.classList.add('active');
  
  if(type === 'all') {
    el('tasksList').style.display = 'block';
    el('adsList').style.display = 'none';
  } else {
    el('tasksList').style.display = 'none';
    el('adsList').style.display = 'block';
  }
}

async function loadLiveFeed() {
  try {
    const { data } = await api('/api/live-withdrawals');
    if (!data.length) {
      el('liveFeed').innerHTML = '<div class="live-item" style="color:var(--mut)">সাম্প্রতিক কোনো উইথড্র নেই।</div>';
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
      el('adsList').innerHTML = '<p class="muted" style="text-align:center;">এখন কোনো অ্যাড নেই।</p>';
      return;
    }
    el('adsList').innerHTML = data.map(a => `
      <div class="list-item">
        <div class="left">
          ${a.bannerUrl ? `<img src="${h(a.bannerUrl)}" onerror="this.style.display='none'" />` : `<div style="width:50px;height:50px;background:var(--line);border-radius:12px;"></div>`}
          <div>
            <div class="title">${h(a.title)}</div>
            <div class="subtitle">${a.duration} সেকেন্ড</div>
          </div>
        </div>
        <div class="right">
          <div class="reward">+${h(a.reward)}</div>
          <button class="btn sm" style="margin-top:8px;" onclick='startAd("${h(a.id)}")'>দেখুন</button>
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
    el('adUrlText').innerHTML = `লিংক ওপেন হচ্ছে... <br><a href="${h(data.url)}" target="_blank" style="color:var(--acc)">এখানে ক্লিক করুন</a>`;
    window.open(data.url, '_blank');
    
    let timeLeft = data.duration;
    el('adTimer').textContent = timeLeft + 's';
    el('adClaimBtn').style.display = 'none';
    
    const timer = setInterval(() => {
      timeLeft--;
      el('adTimer').textContent = timeLeft + 's';
      if (timeLeft <= 0) {
        clearInterval(timer);
        el('adTimer').textContent = 'সম্পন্ন!';
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
    alert(`সফল! আপনি ${data.reward} কয়েন পেয়েছেন।`);
    closeModal('adModal');
    loadProfile();
    loadAds();
  } catch(e) { alert(e.message); }
}

async function loadTasks() {
  try {
    const { data } = await api('/api/tasks');
    state.tasks = data;
    if (!data.length) {
      el('tasksList').innerHTML = '<p class="muted" style="text-align:center;">এখন কোনো কাজ নেই।</p>';
      return;
    }
    el('tasksList').innerHTML = data.map(t => {
      const isDone = t.submissionStatus === 'pending' || t.submissionStatus === 'approved';
      const statusStr = t.submissionStatus === 'pending' ? 'রিভিউতে আছে' : (t.submissionStatus === 'approved' ? 'সম্পন্ন' : 'উপলব্ধ');
      
      return `
      <div class="list-item">
        <div class="left">
          ${t.logoUrl ? `<img src="${h(t.logoUrl)}" onerror="this.style.display='none'" />` : `<div style="width:50px;height:50px;background:var(--line);border-radius:12px;"></div>`}
          <div>
            <div class="title">${h(t.title)}</div>
            <div class="subtitle">${statusStr}</div>
          </div>
        </div>
        <div class="right">
          <div class="reward">+${h(t.reward)}</div>
          ${isDone 
            ? `<button class="btn sm ghost" disabled style="margin-top:8px;">সম্পন্ন</button>`
            : `<button class="btn sm" style="margin-top:8px;" onclick='openTask("${h(t.id)}")'>শুরু</button>`}
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

function openTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  state.currentTask = t;
  
  el('tmTitle').textContent = t.title;
  el('tmInst').textContent = t.instruction || 'কাজটি সম্পন্ন করে রিওয়ার্ড নিন।';
  
  if (t.url) {
    el('tmLinkWrap').innerHTML = `<a href="${h(t.url)}" target="_blank" class="btn ghost" style="text-decoration:none;">লিংকে যান 🔗</a>`;
  } else {
    el('tmLinkWrap').innerHTML = '';
  }
  
  el('tmProofWrap').style.display = t.requiresProof ? 'block' : 'none';
  el('tmProof').value = '';
  
  el('taskModal').classList.add('active');
}

async function submitTask() {
  const proof = el('tmProof').value.trim();
  if (state.currentTask.requiresProof && !proof) {
    return alert('অনুগ্রহ করে প্রুফ দিন।');
  }
  try {
    await api(`/api/tasks/${state.currentTask.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ proof })
    });
    alert('কাজ সাবমিট হয়েছে! অ্যাডমিন এপ্রুভ করার জন্য অপেক্ষা করুন।');
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
      el('refList').innerHTML = '<p class="muted" style="text-align:center; font-size:13px;">কোনো রেফারেল নেই।</p>';
      return;
    }
    el('refList').innerHTML = data.referrals.map(r => `
      <div class="list-item" style="padding:12px;">
        <div class="left">
          <div>
            <div class="title" style="font-size:14px;">${h(r.firstName)} ${h(r.lastName)}</div>
            <div class="subtitle" style="font-size:11px;">ID: ${h(r.telegramId)}</div>
          </div>
        </div>
        <div class="right">
          <div style="font-size:12px; font-weight:bold; color:${r.status === 'successful' ? 'var(--ok)' : 'var(--warn)'}">${h(r.status)}</div>
        </div>
      </div>
    `).join('');
  } catch(e) {}
}

function copyRef() {
  const link = el('refLink').textContent;
  navigator.clipboard.writeText(link).then(() => {
    alert('রেফারেল লিংক কপি হয়েছে!');
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
    select.innerHTML = `<option value="">কোনো মেথড চালু নেই</option>`;
  }
}

async function loadWallet() {
  el('minW').textContent = state.config.minWithdraw || 100;
  const reqRef = state.config.requiredReferrals !== undefined ? state.config.requiredReferrals : 10;
  el('wdRuleText').textContent = `উত্তোলনের জন্য কমপক্ষে ${reqRef} টি সফল রেফারেল প্রয়োজন।`;
  
  try {
    const { data } = await api('/api/history');
    if (!data.length) {
      el('historyList').innerHTML = '<p class="muted" style="text-align:center;">কোনো হিস্টোরি নেই।</p>';
      return;
    }
    el('historyList').innerHTML = data.map(x => {
      let typeName = x.type.toUpperCase().replace('_', ' ');
      return `
      <div class="list-item" style="padding:12px;">
        <div class="left">
          <div>
            <div class="title" style="font-size:14px;">${h(typeName)}</div>
            <div class="subtitle" style="font-size:11px;">${new Date(x.createdAt).toLocaleString()}</div>
          </div>
        </div>
        <div class="right">
          <div style="font-size:15px; font-weight:bold; color:${x.amount > 0 ? 'var(--ok)' : 'var(--bad)'}">
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
  
  if (!amount || !account || !method) return alert('সব ঘর পূরণ করুন।');
  
  try {
    await api('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, method, account })
    });
    alert('উইথড্র রিকোয়েস্ট পাঠানো হয়েছে! অ্যাডমিন এপ্রুভ করলে টাকা পাবেন।');
    el('wdAmount').value = '';
    el('wdAccount').value = '';
    loadWallet();
    loadProfile();
  } catch(e) { alert(e.message); }
}

async function loadNotifications() {
  try {
    const { data } = await api('/api/notifications');
    if (!data || data.length === 0) {
      el('notifyList').innerHTML = '<p class="muted" style="text-align:center; font-size:12px;">কোনো নোটিফিকেশন নেই।</p>';
    } else {
      el('notifyList').innerHTML = data.map(n => `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
          <div style="font-weight: 700; color: var(--acc); margin-bottom: 4px; font-size:13px;">${h(n.title)}</div>
          <div style="font-size: 12px; color: var(--txt);">${h(n.message)}</div>
          <div style="font-size: 10px; color: var(--mut); margin-top: 6px;">${new Date(n.createdAt).toLocaleString()}</div>
        </div>
      `).join('');
    }

    const placementRes = await api('/api/ad-placements');
    const placements = placementRes.data;
    
    if (placements && placements.top && placements.top.html) {
      el('homeNotices').innerHTML = placements.top.html;
      el('homeNotices').style.background = 'transparent';
      el('homeNotices').style.border = 'none';
    } else {
      el('homeNotices').innerHTML = '<div class="card" style="text-align: center; font-size: 13px; color: var(--mut);">কোনো নোটিশ নেই</div>';
    }
  } catch(e) {}
}

function closeModal(id) {
  el(id).classList.remove('active');
}

boot();