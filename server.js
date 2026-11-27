require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 10000;
const PUBLIC_DIR = path.join(__dirname, 'backend', 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================

let firebaseDb = null;
let firebaseAuth = null;

function initializeFirebase() {
  if (admin.apps.length) {
    const existing = admin.app();
    firebaseDb = existing.firestore();
    firebaseAuth = existing.auth();
    return existing;
  }

  const credentials = process.env.FIREBASE_CREDENTIALS;

  if (!credentials) {
    console.error('FIREBASE_CREDENTIALS is missing.');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(credentials);

    const instance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    firebaseDb = admin.firestore();
    firebaseAuth = admin.auth();

    console.log('Firebase Admin initialized.');
    return instance;
  } catch (error) {
    console.error('Firebase initialization failed:', error.message);
    return null;
  }
}

initializeFirebase();

function getDb() {
  if (!firebaseDb) {
    throw new Error('Firebase is not initialized. Check FIREBASE_CREDENTIALS.');
  }
  return firebaseDb;
}

function getAuth() {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not initialized.');
  }
  return firebaseAuth;
}

// ==========================================
// ENVIRONMENT SETTINGS
// ==========================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '');

const MIN_WITHDRAW = Number(process.env.MIN_WITHDRAW || 100);
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 0);

const REQUIRED_REFERRAL_ADS = 20;
const REQUIRED_SUCCESSFUL_REFERRALS = 10;

const TELEGRAM_BOT_USERNAME = String(
  process.env.TELEGRAM_BOT_USERNAME || 'EarnWalle_tBot'
).replace(/^@/, '');

const PUBLIC_APP_URL = String(
  process.env.RENDER_EXTERNAL_URL ||
  'https://earn-wallet-z0ea.onrender.com'
).replace(/\/$/, '');

const WEBHOOK_SECRET = BOT_TOKEN
  ? crypto.createHmac('sha256', BOT_TOKEN)
      .update('EarnWalletBotWebhook2026')
      .digest('hex')
      .slice(0, 48)
  : '';

const WEBHOOK_PATH = WEBHOOK_SECRET
  ? `/telegram/webhook/${WEBHOOK_SECRET}`
  : '';

const DEFAULT_APP_SETTINGS = {
  appName: 'EarnWallet',
  maintenance: false,
  maintenanceMessage:
    'We are currently updating EarnWallet. Please try again later.',
  supportUrl: '',
  minWithdraw: MIN_WITHDRAW
};

const DEFAULT_PAYMENT_SETTINGS = {
  bKash: { enabled: true, label: 'bKash' },
  Nagad: { enabled: true, label: 'Nagad' },
  USDT: { enabled: true, label: 'Binance USDT' }
};

const AD_PLACEMENT_SLOTS = new Set([
  'top', 'middle', 'bottom', 'gate'
]);

// ==========================================
// COMMON HELPERS
// ==========================================

function sendError(res, error, fallback = 'Server error') {
  console.error(error);
  return res.status(500).json({
    success: false,
    error: fallback
  });
}

function userRef(db, uid) {
  return db.collection('users').doc(String(uid));
}

async function requireActiveUser(db, uid) {
  const snap = await userRef(db, uid).get();

  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  if (snap.data().status === 'banned') {
    throw new Error('ACCOUNT_SUSPENDED');
  }

  return snap;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka'
  }).format(new Date());
}

function parseReferralPayload(value) {
  const match = String(value || '')
    .trim()
    .match(/^(?:ref_)?(\d{1,20})$/);

  return match ? match[1] : null;
}

function newUserRecord(tg, now) {
  return {
    telegramId: String(tg.id),
    username: tg.username || null,
    firstName: tg.firstName || null,
    lastName: tg.lastName || null,
    photoUrl: tg.photoUrl || null,
    balance: 0,
    totalEarnings: 0,
    todayEarnings: 0,
    earningsDate: todayKey(),
    referralsCount: 0,
    completedTasks: 0,
    pendingTasks: 0,
    withdrawnAmount: 0,
    status: 'active',
    createdAt: now,
    lastLogin: now
  };
}

