<img src="logo.svg" width="96" alt="Taiwan Stock Tracker logo: a red seal with the character 台">

# Taiwan Stock Tracker

A small Mac app for tracking the Taiwan stocks and ETFs you trade, on your
own or with a partner. Everything stays on your Mac: your trades are saved
in a file next to the app, and prices come from the Taiwan Stock Exchange.

> **Coming in version 1.0.3:** the tracker as a real Mac app in its own
> window, and one-person mode. Until 1.0.3 is released, the install line
> opens the tracker in your browser. See [what's changed](CHANGELOG.md).

## Install

### Easiest: one line in Terminal

1. Open **Terminal**: press **⌘ Space**, type `Terminal` and press Return.
2. Copy this line, paste it into Terminal and press Return:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/huejuenhou/taiwan-stock-tracker/main/install.sh | bash
   ```

3. **Taiwan Stock Tracker**, with the red seal icon, is added to your
   Applications folder and Launchpad, and opens.

This way skips the macOS security warning. Running the same line again
reinstalls the app and keeps your trades, so it's also how to add the Mac
app if you installed an earlier version.

### Or: download the zip

1. **[Download taiwan-stock-tracker.zip](https://github.com/huejuenhou/taiwan-stock-tracker/releases/latest/download/taiwan-stock-tracker.zip)**
   and double-click it to unzip. Move the **Taiwan Stock Tracker** folder
   anywhere you like, such as Documents.
2. Double-click **Install App** to add **Taiwan Stock Tracker** to your
   Applications folder. Leave the folder where it is afterwards: the app
   keeps your trades there. (If you move it, open Install App again.)
3. macOS says it **"could not verify"** the file, because it isn't from the
   App Store. Click **Done**, then open **System Settings → Privacy &
   Security**, scroll down and click **Open Anyway**. You only do this once.

### If your Mac asks to install "Command Line Tools"

The app runs on Python, which comes with Apple's free Command Line Tools.
Click **Install** and wait a few minutes, then run the install line or
double-click **Start Tracker** again. Macs that already have them skip this.
Nothing else needs installing.

## Use it

- Open **Taiwan Stock Tracker** from Applications, Launchpad or Spotlight.
  It opens in its own window. Drag it to your Dock to keep it handy, and
  quit it with **⌘Q** when you're done.
- Prefer the browser? Double-click **Start Tracker** in the folder. That
  opens the tracker in your browser, with a Terminal window doing the work
  behind it; keep that window open while you use it.
- To look around with made-up trades first, double-click **Try Demo** in
  the **Taiwan Stock Tracker** folder.
- With the install line, your trades are saved in the Applications folder
  inside your home folder, in **Taiwan Stock Tracker** (in Finder, press
  **⌘ Shift H** to go home). With the zip, they're in the folder you unzipped.

## Updates

The app checks for a new version a few times a day while it's open. When
there is one, a blue bar appears at the top: click **Update now**. The app
replaces its own files, restarts and reloads the page by itself.

- Your trades, settings, price history and backups are never touched.
- The version you had is kept in `backups/app-<version>/`, just in case.
- Updates don't bring back the macOS security prompt.
- From 1.0.3 on, **Update now** also adds or refreshes the Mac app in
  Applications, including when you update from an earlier version.

## Known issues

- **Gray icon in the Clear and Tinted Dock styles.** In macOS's one-tone
  icon styles, the red seal icon turns into a plain gray square instead of
  see-through glass. Those styles need an icon made with Apple's Xcode.
  The icon looks right in the Default and Dark styles.

Every issue found so far, and how it was fixed, is in the
[changelog](CHANGELOG.md).

## Requirements

- A Mac running macOS 12 (Monterey) or later.
- An internet connection for prices. Everything else works offline.

## Pages

- **Portfolio**: open positions, each one's result for the latest trading
  day, allocation, and the list of buys and sells. Profit is worked out
  from the trades using average cost.
- **Daily tracker**: a chart of total return over time, a total for each
  month, a calendar with each day's gain or loss, and the holdings behind
  any day you click.
- **Dividend calendar**: expected payments with approximate amounts, which
  you correct once the real amount arrives. Dividends are kept on this page
  only and are not part of the profit numbers on the other pages.

**One person or two.** The app starts for one person. To track two people,
separately and together, type a second name in **Settings**: tabs for
Combined and each person appear on every page, and each trade gets an
owner. Empty the second name to go back to one person (this only works
once the second person has no trades left).

Red is a gain and green is a loss, the Taiwan convention.

## Prices

- Live prices refresh every 5 minutes while the page is open.
- Past daily closing prices are downloaded once, slowly, and kept in
  `taiwan-etf-history.json`.
- A price typed in **Edit prices** stays until you empty its field.

## Fees and tax

Every trade includes the broker commission (0.1425% of the amount, times
your discount, with a minimum of NT$20, or NT$1 under 1,000 shares) and, on
sells, the securities tax: 0.1% for ETFs and 0.3% for stocks. Set your
broker's discount in **Settings**. To use the exact charge instead, type it
in the trade's **Fees & tax** field.

## Your data is protected

- A copy of the data file is saved in `backups/` before the first change of
  each day. The last 30 are kept.
- If the data file can't be read, it is set aside as
  `taiwan-etf-data.damaged-….json` and the newest backup is used.
- A browser tab that is behind another tab can't overwrite the newer data.
- Only the app's own page can talk to it; nothing else on the network can.
- Try Demo uses its own file and never touches your real trades. It starts
  over from the sample trades every time you open it.

## Files

- `Install App.command`: adds the Mac app to Applications (for the zip download)
- `Start Tracker.command` / `Try Demo.command`: open the tracker or the demo in the browser
- `install.sh`: the one-line installer; it also adds the app to Applications
- `mac-app/`: the Mac app window (`TrackerApp.swift`), its build script and the built app
- `AppIcon.icns`, `logo.svg`: the red seal icon and logo
- `CHANGELOG.md`: every issue found and how it was fixed, by version
- `taiwan_etf_tracker.py`: the local server (Python standard library only)
- `index.html`: the app's interface
- `demo-data.json`: the sample trades used by Try Demo
- `taiwan-etf-data.json`: your trades, created on first run
- `backups/`: daily copies of your data file

To run it from Terminal instead: `python3 taiwan_etf_tracker.py`
(add `--demo` for the sample trades).

## Publishing a new version

For the person who maintains this repository.

1. Raise `VERSION` near the top of `taiwan_etf_tracker.py`, for example
   to `1.1.0`, move the **Unreleased** notes in `CHANGELOG.md` under that
   version, and commit.
2. If `mac-app/TrackerApp.swift` changed, run `mac-app/build.sh` and commit
   the rebuilt `mac-app/TrackerApp`.
3. Build the zip and publish the release:

   ```bash
   git archive --prefix="Taiwan Stock Tracker/" -o taiwan-stock-tracker.zip HEAD
   gh release create v1.1.0 taiwan-stock-tracker.zip --title "1.1.0" --notes "What changed"
   ```

The zip must be named `taiwan-stock-tracker.zip` and the tag must match
`VERSION`. Everyone's app offers the update within a few hours. Draft and
pre-release versions are never offered.
