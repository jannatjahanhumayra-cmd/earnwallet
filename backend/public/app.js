:root { 
  --bg: #0b0f19; 
  --card: #141a29; 
  --card-hover: #1c2437;
  --line: #2a3550; 
  --txt: #ffffff; 
  --mut: #8b98b5; 
  --acc: #ff7f00;
  --acc-glow: rgba(255, 127, 0, 0.3);
  --ok: #2ecc71; 
  --bad: #ff5c5c; 
  --warn: #f1c40f; 
}

* { 
  box-sizing: border-box; 
  -webkit-tap-highlight-color: transparent; 
  font-family: 'Hind Siliguri', system-ui, sans-serif; 
}

body { 
  margin: 0; 
  background: var(--bg); 
  color: var(--txt); 
  padding-bottom: 65px; 
  background-image: radial-gradient(circle at top, rgba(255,127,0,0.05) 0%, transparent 40%); 
  font-size: 13px; /* ফন্ট সাইজ ছোট করা হয়েছে */
}

/* --- Loader & Channel Gate --- */
#loader { 
  position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center; justify-content: center; z-index: 999; font-size: 16px; color: var(--acc); font-weight: bold; 
}

#channelGate h2 {
  font-size: 20px;
  margin-bottom: 8px;
  text-shadow: 0 0 10px var(--acc-glow);
}

#channelGate p {
  font-size: 13px;
  margin-bottom: 16px;
}

#channelGate .btn {
  padding: 10px;
  font-size: 14px;
  margin-bottom: 8px;
}

/* --- Header --- */
header { 
  padding: 12px 16px; 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  background: var(--bg); 
  position: sticky; 
  top: 0; 
  z-index: 10; 
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.user-info { display: flex; align-items: center; gap: 10px; }

.user-info img { 
  width: 38px; height: 38px; border-radius: 10px; object-fit: cover; border: 2px solid var(--acc); box-shadow: 0 0 8px var(--acc-glow); 
}

.user-info .name { font-weight: 700; font-size: 14px; color: #fff; }
.user-info .id { font-size: 10px; color: var(--mut); }

.balance-badge { 
  background: rgba(255, 127, 0, 0.1); border: 1px solid var(--acc); color: var(--acc); padding: 6px 10px; border-radius: 16px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px; box-shadow: 0 0 8px var(--acc-glow); 
}

/* --- Main Content & Pages --- */
main { padding: 12px 16px; }
.page { display: none; animation: fadeIn 0.2s ease; }
.page.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

/* --- Cards --- */
.card { 
  background: var(--card); border: 1px solid rgba(255,127,0,0.1); border-radius: 12px; padding: 14px; margin-bottom: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
}

.card-title { font-size: 16px; font-weight: 700; margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px; }

/* --- Profile Specific --- */
.profile-card { display: flex; flex-direction: column; gap: 8px; }
.profile-header { display: flex; justify-content: space-between; align-items: flex-start; }
.profile-header img { width: 50px; height: 50px; border-radius: 12px; border: 2px solid var(--line); }
.profile-name { font-size: 18px; font-weight: 700; margin: 0; }
.profile-level { color: var(--warn); font-size: 11px; display: flex; align-items: center; gap: 4px; margin-top: 2px; }

.wallet-balance { font-size: 26px; font-weight: 700; color: #fff; margin: 8px 0; display: flex; align-items: baseline; gap: 4px; }
.wallet-balance span { font-size: 12px; color: var(--mut); font-weight: normal; }

/* --- Buttons --- */
.btn { 
  width: 100%; background: linear-gradient(90deg, #ff7f00, #ff5500); color: #fff; border: none; padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; text-align: center; display: flex; justify-content: center; align-items: center; gap: 6px; box-shadow: 0 3px 10px var(--acc-glow); transition: transform 0.1s;
}
.btn:active { transform: scale(0.97); }
.btn.ghost { background: var(--card-hover); border: 1px solid var(--line); color: var(--txt); box-shadow: none; }
.btn.sm { padding: 6px 10px; font-size: 12px; width: auto; border-radius: 6px; }

/* --- Inputs --- */
input, select { 
  width: 100%; background: var(--bg); border: 1px solid var(--line); color: var(--txt); padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 10px; font-family: 'Hind Siliguri'; 
}
input:focus, select:focus { border-color: var(--acc); outline: none; }
label { display: block; font-size: 12px; color: var(--mut); margin-bottom: 6px; }

/* --- Tabs --- */
.tabs { display: flex; background: var(--card); padding: 4px; border-radius: 10px; margin-bottom: 14px; border: 1px solid var(--line); }
.tab { flex: 1; text-align: center; padding: 8px; font-size: 13px; color: var(--mut); font-weight: 600; border-radius: 6px; cursor: pointer; transition: 0.2s; }
.tab.active { background: linear-gradient(90deg, #ff7f00, #ff5500); color: #fff; box-shadow: 0 2px 8px var(--acc-glow); }

/* --- Lists (Tasks, History, Notifications) --- */
.list-item { 
  background: var(--card); border: 1px solid var(--line); padding: 12px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; 
}
.list-item .left { display: flex; align-items: center; gap: 10px; }
.list-item img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--bg); border: 1px solid var(--line); }
.list-item .title { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.list-item .subtitle { font-size: 11px; color: var(--mut); }
.list-item .reward { color: var(--ok); font-weight: 800; font-size: 14px; text-align: right; }

/* --- Live Feed --- */
.live-feed-wrapper { background: rgba(255, 127, 0, 0.1); border: 1px solid rgba(255, 127, 0, 0.2); border-radius: 10px; padding: 8px 12px; overflow: hidden; margin-bottom: 14px; }
.live-feed { display: inline-block; white-space: nowrap; animation: scrollText 20s linear infinite; }
.live-item { display: inline-flex; align-items: center; gap: 6px; margin-right: 20px; font-size: 12px; color: var(--mut); }
.live-item b { color: var(--acc); }
@keyframes scrollText { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }

/* --- Bottom Navigation --- */
.bottom-nav { 
  position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--line); display: flex; justify-content: space-around; padding: 8px 0 12px 0; z-index: 10; border-radius: 16px 16px 0 0; box-shadow: 0 -4px 15px rgba(0,0,0,0.5); 
}
.nav-item { display: flex; flex-direction: column; align-items: center; font-size: 9px; color: var(--mut); cursor: pointer; gap: 3px; transition: 0.3s; }
.nav-item.active { color: var(--acc); }
.nav-item.active svg { filter: drop-shadow(0 0 4px var(--acc-glow)); }
.nav-item svg { width: 20px; height: 20px; fill: currentColor; }

/* --- Modals --- */
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.modal.active { display: flex; }
.modal-content { background: var(--card); width: 100%; max-width: 350px; border-radius: 14px; padding: 16px; border: 1px solid var(--line); max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
.modal-content h3 { font-size: 16px; }

.ad-timer { font-size: 30px; font-weight: 800; color: var(--acc); text-align: center; margin: 16px 0; text-shadow: 0 0 15px var(--acc-glow); }

/* --- Image Upload Box --- */
.upload-box {
  border: 2px dashed var(--line); border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 10px; cursor: pointer; background: rgba(255,255,255,0.02); transition: 0.2s;
}
.upload-box:hover { border-color: var(--acc); background: rgba(255,127,0,0.05); }
.upload-preview { color: var(--mut); font-size: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.upload-preview img { max-width: 100%; max-height: 100px; border-radius: 6px; border: 1px solid var(--line); }

/* Utility */
.muted { color: var(--mut); }