// ==========================================
// TELEGRAM MINI APP AUTHENTICATION
// ==========================================

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    params.delete('hash');

    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculated = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    const a = Buffer.from(calculated, 'hex');
    const b = Buffer.from(hash, 'hex');

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return null;
    }

    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);

    if (
      !authDate ||
      now - authDate > 3600 ||
      authDate > now + 60
    ) {
      return null;
    }

    const user = params.get('user');
    if (!user) return null;

    const parsed = JSON.parse(user);
    parsed._startParam = params.get('start_param') || '';

    return parsed;
  } catch (error) {
    console.error('InitData verification failed:', error.message);
    return null;
  }
}

function readInitData(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('tma ') ? header.slice(4) : '';
}

// User Bot authentication
async function telegramAuth(req, res, next) {
  const user = verifyInitData(readInitData(req), BOT_TOKEN);

  if (!user?.id) {
    return res.status(401).json({
      success: false,
      error: 'Telegram authentication failed. Open this app from the bot.'
    });
  }

  req.telegramUser = {
    id: String(user.id),
    username: user.username || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    photoUrl: user.photo_url || null,
    startParam: user._startParam || ''
  };

  try {
    if (req.path !== '/api/app-config') {
      const snap = await getDb()
        .collection('appConfig')
        .doc('settings')
        .get();

      if (snap.exists && snap.data().maintenance === true) {
        return res.status(503).json({
          success: false,
          maintenance: true,
          error: String(
            snap.data().maintenanceMessage ||
            DEFAULT_APP_SETTINGS.maintenanceMessage
          )
        });
      }
    }
  } catch (error) {
    return sendError(res, error, 'Could not verify app status.');
  }

  next();
}

// Admin Bot authentication
async function adminAuth(req, res, next) {
  const user = verifyInitData(
    readInitData(req),
    ADMIN_BOT_TOKEN
  );

  if (!user?.id) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Admin Bot InitData'
    });
  }

  if (!ADMIN_ID || String(user.id) !== ADMIN_ID) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  req.adminUser = user;
  next();
}

// ==========================================
// REGISTER TELEGRAM USER
// ==========================================

async function registerTelegramUser(tg, referralPayload = '') {
  const db = getDb();
  const uid = String(tg.id);
  const ref = userRef(db, uid);
  const inviterId = parseReferralPayload(referralPayload);

  return db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    const now = new Date().toISOString();

    if (existing.exists) {
      const old = existing.data();

      if (old.status === 'banned') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      tx.update(ref, {
        username: tg.username || null,
        firstName: tg.firstName || null,
        lastName: tg.lastName || null,
        photoUrl: tg.photoUrl || old.photoUrl || null,
        lastLogin: now
      });

      return {
        ...old,
        username: tg.username || null,
        firstName: tg.firstName || null,
        lastName: tg.lastName || null,
        photoUrl: tg.photoUrl || old.photoUrl || null,
        lastLogin: now
      };
    }

    let inviterSnap = null;
    let referralRef = null;

    if (inviterId && inviterId !== uid) {
      inviterSnap = await tx.get(userRef(db, inviterId));
      referralRef = db.collection('referrals').doc(uid);
    }

    const fresh = newUserRecord(tg, now);

    if (
      inviterSnap?.exists &&
      inviterSnap.data().status !== 'banned' &&
      referralRef
    ) {
      const oldReferral = await tx.get(referralRef);

      if (!oldReferral.exists) {
        fresh.referredBy = inviterId;
      }
    }

    tx.create(ref, fresh);

    if (fresh.referredBy && inviterSnap?.exists && referralRef) {
      tx.create(referralRef, {
        referrerId: inviterId,
        referredUserId: uid,
        firstName: tg.firstName || null,
        lastName: tg.lastName || null,
        username: tg.username || null,
        completedAds: 0,
        requiredAds: REQUIRED_REFERRAL_ADS,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now
      });

      tx.update(userRef(db, inviterId), {
        totalReferrals: admin.firestore.FieldValue.increment(1)
      });
    }

    return fresh;
  });
}

// ==========================================
// TELEGRAM BOT API & WEBHOOK
// ==========================================

async function telegramApi(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing.');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || 'Telegram API request failed.');
  }

  return result.result;
}

