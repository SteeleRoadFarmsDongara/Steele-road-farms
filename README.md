# Steele Road Farms — Unified App

One app, three views, one shared set of orders:
- **Shop** — public customer ordering: fortnightly veggie boxes + Dongara pick-your-own
- **CSA & Loyalty** — custom CSA box, Tight Ass Loyalty Club / Steele Dollars
- **Rats Patch Kids Club** — kids missions and Kids Dollars
- **Farm Hub** — operator view: all orders, mark paid, pack list (Geraldton / farm), print, export JSON/CSV

## Settled facts
- Fortnightly boxes. Orders close **Thu 26 Nov 2026**. Geraldton delivery **Mon 30 Nov 2026, BCF car park, 4:30–5:30pm**. Farm pickup **Tue 1 Dec 2026, morning**.
- Prices: Small $30 pickup / $35 delivered, Standard $55 / $60, Large $100 / $105.
- Dongara: Potatoes $6/kg, Carrots $5/kg, Beetroot $6/kg, Zucchini $8/kg, Pumpkin $3.50/kg, Sweet potato $9/kg, Brown onions $5/kg, Tomatoes $8/kg, Broccoli $4.50 each, Cauliflower $7.50 each, Celery $5 a bunch, Garlic $35/kg.
- Zucchini special: large 3 for $2, small 3 for $2.50, large bag $5, mixed crate of 12 for $15.
- **Shop inventory is editable in the Farm Hub** (behind the passcode): veggie box prices, Dongara pick-your-own prices/units/in-stock, stock-on-hand list, zucchini special prices, and gift card amounts. Edits save on that device (localStorage `srf_inventory_v1`) and the Shop updates straight away.
- **Gift cards**: customers buy one in the Shop — $25 / $50 / $100 or a custom amount (min $5), get a code like `SRF-GIFT-1234`, and enter it at checkout to take it off their total. Sold cards are listed in the Farm Hub with their remaining balance. Gift cards save on that device (localStorage `srf_giftcards_v1`), same as orders — no shared server.
- **Fortnightly reset**: in the Farm Hub, "Close this fortnight & start fresh" files all current-fortnight orders into Past Orders (localStorage `srf_archives_v1`, viewable and exportable as CSV per fortnight, or all as JSON), clears the pack list, and starts a fresh fortnight. The round also closes itself at midnight when the cutoff passes. Gift cards and shop inventory are **not** cleared. It is a manual button — a static GitHub Pages site cannot reset itself on a schedule.
- **Downloadable app (PWA)**: `manifest.webmanifest` + `sw.js` + SRF icons make it installable from the live site — Android: Install button / menu → Add to Home screen; iPhone: Share → Add to Home Screen. It opens full-screen like an app and the main page works offline from cache. Orders, inventory, gift cards and archives still live in each device's localStorage — installing it does not add a shared server.
- **Messages**: a Messages tab in the app. Customers send a message (name, optional phone, message) — it saves on that device (localStorage `srf_messages_v1`), shows in the Farm Hub where Kev can reply or mark it read, and the reply shows back in the customer's thread on that device. A copy-for-Messenger block is given too, because on a static site a message sent on a customer's phone does not reach Kev's phone on its own.
- **Special of the week**: a Specials card in the Shop — this week Zucchini Special (large 3 for $2, small 3 for $2.50, large bag $5, mixed crate of 12 $15). Customers pick quantities and it adds to their order total. Kev edits it in the Farm Hub inventory section — title, items, prices, and on/off for the week — so next week's special can be something else entirely.
- **Loyalty & Kids auto-add**: Steele Dollars add up automatically — $0.50 per $10 paid (rate editable in the Farm Hub inventory section). Balance shows in the customer loyalty lookup, on the order confirmation ("you'll earn X once paid"), and in a Farm Hub balances list. Kids Dollars add up automatically too — a kid taps a finished mission in the Kids Club and it adds to their balance (Plant a seedling 5, Pick a veggie 3, Find a bug 2, Draw a veggie 2, Help pack a box 5); Kev can also add with the +5 button in the Hub.
- CSA: custom box, same value, no-obligation, pull out any time. Wording: **"No contract, no guaranteed spot"** — never "No contract, no box".
- Organic and Local.
- Branding: black background, green #63a446 accent only, red-orange-gold from the logo. No Farmer Saila — she has left the farm.
- PayID: steeleroadfarmsdongara@gmail.com. BSB blank for Farmer Kev to add. PayPal is copy-and-pay outside the shop.
- Seeded orders: 24 orders, $1,551.50 total, $310 paid, $1,241.50 unpaid across 21. Unconfirmed flags are shown in the Hub (Miranda Wall possible duplicate, Toni-Jane Burton missing $100 box, Kevin Wenzel $1.50 test, Kotie van Eck likely both legitimate). **No customer phone numbers or addresses are stored in this app.**

