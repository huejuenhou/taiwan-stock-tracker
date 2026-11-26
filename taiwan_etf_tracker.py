#!/usr/bin/env python3
"""
Taiwan ETF Tracker — a small local app.

Run it:      python3 taiwan_etf_tracker.py
Then open:   http://localhost:8787   (it opens your browser automatically)

Everything stays on this computer:
  - Your portfolio is saved to  taiwan-etf-data.json  next to this file.
  - Prices are fetched from the Taiwan Stock Exchange's public quote service,
    server-side (so the browser's CORS rules don't block it).

Uses only the Python standard library — nothing to install.
"""

import json
import os
import re
import shutil
import sys
import time
import threading
import webbrowser
import zipfile
import io
import hashlib
import plistlib
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = "1.0.3"
GITHUB_REPO = "huejuenhou/taiwan-stock-tracker"
INDEX = os.path.join(HERE, "index.html")
# Demo mode (python3 taiwan_etf_tracker.py --demo) opens made-up trades on
# its own port and in its own file, so it never touches your real data. It
# starts over from demo-data.json every time.
DEMO = "--demo" in sys.argv[1:]
DEMO_TEMPLATE = os.path.join(HERE, "demo-data.json")
DATA_FILE = os.path.join(HERE, "taiwan-etf-demo.json" if DEMO else "taiwan-etf-data.json")
PORT = int(os.environ.get("ETF_PORT", "8788" if DEMO else "8787"))

BACKUP_DIR = os.path.join(HERE, "backups", "demo") if DEMO else os.path.join(HERE, "backups")
BACKUPS_TO_KEEP = 30
data_lock = threading.RLock()


def _seed():
    return {
        "rev": 0,   # goes up by one on every save; a tab must send the latest to save
        "settings": {"p1": "Me", "p2": "", "joint": "Joint"},   # one person until a second name is added
        "transactions": [],
        "dividends": [],
        "expected": [],
        "prices": {},
        "manual": [],   # symbols whose price was typed by hand
    }


def _read_data_file(path):
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    if not isinstance(d, dict):
        raise ValueError("not a portfolio file")
    for key, default in _seed().items():
        d.setdefault(key, default)
    return d


def _backup_files():
    try:
        names = sorted(n for n in os.listdir(BACKUP_DIR)
                       if n.startswith("taiwan-etf-data-") and n.endswith(".json"))
    except OSError:
        return []
    return [os.path.join(BACKUP_DIR, n) for n in names]


def _recover_data():
    """The data file can't be read: set it aside and go back to the newest good backup."""
    aside = os.path.join(HERE, "taiwan-etf-data.damaged-%s.json" % time.strftime("%Y%m%d-%H%M%S"))
    os.replace(DATA_FILE, aside)
    for path in reversed(_backup_files()):
        try:
            d = _read_data_file(path)
        except Exception:
            continue
        save_data(d)
        return d
    d = _seed()
    save_data(d)
    return d


def load_data():
    with data_lock:
        if os.path.exists(DATA_FILE):
            try:
                return _read_data_file(DATA_FILE)
            except Exception:
                return _recover_data()
        # First run: write the seed so it persists.
        d = _seed()
        save_data(d)
        return d


def _backup_once_a_day():
    """Before the first save of each day, keep a copy of the file as it was."""
    if not os.path.exists(DATA_FILE):
        return
    target = os.path.join(BACKUP_DIR, "taiwan-etf-data-%s.json" % time.strftime("%Y-%m-%d"))
    if os.path.exists(target):
        return
    try:
        _read_data_file(DATA_FILE)   # never back up a damaged file
        os.makedirs(BACKUP_DIR, exist_ok=True)
        shutil.copy2(DATA_FILE, target)
        for old in _backup_files()[:-BACKUPS_TO_KEEP]:
            os.remove(old)
    except Exception:
        pass   # a failed backup must not block saving


def save_data(d):
    with data_lock:
        _backup_once_a_day()
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)