async function configureTelegramWebhook() {
  if (!BOT_TOKEN || !WEBHOOK_PATH) {
    console.warn('Webhook skipped: BOT_TOKEN=%s, WEBHOOK_PATH=%s',
      BOT_TOKEN ? 'set' : 'MISSING',
      WEBHOOK_PATH ? 'set' : 'MISSING');
    return;
  }

  try {
    const info = await telegramApi('getMe');
    console.log('Bot getMe username:', info.username);
    console.log('Env username:', TELEGRAM_BOT_USERNAME);

    if (
      String(info.username || '').toLowerCase() !==
      TELEGRAM_BOT_USERNAME.toLowerCase()
    ) {
      console.error('Username mismatch! Bot username and env var do not match.');
      return;
    }

    const url = `${PUBLIC_APP_URL}${WEBHOOK_PATH}`;
    console.log('Setting webhook to:', url);

    await telegramApi('setWebhook', {
      url,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    });

    console.log('User Bot webhook configured successfully.');
  } catch (error) {
    console.error('Webhook setup failed:', error.message);
  }
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'running'
  });
});

// ==========================================
// USER BOT /START WEBHOOK
// ==========================================

if (WEBHOOK_PATH) {
  app.post(WEBHOOK_PATH, async (req, res) => {
    if (
      req.get('X-Telegram-Bot-Api-Secret-Token') !==
      WEBHOOK_SECRET
    ) {
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    try {
      const callback = req.body?.callback_query;
      if (callback?.data === 'how_to_work') {
        await telegramApi('answerCallbackQuery', {
          callback_query_id: callback.id
        });

        const callbackChatId = callback.message?.chat?.id;
        if (callbackChatId) {
          await telegramApi('sendMessage', {
            chat_id: callbackChatId,
            text: `📚 HOW TO WORK - EARNWALLET\n\nWelcome to EarnWallet! Follow these steps to get started:\n\n1. OPEN EARNWALLET\nTap the Open EarnWallet button to access the Mini App.\n\n2. WATCH ADVERTISEMENTS\nVisit the Earn section and complete available advertisement tasks according to their instructions.\n\n3. COMPLETE TASKS\nOpen the Tasks section, choose an available task, and follow its instructions carefully.\n\n4. UPLOAD SCREENSHOT\nUpload a clear screenshot as proof of your completed task.\n\n5. WAIT FOR REVIEW\nYour submission will be checked by the Admin. Please wait for approval.\n\n6. RECEIVE REWARDS\nAfter your task is approved, the reward will be credited according to the task rules.\n\n7. INVITE FRIENDS\nShare your referral link with friends and check your referral activity in the app.\n\n8. WITHDRAW EARNINGS\nOpen the Wallet section to view available withdrawal methods and your transaction history.\n\nPlease follow all task instructions and EarnWallet rules. Thank you for using EarnWallet!`
          });
        }
        return;
      }

      const message = req.body?.message;
      const text = String(message?.text || '');
      const from = message?.from;
      const chatId = message?.chat?.id;

      if (
        !from?.id ||
        from.is_bot ||
        !chatId ||
        !/^\/start(?:@\w+)?(?:\s|$)/i.test(text)
      ) {
        return;
      }

      const payload = text.trim().split(/\s+/, 2)[1] || '';

      await registerTelegramUser({
        id: String(from.id),
        username: from.username || null,
        firstName: from.first_name || null,
        lastName: from.last_name || null
      }, payload);

      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: `Welcome to EarnWallet, ${from.first_name || 'friend'}! Your account is ready. Choose an option below to get started.`,
        reply_markup: {
          inline_keyboard: [
            [{
              text: 'Join EarnWallet Official',
              url: 'https://t.me/EarnWallet_Official'
            }],
            [{
              text: 'Join All Official Channel',
              url: 'https://t.me/All_Official_Channal'
            }],
            [{
              text: 'How to Work',
              callback_data: 'how_to_work'
            }],
            [{
              text: 'Open EarnWallet',
              web_app: { url: PUBLIC_APP_URL }
            }]
          ]
        }
      });
    } catch (error) {
      console.error('/start failed:', error.message);
    }
  });
}

// ==========================================
// USER AUTH & PROFILE
// ==========================================

app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const data = await registerTelegramUser(
      req.telegramUser,
      req.telegramUser.startParam
    );
    res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'ACCOUNT_SUSPENDED') {
      return res.status(403).json({ success: false, error: 'Your account is suspended.' });
    }
    sendError(res, error, 'Could not sign in.');
  }
});

app.get('/api/me', telegramAuth, async (req, res) => {
  try {
    const snap = await requireActiveUser(getDb(), req.telegramUser.id);
    res.json({ success: true, data: snap.data() });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'User not found. Reopen the app.' });
    }
    if (error.message === 'ACCOUNT_SUSPENDED') {
      return res.status(403).json({ success: false, error: 'Account suspended.' });
    }
    sendError(res, error, 'Could not load profile.');
  }
});