## Farm Hub passcode
The passcode is set in `HUB_PASSCODE` at the top of the `<script>` in `index.html`. Ask Farmer Kev for the current code — do not publish it in this README. This is a simple on-page gate on a public static page — it hides the order list from casual visitors, it is not bank-grade security.

## Cross-device sync — Firebase Firestore (2026-11-26)
Orders, customers, gift cards, messages, kids/CSA sign-ups, inventory, wait list and referrals now sync across devices through Firebase Firestore (project `steele-road-farms`, config in `sync.js`, loaded on all five pages). Every save pushes the full shared state to the Firestore document `srf/state`; every open listens live, so a customer order on their phone lands in Kev's Hub. localStorage stays the fallback — if Firestore is unreachable the app keeps working locally and syncs later. A one-time backup of pre-sync local data is kept in `srf_presync_backup_v1`. **The sync only works once the Firestore database exists: Kev creates it in the Firebase console (Build → Firestore Database → Create database, production mode, Sydney `australia-southeast1`).** Firestore rules must also allow reads/writes (the app tries anonymous sign-in; if rules block it the Hub shows "Sync blocked — check Firestore rules"). Referral deal lives here too: a new customer entering a referrer's card code (`SRF-CARD-####`) gets 50% off their first box; the referrer gets a free box of the same size, tracked in the Hub until claimed; wrong codes are rejected cleanly at full price; you cannot use your own code.

## Hosting — honest limit
This is a static site for GitHub Pages, plus the Firebase shared store above. Orders are stored in the browser's localStorage on each device AND in Firestore, so a customer order placed on a customer's phone shows in Kev's Hub once the Firestore database exists. If the database has not been created yet, the app falls back to localStorage only (same-device behaviour) and every placed order still builds a copy-and-send Messenger message for the customer to send to Steele Road Farms, exactly as the old Shop did.