def _parse_quote_rows(payload):
    out = {}
    asof = ""
    for row in payload.get("msgArray", []) or []:
        code = row.get("c")
        if not code:
            continue
        price = None
        z = row.get("z")   # last traded price
        y = row.get("y")   # yesterday's close
        try:
            if z not in (None, "", "-"):
                price = float(z)
        except ValueError:
            price = None
        if price is None:
            # Fall back to best bid, then prior close, so we still show something.
            for key in ("b", "o", "y"):
                v = row.get(key)
                if v and v != "-":
                    try:
                        price = float(str(v).split("_")[0])
                        break
                    except ValueError:
                        continue
        prev = None
        try:
            if y not in (None, "", "-"):
                prev = float(y)
        except ValueError:
            prev = None
        if price is not None:
            out[code] = {"price": price, "prevClose": prev, "name": row.get("n") or ""}
        if row.get("d"):
            asof = row["d"]
    # TWSE date comes as YYYYMMDD — make it readable.
    if len(asof) == 8 and asof.isdigit():
        asof = "%s-%s-%s" % (asof[0:4], asof[4:6], asof[6:8])
    return out, asof


def _fetch_mis(ex_chs):
    """Call the TWSE MIS quote endpoint for a list of ex_ch tokens."""
    url = ("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch="
           + urllib.parse.quote("|".join(ex_chs))
           + "&json=1&delay=0&_=" + str(int(time.time() * 1000)))
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Referer": "https://mis.twse.com.tw/stock/fibest.jsp",
        "Accept": "application/json, text/plain, */*",
    })
    with urllib.request.urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def fetch_prices(symbols):
    """Try the main exchange (tse_) first, then OTC (otc_) for any misses."""
    symbols = [s.strip() for s in symbols if s.strip()]
    if not symbols:
        return {}, ""
    quotes, asof = {}, ""
    try:
        payload = _fetch_mis(["tse_%s.tw" % s for s in symbols])
        q, a = _parse_quote_rows(payload)
        quotes.update(q)
        asof = a or asof
    except Exception:
        pass
    missing = [s for s in symbols if s not in quotes]
    if missing:
        try:
            payload = _fetch_mis(["otc_%s.tw" % s for s in missing])
            q, a = _parse_quote_rows(payload)
            quotes.update(q)
            asof = asof or a
        except Exception:
            pass
    return quotes, asof


# ---- daily closing prices (for the Daily tracker page) ---------------------
# One request per symbol per month, kept in HISTORY_FILE. The exchange blocks
# clients that ask too quickly, so a single background thread fetches slowly.
HISTORY_FILE = os.path.join(HERE, "taiwan-etf-history.json")
FETCH_GAP_SECONDS = 2.5
REFRESH_OPEN_MONTH_SECONDS = 3600
RETRY_FAILED_SECONDS = 600
MAX_FAILURES_IN_A_ROW = 3

history_lock = threading.Lock()
history_failed = {}   # "symbol|yyyymm" -> time of the last failed attempt
history_running = False


def taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))


def _load_history():
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_history(h):
    tmp = HISTORY_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False)
    os.replace(tmp, HISTORY_FILE)


def _parse_daily_rows(rows):
    """Rows are [ROC date, ..., close at index 6, ...]; ROC year + 1911 = AD."""
    closes = {}
    for row in rows or []:
        try:
            y, m, d = str(row[0]).strip().split("/")
            closes["%04d-%02d-%02d" % (int(y) + 1911, int(m), int(d))] = float(str(row[6]).replace(",", ""))
        except (ValueError, IndexError):
            continue  # "--" means no trade that day
    return closes


