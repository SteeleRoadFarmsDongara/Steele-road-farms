/* Steele Road Farms — Firebase Firestore sync (shared store across devices).
   Loads after the main app script. Wraps the app's save* functions so every
   local change is pushed to Firestore, and listens for changes from other
   devices. localStorage stays the fallback: if Firestore is unreachable
   (no database yet, no network, rules blocking), the app keeps working
   locally and syncs later. Nothing here deletes local data.
   FIX 2026-11-28 (orders wiped 27 Nov): pushNow() used to blind-overwrite
   the whole shared doc with whatever was in this device's localStorage,
   including null for keys the device never wrote (e.g. a fresh phone that
   registered on the front door never loads orders, so its first save pushed
   orders:null and wiped the shared orders). Now every push MERGES with the
   shared store first: a missing local value never overwrites a real shared
   value, and no push happens before the first pull has completed. */
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
    cart: 'srf_cart_v1',
    reviews: 'srf_reviews_v1'
  };
  var META_KEY = 'srf_sync_meta_v1';
  var DEVICE_KEY = 'srf_device_v1';
  var BACKUP_KEY = 'srf_presync_backup_v1';

  var SAVE_FNS = ['save', 'saveInv', 'saveGift', 'saveArchives', 'saveMessages',
    'saveKids', 'saveCsa', 'saveCustomers', 'saveReferrals', 'saveFeatured',
    'saveWaitlist', 'saveCutoff', 'saveWeekStart', 'saveNotified', 'saveNextDay',
    'saveJokes', 'saveMarketPrices', 'savePartnerPass', 'saveCart', 'saveReviews'];
  var LOAD_FNS = ['load', 'loadInv', 'loadGift', 'loadArchives', 'loadMessages',
    'loadKids', 'loadCsa', 'loadCustomers', 'loadReferrals', 'loadFeatured',
    'loadWaitlist', 'loadCutoff', 'loadWeekStart', 'loadNotified', 'loadNextDay',
    'loadJokes', 'loadMarketPrices', 'loadCart', 'loadReviews'];
  var RENDER_FNS = ['renderHub', 'renderWaitList', 'renderNextDay', 'renderOldOrders',
    'renderRoundInfo', 'renderNotifyList', 'renderArchives', 'renderHubMessages',
    'renderHubKids', 'renderHubCsa', 'renderHubLoyalty', 'renderHubCustomers',
    'renderHubJokes', 'renderCustomerBook', 'renderHubAlert', 'renderReferrals',
    'renderMessages', 'msgBadge', 'renderKidCharacters', 'renderJoke',
    'gateCustomerPages', 'renderCutoffBanner', 'renderShopDates',
    'renderFulfilOptions', 'renderMyWaitList', 'renderMyCard', 'renderBoxes', 'renderReviews', 'renderHarvestShare', 'renderHubHome', 'renderCompare',
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
  /* Set once the first read of the shared store has completed (or the live
     listener has delivered). Until then no push may go out: a save made in
     the first seconds on a fresh device must not overwrite the shared store
     with a half-empty local snapshot. */
  var ready = false, pendingPush = false, lastRemote = null;

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

  function renderAll() {
    for (var i = 0; i < RENDER_FNS.length; i++) callFn(RENDER_FNS[i]);
  }

  /* Keys whose items are append-only records: a push unions them by identity
     (new records from either side survive; on a clash the local copy wins).
     orders / waitlist are NOT in here on purpose: orders move between the
     live list, the waitlist and the archives, so a union would resurrect
     moved orders. For those, the local list wins whole (see mergeData). */
  var UNION_KEYS = ['customers', 'giftcards', 'archives', 'messages',
    'kids', 'csa', 'referrals'];
  var RECORD_KEYS = UNION_KEYS.concat(['orders']);

  function parseArr(str) {
    try {
      var v = JSON.parse(str);
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function itemKey(k, it) {
    if (!it || typeof it !== 'object') return JSON.stringify(it);
    if (k === 'customers') return (it.code || ('name:' + (it.name || '').toLowerCase()));
    if (k === 'giftcards') return it.code || JSON.stringify(it);
    if (k === 'kids') return 'kid:' + (it.name || '') + '|' + (it.parent || '');
    if (k === 'csa') return JSON.stringify(it);
    return it.id || JSON.stringify(it);
  }

  /* Union two JSON-array strings by identity; local wins on a clash. */
  function unionKey(k, localStr, remoteStr) {
    var l = parseArr(localStr), r = parseArr(remoteStr);
    if (!l.length) return remoteStr;
    if (!r.length) return localStr;
    var seen = {}, out = r.slice();
    r.forEach(function (it) { seen[itemKey(k, it)] = 1; });
    l.forEach(function (it) {
      var key = itemKey(k, it);
      if (seen[key]) {
        for (var i = 0; i < out.length; i++) {
          if (itemKey(k, out[i]) === key) { out[i] = it; break; }
        }
      } else { out.push(it); seen[key] = 1; }
    });
    return JSON.stringify(out);
  }

  /* Merge a local snapshot with the shared store's snapshot, key by key.
     The golden rule: a missing local value (null) NEVER overwrites a real
     shared value. That is what wiped the orders on 27 Nov 2026. */
  function mergeData(local, remote) {
    var out = {};
    for (var k in KEYS) {
      var lv = local ? local[k] : null;
      var rv = remote ? remote[k] : null;
      if (lv == null) out[k] = rv;
      else if (rv == null) out[k] = lv;
      else if (UNION_KEYS.indexOf(k) >= 0) out[k] = unionKey(k, lv, rv);
      else out[k] = lv; /* orders, waitlist, scalars: local list wins whole */
    }
    return out;
  }

  /* Local records that the shared store does not have anywhere yet (a new
     order placed on this phone, a new registration). For orders, "anywhere"
     means the live list, the waitlist AND the past-orders archives, so a
     seeded order that already lives in the shared archives is never treated
     as new and never dragged back into the live list. */
  function findAdditions(k, localStr, remoteData) {
    var l = parseArr(localStr);
    if (!l.length) return [];
    if (k === 'orders') {
      var present = {};
      parseArr(remoteData.orders || null).forEach(function (it) { if (it && it.id) present[it.id] = 1; });
      parseArr(remoteData.waitlist || null).forEach(function (it) { if (it && it.id) present[it.id] = 1; });
      parseArr(remoteData.archives || null).forEach(function (a) {
        (a.orders || []).forEach(function (it) { if (it && it.id) present[it.id] = 1; });
      });
      return l.filter(function (it) { return it && it.id && !present[it.id]; });
    }
    var seen = {};
    parseArr(remoteData[k] || null).forEach(function (it) { seen[itemKey(k, it)] = 1; });
    return l.filter(function (it) { return it && !seen[itemKey(k, it)]; });
  }

  function setReady() {
    if (ready) return;
    ready = true;
    if (pendingPush) { pendingPush = false; pushNow(); }
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
      var preLocal = collectSnapshot().data;
      var remoteData = snap.data || {};
      for (var k in KEYS) {
        var v = remoteData[k];
        try {
          if (v == null) {
            /* Shared store has nothing for this key — keep what's on this
               device. A missing value means "no information", never
               "delete the local data". */
          } else if (RECORD_KEYS.indexOf(k) >= 0) {
            /* Keep genuinely-new local records (e.g. an order placed on
               this phone) that the shared store doesn't have anywhere yet. */
            var additions = findAdditions(k, preLocal[k], remoteData);
            var base = parseArr(v);
            localStorage.setItem(KEYS[k], JSON.stringify(base.concat(additions)));
          } else {
            localStorage.setItem(KEYS[k], v);
          }
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
    if (!ready) { pendingPush = true; return Promise.resolve(false); }
    var local = collectSnapshot();
    setStatus('syncing');
    return docRef.get().then(function (doc) {
      var remote = null;
      if (doc.exists) {
        var d = doc.data();
        if (d) {
          lastRemote = d;
          if (d.data) remote = d.data;
        }
      }
      /* Merge with the shared store first — never blind-overwrite it. */
      var snap = { v: 1, updatedAt: Date.now(), updatedBy: deviceId,
        data: mergeData(local.data, remote) };
      return docRef.set(snap).then(function () {
        meta.updatedAt = snap.updatedAt;
        meta.lastSyncAt = snap.updatedAt;
        saveMeta();
        setStatus('synced');
        return true;
      });
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
        lastRemote = remote;
        setReady();
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
        setReady();
        return pushNow().then(function () { subscribe(); });
      }
      var remote = doc.data();
      if (!remote || !remote.data) {
        setReady();
        return pushNow().then(function () { subscribe(); });
      }
      lastRemote = remote;
      if (remote.updatedBy === deviceId) {
        meta.lastSyncAt = remote.updatedAt || Date.now();
        saveMeta();
        setReady();
      } else if ((remote.updatedAt || 0) > (meta.lastSyncAt || 0) || !meta.lastSyncAt) {
        /* Shared store is newer than anything on this device — or this
           device has never synced: pull it FIRST. applySnapshot keeps any
           genuinely-new local records, then push the merged result up so
           nothing this device created is lost. A fresh device's seeded
           orders never overwrite the shared live orders this way. */
        applySnapshot(remote);
        setReady();
        subscribe();
        setStatus('synced');
        return pushNow();
      } else if ((meta.updatedAt || 0) > (remote.updatedAt || 0)) {
        /* This device changed things after its last sync: push the
           merged result (pushNow merges with the shared store first). */
        setReady();
        return pushNow().then(function () { subscribe(); });
      }
      setReady();
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

  /* Re-pull the shared store from Firestore, then run cb. Used by the
     Hub Refresh button: pull first, then re-render everything. Never
     seeds the store — if the doc does not exist yet there is nothing
     to pull, so it just runs cb. */
  function pullNow(cb) {
    var done = function () { try { if (typeof cb === 'function') cb(); } catch (e) {} };
    if (!docRef) { done(); return; }
    setStatus('syncing');
    docRef.get().then(function (doc) {
      if (doc.exists) {
        var remote = doc.data();
        if (remote) lastRemote = remote;
        if (remote && remote.data && (remote.updatedAt || 0) > (meta.lastSyncAt || 0) &&
            remote.updatedBy !== deviceId) {
          applySnapshot(remote);
        }
        setStatus('synced');
      } else {
        setStatus('synced');
      }
      done();
    }).catch(function (err) { handleSyncError(err); done(); });
  }

  window.SRF_SYNC = {
    status: function () { return { state: syncState, note: syncNote, deviceId: deviceId, meta: meta }; },
    pushNow: pushNow,
    pullNow: pullNow,
    config: FIREBASE_CONFIG,
    /* Test hooks (not used by the app itself). */
    _mergeData: mergeData,
    _findAdditions: findAdditions,
    _isReady: function () { return ready; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
