import { renderDashboard } from './modules/dashboard.js';

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#pageTitle');

async function openDashboard() {
  pageTitle.textContent = 'Dashboard';
  content.innerHTML = '<div class="loading-state">Loading dashboard…</div>';
  try {
    await renderDashboard(content);
  } catch (error) {
    content.innerHTML = `
      <div class="panel-card">
        <h2 class="error-text">Dashboard could not load</h2>
        <p>${String(error.message || 'Unknown error').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p>
        <button class="retry-button" id="retryDashboard" type="button">Try again</button>
      </div>`;
    document.querySelector('#retryDashboard').addEventListener('click', openDashboard);
  }
}

openDashboard();
