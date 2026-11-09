# Meta Ads Dashboard

Turn your Meta (Facebook / Instagram) Ads Manager exports into a dashboard that shows **what's working, what's wasting money and what to check next**.

- Works on your computer and your phone, and can be installed like an app. No account, no sign-up.
- Your data stays on your device. Files are read on the device and never uploaded; the app makes no requests to other servers.
- Works offline once installed.
- Load several ad accounts together and compare them side by side.

---

## How to use it (5 minutes)

### Step 1: Get the app (once)

**Option A: open the web link and install it (recommended)**

Open the app's web address, listed under **About** at the top right of this repository's GitHub page (it looks like `https://<name>.github.io/<repo>/`). You can use it right there in the browser, or install it so it gets its own icon and works offline:

| Device | How to install |
|---|---|
| **iPhone / iPad** (Safari) | Tap **Share** ⎋ → **Add to Home Screen** → **Add** |
| **Android** (Chrome) | Tap **⋮** → **Install app** (or **Add to Home screen**) |
| **Mac / Windows** (Chrome or Edge) | Click the install icon ⊕ at the right end of the address bar → **Install** |

**Option B: download it and open it from a folder**

1. On this GitHub page, click the green **Code** button, then **Download ZIP**.
2. Unzip it. You'll get a folder called `meta-ads-dashboard-main`; move it somewhere easy to find.
3. Whenever you want to use it, open the folder and **double-click `index.html`**.

This works fully offline too, but it can't be installed as an app and can't receive files shared from other apps.

> Can't see the **Code** button? This repository is private, so ask the owner to add your GitHub account as a collaborator.

### Step 2: Export your data from Meta Ads Manager

Do this for each ad account you want to look at.