app.patch('/api/profile', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;
    const allowed = {};
    if (typeof req.body.phone === 'string') allowed.phone = req.body.phone.trim().slice(0, 30);
    if (typeof req.body.email === 'string') allowed.email = req.body.email.trim().slice(0, 100);

    if (!Object.keys(allowed).length) {
      return res.status(400).json({ success: false, error: 'No profile fields provided.' });
    }

    await requireActiveUser(getDb(), uid);
    await userRef(getDb(), uid).update(allowed);
    res.json({ success: true, message: 'Profile updated.' });
  } catch (error) {
    sendError(res, error, 'Could not update profile.');
  }
});

// ==========================================
// USER APP CONFIG
// ==========================================

app.get('/api/app-config', telegramAuth, async (req, res) => {
  try {
    await requireActiveUser(getDb(), req.telegramUser.id);
    const db = getDb();

    const [settingsSnap, paymentSnap] = await Promise.all([
      db.collection('appConfig').doc('settings').get(),
      db.collection('appConfig').doc('payments').get()
    ]);

    const settings = { ...DEFAULT_APP_SETTINGS, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
    const payments = { ...DEFAULT_PAYMENT_SETTINGS, ...(paymentSnap.exists ? paymentSnap.data() : {}) };

    res.json({
      success: true,
      data: {
        appName: settings.appName,
        maintenance: settings.maintenance === true,
        maintenanceMessage: settings.maintenanceMessage,
        supportUrl: settings.supportUrl,
        minWithdraw: settings.minWithdraw,
        payments
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load app configuration.');
  }
});

// ==========================================
// USER ADVERTISEMENTS
// ==========================================

app.get('/api/ads', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;
    await requireActiveUser(db, uid);

    const [adsSnap, claimsSnap] = await Promise.all([
      db.collection('advertisements').where('status', '==', 'active').get(),
      db.collection('adClaims').where('userId', '==', uid).get()
    ]);

    const claimed = new Set(claimsSnap.docs.map(d => d.data().adId));

    const ads = adsSnap.docs
      .filter(d => !claimed.has(d.id))
      .map(d => {
        const x = d.data();
        return {
          id: d.id,
          title: String(x.title || 'Sponsored task'),
          url: String(x.url || ''),
          bannerUrl: String(x.bannerUrl || ''),
          reward: Number(x.reward || 0),
          duration: Math.max(20, Math.min(300, Math.floor(Number(x.duration) || 20)))
        };
      });

    res.json({ success: true, data: ads });
  } catch (error) {
    sendError(res, error, 'Could not load advertisements.');
  }
});

app.post('/api/ads/:id/start', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;
    await requireActiveUser(db, uid);

    const adRef = db.collection('advertisements').doc(req.params.id);
    const adSnap = await adRef.get();

    if (!adSnap.exists || adSnap.data().status !== 'active') {
      return res.status(404).json({ success: false, error: 'Ad unavailable.' });
    }

    const ad = adSnap.data();
    const duration = Math.max(20, Math.min(300, Math.floor(Number(ad.duration) || 20)));
    const reward = Number(ad.reward);

    if (!Number.isFinite(reward) || reward <= 0 || reward > 1000) {
      return res.status(400).json({ success: false, error: 'Invalid reward configuration.' });
    }

    const claimRef = db.collection('adClaims').doc(`${uid}_${adSnap.id}`);
    const sessionRef = db.collection('watchSessions').doc();

    await db.runTransaction(async tx => {
      const claim = await tx.get(claimRef);
      if (claim.exists) throw new Error('ALREADY_CLAIMED');

      tx.create(sessionRef, {
        userId: uid,
        adId: adSnap.id,
        startedAt: Date.now(),
        duration,
        reward,
        status: 'started',
        createdAt: new Date().toISOString()
      });
    });

    res.json({
      success: true,
      data: { sessionId: sessionRef.id, url: String(ad.url || ''), duration }
    });
  } catch (error) {
    if (error.message === 'ALREADY_CLAIMED') {
      return res.status(409).json({ success: false, error: 'Already completed this ad.' });
    }
    sendError(res, error, 'Could not start ad.');
  }
});

