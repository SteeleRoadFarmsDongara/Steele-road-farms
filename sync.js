/* Steele Road Farms — Firebase Firestore sync (shared store across devices).
   Loads after the main app script. Wraps the app's save* functions so every
   local change is pushed to Firestore, and listens for changes from other
   devices. localStorage stays the fallback: if Firestore is unreachable
   (no database yet, no network, rules blocking), the app keeps working
   locally and syncs later. Nothing here deletes local data. */
(function () {
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCpn7Ar4TBU6Y_aXIYjRILX3fD1ieox2ls',
    authDomain: 'steele-road-farms.firebaseapp.com',
    projectId: 'steele-road-farms',
    storageBucket: 'steele-road-farms.firebasestorage.app',
    messagingSenderId: '108139939642',
    appId: '1:108139939642:web:6cf04271b817d0038c7203'
  };
  var DOC_PATH = 'srf/state';

  /* localStorage key -> snapshot field */
  var KEYS = {
    orders: 'srf_orders_v1',
    inventory: 'srf_inventory_v1',
    giftcards: 'srf_giftcards_v1',
    archives: 'srf_archives_v1',
    messages: 'srf_messages_v1',
    kids: 'srf_kids_v1',
    csa: 'srf_csa_v1',
    customers: 'srf_customers_v1',
    referrals: 'srf_referrals_v1',
    featured: 'srf_featured_v1',
    waitlist: 'srf_waitlist_v1',
    cutoff: 'srf_cutoff_v1',
    weekstart: 'srf_weekstart_v1',
    notified: 'srf_notified_v1',
    nextday: 'srf_nextday_v1',
    jokes: 'srf_jokes_v1',
    market: 'srf_market_v1',
    hubUsers: 'srf_hub_users_v1',
    cart: 'srf_cart_v1'
  };
  var META_KEY = 'srf_sync_meta_v1';
  var DEVICE_KEY = 'srf_device_v1';
  var BACKUP_KEY = 'srf_presync_backup_v1';

  var SAVE_FNS = ['save', 'saveInv', 'saveGift', 'saveArchives', 'saveMessages',
    'saveKids', 'saveCsa', 'saveCustomers', 'saveReferrals', 'saveFeatured',
    'saveWaitlist', 'saveCutoff', 'saveWeekStart', 'saveNotified', 'saveNextDay',
    'saveJokes', 'saveMarketPrices', 'savePartnerPass', 'saveCart'];
  var LOAD_FNS = ['load', 'loadInv', 'loadGift', 'loadArchives', 'loadMessages',
    'loadKids', 'loadCsa', 'loadCustomers', 'loadReferrals', 'loadFeatured',
    'loadWaitlist', 'loadCutoff', 'loadWeekStart', 'loadNotified', 'loadNextDay',
    'loadJokes', 'loadMarketPrices', 'loadCart'];
  var RENDER_FNS = ['renderHub', 'renderWaitList', 'renderNextDay', 'renderOldOrders',
    'renderRoundInfo', 'renderNotifyList', 'renderArchives', 'renderHubMessages',
    'renderHubKids', 'renderHubCsa', 'renderHubLoyalty', 'renderHubCustomers',
    'renderHubJokes', 'renderCustomerBook', 'renderHubAlert', 'renderReferrals',
    'renderMessages', 'msgBadge', 'renderKidCharacters', 'renderJoke',
    'gateCustomerPages', 'renderCutoffBanner', 'renderShopDates',
    'renderFulfilOptions', 'renderMyWaitList', 'renderMyCard', 'renderBoxes',
    'renderDongara', 'renderStock', 'renderWhatsInBox', 'renderZuc',
    'renderSpecial', 'renderGiftGrid', 'calc', 'renderMarketPrices', 'renderCart'];

  var deviceId = '';
  try {
    deviceId = localStorage.getItem(DEVICE_KEY) || '';
    if (!deviceId) {
      deviceId = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
  } catch (e) { deviceId = 'anon'; }

  var meta = { lastSyncAt: 0, updatedAt: 0 };
  try {
    var m = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    if (m) meta = { lastSyncAt: m.lastSyncAt || 0, updatedAt: m.updatedAt || 0 };
  } catch (e) {}
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }

  var db = null, docRef = null, unsub = null, settled = false;
  var applying = false, pushTimer = null, syncState = 'off', syncNote = '';

  function callFn(name) {
    try {
      var fn = window[name];
      if (typeof fn === 'function') fn();
    } catch (e) {}
  }

  function setStatus(state, note) {
    syncState = state; syncNote = note || ''; settled = true;
    var el = document.getElementById('srfSyncBadge');
    if (el) {
      var label = {
        synced: 'Synced \u2713',
        syncing: 'Syncing\u2026',
        off: 'Sync off \u2014 local only',
        nodatabase: 'Sync off \u2014 no database yet',
        blocked: 'Sync blocked \u2014 check Firestore rules',
        error: 'Sync error \u2014 local only'
      }[state] || state;
      el.textContent = 'SRF sync: ' + label;
      el.style.background = state === 'synced' ? '#1d4d1d' : (state === 'syncing' ? '#4d3d00' : '#4d1d1d');
      el.title = note || label;
    }
  }

  function mountBadge() {
    try {
      if (document.getElementById('srfSyncBadge')) return;
      var b = document.createElement('div');
      b.id = 'srfSyncBadge';
      b.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;background:#222;color:#ddd;font:11px/1.4 Arial,sans-serif;padding:5px 9px;border:1px solid #666;border-radius:20px;opacity:.92;';
      b.textContent = 'SRF sync: starting\u2026';
      if (document.body) document.body.appendChild(b);
    } catch (e) {}
  }

  function collectSnapshot() {
    var data = {};
    for (var k in KEYS) {
      try { data[k] = localStorage.getItem(KEYS[k]); } catch (e) { data[k] = null; }
    }
    return { v: 1, updatedAt: Date.now(), updatedBy: deviceId, data: data };
  }

  /* True when this device only holds the seeded defaults (fresh install). */
  function localIsSeedOnly() {
    try {
      var o = localStorage.getItem(KEYS.orders);
      if (!o) return true;
      var arr = JSON.parse(o);
      if (typeof SEED === 'undefined' || !SEED) return false;
      if (!arr || arr.length !== SEED.length) return false;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id !== SEED[i][0] || arr[i].total !== SEED[i][5]) return false;
      }
      var others = [KEYS.customers, KEYS.giftcards, KEYS.messages, KEYS.kids,
        KEYS.csa, KEYS.referrals, KEYS.archives, KEYS.waitlist];
      for (var j = 0; j < others.length; j++) {
        var v = localStorage.getItem(others[j]);
        if (v && v !== '[]' && v !== '{}' && v !== 'null') return false;
      }
      return true;
    } catch (e) { return false; }
  }

  function renderAll() {
    for (var i = 0; i < RENDER_FNS.length; i++) callFn(RENDER_FNS[i]);
  }

  function applySnapshot(snap) {
    applying = true;
    try {
      /* One-time safety backup of whatever was on this device before sync. */
      try {
        if (!localStorage.getItem(BACKUP_KEY)) {
          var bak = {};
          for (var k in KEYS) { try { bak[k] = localStorage.getItem(KEYS[k]); } catch (e) { bak[k] = null; } }
          localStorage.setItem(BACKUP_KEY, JSON.stringify(bak));
        }
      } catch (e) {}
      for (var k in KEYS) {
        var v = snap.data ? snap.data[k] : null;
        try {
          if (v == null) localStorage.removeItem(KEYS[k]);
          else localStorage.setItem(KEYS[k], v);
        } catch (e) {}
      }
      for (var i = 0; i < LOAD_FNS.length; i++) callFn(LOAD_FNS[i]);
      try { if (typeof reclassifyOrders === 'function') reclassifyOrders(); } catch (e) {}
      try { if (typeof maybeAutoClose === 'function') maybeAutoClose(); } catch (e) {}
      renderAll();
      meta.lastSyncAt = snap.updatedAt || Date.now();
      meta.updatedAt = meta.lastSyncAt;
      saveMeta();
    } finally {
      applying = false;
    }
  }

  function handleSyncError(err) {
    var code = (err && err.code) || '';
    var msg = (err && err.message) || '';
    if (code === 'permission-denied') {
      setStatus('blocked', 'Firestore rules are blocking reads/writes. In Firebase console: Firestore Database > Rules, allow read/write, Publish.');
    } else if (code === 'failed-precondition' || code === 'not-found' ||
        /database .* does not exist/i.test(msg) || /not found/i.test(msg)) {
      setStatus('nodatabase', 'No Firestore database yet. In Firebase console: Build > Firestore Database > Create database (production mode, Sydney).');
    } else if (code === 'unavailable' || code === 'deadline-exceeded') {
      setStatus('error', 'Firestore unreachable right now — changes are saved on this device and will sync later.');
    } else {
      setStatus('error', 'Sync error (' + (code || 'unknown') + ') — changes are saved on this device.');
    }
  }

  function pushNow() {
    if (!db || !docRef || applying) return Promise.resolve(false);
    var snap = collectSnapshot();
    setStatus('syncing');
    return docRef.set(snap).then(function () {
      meta.updatedAt = snap.updatedAt;
      meta.lastSyncAt = snap.updatedAt;
      saveMeta();
      setStatus('synced');
      return true;
    }).catch(function (err) {
      handleSyncError(err);
      return false;
    });
  }

  function pushSoon() {
    if (!db || !docRef) return;
    if (pushTimer) clearTimeout(pushTimer);
    setStatus('syncing');
    pushTimer = setTimeout(function () { pushNow(); }, 800);
  }

  function subscribe() {
    if (unsub || !docRef) return;
    try {
      unsub = docRef.onSnapshot(function (doc) {
        if (!doc.exists) return;
        var remote = doc.data();
        if (!remote || !remote.data) return;
        if (remote.updatedBy === deviceId) return;
        if ((remote.updatedAt || 0) > (meta.lastSyncAt || 0)) {
          applySnapshot(remote);
          setStatus('synced');
        }
      }, function (err) { handleSyncError(err); });
    } catch (e) {}
  }

  function firstSync() {
    if (!docRef) return;
    docRef.get().then(function (doc) {
      if (!doc.exists) {
        /* Nothing shared yet — this device seeds the shared store
           (the 24 seeded orders and everything else on it). */
        return pushNow().then(function () { subscribe(); });
      }
      var remote = doc.data();
      if (!remote || !remote.data) return pushNow().then(function () { subscribe(); });
      if (remote.updatedBy === deviceId) {
        meta.lastSyncAt = remote.updatedAt || Date.now();
        saveMeta();
      } else if (!meta.lastSyncAt && !localIsSeedOnly()) {
        /* This device already holds real local data and has never synced:
           its data wins the first time, so nothing on it is lost. */
        return pushNow().then(function () { subscribe(); });
      } else if ((remote.updatedAt || 0) > (meta.lastSyncAt || 0)) {
        applySnapshot(remote);
      } else if ((meta.updatedAt || 0) > (remote.updatedAt || 0)) {
        return pushNow().then(function () { subscribe(); });
      }
      subscribe();
      setStatus('synced');
    }).catch(function (err) { handleSyncError(err); });
  }

  function start() {
    mountBadge();
    if (typeof firebase === 'undefined') {
      setStatus('off', 'Firebase library did not load — check network, app still works locally.');
      return;
    }
    try {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      docRef = db.doc(DOC_PATH);
      /* Best effort: anonymous sign-in so locked-down rules can allow authed users. */
      try {
        if (firebase.auth) firebase.auth().signInAnonymously().catch(function () {});
      } catch (e) {}
      firstSync();
      /* If Firestore never answers (no database yet, or no connection),
         don't leave the badge stuck on "starting\u2026". Settle it. */
      setTimeout(function () {
        if (!settled) setStatus('nodatabase', 'Firestore did not answer \u2014 no database yet, or no connection. In Firebase console: Build > Firestore Database > Create database (production mode, Sydney).');
      }, 8000);
    } catch (err) {
      setStatus('off', 'Sync could not start — app still works locally.');
    }
  }

  /* Wrap every save* so local changes also push to Firestore (debounced). */
  SAVE_FNS.forEach(function (fn) {
    try {
      var orig = window[fn];
      if (typeof orig !== 'function') return;
      window[fn] = function () {
        var r = orig.apply(this, arguments);
        if (!applying) {
          meta.updatedAt = Date.now();
          saveMeta();
          pushSoon();
        }
        return r;
      };
    } catch (e) {}
  });

  window.SRF_SYNC = {
    status: function () { return { state: syncState, note: syncNote, deviceId: deviceId, meta: meta }; },
    pushNow: pushNow,
    pullNow: function () { if (docRef) firstSync(); },
    config: FIREBASE_CONFIG
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
