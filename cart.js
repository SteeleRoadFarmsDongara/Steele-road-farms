/* Steele Road Farms — Shop cart + Stripe-ready checkout.
   Loaded on shop.html AFTER the main inline app script and BEFORE sync.js,
   so sync.js can wrap saveCart() and sync the cart with the shared store.
   Plain black background, SRF branding — see brand standards.
   Top-level functions on purpose: the shop page calls them from onclick
   handlers, and sync.js wraps saveCart() by name. */
'use strict';

/* =====================================================================
   STRIPE PAYMENT LINKS — KEV: PASTE YOUR STRIPE PAYMENT LINKS HERE.
   Stripe is NOT connected yet. Once Kev connects his Stripe account,
   create one Payment Link per box size in the Stripe dashboard and
   paste each link below (in the quotes). 'extras' is for orders with
   no box in them (pick-your-own / gift cards only).
   Until a slot has a real link, the "Pay by card" option stays switched
   off and customers see "Card payment coming soon" — PayID, bank
   transfer, PayPal and cash keep working exactly as before.
   No other code change is needed when the links go in.
   ===================================================================== */
var STRIPE_PAYMENT_LINKS = {
  small: '',
  standard: '',
  large: '',
  extras: ''
};

/* ------------------------------------------------------------------ */
/* Cart state — saved on this device, synced via sync.js (srf_cart_v1) */
var CART_KEY = 'srf_cart_v1';
var cart = [];