app.post('/api/ads/complete', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;
    const sessionId = String(req.body.sessionId || '');

    if (!sessionId || sessionId.length > 150) {
      return res.status(400).json({ success: false, error: 'Invalid session.' });
    }

    const sessionRef = db.collection('watchSessions').doc(sessionId);
    const uRef = userRef(db, uid);

    const result = await db.runTransaction(async tx => {
      const [session, user] = await Promise.all([tx.get(sessionRef), tx.get(uRef)]);

      if (!session.exists) throw new Error('SESSION_NOT_FOUND');
      if (!user.exists) throw new Error('USER_NOT_FOUND');

      const s = session.data();
      const u = user.data();

      if (s.userId !== uid) throw new Error('SESSION_FORBIDDEN');
      if (s.status !== 'started') throw new Error('SESSION_USED');
      if (u.status === 'banned') throw new Error('ACCOUNT_SUSPENDED');

      const adRef = db.collection('advertisements').doc(s.adId);
      const claimRef = db.collection('adClaims').doc(`${uid}_${s.adId}`);

      const [ad, claim] = await Promise.all([tx.get(adRef), tx.get(claimRef)]);

      if (!ad.exists || ad.data().status !== 'active') throw new Error('AD_INACTIVE');
      if (claim.exists) throw new Error('ALREADY_CLAIMED');
      if (Date.now() - Number(s.startedAt) < Number(s.duration) * 1000) throw new Error('TOO_EARLY');

      let referralSnap = null;
      let inviterSnap = null;
      let referralRef = null;
      let inviterRef = null;

      if (u.referredBy) {
        referralRef = db.collection('referrals').doc(uid);
        referralSnap = await tx.get(referralRef);

        if (referralSnap.exists && referralSnap.data().status !== 'successful') {
          inviterRef = userRef(db, referralSnap.data().referrerId);
          inviterSnap = await tx.get(inviterRef);
        }
      }

      const reward = Number(s.reward);
      if (!Number.isFinite(reward) || reward <= 0) throw new Error('INVALID_REWARD');

      const day = todayKey();
      const today = u.earningsDate === day ? Number(u.todayEarnings || 0) + reward : reward;
      const now = new Date().toISOString();

      tx.update(uRef, {
        balance: Number(u.balance || 0) + reward,
        totalEarnings: Number(u.totalEarnings || 0) + reward,
        todayEarnings: today,
        earningsDate: day
      });

      tx.create(claimRef, { userId: uid, adId: s.adId, reward, completedAt: now });
      tx.update(sessionRef, { status: 'completed', completedAt: now });

      if (referralSnap?.exists && referralSnap.data().status !== 'successful') {
        const referral = referralSnap.data();
        const completed = Math.min(REQUIRED_REFERRAL_ADS, Number(referral.completedAds || 0) + 1);
        const successful = completed >= REQUIRED_REFERRAL_ADS;

        tx.update(referralRef, {
          completedAds: completed,
          status: successful ? 'successful' : 'in_progress',
          updatedAt: now,
          ...(successful ? { successfulAt: now } : {})
        });

        if (successful && inviterSnap?.exists) {
          tx.update(inviterRef, {
            referralsCount: Number(inviterSnap.data().referralsCount || 0) + 1
          });
        }
      }

      const historyRef = db.collection('transactions').doc();
      tx.create(historyRef, {
        userId: uid,
        type: 'ad_reward',
        amount: reward,
        status: 'completed',
        note: 'Advertisement reward',
        createdAt: now
      });

      return { reward, balance: Number(u.balance || 0) + reward };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const errors = {
      SESSION_NOT_FOUND: [404, 'Session not found.'],
      USER_NOT_FOUND: [404, 'User not found.'],
      SESSION_FORBIDDEN: [403, 'Forbidden.'],
      SESSION_USED: [409, 'Session already used.'],
      ACCOUNT_SUSPENDED: [403, 'Account suspended.'],
      AD_INACTIVE: [409, 'Ad inactive.'],
      ALREADY_CLAIMED: [409, 'Already claimed.'],
      TOO_EARLY: [425, 'Watch timer is not complete.'],
      INVALID_REWARD: [400, 'Invalid reward.']
    };

    const [status, message] = errors[error.message] || [500, 'Could not complete ad.'];
    if (status === 500) console.error(error);

    res.status(status).json({ success: false, error: message });
  }
});

// ==========================================
// USER TASKS
// ==========================================

