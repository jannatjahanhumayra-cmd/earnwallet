import { api, escapeHTML } from '../api.js';

const number = value => Number(value || 0).toLocaleString('en-US');

export async function renderDashboard(element) {
  const response = await api('/api/admin/stats');
  const stats = response.data || {};
  // These keys are taken from the existing server.js response; no new DB fields are assumed.
  const cards = [
    { label: 'Total users', value: number(stats.totalUsers), note: 'Registered accounts', symbol: '♙' },
    { label: 'Active users', value: number(stats.activeUsers), note: 'Active accounts', symbol: '●' },
    { label: 'Banned users', value: number(stats.bannedUsers), note: 'Restricted accounts', symbol: '⊘' },
    { label: 'Pending withdrawals', value: number(stats.pendingWithdraws), note: 'Awaiting review', symbol: '↗' },
    { label: 'Total user balance', value: number(stats.totalBalance), note: 'Combined current balance', symbol: '◇' }
  ];

  element.innerHTML = `
    <div class="section-heading">
      <div><h2>Overview</h2><p>Live summary from your existing EarnWallet backend</p></div>
    </div>
    <div class="stats-grid">
      ${cards.map(card => `
        <article class="stat-card">
          <div class="stat-top"><span>${card.label}</span><span class="stat-symbol">${card.symbol}</span></div>
          <strong class="stat-value">${escapeHTML(card.value)}</strong>
          <small class="stat-caption">${card.note}</small>
        </article>`).join('')}
    </div>
    <section class="panel-card">
      <h2>Admin Section</h2>
      <p>This is the base Admin workspace. We will add each admin feature separately, one at a time. The existing database and backend routes are being kept unchanged.</p>
    </section>`;
}
