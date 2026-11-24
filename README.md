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
- **Weekly reset**: in the Farm Hub, "Close this week & start fresh" files all current orders into Past Orders (localStorage `srf_archives_v1`, viewable and exportable as CSV per week, or all as JSON), clears the pack list, and starts a fresh week with order numbers restarting at SRF-001. Gift cards and shop inventory are **not** cleared. It is a manual button — a static GitHub Pages site cannot reset itself on a schedule.
- CSA: custom box, same value, no-obligation, pull out any time. Wording: **"No contract, no guaranteed spot"** — never "No contract, no box".
- Organic grown only — **NOT certified organic**.
- Branding: black background, green #63a446 accent only, red-orange-gold from the logo. No Farmer Saila — she has left the farm.
- PayID: steeleroadfarmsdongara@gmail.com. BSB blank for Farmer Kev to add. PayPal is copy-and-pay outside the shop.
- Seeded orders: 24 orders, $1,551.50 total, $310 paid, $1,241.50 unpaid across 21. Unconfirmed flags are shown in the Hub (Miranda Wall possible duplicate, Toni-Jane Burton missing $100 box, Kevin Wenzel $1.50 test, Kotie van Eck likely both legitimate). **No customer phone numbers or addresses are stored in this app.**

## Farm Hub passcode
The passcode is set in `HUB_PASSCODE` at the top of the `<script>` in `index.html`. Ask Farmer Kev for the current code — do not publish it in this README. This is a simple on-page gate on a public static page — it hides the order list from casual visitors, it is not bank-grade security.

## Hosting — honest limit
This is a static site for GitHub Pages. Orders are stored in the browser's localStorage (`srf_orders_v1`) on the device that placed / viewed them, so a customer order placed on a customer's phone shows in the Hub **on that same device**, and Kev can export JSON/CSV from the Hub and import it on his phone. It does **not** do live cross-device sync — GitHub Pages has no server or shared database. That is why every placed order also builds a copy-and-send Messenger message for the customer to send to Steele Road Farms, exactly as the old Shop did. A real shared backend (e.g. Supabase/Firebase) would be needed for true live sync, and that needs Kev to create that account — it was not invented here.

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