app.get('/api/tasks', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;
    await requireActiveUser(db, uid);

    const [tasks, submissions] = await Promise.all([
      db.collection('tasks').where('status', '==', 'active').get(),
      db.collection('taskSubmissions').where('userId', '==', uid).get()
    ]);

    const submitted = new Map(submissions.docs.map(d => [d.data().taskId, d.data().status]));

    res.json({
      success: true,
      data: tasks.docs.map(d => {
        const x = d.data();
        return {
          id: d.id,
          ...x,
          instruction: String(x.instruction || ''),
          logoUrl: String(x.logoUrl || ''),
          submissionStatus: submitted.get(d.id) || null
        };
      })
    });
  } catch (error) {
    sendError(res, error, 'Could not load tasks.');
  }
});

app.post('/api/tasks/:id/submit', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;
    await requireActiveUser(db, uid);

    const task = await db.collection('tasks').doc(req.params.id).get();
    if (!task.exists || task.data().status !== 'active') {
      return res.status(404).json({ success: false, error: 'Task unavailable.' });
    }

    const proof = String(req.body.proof || '').trim().slice(0, 1000);
    if (task.data().requiresProof && !proof) {
      return res.status(400).json({ success: false, error: 'Please provide task proof.' });
    }

    const ref = db.collection('taskSubmissions').doc(`${uid}_${req.params.id}`);

    await db.runTransaction(async tx => {
      const [old, user] = await Promise.all([tx.get(ref), tx.get(userRef(db, uid))]);

      if (old.exists) throw new Error('ALREADY_SUBMITTED');
      if (!user.exists) throw new Error('USER_NOT_FOUND');

      tx.create(ref, {
        userId: uid,
        taskId: req.params.id,
        proof,
        status: 'pending',
        reward: Number(task.data().reward || 0),
        createdAt: new Date().toISOString()
      });

      tx.update(userRef(db, uid), {
        pendingTasks: Number(user.data().pendingTasks || 0) + 1
      });
    });

    res.json({ success: true, message: 'Task submitted for review.' });
  } catch (error) {
    if (error.message === 'ALREADY_SUBMITTED') {
      return res.status(409).json({ success: false, error: 'You have already submitted this task.' });
    }
    sendError(res, error, 'Could not submit task.');
  }
});

// ==========================================
// USER REFERRALS
// ==========================================

app.get('/api/referrals', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;
    const db = getDb();
    await requireActiveUser(db, uid);

    const snap = await db.collection('referrals').where('referrerId', '==', uid).get();
    const referrals = snap.docs.map(doc => {
      const item = doc.data();
      return {
        telegramId: item.referredUserId || doc.id,
        firstName: item.firstName || 'Telegram User',
        lastName: item.lastName || '',
        username: item.username || null,
        completedAds: Number(item.completedAds || 0),
        requiredAds: REQUIRED_REFERRAL_ADS,
        status: item.status || 'in_progress',
        createdAt: item.createdAt || null
      };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const successfulCount = referrals.filter(x => x.status === 'successful').length;

    res.json({
      success: true,
      data: {
        count: successfulCount,
        successfulCount,
        totalCount: referrals.length,
        inProgressCount: referrals.length - successfulCount,
        requiredSuccessfulReferrals: REQUIRED_SUCCESSFUL_REFERRALS,
        requiredAdsPerReferral: REQUIRED_REFERRAL_ADS,
        link: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=ref_${uid}`,
        bonus: REFERRAL_BONUS,
        referrals
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load referrals.');
  }
});

// ==========================================
// USER TRANSACTION HISTORY
// ==========================================

app.get('/api/history', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;
    const db = getDb();
    await requireActiveUser(db, uid);

    const snap = await db.collection('transactions').where('userId', '==', uid).get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 100);

    res.json({ success: true, data: items });
  } catch (error) {
    sendError(res, error, 'Could not load history.');
  }
});

// ==========================================
// USER WITHDRAWAL
// ==========================================

app.post('/api/withdraw', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').trim();
    const account = String(req.body.account || '').trim();

    const [settingsSnap, paymentSnap] = await Promise.all([
      db.collection('appConfig').doc('settings').get(),
      db.collection('appConfig').doc('payments').get()
    ]);

    const currentMin = settingsSnap.exists
      ? Number(settingsSnap.data().minWithdraw || MIN_WITHDRAW)
      : MIN_WITHDRAW;

    const payments = { ...DEFAULT_PAYMENT_SETTINGS, ...(paymentSnap.exists ? payment