function loadCart() {
  try {
    var s = localStorage.getItem(CART_KEY);
    cart = s ? JSON.parse(s) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch (e) { cart = []; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
}

/* Item: {kind:'box'|'zuc'|'dongara'|'special'|'gift', key, name, unit,
   price (fallback — live prices are re-read from INV where possible),
   qty, meta (gift cards only: buyer/buyerEmail/to/toEmail/message)} */
var ZUC_NAMES = {
  large3: ['Large zucchini — 3 for', 'pack'],
  small3: ['Small zucchini — 3 for', 'pack'],
  bag: ['Large bag — as much as you can carry', 'bag'],
  crate12: ['Mixed crate of 12', 'crate']
};

function cartFulfil() {
  var el = (typeof document !== 'undefined') ? document.getElementById('fulfil') : null;
  return el ? el.value : 'pickup';
}
function cartBoxUnitPrice(key) {
  try {
    var b = INV.boxes[key];
    if (!b) return 0;
    return cartFulfil() === 'delivery' ? b.del : b.pickup;
  } catch (e) { return 0; }
}
function cartLivePrice(it) {
  try {
    if (it.kind === 'box') return cartBoxUnitPrice(it.key);
    if (it.kind === 'zuc' && INV.zuc && INV.zuc[it.key] != null) return +INV.zuc[it.key];
    if (it.kind === 'dongara' && INV.dongara[it.key]) return +INV.dongara[it.key].price;
    if (it.kind === 'special' && INV.special && INV.special.items[it.key]) return +INV.special.items[it.key].price;
  } catch (e) {}
  return +it.price || 0;
}
function cartLinePrice(it) { return cartLivePrice(it); }
function cartNameFor(kind, key, meta) {
  try {
    if (kind === 'box' && INV.boxes[key]) return INV.boxes[key].label + ' box';
    if (kind === 'zuc' && ZUC_NAMES[key]) return ZUC_NAMES[key][0];
    if (kind === 'dongara' && INV.dongara[key]) return INV.dongara[key].name;
    if (kind === 'special' && INV.special && INV.special.items[key]) return INV.special.items[key].name;
    if (kind === 'gift' && meta) return 'Gift card $' + (+meta.amount).toFixed(2) + ' for ' + (meta.to || '—');
  } catch (e) {}
  return kind + ' ' + key;
}
function cartUnitFor(kind, key) {
  try {
    if (kind === 'box') return 'box';
    if (kind === 'zuc' && ZUC_NAMES[key]) return ZUC_NAMES[key][1];
    if (kind === 'dongara' && INV.dongara[key]) return INV.dongara[key].unit;
    if (kind === 'special' && INV.special && INV.special.items[key]) return INV.special.items[key].unit;
    if (kind === 'gift') return 'card';
  } catch (e) {}
  return '';
}
function cartPriceFor(kind, key, meta) {
  try {
    if (kind === 'box') return cartBoxUnitPrice(key);
    if (kind === 'zuc' && INV.zuc) return +INV.zuc[key] || 0;
    if (kind === 'dongara' && INV.dongara[key]) return +INV.dongara[key].price;
    if (kind === 'special' && INV.special && INV.special.items[key]) return +INV.special.items[key].price;
    if (kind === 'gift' && meta) return +meta.amount || 0;
  } catch (e) {}
  return 0;
}

function cartAdd(kind, key, qty, meta) {
  qty = Math.max(1, Math.round(qty || 1));
  var found = null;
  if (kind !== 'gift') {
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].kind === kind && String(cart[i].key) === String(key)) { found = cart[i]; break; }
    }
  }
  if (found) { found.qty += qty; }
  else {
    cart.push({ kind: kind, key: key, name: cartNameFor(kind, key, meta),
      unit: cartUnitFor(kind, key), price: cartPriceFor(kind, key, meta),
      qty: qty, meta: meta || null });
  }
  saveCart();
  renderCart();
}
function cartAddBox(key) { cartAdd('box', key, 1); }
function cartAddZuc(key) {
  var inp = (typeof document !== 'undefined') ? document.getElementById('zucQty-' + key) : null;
  var q = inp ? (parseFloat(inp.value) || 0) : 0;
  if (q <= 0) q = 1;
  cartAdd('zuc', key, q);
  if (inp) inp.value = 1;
}
function cartAddDongara(i) {
  var inp = (typeof document !== 'undefined') ? document.querySelector('[data-dong="' + i + '"]') : null;
  var q = inp ? (parseFloat(inp.value) || 0) : 0;
  if (q <= 0) q = 1;
  cartAdd('dongara', i, q);
  if (inp) inp.value = 0;
  if (typeof calc === 'function') { try { calc(); } catch (e) {} }
  renderCart();
}
function cartAddSpecial(i) {
  var inp = (typeof document !== 'undefined') ? document.querySelector('[data-special="' + i + '"]') : null;
  var q = inp ? (parseFloat(inp.value) || 0) : 0;
  if (q <= 0) q = 1;
  cartAdd('special', i, q);
  if (inp) inp.value = 0;
  if (typeof calc === 'function') { try { calc(); } catch (e) {} }
  renderCart();
}
function addGiftToCart() {
  var amtEl = document.getElementById('giftAmount');
  var amt = parseFloat(amtEl ? amtEl.value : '') || (typeof selectedGiftAmt !== 'undefined' ? selectedGiftAmt : 0);
  var buyer = document.getElementById('giftBuyer').value.trim();
  var buyerEmail = document.getElementById('giftBuyerEmail').value.trim();
  var to = document.getElementById('giftTo').value.trim();
  var toEmail = document.getElementById('giftToEmail').value.trim();
  var out = document.getElementById('giftDone');
  if (!amt || amt < 5) { alert('Pick an amount — at least $5.'); return; }
  if (!buyer) { alert('Add your name so Farmer Kev knows who bought it.'); return; }
  if (!toEmail || !/^\S+@\S+\.\S+$/.test(toEmail)) { alert('Add the recipient\'s email address so the digital card can be sent to them.'); return; }
  cartAdd('gift', 'gift-' + Date.now(), 1, {
    amount: +amt.toFixed(2), buyer: buyer, buyerEmail: buyerEmail,
    to: to || '—', toEmail: toEmail,
    message: document.getElementById('giftMsg').value.trim()
  });
  if (out) out.innerHTML = '<p class="small" style="color:#7bc96f">Gift card $' + amt.toFixed(2) + ' for ' + escHtml(to || '—') + ' added to your cart — it will be created when you check out, and you can email the digital card then.</p>';
  scrollToCart();
}
function cartChangeQty(i, d) {
  if (!cart[i]) return;
  cart[i].qty += d;
  if (cart[i].qty <= 0) cart.splice(i, 1);
  saveCart();
  renderCart();
}
function cartRemove(i) {
  if (!cart[i]) return;
  cart.splice(i, 1);
  saveCart();
  renderCart();
}
function cartClear() { cart = []; saveCart(); renderCart(); }
function cartCount() { return cart.reduce(function (a, it) { return a + it.qty; }, 0); }
function cartHasItems() { return cart.length > 0; }
function cartSubtotal() {
  return cart.reduce(function (a, it) { return a + cartLinePrice(it) * it.qty; }, 0);
}
function cartFirstBoxPrice() {
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].kind === 'box') return cartLinePrice(cart[i]);
  }
  return 0;
}
/* Totals mirror the old checkout's discount maths exactly:
   gift card comes off the subtotal, referral is 50% off the FIRST box,
   a free referral box takes up to one box price off. */