## Deploy to GitHub Pages (manual step — repo creation via the Muse GitHub App failed)
The Muse GitHub App connection as SteeleRoadFarmsDongara is connected, but `create_repository` fails with:
`403 Resource not accessible by integration` (POST https://api.github.com/user/repos)
— tried twice, 24 Nov 2026, after Kev switched the App access to All repositories. The App appears not to have repository-creation permission.

Manual step for Kev (one minute, in his own browser):
1. Go to https://github.com/new — sign in as SteeleRoadFarmsDongara
2. Repository name: `steele-road-farms`, Public, leave the rest as-is, Create repository
3. Tell Muse, or upload these files yourself: `index.html`, `README.md`, `.nojekyll`
4. Then: Settings → Pages → Branch: `main`, folder `/ (root)` → Save. Live URL: https://steeleroadfarmsdongara.github.io/steele-road-farms/

Once the repo exists, Muse can push updates to it with the connected GitHub account.

## Local test
Open `index.html` in a browser, or run `python3 -m http.server` in this folder and open http://localhost:8000.


## Split into separate apps (2026-11-25)
- `index.html` — front door: links to the three customer apps only. The Farm Hub is NOT linked from here.
- `shop.html` — customer veggie-buying app: what's in this week's box, pick a box size, add extras (Dongara pick-your-own + Special of the Week), subscribe (CSA), gift cards, checkout, messages. No Hub tab.
- `loyalty.html` — My Card login by name: LARGE visual loyalty card (Steele Dollars 0.50 per $10 paid, box stamps 1 per box, gift at 10, free box at 100), purchase history, kids' Kids Dollars, and a LARGE visual gift card section with check-by-code.
- `kids.html` — Rats Patch Kids Club: sign-up, missions with auto Kids Dollars, invented vegetable characters.
- `hub.html` — Farm Hub, operator-only behind the passcode, one neat Edit page: prices, stock, specials, gift cards, orders, pack list, messages, customers, kids, CSA, jokes, weekly reset. No customer link to it. Editing is for Farmer Kev only — no editing controls on any customer page.
All pages share the same data (orders, gift cards, loyalty, kids, inventory) — on the same device via localStorage, and across devices via the Firebase shared store (`sync.js`, Firestore document `srf/state`) once the database exists.

## Registration wall + customer book + new-order alerts (2026-11-25)
- Customer apps (shop, loyalty, kids) open on a registration page first: name, phone, address, pickup/delivery preference. No browsing without registering. Registration saves on the device (srf_customers_v1 / srf_customer_v1) and pre-fills checkout. Switch-customer link clears it.
- Hub has a private Customer book (Kev only, behind the passcode): every registered customer with phone, address, preference, orders, paid total, Steele Dollars and box stamps — plus order-only customers merged in.
- New-order alerts in the Hub: a 🔔 NEW badge on the gate before unlocking, a new-orders banner inside the Hub, NEW pills on fresh order rows, and a Mark-all-as-seen button. Static-site limit: a customer's phone cannot push a live notification to Kev's phone — the one-tap Copy-order button (Messenger) is the bridge that gets the order to him.

## Fortnightly cycle, wait list, separate Hub app (2026-11-25)
- **Fortnightly cycle**: customers have two full weeks to order. This round (one-off for this first round only): orders after Fri 13 Nov 2026 and before midnight Wed 25 Nov go on next Monday's delivery (Mon 30 Nov 2026, Geraldton BCF 4:30–5:30pm, farm pickup Tue 1 Dec). At midnight the round closes itself (midnight close-off in the app: this round is filed, the wait list rolls in, next fortnight starts — next cutoff Thu 10 Dec 2026, delivery Mon 14 Dec, pickup Tue 15 Dec). All dates in the Hub and Shop are computed from the cutoff, not hardcoded.
- **Date rule**: orders dated on or before Fri 13 Nov 2026 were already delivered — they do NOT count. They are kept in a Hub "Old orders" section (14 orders, $1,125.00). One-off backdate for this first round only — later rounds run fortnightly as normal. and excluded from this fortnight's pack list, totals and the cap. The seeded 30 Nov order ($1.50, Kevin Wenzel, looks like a test) sits on the wait list until the close-off rolls it into the next fortnight.
- **Cap is 15 BOXES per fortnight** (not 30, not customers): the 16th box order onwards goes on the wait list and is told so. Produce-only orders do not count as boxes. The customer message says 25 boxes a round; the app cap stays 15.
- **Wait list**: after-cutoff or cap-overflow orders go on the wait list (localStorage `srf_waitlist_v1`), not the current pack list. The shop tells the customer plainly and shows what they ordered. The Hub (Kev only) has the Wait List section: Move to next fortnight, Next-day delivery, Remove. Weekly reset / midnight close-off rolls wait-listed orders into the new fortnight automatically. **The wait list has no cap.**
- **Wait-list overflow — next-day delivery**: when the wait list builds up and there is enough stock, Kev can mark wait-listed orders for next-day delivery (Geraldton or Dongara) from the Hub. They move to a Next-day deliveries list (`srf_nextday_v1`) with tomorrow's date, and a copy message tells the customer. Back-to-wait-list and Delivered controls included.
- **Opt-out**: a wait-listed customer can leave the wait list from the Shop ("Your wait-listed orders" card, or the Leave button on the wait-list confirmation). The shop warns plainly that leaving means no guaranteed spot — they must order again next fortnight under the 15-box cap.
- **Customer notifications**: the Hub has a "Tell this week's customers" card listing everyone who ordered this fortnight, with a one-tap Copy message (Messenger) telling them their order is on next Monday's delivery, and a Notified / Not yet status per customer (saved per round, `srf_notified_v1`). Static-site limit: the app cannot push a live notification to a customer's phone — Messenger is the delivery mechanism.
- **Hub as a separate app**: `hub.html` has its own manifest (`manifest-hub.json`, "Steele Road Farms Hub" / "SRF Hub") and its own icon (`hub-icon.svg`), so Kev can add it to his home screen as its own app icon. No customer page links to it; it opens straight into the passcode gate. It shares the same on-device localStorage data.
- **Loyalty card tidy + QR**: the loyalty screen shows only the customer's card (name, Steele Dollars, box stamps) with a QR code (`qrcode.min.js`, vendored qrcode-generator, works offline once cached) encoding their card code `SRF-CARD-####`. The Hub has a scan/lookup box (code or name) that pulls up the customer's card and balance.
- **Hub NEW alerts** flag wait-listed and next-day orders too, not just new orders.

## Farm-scene background, master heading, no-till claim, market prices, Refresh (2026-11-25)
- **Customer pages** (index, shop, loyalty, kids) use the farm-scene sign as their background and the new master heading image ("Steele Road" / "Farms" with leaf sprigs, "— Bonniefield Irwin, WA —"), both embedded as base64 in the HTML because the push tool rejects binary files. The Hub keeps its black background and text heading.
- **No-till claim** on all four customer pages, right under the header: "One of the only no-till, organic, regenerative market garden farms in Western Australia." The farm's own words — no extra superlatives, never "certified organic".
- **WA Organic Market Prices** (Hub only, behind the passcode, never on a customer page): a per-item WA organic market price list Kev can read and edit like the inventory, with a "Last updated" date. Seeded 25 Nov 2026 with his Dongara prices and market prices checked from the suppliers' own online shops — Dirty Clean Food (potatoes $7.75/kg, carrots $11.50/kg, pumpkin $8/kg, onions $11.95/kg), Manna Wholefoods (beetroot $10.99/kg, zucchini $9.99/kg, celery $16.99/kg), Market Organics (sweet potato $7.95/kg), Perth Organics (broccoli $6.95, cauliflower $13.95). Tomatoes and garlic are left blank — no price could be verified — and are editable. Perth box prices for reference: Organic Collective Big Box $79, Dunn & Walton Small $55 / Large $95 / Extra Large $150, Dirty Clean Food Large $94.95, Manna Wholefoods Large $75, The Peoples Produce Large $82. Saved on the device (`srf_market_v1`). The weekly refresh of this list comes after this build.
- **Refresh button** at the top of the Hub: one big button re-reads all the data on the device and re-renders everything — orders, totals, pack list, wait list, next-day deliveries, stock, prices, the WA market price list, notifications — re-applies the date and cap rules, and re-checks for a new app version (the same check the app already does every 15 seconds). Shows "Last refreshed: <time>". Once the Firestore database exists, Refresh also pulls the latest shared data from other devices; before that it can only refresh what is on this device.
- **Updates reach customers without a re-download**: the PWA updates in place. The service worker cache is bumped on each push (now `srf-v10`) and `APP_VERSION` is bumped (`2026-11-26-firebase-sync`), so an installed app shows the gold refresh banner within 15 seconds of opening; the customer taps refresh and gets the new version. No app-store download, no reinstall.