1. Open [Ads Manager](https://adsmanager.facebook.com) and choose the ad account (top-left account switcher).
2. Stay on the **Campaigns** tab.
3. Set the **date range** (top-right), for example *Last 30 days*.
4. Click **Breakdown** → **By time** → **Day**. *(Important: this is what powers the trends and day-of-week patterns.)*
5. Click **Export** (the ⤓ icon or *Reports → Export table data*) → choose **.csv** → **Export**.

The file lands in your Downloads folder with a name like
`1234567890123456 Acme-Home-Goods-Campaigns-Oct-4-2026-Nov-2-2026.csv`.
Don't rename it: the dashboard reads the account name from the file name.

### Step 3: Add your files

Open the app, then **drag all your CSV files onto the drop area**, or click it and pick them. Once data is loaded, use **+ Add files** (top right) or drop more files anywhere on the page. You can select several files at once (hold **Cmd** on Mac or **Ctrl** on Windows while clicking), so there's no need to add them one by one.

- **On a phone:** tap the box and choose the CSVs from Files, Drive or Downloads. To get them onto your phone, email them to yourself or save them to Drive or iCloud.
- **On Android (installed app):** you can also select CSVs in Files, Gmail or Drive, tap **Share**, and pick **Ads Dashboard**.
- **On desktop (installed app):** right-click a CSV → **Open with** → **Meta Ads Dashboard**.

You can add more files later and they're merged in. If two files cover the same days for the same account, those days are counted once.

That's it: the dashboard fills in below.

---

## Reading the dashboard

| Section | What it tells you |
|---|---|
| **Top numbers** | Total spend, leads (or whatever result your campaigns optimise for), cost per lead, clicks, click-through rate, cost per click, cost per 1,000 impressions |
| **What the data says** | Patterns found automatically, most urgent first. ⛔ **Critical**: money spent with nothing to show. ▲ **Watch**: something slipping. ✓ **Working**: keep doing it. ● **Pattern**: useful to know. |
| **Charts** | Daily spend, daily leads, cost per lead (7-day average), click-through rate by day, and by weekday. Hover any chart for exact numbers. |
| **Campaigns table** | Every campaign with its results. Click a column heading to sort. *Budget used* shows how much of its daily budget each campaign actually spends. |

**Handy controls**

- Click an **account** in the filter bar to hide or show it.
- Change **From / To** to zoom into a period.
- Click an account's name in the **file chips** at the top to give it a friendlier name.
- **×** removes a file, and **Clear all** starts over.
- **◐** (top right) switches between light and dark.
- **Hide idle campaigns** leaves out campaigns that spent nothing.

The dashboard remembers your files on this computer, in this browser, until you click **Clear all**.

### Ask an AI about your data

Below the patterns there's an **Ask an AI about this data** panel. It takes three steps:

1. **Pick a question** (such as *"What should I fix first?"* or *"Which campaign deserves more budget?"*) or type your own. You can also leave it empty, and the AI will start with the three most important takeaways.
2. **Click your assistant: ChatGPT, Claude, Gemini or Copilot.** That one click copies the data and your question and opens the chat in a new tab. Use another assistant? Click **Just copy**.
3. **Paste into the chat and send** (⌘V on Mac, Ctrl+V on Windows, long-press → Paste on a phone). Then keep asking follow-up questions as normal.

The copy covers exactly what's on screen: the period, accounts, totals, per-account and per-campaign tables, the patterns found, and the day-by-day and weekday numbers. Hide an account or narrow the dates first to ask about just that slice. To see exactly what will be shared, open **See exactly what gets copied**. Nothing leaves your device until you paste it.

The **Ask AI** button in the filter bar jumps to the panel.

### Patterns it looks for

- Campaigns or accounts spending money with **zero results**
- One account or campaign getting results **much cheaper** than another, and whether the gap comes before the click (the ad) or after it (the form or landing page)
- **Dry spells**: several days of spend without a single lead, including ones happening right now
- **This week vs last week**: leads, click-through rate, cost per lead, cost of impressions
- Whether **click-through rate predicts leads**, which makes it a useful early warning
- **Day-of-week effects**, including spend that drops on the same weekday every week
- Campaigns **not spending their daily budget**
- Too much spend in **one campaign**, **switched-off campaigns** cluttering the account, and **ads shown too often** to the same people

With small numbers (under 30 leads), comparisons are flagged as directional: worth testing, not proof.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| The page is blank or the charts don't appear | Refresh. If you downloaded the folder, make sure the `vendor` folder is next to `index.html`. |
| No install option | Installing needs the web link (Option A). A downloaded `index.html` can't be installed. On iPhone, use Safari. |
| The installed app hasn't picked up a new version | Close the app completely and reopen it. Updates download in the background and apply on the next launch. |
| "This does not look like a Meta Ads export" | Export from the **Campaigns**, **Ad sets** or **Ads** tab of Ads Manager as **.csv**, not .xlsx. |
| No charts over time, only totals | Re-export with **Breakdown → By time → Day**. |
| Two accounts show up as one | Keep Meta's original file names. They start with the account ID, which is how accounts are told apart. |
| Numbers look doubled | They shouldn't be: the same account and day are only counted once. Check that you haven't exported the same account under two different date breakdowns. |

---

<details>
<summary><strong>For developers</strong></summary>

Plain HTML, CSS and JavaScript with no build step and no runtime dependencies to install. PapaParse and Chart.js are vendored in `vendor/` (see `vendor/README.md`). The scripts are classic (not ES modules) so `index.html` works over `file://`. They register their functions on `globalThis.MetaAds` and load in this order: `parse.js`, `analyze.js`, `report.js`, `app.js`.

```
index.html        page shell
src/parse.js      CSV records → normalised rows (header matching, account from file name, de-dupe)
src/analyze.js    totals, daily series, per-campaign stats, pattern detection (pure functions)
src/report.js     Markdown summary of the current view (plus the question) for the Ask AI panel
src/app.js        upload, filters, rendering, charts, install/share plumbing
sw.js             service worker: offline cache (stale-while-revalidate) + Android share target
manifest.webmanifest  install metadata, icons, share target, desktop file handler
icons/            app icons (SVG sources + rendered PNGs)
vendor/           Papa Parse and Chart.js
test/             node:test suites with synthetic exports, plus PWA wiring checks
```

**Installable app (PWA).** The service worker only runs over http(s), so installing, offline caching and sharing need the hosted version; `file://` skips them and still works. `.github/workflows/pages.yml` deploys to GitHub Pages on every push to `main`. It skips private repos, because Pages is only free for public ones. In the public repo, set **Settings → Pages → Source** to **GitHub Actions**.

**Shipping a change to installed users.** Bump `SHELL` in `sw.js` (for example `shell-v1` → `shell-v2`) whenever you add, rename or remove files, and add new files to its `ASSETS` list. `npm test` fails if a file the page loads isn't in `ASSETS`.

```sh
npm test     # Node 20+
npm start    # optional: serve at http://localhost:8080 instead of opening the file
```

Real exports are git-ignored (`*.csv`). Don't commit client data.

</details>