function cartTotals() {
  var sub = cartSubtotal();
  var firstBox = cartFirstBoxPrice();
  var disc = 0;
  if (typeof giftApplied !== 'undefined' && giftApplied) disc = Math.min(giftApplied.remaining, sub);
  var refDisc = 0;
  if (typeof refApplied !== 'undefined' && refApplied) refDisc = +(firstBox * 0.5).toFixed(2);
  var freeDisc = 0;
  if (typeof freeBoxCredit === 'function') {
    try { freeDisc = Math.min(freeBoxCredit(), firstBox); } catch (e) { freeDisc = 0; }
  }
  var total = Math.max(0, +(sub - disc - refDisc - freeDisc).toFixed(2));
  return { sub: +sub.toFixed(2), disc: +disc.toFixed(2), refDisc: refDisc,
    freeDisc: +freeDisc.toFixed(2), total: total, firstBox: firstBox };
}

/* ------------------------------------------------------------------ */
/* Stripe — one config slot (top of this file). Card option is only
   usable when a Payment Link exists for what is in the cart. */
function stripeLinkForCart() {
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].kind === 'box') {
      var l = STRIPE_PAYMENT_LINKS[cart[i].key];
      if (l) return l;
    }
  }
  return STRIPE_PAYMENT_LINKS.extras || '';
}
function stripeReady() {
  return !!(STRIPE_PAYMENT_LINKS.small || STRIPE_PAYMENT_LINKS.standard ||
    STRIPE_PAYMENT_LINKS.large || STRIPE_PAYMENT_LINKS.extras);
}
function stripeUI() {
  var sel = document.getElementById('payMethod');
  var note = document.getElementById('stripeNote');
  var link = stripeLinkForCart();
  if (sel) {
    var opt = sel.querySelector ? sel.querySelector('option[value="card"]') : null;
    if (opt) {
      opt.disabled = !link;
      if (!link && sel.value === 'card') sel.value = 'payid';
    }
  }
  if (note) {
    note.innerHTML = link
      ? '💳 Pay by card on Stripe\u2019s secure page — you\u2019ll be sent there after you place your order.'
      : (stripeReady()
        ? '💳 Card payment is set up for some items — add a box it covers and the card option will switch on.'
        : '💳 Card payment coming soon — pay by PayID, bank transfer or cash for now.');
  }
}