def _fetch_url_json(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def fetch_month_closes(symbol, yyyymm):
    """Daily closes for one month: main exchange first, then OTC. Raises if unreachable."""
    payload = _fetch_url_json(
        "https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=%s01&stockNo=%s"
        % (yyyymm, urllib.parse.quote(symbol)))
    closes = _parse_daily_rows(payload.get("data")) if payload.get("stat") == "OK" else {}
    if closes:
        return closes
    time.sleep(FETCH_GAP_SECONDS)
    payload = _fetch_url_json(
        "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=%s&date=%s/%s/01&id=&response=json"
        % (urllib.parse.quote(symbol), yyyymm[:4], yyyymm[4:]))
    tables = payload.get("tables") or [{}]
    return _parse_daily_rows(tables[0].get("data"))


def _next_month(yyyymm):
    y, m = int(yyyymm[:4]), int(yyyymm[4:])
    return "%04d%02d" % (y + 1, 1) if m == 12 else "%04d%02d" % (y, m + 1)


def needed_months(transactions):
    """(symbol, yyyymm) for every month from a symbol's first trade until it was sold out."""
    by_symbol = {}
    for t in transactions:
        sym, date = str(t.get("symbol") or ""), str(t.get("date") or "").replace("/", "-")
        if re.fullmatch(r"[0-9A-Za-z]{4,8}", sym) and re.match(r"\d{4}-\d{2}", date):
            by_symbol.setdefault(sym, []).append(dict(t, date=date))
    this_month = taipei_now().strftime("%Y%m")
    needed = []
    for sym, txs in by_symbol.items():
        txs.sort(key=lambda t: t["date"])
        held = sum(float(t.get("shares") or 0) * (-1 if t.get("type") == "sell" else 1) for t in txs)
        month = txs[0]["date"][:7].replace("-", "")
        last = this_month if held > 1e-9 else txs[-1]["date"][:7].replace("-", "")
        while month <= min(last, this_month):
            needed.append((sym, month))
            month = _next_month(month)
    return needed


def _is_up_to_date(entry, yyyymm):
    """A month fetched after it ended, with data in it, never changes again."""
    if entry.get("closes") and entry.get("fetchedMonth", "") > yyyymm:
        return True
    return time.time() - entry.get("fetchedAt", 0) < REFRESH_OPEN_MONTH_SECONDS


def _fetch_history(work):
    global history_running
    failures = 0
    try:
        for i, (sym, month) in enumerate(work):
            if i:
                time.sleep(FETCH_GAP_SECONDS)
            key = sym + "|" + month
            try:
                closes = fetch_month_closes(sym, month)
            except Exception:
                history_failed[key] = time.time()
                failures += 1
                if failures >= MAX_FAILURES_IN_A_ROW:
                    # Probably rate-limited: stop now and try the rest later.
                    for s, m in work[i + 1:]:
                        history_failed[s + "|" + m] = time.time()
                    return
                continue
            failures = 0
            history_failed.pop(key, None)
            with history_lock:
                h = _load_history()
                h.setdefault(sym, {})[month] = {
                    "closes": closes,
                    "fetchedAt": time.time(),
                    "fetchedMonth": taipei_now().strftime("%Y%m"),
                }
                _save_history(h)
    finally:
        history_running = False


def history_status(transactions=None):
    """Closes we already have, and start a background fetch for whatever is due."""
    global history_running
    needed = needed_months(load_data()["transactions"] if transactions is None else transactions)
    with history_lock:
        h = _load_history()
        now = time.time()
        recently_failed = lambda k: now - history_failed.get(k, 0) < RETRY_FAILED_SECONDS
        missing = [(s, m) for s, m in needed if m not in h.get(s, {})]
        failed = sum(1 for s, m in missing if recently_failed(s + "|" + m))
        due = [(s, m) for s, m in needed
               if not recently_failed(s + "|" + m)
               and (m not in h.get(s, {}) or not _is_up_to_date(h[s][m], m))]
        if due and not history_running:
            history_running = True
            threading.Thread(target=_fetch_history, args=(due,), daemon=True).start()
    closes = {}
    for s, m in needed:
        closes.setdefault(s, {}).update(h.get(s, {}).get(m, {}).get("closes", {}))
    return {
        "closes": closes,
        "total": len(needed),
        "missing": len(missing) - failed,
        "failed": failed,
        "busy": history_running,
    }


# ---- updates from GitHub releases ------------------------------------------
# The app asks GitHub for the latest release at most every 6 hours. Installing
# one replaces only the files below; data, history and backups are never
# touched. The old version is kept in backups/app-<version>/.
UPDATE_FEED = os.environ.get(
    "ETF_UPDATE_FEED", "https://api.github.com/repos/%s/releases/latest" % GITHUB_REPO)
UPDATE_ASSET = "taiwan-stock-tracker.zip"
APP_FILES = ["taiwan_etf_tracker.py", "index.html", "demo-data.json", "README.md",
             "CHANGELOG.md", "AppIcon.icns", "Start Tracker.command", "Try Demo.command",
             "Install App.command", "mac-app/TrackerApp"]
MAX_UPDATE_BYTES = 5 * 1024 * 1024
CHECK_EVERY_SECONDS = 6 * 3600
_update = {"checked": 0, "info": None}
update_lock = threading.Lock()


def _version_tuple(v):
    nums = re.findall(r"\d+", str(v))
    return tuple(int(n) for n in nums[:3]) if nums else (0,)


def _download(url, limit):
    req = urllib.request.Request(url, headers={
        "User-Agent": "taiwan-stock-tracker/" + VERSION,
        "Accept": "application/vnd.github+json, application/octet-stream, */*"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read(limit + 1)
    if len(body) > limit:
        raise ValueError("download too large")
    return body


def check_for_update(force=False):
    """{current, latest, available, notes, page}; quietly says 'none' when offline."""
    with update_lock:
        fresh = time.time() - _update["checked"] < CHECK_EVERY_SECONDS
        if _update["info"] is None or force or not fresh:
            info = {"current": VERSION, "latest": VERSION, "available": False,
                    "notes": "", "page": "", "asset": ""}
            try:
                rel = json.loads(_download(UPDATE_FEED, 1024 * 1024).decode("utf-8"))
                asset = next((a.get("browser_download_url") for a in rel.get("assets") or []
                              if a.get("name") == UPDATE_ASSET), "")
                tag = str(rel.get("tag_name") or "")
                info.update(latest=tag.lstrip("vV") or VERSION, notes=str(rel.get("body") or "")[:2000],
                            page=str(rel.get("html_url") or ""), asset=asset)
                info["available"] = bool(asset) and not rel.get("draft") and not rel.get("prerelease") \
                    and _version_tuple(tag) > _version_tuple(VERSION)
            except Exception:
                pass   # offline, or no release yet: just don't offer an update
            _update.update(checked=time.time(), info=info)
        return {k: v for k, v in _update["info"].items() if k != "asset"}


def install_update():
    """Download the release zip, check it, swap in the app files. Returns the new version."""
    info = check_for_update(force=True)
    if not info["available"]:
        raise ValueError("no newer version")
    blob = _download(_update["info"]["asset"], MAX_UPDATE_BYTES)
    zf = zipfile.ZipFile(io.BytesIO(blob))
    # Files may sit inside one top folder; find it from the server file.
    root = next((n[:-len("taiwan_etf_tracker.py")] for n in zf.namelist()
                 if n.endswith("taiwan_etf_tracker.py") and n.count("/") <= 1), None)
    if root is None:
        raise ValueError("release zip is missing the app")
    new = {}
    for name in APP_FILES:
        if root + name in zf.namelist():
            new[name] = zf.read(root + name)
    if "index.html" not in new:
        raise ValueError("release zip is missing index.html")
    compile(new["taiwan_etf_tracker.py"], "taiwan_etf_tracker.py", "exec")   # refuse a broken server
    keep = os.path.join(BACKUP_DIR if not DEMO else os.path.join(HERE, "backups"), "app-" + VERSION)
    os.makedirs(keep, exist_ok=True)
    for name in APP_FILES:
        if os.path.exists(os.path.join(HERE, name)):
            os.makedirs(os.path.dirname(os.path.join(keep, name)), exist_ok=True)
            shutil.copy2(os.path.join(HERE, name), os.path.join(keep, name))
    for name, body in new.items():
        target = os.path.join(HERE, name)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target + ".tmp", "wb") as f:
            f.write(body)
        runnable = name.endswith(".command") or name == "mac-app/TrackerApp"
        os.chmod(target + ".tmp", 0o755 if runnable else 0o644)
        os.replace(target + ".tmp", target)
    return info["latest"]


def _restart_soon():
    """Start the new code in this same process, so the Terminal window stays put."""
    def go():
        time.sleep(0.8)
        os.environ["ETF_NO_BROWSER"] = "1"
        os.execv(sys.executable, [sys.executable, os.path.join(HERE, "taiwan_etf_tracker.py")] + sys.argv[1:])
    threading.Thread(target=go, daemon=True).start()


# ---- the Mac app ------------------------------------------------------------
# "Taiwan Stock Tracker.app" in Applications shows the tracker in its own
# window (mac-app/TrackerApp). It is made here so the install line, Install
# App and updates all build it the same way. It records this folder, so the
# app finds the trades wherever the folder is.
MAC_APP_BINARY = os.path.join(HERE, "mac-app", "TrackerApp")
MAC_APP_NAME = "Taiwan Stock Tracker.app"
MAC_APP_MARK = os.path.join(HERE, ".mac-app-installed")


def _apps_dirs():
    if os.environ.get("ETF_APPS_DIR"):          # for testing
        return [os.environ["ETF_APPS_DIR"]]
    return ["/Applications", os.path.expanduser("~/Applications")]


def _mac_app_fingerprint():
    h = hashlib.sha256()
    for path in (MAC_APP_BINARY, os.path.join(HERE, "AppIcon.icns")):
        if os.path.exists(path):
            with open(path, "rb") as f:
                h.update(f.read())
    h.update(HERE.encode("utf-8"))
    return h.hexdigest()[:16]


def find_mac_app():
    for d in _apps_dirs():
        path = os.path.join(d, MAC_APP_NAME)
        if os.path.isdir(path):
            return path
    return None


def install_mac_app():
    """Create or refresh the Mac app. Returns its path, or None if it can't be made."""
    if sys.platform != "darwin" or not os.path.exists(MAC_APP_BINARY):
        return None
    for apps in _apps_dirs():
        try:
            os.makedirs(apps, exist_ok=True)
            if not os.access(apps, os.W_OK):
                continue
            bundle = os.path.join(apps, MAC_APP_NAME)
            new = bundle + ".new"
            shutil.rmtree(new, ignore_errors=True)
            os.makedirs(os.path.join(new, "Contents", "MacOS"))
            os.makedirs(os.path.join(new, "Contents", "Resources"))
            for src, dst, mode in ((MAC_APP_BINARY, "MacOS/launcher", 0o755),
                                   (os.path.join(HERE, "AppIcon.icns"), "Resources/AppIcon.icns", 0o644)):
                if os.path.exists(src):
                    target = os.path.join(new, "Contents", dst)
                    with open(src, "rb") as f, open(target, "wb") as out:
                        out.write(f.read())
                    os.chmod(target, mode)
            with open(os.path.join(new, "Contents", "Info.plist"), "wb") as f:
                plistlib.dump({
                    "CFBundleName": "Taiwan Stock Tracker",
                    "CFBundleDisplayName": "Taiwan Stock Tracker",
                    "CFBundleIdentifier": "io.github.huejuenhou.taiwan-stock-tracker",
                    "CFBundleExecutable": "launcher",
                    "CFBundleIconFile": "AppIcon",
                    "CFBundlePackageType": "APPL",
                    "CFBundleShortVersionString": VERSION,
                    "LSMinimumSystemVersion": "12.0",
                    "NSHighResolutionCapable": True,
                    "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
                    "TrackerFolder": HERE,
                    "TrackerFingerprint": _mac_app_fingerprint(),
                }, f)
            # Remove the other location's copy so there's only one app.
            for other in _apps_dirs():
                if other != apps:
                    shutil.rmtree(os.path.join(other, MAC_APP_NAME), ignore_errors=True)
            shutil.rmtree(bundle, ignore_errors=True)
            os.replace(new, bundle)
            os.utime(bundle)
            with open(MAC_APP_MARK, "w") as f:
                f.write(bundle + "\n")
            return bundle
        except OSError:
            continue
    return None


def _fetch_missing_files():
    """An updater from before 1.0.3 copies only the files it knew about, so the
    Mac app and its icon don't arrive. Fetch whatever this version's release
    has that this folder lacks. Existing files are never overwritten."""
    missing = [n for n in APP_FILES if not os.path.exists(os.path.join(HERE, n))]
    if not missing:
        return
    rel = json.loads(_download(UPDATE_FEED, 1024 * 1024).decode("utf-8"))
    if str(rel.get("tag_name") or "").lstrip("vV") != VERSION:
        return   # the latest release isn't this version; the next update brings them
    asset = next((a.get("browser_download_url") for a in rel.get("assets") or []
                  if a.get("name") == UPDATE_ASSET), "")
    if not asset:
        return
    zf = zipfile.ZipFile(io.BytesIO(_download(asset, MAX_UPDATE_BYTES)))
    root = next((n[:-len("taiwan_etf_tracker.py")] for n in zf.namelist()
                 if n.endswith("taiwan_etf_tracker.py") and n.count("/") <= 1), None)
    if root is None:
        return
    for name in missing:
        if root + name in zf.namelist():
            target = os.path.join(HERE, name)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target + ".tmp", "wb") as f:
                f.write(zf.read(root + name))
            runnable = name.endswith(".command") or name == "mac-app/TrackerApp"
            os.chmod(target + ".tmp", 0o755 if runnable else 0o644)
            os.replace(target + ".tmp", target)


def keep_mac_app_current():
    """On start: add the app once (e.g. after updating from an older version),
    and refresh it when a newer app or icon arrives. Never for a source checkout
    or the demo, and never brought back once someone deleted it."""
    if DEMO or os.environ.get("ETF_NO_MAC_APP") or os.path.isdir(os.path.join(HERE, ".git")):
        return
    try:
        _fetch_missing_files()
    except Exception:
        pass   # offline: try again next start
    try:
        bundle = find_mac_app()
        if bundle:
            with open(os.path.join(bundle, "Contents", "Info.plist"), "rb") as f:
                info = plistlib.load(f)
            if info.get("TrackerFolder") == HERE and info.get("TrackerFingerprint") != _mac_app_fingerprint():
                install_mac_app()
        elif not os.path.exists(MAC_APP_MARK):
            install_mac_app()
    except Exception:
        pass   # the tracker works without the app


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep the console quiet

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _is_local_request(self):
        """Only this app's own page may talk to the server, not other websites."""
        allowed = {"localhost:%d" % PORT, "127.0.0.1:%d" % PORT, "[::1]:%d" % PORT}
        origin = self.headers.get("Origin")
        if self.headers.get("Host", "") in allowed and (
                not origin or urllib.parse.urlparse(origin).netloc in allowed):
            return True
        self._send(403, "forbidden", "text/plain; charset=utf-8")
        return False

    def do_GET(self):
        if not self._is_local_request():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path in ("/", "/index.html"):
            try:
                with open(INDEX, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except Exception:
                self._send(500, "index.html not found next to the server.", "text/plain; charset=utf-8")
            return
        sample = urllib.parse.parse_qs(parsed.query).get("view") == ["demo"]
        if path == "/api/data":
            d = dict(_demo_template(), demo=True, view="demo") if sample else dict(load_data(), demo=DEMO)
            self._send(200, json.dumps(d, ensure_ascii=False))
            return
        if path == "/api/update":
            self._send(200, json.dumps(check_for_update()))
            return
        if path == "/api/history":
            txs = _demo_template()["transactions"] if sample else None
            self._send(200, json.dumps(history_status(txs)))
            return
        if path == "/api/prices":
            qs = urllib.parse.parse_qs(parsed.query)
            syms = (qs.get("symbols", [""])[0]).split(",")
            try:
                quotes, asof = fetch_prices(syms)
                self._send(200, json.dumps({"quotes": quotes, "asof": asof}))
            except Exception as e:
                self._send(200, json.dumps({"quotes": {}, "asof": "", "error": str(e)}))
            return
        self._send(404, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        if not self._is_local_request():
            return
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self._send(403, "forbidden", "text/plain; charset=utf-8")
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/update":
            try:
                version = install_update()
            except Exception as e:
                self._send(200, json.dumps({"ok": False, "error": str(e)}))
                return
            self._send(200, json.dumps({"ok": True, "version": version}))
            _restart_soon()
            return
        if parsed.path == "/api/data":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length else b"{}"
                d = json.loads(raw.decode("utf-8"))
                with data_lock:
                    current = load_data()
                    if d.get("rev") != current["rev"]:
                        # The tab is behind (another tab saved first): don't let it undo that.
                        self._send(409, json.dumps({"ok": False, "data": current}, ensure_ascii=False))
                        return
                    clean = {
                        "rev": current["rev"] + 1,
                        "settings": d.get("settings") or _seed()["settings"],
                        "transactions": d.get("transactions") or [],
                        "dividends": d.get("dividends") or [],
                        "expected": d.get("expected") or [],
                        "prices": d.get("prices") or {},
                        "manual": d.get("manual") or [],
                    }
                    save_data(clean)
                self._send(200, json.dumps({"ok": True, "rev": clean["rev"]}))
            except Exception as e:
                self._send(400, json.dumps({"ok": False, "error": str(e)}))
            return
        self._send(404, "not found", "text/plain; charset=utf-8")


def _demo_template():
    """The made-up sample trades (read-only; the Demo button shows these)."""
    with open(DEMO_TEMPLATE, "r", encoding="utf-8") as f:
        d = json.load(f)
    d["rev"] = 0
    return d


def _start_demo():
    """Copy the sample trades into the demo file, replacing last time's changes."""
    d = _demo_template()
    with data_lock:
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)


def _tracker_already_running():
    """True when this port already answers like the tracker (opened twice)."""
    try:
        req = urllib.request.Request("http://127.0.0.1:%d/api/update" % PORT)
        with urllib.request.urlopen(req, timeout=3) as resp:
            return "current" in json.loads(resp.read().decode("utf-8"))
    except Exception:
        return False


def main():
    if "--install-app" in sys.argv[1:]:
        path = install_mac_app()
        print(path or "")
        sys.exit(0 if path else 1)
    url = "http://localhost:%d" % PORT
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        if _tracker_already_running():
            print("\n  Taiwan Stock Tracker is already running, so its page was opened again.")
            print("  You can close this window; the app keeps running in its other window.\n")
            webbrowser.open(url)
            sys.exit(0)
        print("Could not start on port %d: %s" % (PORT, e))
        print("Something else is using it. Try:  ETF_PORT=8899 python3 taiwan_etf_tracker.py")
        sys.exit(1)
    if DEMO:
        _start_demo()   # only once we know no other demo is running on this file
    load_data()  # ensure the data file exists
    threading.Thread(target=keep_mac_app_current, daemon=True).start()
    print("\n  Taiwan Stock Tracker %s is running%s." % (VERSION, " with sample data" if DEMO else ""))
    print("  Open:  %s" % url)
    print("  Data file:  %s" % DATA_FILE)
    print("  Press Ctrl+C to stop.\n")
    if not os.environ.pop("ETF_NO_BROWSER", None):
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped. Your data is saved.")
        server.shutdown()


if __name__ == "__main__":
    main()