/* ------------------------------------------------------------------ */
/* Rendering */
function cartApplyTotalsToCheckout() {
  var t = cartTotals();
  var tl = document.getElementById('totalLine');
  if (tl) tl.textContent = money(t.total);
  var gl = document.getElementById('giftLine');
  if (gl) gl.textContent = t.disc > 0 ? ('Gift card applied: -' + money(t.disc)) : '';
  var rl = document.getElementById('refLine');
  if (rl) {
    var b = INV.boxes;
    var firstLabel = 'box';
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].kind === 'box') { firstLabel = b[cart[i].key] ? b[cart[i].key].label : 'box'; break; }
    }
    rl.textContent = (typeof refApplied !== 'undefined' && refApplied)
      ? ('Referral (' + refApplied.code + ') — 50% off your first box: -' + money(t.refDisc) + ' — ' + refApplied.referrerName + ' gets a free ' + firstLabel + ' box.')
      : (t.freeDisc ? ('Free referral box used: -' + money(t.freeDisc) + '.') : '');
  }
}
function renderSDLine() {
  var el = document.getElementById('sdLine');
  if (!el) return;
  var nEl = document.getElementById('custName');
  var n = nEl ? nEl.value.trim() : '';
  if (!n) { el.textContent = ''; return; }
  try {
    var b = steeleDollars(n);
    el.textContent = 'Your Steele Dollars: ' + fmtSD(b.dollars) + ' Steele $ (' + money(b.paidTotal) + ' paid so far, ' + b.orders + ' order(s) on record).';
  } catch (e) { el.textContent = ''; }
}
function renderZucCart() {
  var el = document.getElementById('zucCartList');
  if (!el) return;
  var keys = ['large3', 'small3', 'bag', 'crate12'];
  el.innerHTML = keys.map(function (k) {
    var nm = ZUC_NAMES[k];
    var price = (typeof INV !== 'undefined' && INV.zuc) ? INV.zuc[k] : 0;
    return '<div class="prow"><span>🥒 ' + nm[0] + ' — $' + price + '/' + nm[1] + '</span><span><input type="number" min="1" step="1" value="1" id="zucQty-' + k + '" style="width:60px"> <button class="small" onclick="cartAddZuc(\'' + k + '\')">➕ Add</button></span></div>';
  }).join('');
}
function renderCart() {
  var lines = document.getElementById('cartLines');
  if (lines) {
    if (!cart.length) {
      lines.innerHTML = '<p class="small">Your cart is empty — add a box, some zucchini, pick-your-own extras or a gift card above. It\'s sorta what we do around here.</p>';
    } else {
      lines.innerHTML = cart.map(function (it, i) {
        return '<div class="prow"><span><b>' + escHtml(it.name) + '</b><br><span class="small">' + money(cartLinePrice(it)) + ' each &bull; ' + escHtml(it.unit || '') + '</span></span><span><button class="small" onclick="cartChangeQty(' + i + ',-1)">−</button> <b>' + it.qty + '</b> <button class="small" onclick="cartChangeQty(' + i + ',1)">+</button> <button class="small" onclick="cartRemove(' + i + ')">✕</button><br>' + money(cartLinePrice(it) * it.qty) + '</span></div>';
      }).join('');
    }
  }
  var t = cartTotals();
  var ct = document.getElementById('cartTotal');
  if (ct) ct.textContent = money(t.total);
  var cn = document.getElementById('cartNote');
  if (cn) cn.textContent = cart.length ? (cartCount() + ' item(s) in your cart — checkout below to place your order.') : '';
  var chip = document.getElementById('cartChip');
  if (chip) chip.textContent = '🛒 Cart (' + cartCount() + ') — ' + money(t.total);
  if (cart.length) {
    cartApplyTotalsToCheckout();
  } else if (typeof _srfCalcOrig === 'function') {
    try { _srfCalcOrig(); } catch (e) {}
  }
  renderSDLine();
  stripeUI();
}
function scrollToCart() {
  var el = document.getElementById('cartPanel');
  if (el) el.scrollIntoView();
}
function scrollToCheckout() {
  var el = document.getElementById('checkoutCard');
  if (el) el.scrollIntoView();
}

/* Keep the old form-based total display in step: when the cart has
   items, the checkout total is the cart total (calc() still runs first
   for the referral / free-box rows, then we re-apply the cart total). */
var _srfCalcOrig = null;
if (typeof calc === 'function') {
  _srfCalcOrig = calc;
  calc = function () {
    var r = null;
    try { r = _srfCalcOrig.apply(this, arguments); } catch (e) {}
    if (cartHasItems()) cartApplyTotalsToCheckout();
    return r;
  };
}

/* ------------------------------------------------------------------ */
/* Checkout — places the cart as real orders, same shape as the seeded
   orders, same cap / wait-list rules as the old Place-my-order flow.
   One order per box (so the Hub's 15-box cap counts right); extras,
   discounts and gift-card purchases ride on the first order. */
function placeCartOrder() {
  maybeAutoClose();
  var nameEl = document.getElementById('custName');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) { alert('Please add your name so Farmer Kev knows whose box it is.'); return; }
  var payEl = document.getElementById('payMethod');
  var pay = payEl ? payEl.value : 'payid';
  if (pay === 'card' && !stripeLinkForCart()) {
    alert('Card payment isn\'t ready yet — pick PayID, bank transfer or cash for now.');
    return;
  }
  if (typeof refApplied !== 'undefined' && refApplied && !isFirstBoxOrder(name)) {
    refApplied = null;
    var _ro = document.getElementById('refOut');
    if (_ro) _ro.innerHTML = '<p class="small">Referral code removed — the 50% off is for your first box only.</p>';
  }
  var t = cartTotals();
  var fEl = document.getElementById('fulfil');
  var f = fEl ? fEl.value : 'pickup';
  var boxLabels = { small: 'Small', standard: 'Standard', large: 'Large' };

  var boxUnits = [];
  var extras = [];
  cart.forEach(function (it) {
    if (it.kind === 'box') { for (var q = 0; q < it.qty; q++) boxUnits.push(it); }
    else extras.push(it);
  });
  function lineText(it) { return it.name + ' x' + it.qty + ' (' + money(cartLinePrice(it) * it.qty) + ')'; }
  var extrasText = extras.map(lineText).join(', ');
  var extrasSub = extras.reduce(function (a, it) { return a + cartLinePrice(it) * it.qty; }, 0);

  var _refUsed = (typeof refApplied !== 'undefined') ? refApplied : null;
  var _freeUsed = (typeof freeBoxUseId !== 'undefined') ? freeBoxUseId : null;

  /* Gift cards bought in the cart are created now — same record shape
     as the old Buy-gift-card flow, paid by the order's payment method. */
  var madeGifts = [];
  extras.forEach(function (it) {
    if (it.kind !== 'gift' || !it.meta) return;
    var code = 'SRF-GIFT-' + String(Math.floor(1000 + Math.random() * 9000));
    var g = { code: code, amount: +cartLinePrice(it).toFixed(2), remaining: +cartLinePrice(it).toFixed(2),
      buyer: it.meta.buyer, buyerEmail: it.meta.buyerEmail, to: it.meta.to || '—',
      toEmail: it.meta.toEmail, message: it.meta.message || '', date: todayStr(),
      status: 'active', pay: pay };
    giftcards.push(g);
    madeGifts.push(g);
  });
  if (madeGifts.length) saveGift();

  var plans = [];
  if (!boxUnits.length) {
    plans.push({ boxLabel: 'Produce only', boxPrice: 0, first: true });
  } else {
    boxUnits.forEach(function (bu, idx) {
      plans.push({ boxLabel: boxLabels[bu.key] || bu.name, boxPrice: cartLinePrice(bu), first: idx === 0 });
    });
  }

  var giftLeft = t.disc, refLeft = t.refDisc, freeLeft = t.freeDisc;
  var placed = [], waitlisted = [];
  var firstOrderId = null;
  plans.forEach(function (op) {
    var id = 'SRF-' + String(orders.length + waitlist.length + 1).padStart(3, '0');
    var sub = op.boxPrice + (op.first ? extrasSub : 0);
    var gd = Math.min(giftLeft, sub); giftLeft -= gd;
    var rd = 0, fd = 0;
    if (op.first && boxUnits.length) {
      rd = Math.min(refLeft, op.boxPrice); refLeft -= rd;
      fd = Math.min(freeLeft, op.boxPrice); freeLeft -= fd;
    }
    var total = Math.max(0, +(sub - gd - rd - fd).toFixed(2));
    var items = op.boxLabel === 'Produce only'
      ? (extrasText || 'Produce only')
      : (op.boxLabel + ' box' + (op.first && extrasText ? ' + ' + extrasText : ''));
    var giftNote = gd ? (' Gift card used: -' + money(gd)) : '';
    var refNote = rd ? (' Referred by ' + (_refUsed ? _refUsed.referrerName : '') + ' (' + (_refUsed ? _refUsed.code : '') + ') — 50% off first box: -' + money(rd)) : '';
    var freeNote = fd ? (' Free referral box used: -' + money(fd)) : '';
    var o = { id: id, name: name, date: todayStr(), method: f, box: items, total: total,
      pay: pay, paid: 'unpaid',
      notes: (document.getElementById('custNotes').value.trim() + giftNote + refNote + freeNote).trim(),
      source: 'shop', refCode: _refUsed ? _refUsed.code : '',
      referredBy: _refUsed ? _refUsed.referrerName : '', refDisc: +rd.toFixed(2),
      freeBoxUsed: _freeUsed || '',
      from: document.getElementById('custFrom').value.trim() };
    var wl = isAfterCutoff(o.date) || boxCount(currentWeekOrders()) >= WEEK_CAP;
    var wlReason = isAfterCutoff(o.date)
      ? 'Orders for this fortnight closed ' + cutoffLabel(weekCutoff) + '.'
      : 'This fortnight is full (15-box cap reached).';
    if (wl) { waitlist.push(o); saveWaitlist(); waitlisted.push({ o: o, reason: wlReason }); }
    else { orders.push(o); save(); placed.push(o); }
    if (!firstOrderId) firstOrderId = id;
  });

  /* Referral record + free-box claim — first box order only, as before. */
  if (_refUsed && boxUnits.length && firstOrderId) {
    var firstBox = plans[0];
    referrals.push({ id: nextRefId(), referrerName: _refUsed.referrerName,
      referrerCode: _refUsed.code, newName: name, orderId: firstOrderId,
      boxKey: (function () { for (var i = 0; i < cart.length; i++) if (cart[i].kind === 'box') return cart[i].key; return ''; })(),
      boxLabel: firstBox.boxLabel, boxValue: firstBox.boxPrice, status: 'owed', date: todayStr() });
    saveReferrals();
  }
  if (_freeUsed && boxUnits.length) {
    var fr = referrals.find(function (x) { return x.id === _freeUsed && x.status === 'owed'; });
    if (fr) { fr.status = 'claimed'; fr.claimedDate = todayStr(); fr.claimedOrderId = firstOrderId; saveReferrals(); }
  }
  /* Gift-card redeem — reduce the balance by what was actually used. */
  if (typeof giftApplied !== 'undefined' && giftApplied) {
    var usedGift = +(t.disc - giftLeft).toFixed(2);
    giftApplied.remaining = +(giftApplied.remaining - usedGift).toFixed(2);
    if (giftApplied.remaining <= 0) giftApplied.status = 'redeemed';
    saveGift();
    giftApplied = null;
    document.getElementById('giftCode').value = '';
    document.getElementById('giftOut').innerHTML = '';
  }
  upsertCustomer({ name: name, phone: document.getElementById('custPhone').value.trim(),
    addr: document.getElementById('custAddr').value.trim(), pref: f, date: '2026-11-25' });
  renderHub(); renderWaitList(); renderCutoffBanner();

  /* Reset referral / free-box state, as the old flow does. */
  var refConfirm = (_refUsed && boxUnits.length ? '<br>🎉 Referral: 50% off your first box — you saved ' + money(t.refDisc) + '. ' + escHtml(_refUsed.referrerName) + ' gets a FREE ' + plans[0].boxLabel + ' box.' : '')
    + (_freeUsed && boxUnits.length ? '<br>🎁 Free referral box used: -' + money(t.freeDisc) + '.' : '');
  refApplied = null; freeBoxUseId = null;
  if (typeof _freeBoxSig !== 'undefined') _freeBoxSig = '';
  var _rc = document.getElementById('refCode'); if (_rc) _rc.value = '';
  var _ro2 = document.getElementById('refOut'); if (_ro2) _ro2.innerHTML = '';
  var _rl2 = document.getElementById('refLine'); if (_rl2) _rl2.textContent = '';
  var _fr2 = document.getElementById('freeBoxRow'); if (_fr2) _fr2.innerHTML = '';

  var allOrders = placed.concat(waitlisted.map(function (w) { return w.o; }));
  var grandTotal = allOrders.reduce(function (a, o) { return a + o.total; }, 0);
  var wlHead = waitlisted.length
    ? '<h2>Wait list — see you next fortnight!</h2><p><b>' + escHtml(waitlisted[0].reason) + '</b> Your order is saved on the wait list for next fortnight — it is not in this week\'s pack list, and Farmer Kev will move it into next week\'s orders. Next cutoff ' + cutoffLabel(nextCutoff()) + '.</p>'
    : '<h2>Order placed — thank you!</h2>';
  var orderRows = allOrders.map(function (o) {
    var isWl = waitlisted.some(function (w) { return w.o.id === o.id; });
    return '<p>Order number: <b>' + o.id + '</b>' + (isWl ? ' <b>(WAIT LIST)</b>' : '') + '<br>' + escHtml(o.box) + '<br>Total: <b class="price">' + money(o.total) + '</b><br>' + (f === 'delivery' ? 'Geraldton delivery ' + shortDate(deliveryDate(isWl ? 1 : 0)) + ', BCF 4:30–5:30pm' : 'Farm pickup ' + shortDate(pickupDate(isWl ? 1 : 0)) + ', morning') + '</p>';
  }).join('');
  var giftRows = madeGifts.length
    ? '<p>🎁 Gift card(s) created: ' + madeGifts.map(function (g) { return '<b>' + g.code + '</b> (' + money(g.amount) + ' for ' + escHtml(g.to) + ')'; }).join(', ') + ' — email the digital card from the gift card section, or ask Kev in the Hub.</p>' : '';
  var stripeBtn = '';
  if (pay === 'card') {
    var sLink = stripeLinkForCart();
    if (sLink) stripeBtn = '<p><a href="' + sLink + '" target="_blank" rel="noopener"><button class="big" type="button">💳 Pay by card on Stripe</button></a></p><p class="small">Stripe will charge the price on the payment page for your box size. Your order is saved as unpaid until Kev sees the payment land — then he marks it paid in the Hub.</p>';
  }
  var msgLines = allOrders.map(function (o) {
    var isWl = waitlisted.some(function (w) { return w.o.id === o.id; });
    return 'Steele Road Farms order ' + o.id + ' — ' + name + ', ' + o.box + ', ' + f + ', total ' + money(o.total) + ', pay by ' + o.pay + '. Orders close ' + cutoffLabel(weekCutoff) + ', Geraldton ' + shortDate(deliveryDate(isWl ? 1 : 0)) + ' BCF 4:30-5:30pm / farm pickup ' + shortDate(pickupDate(isWl ? 1 : 0)) + (_refUsed ? ' Referred by ' + _refUsed.referrerName + ' (' + _refUsed.code + ') — referrer gets a free box.' : '') + '.' + (isWl ? ' WAIT LIST for next fortnight.' : '');
  });
  var msg = msgLines.join('\n');
  document.getElementById('orderConfirm').innerHTML = '<div class="card" style="border-color:var(--gold)">' + wlHead
    + orderRows
    + '<p>Grand total: <b class="price">' + money(grandTotal) + '</b><br>Steele Dollars you will earn once paid: <b>' + fmtSD(steeleDollarsFor(grandTotal)) + ' Steele $</b>' + refConfirm + '</p>'
    + giftRows + stripeBtn
    + '<p class="small">Your order is saved to the shared store and will show in Farmer Kev\'s Farm Hub. Sending it on Messenger too is a good backup, so Kev has it on his phone straight away. Tap the big button below — it copies the whole order, then paste it into Messenger. ' + (waitlisted.length ? 'Your order is on the WAIT LIST in Farmer Kev\'s Hub:' : 'Your order is flagged NEW in Farmer Kev\'s Hub:') + '</p><pre>' + escHtml(msg) + '</pre><button class="big" onclick="copyText(document.querySelector(\'#orderConfirm pre\').textContent)">Copy order — send it to Kev on Messenger</button>'
    + (waitlisted.length ? ' <button class="ghost" style="margin-top:8px" onclick="optOutWaitlist(\'' + waitlisted[0].o.id + '\')">Leave the wait list</button><p class="small">Leaving the wait list means your spot is <b>not guaranteed</b>.</p>' : '')
    + '</div>';
  cartClear();
  window.scrollTo(0, document.getElementById('orderConfirm').offsetTop);
}

/* ------------------------------------------------------------------ */
/* Init — runs after the inline app script, before sync.js. */
loadCart();
renderZucCart();
renderCart();
(function () {
  var cn = document.getElementById('custName');
  if (cn) cn.addEventListener('input', renderSDLine);
  var ff = document.getElementById('fulfil');
  if (ff) ff.addEventListener('change', function () { renderCart(); });
  var pm = document.getElementById('payMethod');
  if (pm) pm.addEventListener('change', stripeUI);
})();
