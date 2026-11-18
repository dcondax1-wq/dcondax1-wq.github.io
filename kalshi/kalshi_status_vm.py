#!/usr/bin/env python3
"""Kalshi to Jarvis (kalshi_status_vm.py): the owner's Kalshi bot numbers on his phone (Jarvis), read-only.

ONE FILE. Python 3.9+, standard library only (+ 'cryptography' for the not-recommended --from-api). It imports nothing
from the nq-liquidity-engine repo or from the Kalshi bot, so it can be copied anywhere. Public copy:
https://demetrades2000-coder.github.io/nq-dashboard/kalshi/kalshi_status_vm.py (steps for the bot's own Claude chat:
.../kalshi/SETUP.md). In the repo it is tools/kalshi_kit/public/kalshi_status_vm.py, and engine/kalshi_publish.py loads
this same file, so both give the same kalshi.json for the same input.

Where the numbers come from:
  --from-bot DIR  the Kalshi bot's own files in DIR (on its VM: /home/ubuntu/kalshi): trades.db (opened read-only),
                  account_truth.json, autotrader_status.json, autotune_state.json (eq_main), the settings files,
                  paused.txt.
                  Never .env or keys/, never the bot's modules, no Kalshi API call. THE way (runs on the VM).
  --from-vm       (alias --ssh) from the PC: runs --from-bot on the VM through the PC's own srv.py helper (the VM's
                  address stays in srv.py), then pushes from the PC. The fallback while the VM can't push.
  --src FILE      a status file the bot writes (the contract: --sample).
  --from-api      the Kalshi account through Kalshi's READ-ONLY endpoints. NOT recommended: the bot's account already
                  meets Kalshi's rate limits (HTTP 429); off unless asked for, at most one round every 5 min.
Risk guard (2026-11-13): when ~/kalshi_jarvis/guard exists (kalshi_guard.py beside this file; --guard DIR overrides), the
payload also carries `risk` (the guard's mode, limits, today's room, kill switch, the orders it saw; clean_risk()) and its
alerts, and once the bot asks the guard about its orders the mode shown is the guard's (paper / dry-run / live).
How it runs:
  --check   print exactly what would go public (no push)
  --once    push once (prints the result and the address the phone reads)
  --cron    for a crontab line every minute: push only when the numbers changed, and at least every 3 min
  --loop    keep it fresh by itself: every 60 s (API: 300 s), push when it changed (else every 3 min)

Where it goes: kalshi.json, one orphan commit force-pushed to the branch `main` of its OWN public repo
demetrades2000-coder/kalshi-feed (never the phone app's site repo: a key that can write there could rewrite the site),
from a private scratch git dir (no history piles up): with --deploy-key (the VM; a key added to kalshi-feed only) over SSH
as git@github.com:demetrades2000-coder/kalshi-feed.git, else over https with the machine's own git login. The first push
into the new, empty repo creates `main`. The phone's Kalshi page and the Jarvis card read
https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json (fallback: the GitHub contents API).

Safety (enforced in code, tested in tests/test_kalshi_publish.py):
  * Never trades and never changes the bot: the bot's files are only read (SQLite in read-only mode).
  * Pinned: the owner's paste line carries this file's SHA-256 (tools/kalshi_kit/print_sha.py); SETUP.md checks it
    before the first run and on every update. Cron runs the local copy, which never updates itself.
  * The feed's deploy key writes kalshi-feed only, never the phone app's site (nq-dashboard).
  * Only the contract's keys are published: credential-looking keys are dropped, every free-text string is redacted
    (links, IP addresses, e-mail addresses, local paths, keys, ids and token-like strings), tickers and times must look
    like tickers and times, lists are capped, and the file stays under MAX_BYTES.
  * --from-api is GET only: anything that is not a GET to an allow-listed read-only path is refused before a request is
    built (ReadOnlyError); the base URL must be Kalshi's trade API (or a loopback test server); redirects are refused;
    a 429 ends the round at once. The key id, the key file's path and the PEM text are never printed, logged or
    published; errors are redacted.

Keys (--from-api), first found wins: --key-id / --key-file, then the environment (KEY_ID_ENV / KEY_FILE_ENV names),
then an env file (--env-file, e.g. the Kalshi bot's own .env), then config.json in the state folder. A key "file"
value may also be the PEM text itself. Production by default; --demo (or a demo key setting) uses the demo API.

Money math (--from-api, all in dollars, ET days, Mon-Sun weeks): every fill is booked YES-equivalent (a NO buy is a YES
sell at 1 - price), average cost per market; a sell or a settlement books realized P&L, net of the fees of the
contracts it closes, on its ET day. Open positions are valued at their side's best bid (else the last price), net of
their fees. days = realized per ET day, today's day also holds the open positions' P&L; today/week/total = sums of days
(total = everything in Kalshi's live data, up to MAX_PAGES pages). Balance = cash + Kalshi's portfolio value. Equity
points: the balance now, walked back through the days (deposits and withdrawals are not visible to these endpoints).
"""
from __future__ import annotations

import argparse
import base64
import datetime as _dt
import glob
import hashlib
import importlib.util
import json
import os
import re
import shlex
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

KIT_VERSION = "2026-11-01"
FEED_OWNER = "demetrades2000-coder"
FEED_REPO = "kalshi-feed"       # its own public repo: a write key there can never touch the phone app's site (nq-dashboard)
REPO_URL = f"https://github.com/{FEED_OWNER}/{FEED_REPO}.git"
REPO_SSH = f"git@github.com:{FEED_OWNER}/{FEED_REPO}.git"            # with --deploy-key
BRANCH = "main"
FILE = "kalshi.json"
MAX_BYTES = 200 * 1024
EVERY_S = 60
KEEPALIVE_S = 180               # a push at least this often even when nothing changed ("updated N min ago" stays small)
PRUNE_EVERY = 30

PROD_BASE = "https://external-api.kalshi.com/trade-api/v2"          # the bot's own (api.elections.kalshi.com works too)
DEMO_BASE = "https://external-api.demo.kalshi.co/trade-api/v2"     # (demo-api.kalshi.co works too)
API_EVERY_S = 300               # --from-api: at most one read round every 5 min (the account already meets 429s)
API_PATH = "/trade-api/v2"
KALSHI_HOSTS = ("api.elections.kalshi.com", "external-api.kalshi.com", "trading-api.kalshi.com",
                "demo-api.kalshi.co", "external-api.demo.kalshi.co")
LOOPBACK = ("127.0.0.1", "localhost", "::1")

# The only requests this tool can make (GET, relative to /trade-api/v2, no query in the path).
ALLOWED_PATHS = (
    re.compile(r"/portfolio/balance"),
    re.compile(r"/portfolio/positions"),
    re.compile(r"/portfolio/fills"),
    re.compile(r"/portfolio/settlements"),
    re.compile(r"/markets/[A-Za-z0-9][A-Za-z0-9._-]{0,127}"),
)
PAGE = 200
MAX_PAGES = 25                  # fills / settlements: up to 5,000 rows each per full read
PAUSE_S = 0.12                  # between requests (the Kalshi bot shares the read budget)

KEY_ID_ENV = ("KALSHI_API_KEY_ID", "KALSHI_KEY_ID", "KALSHI_ACCESS_KEY", "KALSHI_API_KEY")
KEY_FILE_ENV = ("KALSHI_PRIVATE_KEY_PATH", "KALSHI_PRIVATE_KEY_FILE", "KALSHI_KEY_FILE", "KALSHI_KEY_PATH",
                "KALSHI_PRIVATE_KEY")
DEMO_KEY_ID_ENV = ("KALSHI_DEMO_API_KEY_ID", "KALSHI_DEMO_KEY_ID")
DEMO_KEY_FILE_ENV = ("KALSHI_DEMO_PRIVATE_KEY_PATH", "KALSHI_DEMO_KEY_FILE", "KALSHI_DEMO_PRIVATE_KEY")
DEMO_FLAG_ENV = ("KALSHI_DEMO", "KALSHI_USE_DEMO")
BASE_ENV = ("KALSHI_API_BASE", "KALSHI_BASE_URL")

# ------------------------------------------------------------------------------------------------- the contract
TOP = ("name", "mode", "status", "running", "t", "balance", "today_pnl", "week_pnl", "total_pnl", "note")
NUM = ("balance", "today_pnl", "week_pnl", "total_pnl")
POS = ("ticker", "title", "side", "contracts", "avg_price", "price", "value", "pnl", "closes", "asset", "strategy",
       "category", "prob")
TRADE = ("t", "ticker", "title", "side", "action", "contracts", "price", "pnl", "asset", "strategy", "category", "prob")
STRAT = ("name", "mode", "running", "today_pnl", "total_pnl", "trades", "wins", "losses")
# contract v3 (2026-11-03, all optional, additive): breakdowns over EVERY settled trade (the trades list holds only the last 40)
CAT = ("name", "group", "trades", "wins", "losses", "pnl", "staked")            # P&L by market category
BUCKET = ("lo", "hi", "trades", "wins", "losses", "pnl", "staked")              # by entry price (dollars 0-1)
CALIB = ("p", "n", "hit")                                                        # predicted chance vs how often it won
ALERT = ("t", "level", "text")                                                   # level: info / warn / bad
KELLY = ("fraction", "bankroll", "max_bet", "min_edge")                          # the bot's own sizing settings
STATS = ("trades", "wins", "losses", "staked", "pnl", "avg_price")               # all-time totals of settled trades
ROW_NUM = ("contracts", "avg_price", "price", "value", "pnl", "t", "today_pnl", "total_pnl", "trades", "wins", "losses",
           "prob", "staked", "lo", "hi", "p", "n", "hit", "fraction", "bankroll", "max_bet", "min_edge")
ROW_INT = ("t", "trades", "wins", "losses", "n")
UNIT = ("prob", "lo", "hi", "p", "hit", "fraction", "min_edge")                 # a chance / a price bucket: 0-1, else dropped
CAPS = {"positions": 60, "trades": 40, "days": 120, "strategies": 10, "equity": 500,
        "categories": 20, "buckets": 12, "calibration": 12, "alerts": 20}
LEVELS = ("info", "warn", "bad")
V3_LISTS = (("categories", CAT, 40), ("buckets", BUCKET, 40), ("calibration", CALIB, 40), ("alerts", ALERT, 140))

# Same patterns as engine/live_publish.py (a test keeps them identical).
_SECRET_KEY = re.compile(r"(password|passwd|^pass$|secret|token|webhook|api_?key|confirm|phrase|private|vapid|endpoint|^auth|cookie|"
                         r"push_pk|^subs$|credential)", re.I)
_PATHLIKE = re.compile(r"([A-Za-z]:\\[^\s\"']+|/(?:home|Users|root)/[^\s\"']+)")
_PEM = re.compile(r"-----BEGIN [A-Z ]+-----.*?(-----END [A-Z ]+-----|$)", re.S)

SAMPLE = {
    "name": "Kalshi bot", "mode": "paper", "running": True, "status": "Watching 12 markets", "t": 1793548800,
    "balance": 512.34, "today_pnl": 18.5, "week_pnl": 42.1, "total_pnl": 112.34,
    "positions": [{"ticker": "KXHIGHNY-26NOV02-B58.5", "title": "NYC high 58-59°F on Nov 2", "side": "yes", "contracts": 10,
                   "avg_price": 0.42, "price": 0.55, "value": 5.5, "pnl": 1.3, "closes": "2026-11-02T23:59:00Z"}],
    "trades": [{"t": 1793545200, "ticker": "KXHIGHNY-26NOV02-B58.5", "title": "NYC high 58-59°F on Nov 2", "side": "yes",
                "action": "buy", "contracts": 10, "price": 0.42, "pnl": None}],
    "days": [["2026-10-30", 12.4], ["2026-10-31", -3.1], ["2026-11-01", 18.5]],
}
SAMPLE_V2 = {**SAMPLE,
             "strategies": [{"name": "Weather", "mode": "live", "running": True, "today_pnl": 12.1, "total_pnl": 80.4,
                             "trades": 41, "wins": 27, "losses": 14},
                            {"name": "Index ranges", "mode": "paper", "running": False, "today_pnl": 6.4, "total_pnl": 31.94,
                             "trades": 12, "wins": 7, "losses": 5}],
             "equity": [[1793289600, 470.24], [1793376000, 467.14], [1793462400, 493.84], [1793548800, 512.34]]}
# v3 (2026-11-03): the page's breakdowns over every settled trade, calibration, alerts, Kelly settings. --sample prints this.
SAMPLE_V3 = {**SAMPLE_V2,
             "positions": [{**SAMPLE["positions"][0], "category": "Weather", "prob": 0.61}],
             "trades": [{**SAMPLE["trades"][0], "category": "Weather", "prob": 0.61}],
             "categories": [{"name": "Weather", "group": "Climate", "trades": 41, "wins": 27, "losses": 14, "pnl": 80.4, "staked": 402.5},
                            {"name": "S&P 500 range", "group": "Financials", "trades": 12, "wins": 7, "losses": 5, "pnl": 31.94,
                             "staked": 140.0}],
             "buckets": [{"lo": 0.2, "hi": 0.4, "trades": 9, "wins": 4, "losses": 5, "pnl": 12.3, "staked": 28.1},
                         {"lo": 0.4, "hi": 0.6, "trades": 30, "wins": 18, "losses": 12, "pnl": 61.2, "staked": 151.0},
                         {"lo": 0.6, "hi": 0.8, "trades": 14, "wins": 12, "losses": 2, "pnl": 38.84, "staked": 98.4}],
             "calibration": [{"p": 0.31, "n": 9, "hit": 0.44}, {"p": 0.5, "n": 30, "hit": 0.6}, {"p": 0.69, "n": 14, "hit": 0.86}],
             "calib_basis": "model",
             "alerts": [{"t": 1793545200, "level": "warn", "text": "3 losses in a row on Index ranges"}],
             "kelly": {"fraction": 0.25, "bankroll": 512.34, "max_bet": 25.0, "min_edge": 0.03},
             "stats": {"trades": 53, "wins": 34, "losses": 19, "staked": 542.5, "pnl": 112.34, "avg_price": 0.49}}


def _num(v):
    try:
        f = float(v)
        return round(f, 4) if f == f and abs(f) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _txt(v, n=160):
    return None if v is None else public_text(v, n)


_URL = re.compile(r"(?i)\b(?:https?|wss?|ftp|ssh)://\S+")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
_UUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
_TOKENISH = re.compile(r"\b(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{32,}\b")
_HEX = re.compile(r"\b[0-9A-Fa-f]{32,}\b")
_ASSIGN = re.compile(r"(?i)\b([\w-]*(?:token|secret|password|passwd|pwd|api[_-]?key|key[_-]?id|auth|signature|cookie)[\w-]*)"
                     r"(\s*[=:]\s*)(?!<)(?!(?:bearer|basic)\b)[^\s,;'\"]+")   # NAME=value / name: value -> NAME=<redacted>
_BEARER = re.compile(r"(?i)\b((?:bearer|basic)\s+)(?!<)[^\s,;'\"]+")
_TICKER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_TIME = re.compile(r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?")


def public_text(v, n=160):
    """Free text as it may be published: no links (a tunnel link carries its token), IP or e-mail addresses, local
    paths, PEM keys, ids or token-like strings. Idempotent."""
    s = _URL.sub("<link>", str(v))
    s = _EMAIL.sub("<email>", s)
    s = _UUID.sub("<redacted>", s)
    s = redact(s)
    s = _BEARER.sub(lambda m: m.group(1) + "<redacted>", s)
    s = _ASSIGN.sub(lambda m: m.group(1) + m.group(2) + "<redacted>", s)
    s = _HEX.sub("<redacted>", s)
    return _TOKENISH.sub("<redacted>", s)[:n]


def _field(k, v, n):
    """A row's text field: tickers and times must look like tickers and times; everything else is public_text."""
    if k == "ticker":
        t = str(v)
        return t if _TICKER.fullmatch(t) else public_text(t, 60)
    if k == "closes":
        t = str(v)
        return t[:40] if _TIME.fullmatch(t) else None
    return public_text(v, n)


def _row(r, keys, n=160):
    if not isinstance(r, dict):
        return None
    out = {}
    for k in keys:
        v = r.get(k)
        if v is None:
            continue
        if k == "running":
            out[k] = bool(v)
        elif k in ROW_INT:
            x = _num(v)
            out[k] = None if x is None else int(x)
        elif k in ROW_NUM:
            x = _num(v)
            if k in UNIT and x is not None and not 0 <= x <= 1:
                continue                                    # a chance / a price bucket is 0-1 dollars, never anything else
            out[k] = x
        elif k == "level":
            lv = str(v).strip().lower()
            out[k] = lv if lv in LEVELS else "info"
        else:
            f = _field(k, v, n)
            if f is not None:
                out[k] = f
    return out or None


def scrub(obj, phrases=()):
    """Copy without credential-like keys and without any string holding a secret phrase; local paths redacted."""
    if isinstance(obj, dict):
        return {k: scrub(v, phrases) for k, v in obj.items() if not _SECRET_KEY.search(str(k))}
    if isinstance(obj, (list, tuple)):
        return [scrub(v, phrases) for v in obj]
    if isinstance(obj, str):
        if any(p and p in obj for p in phrases):
            return "<redacted>"
        return _PATHLIKE.sub("<path>", obj)
    return obj


def downsample(points, n):
    """At most n points, evenly spaced, first and last kept."""
    if len(points) <= n:
        return list(points)
    if n <= 1:
        return list(points[-1:])
    idx = sorted({round(i * (len(points) - 1) / (n - 1)) for i in range(n)})
    return [points[i] for i in idx]


def _equity(rows):
    pts = []
    for e in rows or []:
        if isinstance(e, (list, tuple)) and len(e) >= 2:
            t, b = _num(e[0]), _num(e[1])
        elif isinstance(e, dict):
            t, b = _num(e.get("t")), _num(e.get("balance") if e.get("balance") is not None else e.get("equity"))
        else:
            continue
        if t is not None and b is not None and t > 0:
            pts.append([int(t), b])
    pts.sort(key=lambda p: p[0])
    return downsample(pts, CAPS["equity"])


def clean(raw, now=None, phrases=()):
    """A status (from the bot's file or built from the API) -> kalshi.json: only the contract's keys, numbers as numbers,
    lists capped, secrets dropped, paths redacted. v1 keys always; the v2 keys `strategies` / `equity` and the v3 keys
    (`categories`, `buckets`, `calibration`, `calib_basis`, `alerts`, `kelly`, `stats`, rows' `category` / `prob`) only when given
    (then "v": 2). Never raises on junk (returns a card with an error note instead)."""
    now = float(now or time.time())
    try:
        src = scrub(raw if isinstance(raw, dict) else {}, phrases)
        out = {"v": 1, "kind": "kalshi"}
        for k in TOP:
            v = src.get(k)
            if k == "running":
                out[k] = None if v is None else bool(v)
            elif k == "t":
                out[k] = int(_num(v) or now)
            elif k in NUM:
                out[k] = _num(v)
            else:
                out[k] = _txt(v)
        out["positions"] = [x for x in (_row(r, POS) for r in (src.get("positions") or [])[:CAPS["positions"]]) if x]
        out["trades"] = [x for x in (_row(r, TRADE) for r in (src.get("trades") or [])[:CAPS["trades"]]) if x]
        days = []
        for d in (src.get("days") or [])[-CAPS["days"]:]:
            if isinstance(d, (list, tuple)) and len(d) >= 2 and _num(d[1]) is not None:
                days.append([_txt(d[0], 10), _num(d[1])])
            elif isinstance(d, dict) and _num(d.get("pnl")) is not None:
                days.append([_txt(d.get("day") or d.get("date"), 10), _num(d.get("pnl"))])
        out["days"] = days
        if isinstance(src.get("strategies"), (list, tuple)):
            out["strategies"] = [x for x in (_row(r, STRAT, 60) for r in src["strategies"][:CAPS["strategies"]]) if x and x.get("name")]
            out["v"] = 2
        if isinstance(src.get("equity"), (list, tuple)):
            out["equity"] = _equity(src["equity"])
            out["v"] = 2
        # v3: breakdowns, calibration, alerts, Kelly settings, all-time stats (each only when given; then "v": 3)
        v3 = False
        for key, keys, n in V3_LISTS:
            if isinstance(src.get(key), (list, tuple)):
                rows = (_row(r, keys, n) for r in src[key][:CAPS[key] * 5])         # junk rows never crowd out good ones
                out[key] = [x for x in rows if x and _v3_ok(key, x)][:CAPS[key]]
                v3 = True
        for key, keys in (("kelly", KELLY), ("stats", STATS)):
            if isinstance(src.get(key), dict):
                r = _row(src[key], keys)
                if r:
                    out[key] = r
                    v3 = True
        cb = str(src.get("calib_basis") or "").strip().lower()
        if cb in ("price", "model"):
            out["calib_basis"] = cb
            v3 = True
        if v3:
            out["v"] = 3
        if isinstance(src.get("risk"), dict):
            r = clean_risk(src["risk"])
            if r:
                out["risk"] = r
        out["pub_t"] = int(now)
        return out
    except Exception as e:
        return {"v": 1, "kind": "kalshi", "t": int(now), "pub_t": int(now), "running": None,
                "note": f"status could not be read: {e.__class__.__name__}", "positions": [], "trades": [], "days": []}


def _v3_ok(key, r):
    """A v3 row is kept only when it means something: a name, a real 0-1 bucket, a sample, a text."""
    if key == "categories":
        return bool(r.get("name"))
    if key == "buckets":
        return r.get("lo") is not None and r.get("hi") is not None and r["lo"] < r["hi"]
    if key == "calibration":
        return r.get("p") is not None and r.get("hit") is not None and (r.get("n") or 0) >= 1
    if key == "alerts":
        return bool(r.get("text"))
    return True


# ------------------------------------------------------------------------------------------------- the risk guard (2026-11-13)
# kalshi_guard.py beside this file on the VM (~/kalshi_jarvis/) gates every order of the bot; its state is in
# ~/kalshi_jarvis/guard/. When that folder exists, kalshi.json carries a `risk` block (numbers and fixed words only) and its
# alerts, and, once the bot has asked the guard about an order, the guard's mode (paper / dry-run / live) is the one shown.
RISK_MODES = ("paper", "dry_run", "live")
RISK_BOOL = ("kill", "connected", "stopped", "alerts_vm", "limits_ok")
RISK_INT = ("kill_t", "last_check_t", "installed_t", "armed_t", "until", "unguarded")
RISK_LIMITS = ("max_order_usd", "max_order_pct_balance", "max_market_usd", "max_day_usd", "daily_stop_usd", "max_open_usd",
               "max_orders_day", "no_trade_last_s", "max_over_fair_cents", "min_edge_cents", "fee_rate")
_GO_LIVE = re.compile(r"GO LIVE \d{4}-\d{2}-\d{2} STOP \d{1,5}(?:\.\d{2})?")
_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")


def _int(v):
    x = _num(v)
    return None if x is None else int(x)


def clean_risk(r):
    """The guard's risk block as it may be published: whitelisted keys, numbers as numbers, texts redacted."""
    if not isinstance(r, dict):
        return None
    m = str(r.get("mode") or "").strip().lower()
    out = {"mode": m if m in RISK_MODES else "paper"}
    for k in RISK_BOOL:
        if r.get(k) is not None:
            out[k] = bool(r[k])
    for k in RISK_INT:
        if _int(r.get(k)) is not None:
            out[k] = _int(r[k])
    if _num(r.get("open")) is not None:
        out["open"] = _num(r["open"])
    for k, n in (("why", 140), ("version", 24)):
        if r.get(k):
            out[k] = public_text(r[k], n)
    if isinstance(r.get("go_live"), str) and _GO_LIVE.fullmatch(r["go_live"]):
        out["go_live"] = r["go_live"]
    lim = r.get("limits") if isinstance(r.get("limits"), dict) else {}
    out["limits"] = {k: _num(lim.get(k)) for k in RISK_LIMITS if _num(lim.get(k)) is not None}
    td = r.get("today") if isinstance(r.get("today"), dict) else {}
    today = {k: _num(td.get(k)) for k in ("spend", "pnl") if _num(td.get(k)) is not None}
    today.update({k: _int(td.get(k)) for k in ("orders", "sent", "blocked") if _int(td.get(k)) is not None})
    if isinstance(td.get("day"), str) and _DAY.fullmatch(td["day"]):
        today["day"] = td["day"]
    out["today"] = today
    rm = r.get("room") if isinstance(r.get("room"), dict) else {}
    out["room"] = {k: _num(rm.get(k)) for k in ("day", "stop", "open") if _num(rm.get(k)) is not None}
    lb = r.get("last_block")
    if isinstance(lb, dict) and lb.get("text"):
        out["last_block"] = {"t": _int(lb.get("t")), "text": public_text(lb["text"], 160)}
    rows = []
    for x in (r.get("intended") or [])[:10] if isinstance(r.get("intended"), (list, tuple)) else []:
        if not isinstance(x, dict):
            continue
        row = {"t": _int(x.get("t")), "send": bool(x.get("send"))}
        if x.get("ticker"):
            row["ticker"] = _field("ticker", x["ticker"], 60)
        for k, ok in (("side", ("yes", "no")), ("action", ("buy", "sell"))):
            v = str(x.get(k) or "").lower()
            if v in ok:
                row[k] = v
        if _int(x.get("contracts")) is not None:
            row["contracts"] = _int(x["contracts"])
        p = _num(x.get("price"))
        if p is not None and 0 <= p <= 1:
            row["price"] = p
        if _num(x.get("cost")) is not None:
            row["cost"] = _num(x["cost"])
        if x.get("why"):
            row["why"] = public_text(x["why"], 160)
        rows.append(row)
    out["intended"] = rows
    return out


def _guard_home(guard=None):
    return os.path.abspath(os.path.expanduser(guard or os.environ.get("KALSHI_GUARD_HOME") or os.path.join("~", "kalshi_jarvis", "guard")))


def load_guard(guard=None):
    """kalshi_guard.py from the guard folder's parent (~/kalshi_jarvis) or beside this file; None when there is none."""
    here = globals().get("__file__")
    for d in (os.path.dirname(_guard_home(guard)), os.path.dirname(os.path.abspath(here)) if here else None):
        f = os.path.join(d, "kalshi_guard.py") if d else None
        if f and os.path.isfile(f):
            spec = importlib.util.spec_from_file_location("kalshi_guard_for_status", f)
            mod = importlib.util.module_from_spec(spec)
            old, sys.dont_write_bytecode = sys.dont_write_bytecode, True
            try:
                spec.loader.exec_module(mod)
            finally:
                sys.dont_write_bytecode = old
            return mod
    return None


def with_guard(raw, bot_dir=None, guard=None, now=None):
    """The bot's status + the guard's risk block and alerts. No guard folder -> unchanged. Never raises."""
    try:
        home = _guard_home(guard)
        if not os.path.isdir(home):
            return raw
        mod = load_guard(guard)
        if mod is None:
            return raw
        risk = mod.Guard(home, bot_dir=bot_dir).public(now=now)
        alerts = mod.feed_alerts(risk, now)
    except Exception as e:
        return {**raw, "alerts": [{"t": int(now or time.time()), "level": "warn",
                                   "text": f"risk guard could not be read ({e.__class__.__name__})"}] + list(raw.get("alerts") or [])}
    out = {**raw, "risk": risk, "alerts": alerts + list(raw.get("alerts") or [])}
    if risk.get("connected"):
        m = risk.get("mode")
        out["mode"] = "dry-run" if m == "dry_run" else m
        if m != "live":
            out["note"] = "Dry run: orders are logged, none is sent (risk guard)" if m == "dry_run" else \
                "Paper: the risk guard sends no real orders"
            out["strategies"] = [{**x, "mode": "paper" if x.get("mode") == "live" else x.get("mode")} for x in out.get("strategies") or []]
        if risk.get("kill"):
            out["running"], out["status"] = False, "Paused: kill switch on (no orders)"
        elif risk.get("stopped"):
            out["running"], out["status"] = False, "Paused for today: daily stop-loss hit"
    return out


def _size(p):
    return len(json.dumps(p, separators=(",", ":"), default=str).encode("utf-8"))


def fit(p, max_bytes=MAX_BYTES):
    """Trim until the JSON fits: the oldest trades, the oldest days, positions, equity points, alerts, the v3 breakdowns,
    then strategies."""
    while _size(p) > max_bytes:
        for k in ("trades", "days", "positions", "equity", "alerts", "calibration", "buckets", "categories", "strategies"):
            v = p.get(k)
            if v:
                n = len(v) // 2
                p[k] = [] if n == 0 else v[-n:] if k == "days" else downsample(v, n) if k == "equity" else v[:n]
                break
        else:
            break
    return p


def read(src, now=None, max_bytes=MAX_BYTES):
    """(kalshi.json payload, error) from the Kalshi bot's status file. Its own "t" is when the bot wrote it (else the
    file's time)."""
    try:
        with open(src, encoding="utf-8-sig") as fh:
            raw = json.load(fh)
    except FileNotFoundError:
        return None, "status file not found"
    except Exception as e:
        return None, f"status file is not JSON: {e.__class__.__name__}"
    if not isinstance(raw, dict):
        return None, "status file is not a JSON object"
    if raw.get("t") is None:
        try:
            raw = {**raw, "t": int(os.path.getmtime(src))}
        except OSError:
            pass
    return fit(clean(raw, now), max_bytes), None


# ------------------------------------------------------------------------------------------------- ET days
def _nth_sunday(year, month, n):
    d = _dt.date(year, month, 1)
    return d + _dt.timedelta(days=(6 - d.weekday()) % 7 + 7 * (n - 1))


def _utc(d, hour=0):
    return _dt.datetime(d.year, d.month, d.day, hour, tzinfo=_dt.timezone.utc).timestamp()


def et_offset(t):
    """US Eastern offset in seconds at unix time t (DST: 2nd Sunday of March 07:00 UTC .. 1st Sunday of November 06:00
    UTC, the 2007+ rule). No tzdata needed (Windows Python has none)."""
    y = _dt.datetime.fromtimestamp(t, _dt.timezone.utc).year
    return -4 * 3600 if _utc(_nth_sunday(y, 3, 2), 7) <= t < _utc(_nth_sunday(y, 11, 1), 6) else -5 * 3600


def et_dt(t):
    return _dt.datetime.fromtimestamp(t + et_offset(t), _dt.timezone.utc).replace(tzinfo=None)


def et_day(t):
    return et_dt(t).date().isoformat()


def et_midnight(day):
    """Unix time of 00:00 ET on the ISO day."""
    d = _dt.date.fromisoformat(day)
    t = _utc(d) + 4 * 3600
    return t if et_offset(t) == -4 * 3600 else _utc(d) + 5 * 3600


def et_text(t):
    d = et_dt(t)
    return f"{d:%b} {d.day}, {d.hour % 12 or 12}:{d:%M} {'AM' if d.hour < 12 else 'PM'} ET"


# ------------------------------------------------------------------------------------------------- Kalshi read-only client
class ReadOnlyError(Exception):
    """A request this tool must never make (not a GET, not an allow-listed path, not Kalshi's API)."""


class ApiError(Exception):
    pass


class RateLimited(ApiError):
    """HTTP 429: the round stops at once (the bot shares the account's limits)."""


def guard(method, path):
    """Refuse anything that is not a GET to an allow-listed read-only path (raises ReadOnlyError)."""
    if method != "GET":
        raise ReadOnlyError(f"refused {str(method)[:10]!r}: this tool only reads (GET)")
    if (not isinstance(path, str) or any(c in path for c in "?#%\\ \t\r\n") or ".." in path or "//" in path
            or not any(p.fullmatch(path) for p in ALLOWED_PATHS)):
        raise ReadOnlyError("refused: not one of the read-only paths this tool may use")
    return path


def check_base(base):
    """The API root: https on a Kalshi host, or a loopback test server; always ending in /trade-api/v2."""
    try:
        u = urllib.parse.urlsplit(str(base or ""))
        host = (u.hostname or "").lower()
        port = u.port
    except ValueError:
        raise ReadOnlyError("refused: the API address is not a URL")
    ok_host = (u.scheme == "https" and host in KALSHI_HOSTS and port in (None, 443)) or \
              (u.scheme in ("http", "https") and host in LOOPBACK)
    if not ok_host or u.username or u.password or u.query or u.fragment or u.path.rstrip("/") != API_PATH:
        raise ReadOnlyError("refused: the API address must be Kalshi's trade API (https://<kalshi host>/trade-api/v2)")
    netloc = f"[{host}]" if ":" in host else host
    return f"{u.scheme}://{netloc}{'' if port is None else ':' + str(port)}{API_PATH}"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ReadOnlyError(f"refused a redirect (HTTP {code}): the signed request stays on Kalshi's API")


def load_key(value):
    """The private key from a PEM file path, or from PEM text itself (an env value may hold it). RSA or Ed25519."""
    from cryptography.hazmat.primitives import serialization
    v = str(value or "").strip().strip('"').strip("'")
    if v.startswith("-----BEGIN"):
        data = v.replace("\\n", "\n").encode()
    else:
        with open(os.path.expanduser(os.path.expandvars(v)), "rb") as fh:
            data = fh.read()
    return serialization.load_pem_private_key(data, password=None)


def sign(key, ts_ms, method, path):
    """Base64 signature over timestamp + method + path (no query): RSA-PSS SHA-256 (MGF1 SHA-256, salt = digest
    length) for RSA keys, plain Ed25519 for Ed25519 keys (docs.kalshi.com, API Keys)."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ed25519, padding
    msg = f"{ts_ms}{method}{path.split('?')[0]}".encode("utf-8")
    if isinstance(key, ed25519.Ed25519PrivateKey):
        sig = key.sign(msg)
    else:
        sig = key.sign(msg, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
                       hashes.SHA256())
    return base64.b64encode(sig).decode("ascii")


def redact(text, secrets=()):
    """Error text without the key id, the key file's path (and its name), PEM text, signatures or local paths."""
    s = _PEM.sub("<key>", str(text or ""))
    for x in sorted({str(x) for x in secrets if x and len(str(x)) >= 4}, key=len, reverse=True):
        s = s.replace(x, "<redacted>")
    s = re.sub(r"(?i)(kalshi-access-(?:key|signature|timestamp)\W+)[^\s,;'\"}]+", r"\1<redacted>", s)
    s = re.sub(r"[A-Za-z0-9+/]{60,}={0,2}", "<redacted>", s)
    s = re.sub(r"https://[^@\s/]+@", "https://", s)
    s = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "<ip>", s)
    return _PATHLIKE.sub("<path>", s)


def _secret_set(key_id, key_ref):
    out = [key_id]
    if key_ref and not str(key_ref).lstrip().startswith("-----BEGIN"):
        k = str(key_ref).strip().strip('"').strip("'")
        out += [k, os.path.expanduser(os.path.expandvars(k)), os.path.basename(k)]
    return tuple(x for x in out if x)


class Client:
    """Signed GETs to Kalshi's trade API. Read-only by construction: guard() runs before any request is built."""

    def __init__(self, base, key_id, key, secrets=(), timeout=20.0, pause=PAUSE_S, sleep=time.sleep):
        self.base = check_base(base)
        if not key_id or key is None:
            raise ApiError("no Kalshi API key id / private key")
        self.key_id, self.key = str(key_id), key
        self.secrets = tuple(secrets) + (self.key_id,)
        self.timeout, self.pause, self.sleep = timeout, pause, sleep
        host = urllib.parse.urlsplit(self.base).hostname or ""
        handlers = [_NoRedirect()] + ([urllib.request.ProxyHandler({})] if host in LOOPBACK else [])
        self.opener = urllib.request.build_opener(*handlers)
        self.calls = 0
        self._last = 0.0

    def get(self, path, params=None):
        return self.request("GET", path, params)

    def request(self, method, path, params=None):
        guard(method, path)                                   # before anything else, every time
        full = API_PATH + path
        qs = ("?" + urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})) if params else ""
        err = "no answer"
        for attempt in range(4):
            gap = time.monotonic() - self._last
            if gap < self.pause:
                self.sleep(self.pause - gap)
            ts = str(int(time.time() * 1000))
            req = urllib.request.Request(self.base[: -len(API_PATH)] + full + qs, method="GET", headers={
                "KALSHI-ACCESS-KEY": self.key_id, "KALSHI-ACCESS-TIMESTAMP": ts,
                "KALSHI-ACCESS-SIGNATURE": sign(self.key, ts, "GET", full),
                "Accept": "application/json", "User-Agent": f"kalshi-to-jarvis/{KIT_VERSION}"})
            self.calls += 1
            try:
                with self.opener.open(req, timeout=self.timeout) as r:
                    body = r.read()
                self._last = time.monotonic()
                return json.loads(body.decode("utf-8") or "{}")
            except urllib.error.HTTPError as e:
                self._last = time.monotonic()
                try:
                    detail = e.read()[:300].decode("utf-8", "replace")
                except Exception:
                    detail = ""
                err = f"HTTP {e.code} on GET {path}: {detail}"
                if e.code >= 500 and attempt < 1:
                    self.sleep(1.0)
                    continue
                if e.code == 429:                       # never hammer: stop this round, the loop backs off
                    raise RateLimited(f"Kalshi says too many requests (HTTP 429) on GET {path}: backing off") from None
                raise ApiError(redact(err, self.secrets)) from None
            except ReadOnlyError:
                raise
            except Exception as e:
                self._last = time.monotonic()
                err = f"{e.__class__.__name__} on GET {path}: {e}"
                if attempt >= 1:
                    break
                self.sleep(1.0)
        raise ApiError(redact(err, self.secrets))

    def pages(self, path, key, params=None, max_pages=MAX_PAGES):
        out, cursor = [], None
        for _ in range(max_pages):
            q = dict(params or {})
            if cursor:
                q["cursor"] = cursor
            j = self.get(path, q)
            rows = j.get(key) if isinstance(j, dict) else None
            out.extend(r for r in (rows or []) if isinstance(r, dict))
            cursor = j.get("cursor") if isinstance(j, dict) else None
            if not cursor or not rows:
                break
        return out


def fetch(client, cache=None, max_pages=MAX_PAGES):
    """Everything the status needs, read-only. `cache` (a dict kept between loop rounds) makes later rounds cheap: fills
    and settlements are read again only from 6 h before the newest one seen, market titles once."""
    cache = cache if isinstance(cache, dict) else {}
    raw = {"balance": client.get("/portfolio/balance")}
    raw["positions"] = client.pages("/portfolio/positions", "market_positions",
                                    {"limit": PAGE, "count_filter": "position"}, max_pages=5)
    for name, path, key, tkey in (("fills", "/portfolio/fills", "fills", "created_time"),
                                  ("settlements", "/portfolio/settlements", "settlements", "settled_time")):
        old = cache.get(name)
        if old is None:
            rows = client.pages(path, key, {"limit": PAGE}, max_pages=max_pages)
        else:
            newest = max([_ts(r.get(tkey)) or _num(r.get("ts")) or 0 for r in old.values()] or [0])
            rows = client.pages(path, key, {"limit": PAGE, "min_ts": int(newest) - 6 * 3600} if newest else {"limit": PAGE},
                                max_pages=max_pages)
        merged = dict(old or {})
        for r in rows:
            merged[_row_id(name, r)] = r
        cache[name] = merged
        raw[name] = list(merged.values())
    markets = cache.setdefault("markets", {})
    open_tk = [str(p.get("ticker")) for p in raw["positions"] if p.get("ticker")]
    recent = sorted(raw["fills"], key=lambda f: _ts(f.get("created_time")) or _num(f.get("ts")) or 0, reverse=True)
    settled = sorted(raw["settlements"], key=lambda s: _ts(s.get("settled_time")) or 0, reverse=True)
    want = list(dict.fromkeys(open_tk + [str(f.get("ticker") or f.get("market_ticker")) for f in recent[:CAPS["trades"]]]
                              + [str(s.get("ticker")) for s in settled[:CAPS["trades"]]]))
    for tk in want:
        if not tk or tk == "None" or (tk in markets and tk not in open_tk):
            continue
        try:
            guard("GET", "/markets/" + tk)
        except ReadOnlyError:
            continue
        try:
            m = client.get("/markets/" + tk)
            markets[tk] = m.get("market") if isinstance(m, dict) and isinstance(m.get("market"), dict) else {}
        except RateLimited:
            raise
        except ApiError:
            markets.setdefault(tk, {})
    raw["markets"] = {tk: markets.get(tk) or {} for tk in want if tk in markets}
    return raw


def _row_id(name, r):
    if name == "fills":
        return str(r.get("fill_id") or r.get("trade_id") or json.dumps(r, sort_keys=True, default=str))
    return f"{r.get('ticker')}|{r.get('settled_time')}"


# ------------------------------------------------------------------------------------------------- normalizing Kalshi rows
def _f(v):
    try:
        x = float(v)
        return x if x == x and abs(x) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _money(o, key):
    """Dollars from `<key>_dollars` (fixed-point string) or the legacy `<key>` in cents."""
    v = _f(o.get(key + "_dollars"))
    if v is not None:
        return v
    v = _f(o.get(key))
    return None if v is None else v / 100.0


def _count(o, key):
    v = _f(o.get(key + "_fp"))
    return v if v is not None else _f(o.get(key))


_ISO = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?$")


def _ts(v):
    """Unix seconds from an ISO time (any precision, Z or offset) or a number (s or ms)."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v) / 1000.0 if v > 1e11 else float(v)
    m = _ISO.match(str(v).strip())
    if not m:
        return None
    d = _dt.date.fromisoformat(m.group(1))
    sec = int(m.group(4) or 0) + (float("0." + m.group(5)) if m.group(5) else 0.0)
    t = _dt.datetime(d.year, d.month, d.day, int(m.group(2)), int(m.group(3)), tzinfo=_dt.timezone.utc).timestamp() + sec
    tz = m.group(6)
    if tz and tz != "Z":
        sgn = 1 if tz[0] == "+" else -1
        hh, mm = int(tz[1:3]), int(tz[-2:])
        t -= sgn * (hh * 3600 + mm * 60)
    return t


EPS = 1e-9


def norm_fill(f):
    t = _ts(f.get("created_time")) or _ts(f.get("ts"))
    c = _count(f, "count")
    yp = _money(f, "yes_price")
    np_ = _money(f, "no_price")
    if yp is None and np_ is not None:
        yp = 1.0 - np_
    if np_ is None and yp is not None:
        np_ = 1.0 - yp
    act, side = f.get("action"), f.get("side")
    out_side = f.get("outcome_side") or {"bid": "yes", "ask": "no"}.get(f.get("book_side"))
    if out_side not in ("yes", "no") and act in ("buy", "sell") and side in ("yes", "no"):
        out_side = "yes" if (act == "buy") == (side == "yes") else "no"
    tk = f.get("ticker") or f.get("market_ticker")
    if t is None or not c or yp is None or out_side not in ("yes", "no") or not tk:
        return None
    return {"id": str(f.get("fill_id") or f.get("trade_id") or ""), "t": t, "ticker": str(tk), "c": abs(c),
            "d": abs(c) if out_side == "yes" else -abs(c), "yp": yp, "np": np_, "fee": _f(f.get("fee_cost")) or 0.0,
            "action": act if act in ("buy", "sell") else None, "side": side if side in ("yes", "no") else None}


def norm_settlement(s):
    t = _ts(s.get("settled_time"))
    tk = s.get("ticker")
    if t is None or not tk:
        return None
    yc, nc = _count(s, "yes_count") or 0.0, _count(s, "no_count") or 0.0
    v = _f(s.get("value"))
    if v is not None:
        v = v / 100.0
    else:
        v = {"yes": 1.0, "no": 0.0}.get(str(s.get("market_result") or "").lower())
    ycost, ncost = _money(s, "yes_total_cost"), _money(s, "no_total_cost")
    basis = (ycost / yc) if (yc > EPS and ycost is not None) else (1.0 - ncost / nc) if (nc > EPS and ncost is not None) else None
    return {"t": t, "ticker": str(tk), "x": yc - nc, "v": v, "basis": basis}


def norm_position(p):
    x = _count(p, "position")
    tk = p.get("ticker") or p.get("market_ticker")
    if not tk or x is None or abs(x) < EPS:
        return None
    return {"ticker": str(tk), "x": x, "exposure": abs(_money(p, "market_exposure") or 0.0)}


def _title(m, tk):
    t = (m or {}).get("title") or ""
    sub = (m or {}).get("yes_sub_title") or (m or {}).get("subtitle") or ""
    if t and sub and sub.lower() not in t.lower():
        t = f"{t} · {sub}"
    return t or tk


def _mark(m, side, fallback):
    """The side's value per contract now: settled value, else its best bid, else the last price, else `fallback`."""
    m = m or {}
    sv = _f(m.get("settlement_value_dollars"))
    if sv is None and str(m.get("status")) in ("determined", "finalized", "settled") and m.get("result") in ("yes", "no"):
        sv = 1.0 if m.get("result") == "yes" else 0.0
    if sv is not None:
        return sv if side == "yes" else 1.0 - sv
    bid = _money(m, "yes_bid" if side == "yes" else "no_bid")
    if bid is None and side == "no":
        ask = _money(m, "yes_ask")
        bid = None if ask is None or ask <= 0 else 1.0 - ask
    if bid is not None and bid > 0:
        return bid
    last = _money(m, "last_price")
    if last is not None and last > 0:
        return last if side == "yes" else 1.0 - last
    return fallback


def _apply(x, a, fees, d, p, fee):
    """One fill on a market's YES-equivalent position x at average YES basis a with open fees `fees`.
    Returns (x, a, fees, realized or None)."""
    if abs(x) < EPS or (x > 0) == (d > 0):
        nx = x + d
        return nx, (a * abs(x) + p * abs(d)) / abs(nx), fees + fee, None
    closed = min(abs(d), abs(x))
    f_open = fees * closed / abs(x)
    realized = closed * (p - a) * (1 if x > 0 else -1) - f_open - fee * closed / abs(d)
    fees -= f_open
    rest = abs(d) - closed
    if rest > EPS:                                   # through zero: the rest opens the other side at p
        return (rest if d > 0 else -rest), p, fee * rest / abs(d), realized
    x += d
    return (0.0, 0.0, 0.0, realized) if abs(x) < EPS else (x, a, fees, realized)


def build_from_api(raw, now=None, name="Kalshi bot", mode="live", running=None, strategies=None, note=None):
    """The status (the contract's shape, before clean()) from what fetch() read. Deterministic for the same input."""
    now = float(now or time.time())
    fills = sorted((f for f in (norm_fill(x) for x in raw.get("fills") or []) if f), key=lambda f: (f["t"], f["id"]))
    sets = sorted((s for s in (norm_settlement(x) for x in raw.get("settlements") or []) if s), key=lambda s: s["t"])
    pos = {p["ticker"]: p for p in (norm_position(x) for x in raw.get("positions") or []) if p}
    markets = raw.get("markets") or {}
    by = {}
    for f in fills:
        by.setdefault(f["ticker"], []).append(("fill", f["t"], f))
    for s in sets:
        by.setdefault(s["ticker"], []).append(("settle", s["t"] + 1e-6, s))
    realized, trades, state = [], [], {}
    for tk in sorted(set(by) | set(pos)):
        evs = sorted(by.get(tk, []), key=lambda e: (e[1], 0 if e[0] == "fill" else 1))
        st = next((e[2] for e in evs if e[0] == "settle"), None)
        if st is not None:
            target = st["x"]
            moved = sum(e[2]["d"] for e in evs if e[0] == "fill" and e[1] < st["t"] + 1e-6)
        elif tk in pos:
            target = pos[tk]["x"]
            moved = sum(e[2]["d"] for e in evs if e[0] == "fill")
        else:
            target, moved = None, 0.0
        x0 = 0.0 if target is None else round(target - moved, 6)
        a0 = 0.0
        if abs(x0) > EPS:                            # held before the fills Kalshi still lists: Kalshi's own cost basis
            if st is not None and st.get("basis") is not None:
                a0 = st["basis"]
            elif tk in pos and abs(pos[tk]["x"]) > EPS:
                avg = pos[tk]["exposure"] / abs(pos[tk]["x"])
                a0 = avg if pos[tk]["x"] > 0 else 1.0 - avg
            else:
                first = next((e[2] for e in evs if e[0] == "fill"), None)
                a0 = first["yp"] if first else (st["v"] if st and st.get("v") is not None else 0.5)
        x, a, fees = x0, a0, 0.0
        title = _title(markets.get(tk), tk)
        for kind, _t, e in evs:
            if kind == "fill":
                xb = x
                x, a, fees, r = _apply(x, a, fees, e["d"], e["yp"], e["fee"])
                if e["action"] and e["side"]:
                    action, side = e["action"], e["side"]
                elif e["d"] > 0:
                    action, side = ("sell", "no") if xb < -EPS else ("buy", "yes")
                else:
                    action, side = ("sell", "yes") if xb > EPS else ("buy", "no")
                if r is not None:
                    realized.append((e["t"], r))
                trades.append({"t": int(e["t"]), "ticker": tk, "title": title, "side": side, "action": action,
                               "contracts": round(e["c"], 2), "price": round(e["yp"] if side == "yes" else e["np"], 4),
                               "pnl": None if r is None else round(r, 2)})
            else:
                if abs(x) > EPS and e.get("v") is not None:
                    r = x * (e["v"] - a) - fees
                    realized.append((e["t"], r))
                    side = "yes" if x > 0 else "no"
                    trades.append({"t": int(e["t"]), "ticker": tk, "title": title, "side": side, "action": "settled",
                                   "contracts": round(abs(x), 2), "price": round(e["v"] if side == "yes" else 1.0 - e["v"], 4),
                                   "pnl": round(r, 2)})
                x, a, fees = 0.0, 0.0, 0.0
        state[tk] = (x, a, fees)

    rows, unreal, mv = [], 0.0, 0.0
    for tk, p in pos.items():
        side, n = ("yes" if p["x"] > 0 else "no"), abs(p["x"])
        lx, la, lf = state.get(tk, (0.0, 0.0, 0.0))
        if abs(lx - p["x"]) < 1e-6:
            avg = la if side == "yes" else 1.0 - la
        else:                                         # the fills don't add up to Kalshi's position: Kalshi's cost
            avg, lf = (p["exposure"] / n if n else 0.0), 0.0
        m = markets.get(tk) or {}
        px = _mark(m, side, avg)
        val = n * px
        pnl = val - n * avg - lf
        unreal += pnl
        mv += val
        rows.append({"ticker": tk, "title": _title(m, tk), "side": side, "contracts": round(n, 2),
                     "avg_price": round(avg, 4), "price": round(px, 4), "value": round(val, 2), "pnl": round(pnl, 2),
                     "closes": m.get("close_time") or m.get("expected_expiration_time")})
    rows.sort(key=lambda r: (str(r.get("closes") or "9999"), r["ticker"]))

    today = et_day(now)
    per_day = {}
    for t, r in realized:
        per_day[et_day(t)] = per_day.get(et_day(t), 0.0) + r
    if rows:
        per_day[today] = per_day.get(today, 0.0) + unreal
    days = [[d, round(v, 2)] for d, v in sorted(per_day.items())]
    d0 = _dt.date.fromisoformat(today)
    monday = (d0 - _dt.timedelta(days=d0.weekday())).isoformat()
    today_pnl = round(per_day.get(today, 0.0), 2)
    week_pnl = round(sum(v for d, v in per_day.items() if monday <= d <= today), 2)
    total_pnl = round(sum(per_day.values()), 2)

    bal = raw.get("balance") or {}
    cash = _money(bal, "balance")
    pv = _f(bal.get("portfolio_value"))
    pv = pv / 100.0 if pv is not None else (_f(bal.get("portfolio_value_dollars")) if bal.get("portfolio_value_dollars") is not None else mv)
    equity_now = None if cash is None else round(cash + (pv or 0.0), 2)

    equity = []
    if equity_now is not None:
        later = 0.0
        for d, v in reversed(days):
            if d >= today:
                later += v
                continue
            nxt = (_dt.date.fromisoformat(d) + _dt.timedelta(days=1)).isoformat()
            equity.append([int(min(et_midnight(nxt) - 60, now)), round(equity_now - later, 2)])
            later += v
        equity.reverse()
        equity.append([int(now), equity_now])

    trades.sort(key=lambda r: (r["t"], r["action"] == "settled"), reverse=True)
    n_open = len(rows)
    status = (f"{n_open} open position{'s' if n_open != 1 else ''}" if n_open else "No open positions") + \
             ("" if cash is None else f" · cash ${cash:,.2f}")
    last_fill = fills[-1]["t"] if fills else None
    out = {"name": name, "mode": mode, "running": running, "status": status, "t": int(now),
           "balance": equity_now, "today_pnl": today_pnl, "week_pnl": week_pnl, "total_pnl": total_pnl,
           "note": note or (f"Last fill {et_text(last_fill)}" if last_fill else "No fills yet"),
           "positions": rows[:CAPS["positions"]], "trades": trades[:CAPS["trades"]], "days": days[-CAPS["days"]:],
           "equity": equity}
    if strategies is not None:
        out["strategies"] = strategies
    return out


# ------------------------------------------------------------------------------------------------- the bot's own files
# The owner's Kalshi bot ("Kalshi Edge v2") runs on an Oracle Cloud VM in /home/ubuntu/kalshi (systemd units kalshi-bot,
# kalshi-trader, kalshi-combo ...). Its money lives in trades.db (table orders), account_truth.json, autotrader_status.json
# and autotune_state.json. read_bot() reads ONLY those files (SQLite opened read-only, never .env or keys/, never the bot's
# modules) and gives the same numbers as the bot's Discord /money: P&L = SUM(orders.pnl) of live filled rows, by the ET day
# of the order's ts. --from-vm runs this same file on the VM through the PC's own srv.py (no install on the VM, nice'd).
BOT_NAME = "Kalshi Edge v2"
VM_DIR = "/home/ubuntu/kalshi"
VM_EVERY_S = 60                 # the VM is tiny: at most one read a minute
UNITS = ("kalshi-bot", "kalshi-trader", "kalshi-combo")
BOOKS = {"main": "15-min favourites", "latefav": "Late favourite (BTC hourly)", "gold": "Gold 5 PM",
         "exit": "Flip exit sell-backs", "partial": "Partial sell-backs", "closer": "Closer", "sniper": "Sniper test",
         "hourly": "Hourly BTC", "fx": "FX", "copy": "Copy", "value": "Value"}
REAL_BOOKS = ("main", "latefav", "gold")
MARK_A, MARK_B = "@@KJSON@@", "@@END@@"
_MON = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
_COIN = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana", "XRP": "XRP", "DOGE": "Dogecoin", "GOLD": "Gold"}


def ticker_title(tk):
    """A plain title from a Kalshi ticker, offline: KXETH15M-26NOV011215-15 -> "ETH up or down · 15 min to 12:15 PM ET
    Nov 1"; KXBTCD-26OCT2713-T80499.99 -> "Bitcoin above $80,500 at 1 PM ET Oct 27"; else the ticker."""
    tk = str(tk or "")
    parts = tk.split("-")
    series = parts[0][2:] if parts[0].startswith("KX") else parts[0]
    m = re.fullmatch(r"(\d{2})([A-Z]{3})(\d{2})(\d{2})?(\d{2})?", parts[1] if len(parts) > 1 else "")
    when = ""
    if m and m.group(2) in _MON:
        day = f"{m.group(2).title()} {int(m.group(3))}"
        if m.group(4):
            h = int(m.group(4))
            hm = f"{h % 12 or 12}" + (f":{m.group(5)}" if m.group(5) else "")
            when = f"{hm} {'AM' if h < 12 else 'PM'} ET {day}"
        else:
            when = day
    strike = parts[2] if len(parts) > 2 else ""
    if series.endswith("15M") and when:
        return f"{series[:-3]} up or down · 15 min to {when}"
    sm = re.fullmatch(r"([TB])(\d+(?:\.\d+)?)", strike)
    if series.endswith("D") and sm and when:
        coin = series[:-1]
        v = float(sm.group(2))
        v = v + 0.01 if round(v % 1, 2) == 0.99 else v
        word = "above" if sm.group(1) == "T" else "near"
        return f"{_COIN.get(coin, coin)} {word} ${v:,.0f} at {when}"
    if series.startswith("GOLD"):
        return "Gold 5 PM close" + (f" · {when}" if when else "")
    return tk


# Kalshi's own market categories, read from a ticker (offline): crypto coins by name, the rest by series.
_SERIES_CAT = (("HIGH", "Weather", "Climate"), ("LOWT", "Weather", "Climate"), ("RAIN", "Weather", "Climate"), ("SNOW", "Weather", "Climate"),
               ("INX", "S&P 500", "Financials"), ("NASDAQ", "Nasdaq", "Financials"), ("EURUSD", "FX", "Financials"),
               ("USDJPY", "FX", "Financials"), ("WTI", "Oil", "Commodities"), ("FED", "Fed rates", "Economics"),
               ("CPI", "Inflation", "Economics"), ("GDP", "GDP", "Economics"), ("PAYROLL", "Jobs", "Economics"),
               ("NFL", "NFL", "Sports"), ("NBA", "NBA", "Sports"), ("MLB", "MLB", "Sports"), ("NHL", "NHL", "Sports"),
               ("PRES", "Politics", "Politics"), ("SENATE", "Politics", "Politics"), ("HOUSE", "Politics", "Politics"))
_ASSET_CAT = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana", "XRP": "XRP", "DOGE": "Dogecoin", "HYPE": "HYPE",
              "BNB": "BNB", "GOLD": "Gold", "SILVER": "Silver"}


def category_of(ticker, asset=None):
    """(category, group) for a market: the coin for crypto ("Ethereum", "Crypto"), gold / silver ("Gold", "Commodities"),
    else Kalshi's series families (weather, indices, economics, sports, politics); unknown -> ("Other", "Other")."""
    a = str(asset or "").strip().upper()
    tk = str(ticker or "").upper()
    series = tk.split("-")[0]
    series = series[2:] if series.startswith("KX") else series
    if not a:
        a = next((c for c in _ASSET_CAT if series.startswith(c)), "")
    if a in _ASSET_CAT:
        return _ASSET_CAT[a], "Commodities" if a in ("GOLD", "SILVER") else "Crypto"
    for pre, name, group in _SERIES_CAT:
        if series.startswith(pre):
            return name, group
    return "Other", "Other"


# entry-price buckets: finer at the top, where the favourites trade (95-97c)
BUCKET_EDGES = (0.0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.97, 0.99, 1.0001)


def breakdowns(rows, basis="price"):
    """Settled buys [(price 0-1, contracts, pnl, category, group, prob|None)] -> the v3 lists: categories, buckets,
    calibration and the all-time stats. Price = what the side held cost (its implied chance); a win = pnl > 0.
    Calibration uses the bot's own chance (`prob`) when every row has one (basis "model"), else the price ("price")."""
    cats, bks, cal = {}, {}, {}
    tot = {"trades": 0, "wins": 0, "losses": 0, "staked": 0.0, "pnl": 0.0, "px": 0.0}
    model = basis == "model" or (rows and all(r[5] is not None for r in rows))
    for px, n, pnl, cat, group, prob in rows:
        if px is None or pnl is None:
            continue
        px = float(px) / 100 if float(px) > 1 else float(px)
        if not 0 < px < 1.0001:
            continue
        stake = abs(float(n or 0)) * px
        w, lo = (1 if pnl > 0.005 else 0), (1 if pnl < -0.005 else 0)
        for d, k, extra in ((cats, cat, {"name": cat, "group": group}), (bks, next(i for i in range(len(BUCKET_EDGES) - 1)
                                                                               if px < BUCKET_EDGES[i + 1]), {})):
            r = d.setdefault(k, {**extra, "trades": 0, "wins": 0, "losses": 0, "pnl": 0.0, "staked": 0.0})
            r["trades"] += 1
            r["wins"] += w
            r["losses"] += lo
            r["pnl"] += float(pnl)
            r["staked"] += stake
        p = float(prob) if model and prob is not None else px
        b = next(i for i in range(len(BUCKET_EDGES) - 1) if min(p, 0.99999) < BUCKET_EDGES[i + 1])
        c = cal.setdefault(b, [0, 0.0, 0])
        c[0] += 1
        c[1] += p
        c[2] += w
        tot["trades"] += 1
        tot["wins"] += w
        tot["losses"] += lo
        tot["staked"] += stake
        tot["pnl"] += float(pnl)
        tot["px"] += px
    r2 = lambda d: {**d, "pnl": round(d["pnl"], 2), "staked": round(d["staked"], 2)}     # noqa: E731
    out = {"categories": sorted((r2(v) for v in cats.values()), key=lambda r: (-r["trades"], r["name"]))[:CAPS["categories"]],
           "buckets": [{"lo": BUCKET_EDGES[i], "hi": min(1.0, BUCKET_EDGES[i + 1]), **{k: v for k, v in r2(bks[i]).items()}}
                       for i in sorted(bks)],
           "calibration": [{"p": round(c[1] / c[0], 4), "n": c[0], "hit": round(c[2] / c[0], 4)} for _, c in sorted(cal.items())],
           "calib_basis": "model" if model and rows else "price"}
    if tot["trades"]:
        out["stats"] = {"trades": tot["trades"], "wins": tot["wins"], "losses": tot["losses"], "staked": round(tot["staked"], 2),
                        "pnl": round(tot["pnl"], 2), "avg_price": round(tot["px"] / tot["trades"], 4)}
    return out


def _jload(path):
    try:
        with open(path, encoding="utf-8-sig") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _units_active(units):
    """True / False when systemctl can tell, None when it can't (no systemd, or no units asked)."""
    if not units:
        return None
    try:
        r = subprocess.run(["systemctl", "is-active", *units], capture_output=True, timeout=5)
        states = (r.stdout or b"").decode(errors="replace").split()
        return len(states) == len(units) and all(x == "active" for x in states)
    except Exception:
        return None


def _side(v):
    v = str(v or "").strip().lower()
    return "yes" if v in ("up", "yes", "y") else "no" if v in ("down", "no", "n") else v or None


def _mode_word(v, default=2):
    try:
        n = int(float(v if v is not None else default))
    except (TypeError, ValueError):
        n = default
    return "off" if n <= 0 else "paper" if n == 1 else "live"


def _equity_points(*series):
    pts = []
    for s in series:
        rows = s.get("rows") or s.get("history") or s.get("points") if isinstance(s, dict) else s
        for e in rows or []:
            if isinstance(e, (list, tuple)) and len(e) >= 2:
                t, v = _f(e[0]), _f(e[1])
            elif isinstance(e, dict):
                t = _f(e.get("t") if e.get("t") is not None else e.get("ts"))
                v = next((_f(e.get(k)) for k in ("equity", "total", "balance", "value") if _f(e.get(k)) is not None), None)
            else:
                continue
            if t and v is not None and t > 1e9:
                pts.append([int(t), round(v, 2)])
    pts.sort()
    return pts


def read_bot(bot_dir, now=None, units=UNITS, week="monday"):
    """The Kalshi bot's own files -> the status (the contract's shape, before clean()). Read-only."""
    now = float(now or time.time())
    J = lambda name: _jload(os.path.join(bot_dir, name))      # noqa: E731
    st = J("autotrader_status.json") or {}
    truth = J("account_truth.json") or {}
    tune = J("autotune_state.json") or {}
    bset, cset, sset = J("bot_settings.json") or {}, J("combo_settings.json") or {}, J("sniper_settings.json") or {}
    rows, db_err = [], None
    db = os.path.join(bot_dir, "trades.db")
    try:
        if not os.path.isfile(db):
            raise FileNotFoundError("trades.db")
        con = sqlite3.connect("file:" + urllib.request.pathname2url(os.path.abspath(db)) + "?mode=ro", uri=True, timeout=5)
        try:
            con.execute("PRAGMA query_only=1")
            rows = con.execute("SELECT ts, ticker, side, COALESCE(book,'main'), filled, avg_price, pnl, result, close_ts, asset "
                               "FROM orders WHERE mode='live' AND filled>0 ORDER BY ts, rowid").fetchall()
        finally:
            con.close()
    except Exception as e:
        db_err = f"trades.db could not be read ({e.__class__.__name__})"
    today = et_day(now)
    t_today = et_midnight(today)
    d0 = _dt.date.fromisoformat(today)
    t_week = now - 7 * 86400 if week == "rolling7" else et_midnight((d0 - _dt.timedelta(days=d0.weekday())).isoformat())
    graded = [r for r in rows if r[6] is not None and _f(r[0]) is not None]
    per_day, books = {}, {}
    for ts, tk, side, book, filled, avg, pnl, result, close_ts, asset in graded:
        per_day[et_day(ts)] = per_day.get(et_day(ts), 0.0) + float(pnl)
        b = books.setdefault(book or "main", {"today": 0.0, "total": 0.0, "n": 0, "w": 0, "l": 0})
        b["total"] += float(pnl)
        b["n"] += 1
        b["w"] += 1 if pnl > 0.005 else 0
        b["l"] += 1 if pnl < -0.005 else 0
        if ts >= t_today:
            b["today"] += float(pnl)
    paused_file = os.path.join(bot_dir, "paused.txt")      # holds "paused until <unix>"; "0" = until /start
    paused = os.path.exists(paused_file)
    try:
        until = float(open(paused_file).read().strip() or 0) if paused else 0.0
    except (OSError, ValueError):
        until = 0.0                                          # unreadable: still paused (the cautious reading)
    if paused and 0 < until <= now:
        paused = False                                       # a pause that already ran out
    fresh = (_f(st.get("ts")) or 0) > now - 180
    alive = _units_active(units)
    running = bool(fresh and not paused and alive is not False)
    mode = str(st.get("mode") or "live")
    main_on = _mode_word(bset.get("MAIN_BOOK"), 2) != "off"
    modes = {"main": (mode if main_on else "off"), "latefav": _mode_word(cset.get("LATE_MODE"), 2),
             "gold": _mode_word(cset.get("GOLD_MODE"), 2), "hourly": _mode_word(bset.get("HOURLY_BOOK"), 0),
             "exit": "off" if not _f(cset.get("FLIP_EXIT")) else "live",
             "sniper": "live" if _f(sset.get("SNIPER_LIVE")) else "off"}
    order = {b: i for i, b in enumerate(REAL_BOOKS)}
    strategies = []
    for b in sorted(books, key=lambda k: (order.get(k, 9), -books[k]["n"], k)):
        v = books[b]
        m = modes.get(b)
        strategies.append({"name": BOOKS.get(b, b), "mode": m, "running": None if m is None else (running and m != "off"),
                           "today_pnl": round(v["today"], 2), "total_pnl": round(v["total"], 2), "trades": v["n"],
                           "wins": v["w"], "losses": v["l"]})
    settled = [(avg, filled, pnl, *category_of(tk, asset), None)
               for ts, tk, side, book, filled, avg, pnl, result, close_ts, asset in graded if (book or "main") not in ("exit", "partial")]
    extra = breakdowns(settled)
    opened = [r for r in rows if r[7] is None and (r[3] or "main") != "exit"]
    positions = []
    for ts, tk, side, book, filled, avg, pnl, result, close_ts, asset in sorted(opened, key=lambda r: (r[8] or 0, r[0])):
        positions.append({"ticker": tk, "title": ticker_title(tk), "side": _side(side), "contracts": filled,
                          "asset": asset or None, "strategy": BOOKS.get(book or "main", book), "category": category_of(tk, asset)[0],
                          "avg_price": avg, "value": None if avg is None else round(float(filled) * float(avg), 2),
                          "closes": None if not _f(close_ts) else _dt.datetime.fromtimestamp(float(close_ts), _dt.timezone.utc)
                          .strftime("%Y-%m-%dT%H:%M:%SZ")})
    trades = []
    for ts, tk, side, book, filled, avg, pnl, result, close_ts, asset in reversed(rows[-CAPS["trades"]:]):
        trades.append({"t": int(ts), "ticker": tk, "title": ticker_title(tk), "side": _side(side),
                       "asset": asset or None, "strategy": BOOKS.get(book or "main", book), "category": category_of(tk, asset)[0],
                       "action": "sell" if (book or "main") in ("exit", "partial") else "buy", "contracts": filled,
                       "price": avg, "pnl": None if pnl is None else round(float(pnl), 2)})
    balance = next((v for v in (_f(truth.get("total")), _f(truth.get("cash")), _f(st.get("balance"))) if v is not None), None)
    equity = _equity_points(tune.get("eq_main"))              # the tuner's 24 h [unix, equity] curve
    if balance is not None:
        equity = [p for p in equity if p[0] < now] + [[int(now), round(balance, 2)]]
    live_n = sum(1 for b in REAL_BOOKS if modes.get(b) == "live")
    if paused:
        status = "Paused" + (f" until {et_text(until)}" if until > now else "")
    elif st.get("blocked") or st.get("problem"):
        status = ("Problem: " if st.get("problem") else "Blocked: ") + public_text(st.get("problem") or st.get("blocked"), 100)
    elif db_err:
        status = db_err
    elif alive is False:
        status = "A bot service is not running (kalshi-bot / kalshi-trader / kalshi-combo)"
    elif not fresh:
        age = now - (_f(st.get("ts")) or 0)
        status = "No word from the trader for " + ("over an hour" if age > 3600 else f"{max(3, int(age // 60))} min")
    else:
        status = f"Trading · {live_n} live strateg{'y' if live_n == 1 else 'ies'} · {len(positions)} open bet{'' if len(positions) == 1 else 's'}"
    alerts = []                                              # what needs the owner's eye, newest first (the page adds countdowns)
    if paused or (st.get("blocked") or st.get("problem")) or db_err or alive is False or not fresh:
        alerts.append({"t": int(now), "level": "bad" if (st.get("problem") or db_err or alive is False) else "warn", "text": status})
    streak = 0
    for r in reversed(graded):
        if float(r[6]) < -0.005:
            streak += 1
        elif float(r[6]) > 0.005:
            break
    if streak >= 3:
        alerts.append({"t": int(graded[-1][0]), "level": "warn", "text": f"{streak} losses in a row"})
    today_pnl = round(sum(float(r[6]) for r in graded if r[0] >= t_today), 2)
    if balance and today_pnl < 0 and -today_pnl >= 0.1 * balance:
        alerts.append({"t": int(now), "level": "bad", "text": f"Down ${-today_pnl:,.2f} today, {(-today_pnl / balance) * 100:.0f}% of the balance"})
    kelly = {}
    for key, names in (("fraction", ("KELLY_FRACTION", "KELLY_FRAC", "KELLY")), ("max_bet", ("MAX_BET", "MAX_STAKE", "MAX_BET_USD")),
                       ("min_edge", ("MIN_EDGE", "EDGE_MIN"))):
        v = next((_f(x.get(n)) for x in (bset, cset) for n in names if _f(x.get(n)) is not None), None)
        if v is not None:
            kelly[key] = v
    if balance is not None and kelly:
        kelly["bankroll"] = round(balance, 2)
    return {"name": BOT_NAME, "mode": mode, "running": running, "status": status, "t": int(now), "balance": balance,
            "today_pnl": round(sum(float(r[6]) for r in graded if r[0] >= t_today), 2),
            "week_pnl": round(sum(float(r[6]) for r in graded if r[0] >= t_week), 2),
            "total_pnl": round(sum(float(r[6]) for r in graded), 2),
            "note": "Real money · main account" if mode == "live" else f"{mode.title()} account",
            "positions": positions, "trades": trades,
            "days": [[d, round(v, 2)] for d, v in sorted(per_day.items())][-CAPS["days"]:],
            "strategies": strategies[:CAPS["strategies"]], "equity": equity,
            **extra, "alerts": alerts[:CAPS["alerts"]], **({"kelly": kelly} if kelly else {})}


def bot_payload(bot_dir, now=None, units=UNITS, week="monday", max_bytes=MAX_BYTES, guard=None):
    raw = with_guard(read_bot(bot_dir, now=now, units=units, week=week), bot_dir=bot_dir, guard=guard, now=now)
    return fit(clean(raw, now), max_bytes)


# ------------------------------------------------------------------------------------------------- the VM, through srv.py
def find_vm_helper(appdata=None):
    """The PC's own srv.py (it runs a shell file on the VM: python srv.py x.sh), newest first, one that has
    cloud_linux/deploy_to_oracle.py beside it preferred."""
    app = appdata or os.environ.get("APPDATA") or ""
    if not app:
        return None
    root = os.path.join(app, "Claude", "scratch-workspaces")
    cands = []
    for pat in (("*", "*", "scratch-*", "srv.py"), ("*", "scratch-*", "srv.py"), ("*", "*", "*", "srv.py")):
        cands += glob.glob(os.path.join(root, *pat))
    cands = sorted(set(cands), key=lambda c: (os.path.isfile(os.path.join(os.path.dirname(c), "cloud_linux", "deploy_to_oracle.py")),
                                               os.path.getmtime(c)), reverse=True)
    return cands[0] if cands else None


def vm_command(source, vm_dir=VM_DIR, week="monday", now=None, units=None):
    """One shell line for the VM: cd to the bot, then run THIS file (sent inside the command, zlib + base64: no file is
    written on the VM) with --from-bot . --emit, nice'd, in isolated mode (-I: the bot's folder is never on sys.path, so
    none of its modules can load). It prints the payload between MARK_A and MARK_B."""
    blob = base64.b64encode(zlib.compress(source.encode("utf-8"), 9)).decode("ascii")
    py = ("import base64,zlib,sys;sys.argv=['kalshi_to_jarvis']+sys.argv[1:];"
          f"exec(compile(zlib.decompress(base64.b64decode('{blob}')),'kalshi_to_jarvis','exec'))")
    extra = (["--now", repr(float(now))] if now else []) + (["--units", units] if units is not None else [])
    args = " ".join(shlex.quote(x) for x in ["--from-bot", ".", "--emit", "--week", week] + extra)
    return (f"cd {shlex.quote(vm_dir)} && PY=venv/bin/python && {{ [ -x \"$PY\" ] || PY=python3; }} && "
            f"nice -n 15 ionice -c3 \"$PY\" -I -c \"{py}\" {args}\n")


def parse_emit(text):
    m = re.search(re.escape(MARK_A) + r"(.*?)" + re.escape(MARK_B), text or "", re.S)
    if not m:
        return None
    try:
        p = json.loads(re.sub(r"[\r\n]", "", m.group(1)))
        return p if isinstance(p, dict) else None
    except ValueError:
        return None


def _console_python():
    exe = sys.executable or "python"
    if os.path.basename(exe).lower() == "pythonw.exe":
        alt = os.path.join(os.path.dirname(exe), "python.exe")
        if os.path.isfile(alt):
            return alt
    return exe


def vm_payload(helper, python=None, vm_dir=VM_DIR, week="monday", now=None, timeout=150, max_bytes=MAX_BYTES, work=None,
               units=None):
    """Run this file on the VM through srv.py and return (payload, error). The VM's own read time stays its "t"."""
    if not helper or not os.path.isfile(helper):
        return None, "srv.py (the PC's VM helper) was not found: give --vm-helper <path to srv.py>"
    try:
        with open(os.path.abspath(__file__), encoding="utf-8") as fh:
            source = fh.read()
        work = work or state_dir()
        os.makedirs(work, exist_ok=True)
        sh = os.path.join(work, "vm_read.sh")
        body = vm_command(source, vm_dir, week, now, units).encode("ascii")
        try:
            same = open(sh, "rb").read() == body
        except OSError:
            same = False
        if not same:
            with open(sh, "wb") as fh:
                fh.write(body)
        r = subprocess.run([python or _console_python(), helper, sh], cwd=os.path.dirname(os.path.abspath(helper)),
                           capture_output=True, timeout=timeout, creationflags=_NO_WINDOW)
        out = (r.stdout or b"").decode("utf-8", "replace") + (r.stderr or b"").decode("utf-8", "replace")
        p = parse_emit(out)
        if p is None:
            tail = re.sub(r"\s+", " ", out).strip()[-200:]
            return None, f"no status from the VM (exit {r.returncode}): {redact(tail)}"
        return fit(clean(p, now), max_bytes), None
    except subprocess.TimeoutExpired:
        return None, "the VM did not answer in time"
    except Exception as e:
        return None, redact(f"{e.__class__.__name__}: {e}")


# ------------------------------------------------------------------------------------------------- keys and settings
def state_dir():
    if os.environ.get("KALSHI_JARVIS_HOME"):
        return os.path.expanduser(os.environ["KALSHI_JARVIS_HOME"])
    base = os.environ.get("LOCALAPPDATA") if os.name == "nt" else None
    return os.path.join(base, "KalshiToJarvis") if base else os.path.join(os.path.expanduser("~"), ".kalshi_to_jarvis")


def read_env_file(path):
    """KEY=VALUE lines (a .env file: comments, `export`, quotes). Missing file -> {}."""
    out = {}
    try:
        with open(path, encoding="utf-8-sig") as fh:
            text = fh.read()
    except OSError:
        return out
    for m in re.finditer(r'(?m)^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|\'[^\']*\'|[^\r\n#]*)', text):
        v = m.group(2).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        out[m.group(1)] = v
    return out


def _truthy(v):
    return str(v or "").strip().lower() in ("1", "true", "yes", "on", "demo")


def settings(args=None, env=None):
    """{key_id, key_ref, base, demo, name, ...} from the flags, the environment, an env file and config.json (first
    found wins, in that order). Values are kept in memory only."""
    a = vars(args) if args is not None and not isinstance(args, dict) else dict(args or {})
    env = os.environ if env is None else env
    cfg = {}
    cpath = a.get("config") or os.path.join(state_dir(), "config.json")
    try:
        with open(cpath, encoding="utf-8-sig") as fh:
            c = json.load(fh)
            cfg = c if isinstance(c, dict) else {}
    except (OSError, ValueError):
        cfg = {}
    envf = {}
    if a.get("from_api"):                      # key settings are read only for --from-api, never for the other sources
        for p in [a.get("env_file"), cfg.get("env_file")] + [os.path.join(d, ".env") for d in [a.get("bot_dir"), cfg.get("bot_dir")] if d]:
            if p:
                envf = {**read_env_file(os.path.expanduser(p)), **envf}

    def first(*vals):
        return next((v for v in vals if v not in (None, "")), None)

    def pick(names, src):
        return first(*[src.get(n) for n in names])

    demo = bool(a.get("demo")) or _truthy(pick(DEMO_FLAG_ENV, env)) or _truthy(pick(DEMO_FLAG_ENV, envf)) or _truthy(cfg.get("demo"))
    ids = (DEMO_KEY_ID_ENV + KEY_ID_ENV) if demo else KEY_ID_ENV
    files = (DEMO_KEY_FILE_ENV + KEY_FILE_ENV) if demo else KEY_FILE_ENV
    key_ref = first(a.get("key_file"), pick(files, env), pick(files, envf), cfg.get("key_file"))
    bot_dir = first(a.get("bot_dir"), cfg.get("bot_dir"))
    if key_ref and not str(key_ref).lstrip().startswith("-----BEGIN") and bot_dir and not os.path.isabs(os.path.expanduser(str(key_ref))):
        key_ref = os.path.join(bot_dir, str(key_ref))        # a relative key path in the bot's .env is relative to the bot
    base = first(a.get("base"), pick(BASE_ENV, env), pick(BASE_ENV, envf), cfg.get("base"))
    return {"key_id": first(a.get("key_id"), pick(ids, env), pick(ids, envf), cfg.get("key_id")),
            "key_ref": key_ref, "demo": demo, "base": base or (DEMO_BASE if demo else PROD_BASE),
            "name": first(a.get("name"), cfg.get("name"), "Kalshi bot"),
            "repo": first(a.get("repo"), env.get("KALSHI_JARVIS_REPO"), cfg.get("repo"), REPO_URL),
            "git_config_from": first(a.get("git_config_from"), cfg.get("git_config_from")),
            "git_dir": first(a.get("git_dir"), cfg.get("git_dir"), os.path.join(state_dir(), "pub.git")),
            "log": first(a.get("log"), cfg.get("log")),
            "vm_helper": first(a.get("vm_helper"), cfg.get("vm_helper")),
            "vm_python": first(a.get("vm_python"), cfg.get("vm_python")),
            "vm_dir": first(a.get("vm_dir"), cfg.get("vm_dir"), VM_DIR)}


def make_client(st):
    """A read-only Client from settings(); errors are redacted."""
    secrets = _secret_set(st.get("key_id"), st.get("key_ref"))
    if not st.get("key_id") or not st.get("key_ref"):
        raise ApiError("no Kalshi API key: give --key-id and --key-file (or set KALSHI_API_KEY_ID and "
                       "KALSHI_PRIVATE_KEY_PATH, or --env-file with the Kalshi bot's .env)")
    try:
        key = load_key(st["key_ref"])
    except ImportError:
        raise ApiError("the 'cryptography' package is missing: python -m pip install cryptography") from None
    except Exception as e:
        raise ApiError(redact(f"could not load the private key ({e.__class__.__name__}: {e})", secrets)) from None
    return Client(st["base"], st["key_id"], key, secrets=secrets)


def api_payload(client, now=None, cache=None, name="Kalshi bot", running=None, strategies=None, max_bytes=MAX_BYTES):
    """Read the account (read-only) and return the cleaned kalshi.json payload."""
    raw = fetch(client, cache)
    mode = "demo" if "demo" in client.base else "live"
    st = build_from_api(raw, now=now, name=name, mode=mode, running=running, strategies=strategies)
    return fit(clean(st, now, phrases=client.secrets), max_bytes)


# ------------------------------------------------------------------------------------------------- push (git plumbing)
_NO_WINDOW = 0x08000000 if os.name == "nt" else 0         # CREATE_NO_WINDOW: no console flash under pythonw


def _run(cmd, inp=None, timeout=90, env=None):
    return subprocess.run(cmd, input=inp, capture_output=True, timeout=timeout, env=env, creationflags=_NO_WINDOW)


def _out(r):
    return (r.stdout or b"").decode(errors="replace").strip()


def push(payload, url=REPO_URL, branch=BRANCH, git_dir=None, file=FILE, prune=False, copy_config_from=None):
    """payload as `file` in one orphan commit, force-pushed to url/branch (replaces it: no history), from a private
    scratch bare repo, with this PC's own git login. {"ok", "error"|"commit", "bytes"}. Never raises."""
    git_dir = git_dir or os.path.join(state_dir(), "pub.git")
    try:
        if not url:
            return {"ok": False, "error": "no target repo"}
        if not os.path.isdir(os.path.join(git_dir, "objects")):
            os.makedirs(os.path.dirname(os.path.abspath(git_dir)), exist_ok=True)
            r = _run(["git", "init", "-q", "--bare", git_dir], timeout=60)
            if r.returncode:
                return {"ok": False, "error": "git init failed (is Git for Windows installed?)"}
            if copy_config_from:
                r = _run(["git", "-C", copy_config_from, "config", "--local", "--get-regexp",
                          r"^(credential\..*|core\.sshcommand|http\..*proxy)$"], timeout=20)
                for ln in _out(r).splitlines():
                    k, _, v = ln.partition(" ")
                    if k and v:
                        _run(["git", "--git-dir", git_dir, "config", "--add", k, v], timeout=20)
        body = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
        r = _run(["git", "--git-dir", git_dir, "hash-object", "-w", "--stdin"], inp=body, timeout=60)
        blob = _out(r)
        if r.returncode or len(blob) < 40:
            return {"ok": False, "error": "hash-object failed"}
        r = _run(["git", "--git-dir", git_dir, "mktree"], inp=f"100644 blob {blob}\t{file}\n".encode(), timeout=60)
        tree = _out(r)
        if r.returncode or not tree:
            return {"ok": False, "error": "mktree failed"}
        env = {**os.environ, "GIT_AUTHOR_NAME": "kalshi-to-jarvis", "GIT_AUTHOR_EMAIL": "pc@liquidity-engine.local",
               "GIT_COMMITTER_NAME": "kalshi-to-jarvis", "GIT_COMMITTER_EMAIL": "pc@liquidity-engine.local",
               "GIT_TERMINAL_PROMPT": "0"}
        r = _run(["git", "--git-dir", git_dir, "commit-tree", tree, "-m", f"kalshi {payload.get('t')}"], env=env, timeout=60)
        commit = _out(r)
        if r.returncode or not commit:
            return {"ok": False, "error": "commit-tree failed"}
        r = _run(["git", "--git-dir", git_dir, "push", "-q", "--force", url, f"{commit}:refs/heads/{branch}"], env=env, timeout=90)
        if r.returncode:
            err = redact((r.stderr or b"").decode(errors="replace").strip()[-200:]) or "push failed"
            return {"ok": False, "error": err + _push_hint(err)}
        if prune:
            _run(["git", "--git-dir", git_dir, "update-ref", "refs/heads/last", commit], timeout=20)
            _run(["git", "--git-dir", git_dir, "prune", "--expire=now"], timeout=120)
        return {"ok": True, "commit": commit[:10], "bytes": len(body)}
    except Exception as e:
        return {"ok": False, "error": redact(f"{e.__class__.__name__}: {e}")}


# ------------------------------------------------------------------------------------------------ publishing without GitHub
# (owner 2026-11-10: the GitHub account is gone). The payload that reaches these functions is the SAME already-redacted
# payload the git push sends (the maker builds it: only the contract's keys, free text redacted); a provider only moves bytes.
#   folder   write kalshi.json into a folder (a synced Dropbox / OneDrive / iCloud folder, or the PC's pc_publish picks it up)
#   netlify  Netlify deploy API (file digest: kalshi.json + _headers + index.html) to the feed's OWN small site; the token
#            and site id come from a file on this machine (default ~/.olympus/netlify.json), never from the command line
#   scp      copy kalshi.json to user@host:/path with the machine's own ssh key (a server you own)
NETLIFY_API = "https://api.netlify.com/api/v1"
NETLIFY_FILE_DEFAULT = os.path.join("~", ".olympus", "netlify.json")
NETLIFY_MIN_GAP_S = 3600        # Netlify's new free plan allows about 20 deploys a month: at most one an hour by default
FEED_HEADERS = "/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n"
FEED_INDEX = "<!doctype html><meta charset=utf-8><title>feed</title><p>kalshi.json: a read-only status file.</p>\n"


def _atomic_write(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)


def _body(payload):
    return json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")


def publish_folder(payload, directory, **_k):
    """{"ok", "bytes"}: kalshi.json atomically into `directory`. Never raises."""
    try:
        if not directory:
            return {"ok": False, "error": "no folder: pass --publish-dir"}
        body = _body(payload)
        _atomic_write(os.path.join(os.path.expanduser(directory), FILE), body)
        return {"ok": True, "bytes": len(body), "commit": "folder"}
    except Exception as e:
        return {"ok": False, "error": redact(f"{e.__class__.__name__}: {e}")}


def _nl_call(method, url, token, data=None, ctype=None, timeout=60):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("User-Agent", "kalshi-status-vm/1")
    if ctype:
        req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    try:
        return json.loads(raw.decode("utf-8")) if raw else {}
    except ValueError:
        return {}


def read_netlify_file(path=None, env=None):
    """(site_id, token) from the local file (JSON {"site_id", "token"}); never printed. ("", "") when missing."""
    env = os.environ if env is None else env
    p = os.path.expanduser(path or env.get("KALSHI_NETLIFY_FILE") or NETLIFY_FILE_DEFAULT)
    try:
        with open(p, encoding="utf-8-sig") as fh:
            d = json.load(fh)
        return str(d.get("site_id") or d.get("siteId") or "").strip(), str(d.get("token") or d.get("access_token") or "").strip()
    except (OSError, ValueError):
        return "", ""


def publish_netlify(payload, netlify_file=None, api=None, state_file=None, min_gap_s=NETLIFY_MIN_GAP_S, now=None, env=None, **_k):
    """The feed as a tiny Netlify site: files kalshi.json + _headers (CORS *) + index.html, file-digest deploy (only the changed
    kalshi.json is uploaded). Paced to one deploy per min_gap_s (the free plan's deploy budget). Never raises, never prints
    the token. {"ok", "bytes", "commit"} or {"ok": False, "error"} or {"ok": True, "skipped": "..."}."""
    sid, tok = "", ""
    try:
        env = os.environ if env is None else env
        sid, tok = read_netlify_file(netlify_file, env)
        if not sid or not tok:
            return {"ok": False, "error": "no Netlify site id / token file: " + (netlify_file or NETLIFY_FILE_DEFAULT)}
        t = time.time() if now is None else now
        sf = state_file or os.path.join(state_dir(), "netlify_last.json")
        last = _jload(sf) or {}
        if min_gap_s and t - float(last.get("t") or 0) < min_gap_s:
            return {"ok": True, "skipped": "paced: one deploy per %d min" % (min_gap_s // 60), "bytes": 0, "commit": last.get("deploy")}
        base = (api or env.get("OLYMPUS_NETLIFY_API") or NETLIFY_API).rstrip("/")
        files = {"kalshi.json": _body(payload), "_headers": FEED_HEADERS.encode(), "index.html": FEED_INDEX.encode()}
        digest = {"/" + k: hashlib.sha1(v).hexdigest() for k, v in files.items()}
        d = _nl_call("POST", f"{base}/sites/{urllib.parse.quote(sid)}/deploys", tok,
                     json.dumps({"files": digest}).encode(), "application/json")
        did = d.get("id")
        if not did:
            return {"ok": False, "error": "Netlify gave no deploy id"}
        need = set(d.get("required") or [])
        for k, v in files.items():
            if hashlib.sha1(v).hexdigest() in need:
                _nl_call("PUT", f"{base}/deploys/{urllib.parse.quote(did)}/files/{urllib.parse.quote(k)}", tok, v, "application/octet-stream")
        try:
            _atomic_write(sf, json.dumps({"t": t, "deploy": did}).encode())
        except OSError:
            pass
        return {"ok": True, "bytes": len(files["kalshi.json"]), "commit": str(did)[:10], "url": d.get("ssl_url") or d.get("url")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": redact(f"Netlify HTTP {e.code}" + (" (token refused: make a new one)" if e.code in (401, 403) else ""), (sid, tok))}
    except Exception as e:
        return {"ok": False, "error": redact(f"{e.__class__.__name__}: {e}", (sid, tok))}


def publish_scp(payload, target, key=None, **_k):
    """scp kalshi.json to user@host:/path/ (the machine's own ssh key). Never raises."""
    try:
        if not target or "@" not in target:
            return {"ok": False, "error": "give --publish-dir user@host:/path"}
        body = _body(payload)
        tmp = os.path.join(state_dir(), "kalshi.json.out")
        _atomic_write(tmp, body)
        cmd = ["scp", "-q", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"] + \
              (["-i", os.path.expanduser(key), "-o", "IdentitiesOnly=yes"] if key else []) + [tmp, target.rstrip("/") + "/" + FILE]
        r = _run(cmd, timeout=60)
        if r.returncode:
            return {"ok": False, "error": redact((r.stderr or b"").decode(errors="replace").strip()[-160:]) or "scp failed"}
        return {"ok": True, "bytes": len(body), "commit": "scp"}
    except Exception as e:
        return {"ok": False, "error": redact(f"{e.__class__.__name__}: {e}")}


def provider_push(name, dest=None, netlify_file=None, key=None):
    """A push_fn(payload, prune=False) for --publish folder|netlify|scp; None for git (the default)."""
    if name == "folder":
        return lambda p, prune=False: publish_folder(p, dest)
    if name == "netlify":
        return lambda p, prune=False: publish_netlify(p, netlify_file)
    if name == "scp":
        return lambda p, prune=False: publish_scp(p, dest, key)
    return None


def phone_url(url=REPO_URL):
    """Where the phone reads the feed: raw.githubusercontent.com/<owner>/<repo>/main/kalshi.json."""
    m = re.search(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$", url or "")
    owner, repo = (m.group(1), m.group(2)) if m else (FEED_OWNER, FEED_REPO)
    return f"https://raw.githubusercontent.com/{owner}/{repo}/{BRANCH}/{FILE}"


def _push_hint(err):
    """A plain next step for the usual first-push errors (the feed repo missing, the key not added / read-only)."""
    e = err.lower()
    if "not found" in e or "does not appear to be a git repository" in e or "does not exist" in e:
        return (f" -> create the PUBLIC repo {FEED_OWNER}/{FEED_REPO} on GitHub first (empty: no README, no license)")
    if "read only" in e or "read-only" in e or "write access" in e:
        return f" -> the deploy key is read-only: on {FEED_REPO} > Settings > Deploy keys, add it again with Allow write access"
    if "permission denied" in e or "publickey" in e or "authentication failed" in e or "could not read username" in e:
        return f" -> GitHub refused the login: add the deploy key to {FEED_REPO} (Settings > Deploy keys, Allow write access)"
    return ""


def _sig(p):
    """What counts as a change: everything but the clocks (t, pub_t, the time of the last equity point)."""
    q = {k: v for k, v in p.items() if k not in ("t", "pub_t")}
    if q.get("equity"):
        q["equity"] = list(q["equity"][:-1]) + [[None, q["equity"][-1][1] if len(q["equity"][-1]) > 1 else None]]
    return hashlib.sha256(json.dumps(q, sort_keys=True, default=str).encode()).hexdigest()


def run_loop(make, push_fn, every=EVERY_S, keepalive=KEEPALIVE_S, log=print, clock=time.time, sleep=time.sleep,
             max_rounds=None):
    """Every `every` s: make() -> (payload, error); push when it changed (t / pub_t aside) or at least every `keepalive`
    s. Errors back off (2, 4 .. 10 min) and are logged redacted; it never exits on its own."""
    last_sig, last_t, fails, n, pushes = None, 0.0, 0, 0, 0
    while max_rounds is None or n < max_rounds:
        n += 1
        try:
            p, err = make()
            now = clock()
            if err:
                fails += 1
                log(f"kalshi to jarvis: {err}")
            elif _sig(p) != last_sig or now - last_t >= keepalive:
                r = push_fn(p, prune=(pushes % PRUNE_EVERY == PRUNE_EVERY - 1))
                pushes += 1
                if r.get("ok"):
                    if fails:
                        log("kalshi to jarvis: working again")
                    last_sig, last_t, fails = _sig(p), now, 0
                    log(f"kalshi to jarvis: pushed {r.get('commit')} ({r.get('bytes')} bytes)")
                else:
                    fails += 1
                    log(f"kalshi to jarvis: push FAILED: {redact(str(r.get('error')))}")
            else:
                fails = 0
        except Exception as e:                                 # never dies (Task Scheduler restarts it if it does)
            fails += 1
            log(f"kalshi to jarvis: {redact(f'{e.__class__.__name__}: {e}')}")
        sleep(every if not fails else min(600.0, every * 2 ** min(fails, 4)))


class Log:
    """print() (when there is a console) + an optional small log file (rotated at 1 MB). Text is redacted."""

    def __init__(self, path=None, secrets=()):
        self.path, self.secrets = path, tuple(secrets)

    def __call__(self, msg):
        line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {redact(msg, self.secrets)}"
        try:
            if sys.stdout is not None:
                print(line, flush=True)
        except Exception:
            pass
        if self.path:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
                if os.path.exists(self.path) and os.path.getsize(self.path) > 1_000_000:
                    os.replace(self.path, self.path + ".1")
                with open(self.path, "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
            except OSError:
                pass


# ------------------------------------------------------------------------------------------------- command line
def parser(prog=None):
    ap = argparse.ArgumentParser(prog=prog, description="Kalshi to Jarvis: publish the Kalshi numbers to the phone (read-only).")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--from-bot", default=None, metavar="DIR", help="read the Kalshi bot's own files in DIR (on the VM: /home/ubuntu/kalshi)")
    src.add_argument("--from-vm", "--ssh", dest="from_vm", action="store_true",
                     help="from the PC: run --from-bot on the VM through the PC's own srv.py (the fallback)")
    src.add_argument("--from-api", action="store_true",
                     help="NOT recommended (the account already meets Kalshi's rate limits): read-only API reads, every 5 min")
    src.add_argument("--src", default=None, help="a status JSON file the Kalshi bot writes")
    ap.add_argument("--key-id", default=None, help="Kalshi API key id (else KALSHI_API_KEY_ID / env file / config)")
    ap.add_argument("--key-file", default=None, help="private key PEM file (else KALSHI_PRIVATE_KEY_PATH / env file / config)")
    ap.add_argument("--env-file", default=None, help="a .env file to read the key settings from (--from-api only)")
    ap.add_argument("--bot-dir", default=None, help="the folder of the bot's .env (--from-api only)")
    ap.add_argument("--demo", action="store_true", help="Kalshi's demo API (--from-api)")
    ap.add_argument("--deploy-key", default=None, help="SSH deploy key with write access to kalshi-feed only (the VM); pushes over SSH")
    ap.add_argument("--publish", choices=("git", "folder", "netlify", "scp"), default="git",
                    help="where kalshi.json goes: git (the old feed repo), folder, netlify (its own small site) or scp. Default git")
    ap.add_argument("--publish-dir", default=None, help="folder (--publish folder) or user@host:/path (--publish scp)")
    ap.add_argument("--netlify-file", default=None, help="JSON file {site_id, token} on this machine (default ~/.olympus/netlify.json)")
    ap.add_argument("--week", choices=("monday", "rolling7"), default="monday", help="week start for week_pnl (default Monday 00:00 ET)")
    ap.add_argument("--guard", default=None, help="the risk guard's folder (default ~/kalshi_jarvis/guard, when it exists)")
    ap.add_argument("--every", type=float, default=None, help="seconds between reads in --loop (default 60; --from-api 300)")
    ap.add_argument("--vm-helper", default=None, help="the PC's srv.py (default: found under %%APPDATA%%\\Claude\\scratch-workspaces)")
    ap.add_argument("--vm-python", default=None, help="python that runs srv.py (needs paramiko; default this python)")
    ap.add_argument("--vm-dir", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--units", default=None, help=argparse.SUPPRESS)                  # systemd units to check ("none": skip)
    ap.add_argument("--base", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--name", default=None, help="the bot's name on the phone")
    ap.add_argument("--config", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--repo", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--git-dir", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--git-config-from", default=None, help=argparse.SUPPRESS)        # a repo whose local git login settings to copy
    ap.add_argument("--log", default=None, help="log file for --loop")
    ap.add_argument("--now", type=float, default=None, help=argparse.SUPPRESS)          # tests: a fixed clock
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--once", action="store_true", help="push once now")
    g.add_argument("--loop", action="store_true", help="keep it fresh")
    g.add_argument("--cron", action="store_true", help="for cron every minute: push only when changed (and every 3 min)")
    g.add_argument("--check", action="store_true", help="print what would be published (no push)")
    g.add_argument("--sample", action="store_true", help="print a sample status file (the contract)")
    g.add_argument("--emit", action="store_true", help=argparse.SUPPRESS)              # the VM side of --from-vm
    return ap


def _stdout_utf8():
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass


def maker(a, st, log=print):
    """make() -> (payload, error) for the chosen source. Never raises."""
    units = UNITS if a.units in (None, "") else tuple(u for u in str(a.units).split(",") if u and u != "none")
    if a.src:
        return lambda: read(a.src, a.now)
    if a.from_bot:
        def from_bot():
            try:
                return bot_payload(a.from_bot, now=a.now, units=units, week=a.week, guard=a.guard), None
            except Exception as e:
                return None, redact(f"{e.__class__.__name__}: {e}")
        return from_bot
    if a.from_vm:
        helper = st.get("vm_helper") or find_vm_helper()
        return lambda: vm_payload(helper, st.get("vm_python"), st.get("vm_dir") or VM_DIR, a.week, now=a.now, units=a.units)
    holder, cache = {"client": None}, {}

    def from_api():
        try:
            if holder["client"] is None:
                holder["client"] = make_client(st)
            return api_payload(holder["client"], now=a.now, cache=cache, name=st["name"]), None
        except (ApiError, ReadOnlyError) as e:
            return None, str(e)
        except Exception as e:
            return None, redact(f"{e.__class__.__name__}: {e}", _secret_set(st.get("key_id"), st.get("key_ref")))
    return from_api


def push_env(deploy_key=None):
    """Extra git environment for a push with an SSH deploy key (the VM); none for the PC's own git login."""
    if not deploy_key:
        return {}
    k = os.path.expanduser(str(deploy_key))
    return {"GIT_SSH_COMMAND": f"ssh -i {shlex.quote(k)} -o IdentitiesOnly=yes -o BatchMode=yes "
                               f"-o StrictHostKeyChecking=accept-new"}


def main(argv=None, push_fn=None, prog=None, defaults=None):
    """The command line. engine/kalshi_publish.py calls it with its own push (the repo's git login) and defaults."""
    _stdout_utf8()
    ap = parser(prog)
    if defaults:
        ap.set_defaults(**defaults)
    a = ap.parse_args(argv)
    if a.sample:
        print(json.dumps(SAMPLE_V3, indent=2, ensure_ascii=False))
        return 0
    if a.from_api or a.from_bot or a.from_vm:
        a.src = None
    if not (a.from_api or a.from_bot or a.from_vm or a.src):
        print("give a source: --from-bot DIR (the bot's files), --from-vm (from the PC, over srv.py), --from-api, or --src FILE")
        return 2
    st = settings(a)
    if a.deploy_key and not a.repo and st["repo"] == REPO_URL:
        st["repo"] = REPO_SSH                                  # a deploy key pushes over SSH
    secrets = _secret_set(st.get("key_id"), st.get("key_ref"))
    log = Log(st["log"] or (os.path.join(state_dir(), "kalshi_to_jarvis.log") if a.loop else None), secrets)
    make = maker(a, st, log)
    if push_fn is None and getattr(a, "publish", "git") != "git":
        push_fn = provider_push(a.publish, a.publish_dir, a.netlify_file, a.deploy_key)
    if push_fn is None:
        extra = push_env(os.path.abspath(os.path.expanduser(a.deploy_key)) if a.deploy_key else None)

        def push_fn(p, prune=False):
            old = {k: os.environ.get(k) for k in extra}
            os.environ.update(extra)
            try:
                return push(p, st["repo"], git_dir=st["git_dir"], prune=prune, copy_config_from=st.get("git_config_from"))
            finally:
                for k, v in old.items():
                    if v is None:
                        os.environ.pop(k, None)
                    else:
                        os.environ[k] = v
    if a.loop:
        every = a.every or (API_EVERY_S if a.from_api else VM_EVERY_S if (a.from_vm or a.from_bot) else EVERY_S)
        what = "Kalshi API, read-only" if a.from_api else "the bot's files on the VM" if a.from_vm else \
            "the bot's files" if a.from_bot else "the status file"
        log(f"kalshi to jarvis: started ({what}; every {int(every)} s)")
        while True:
            try:
                run_loop(make, push_fn, every=every, log=log)
            except Exception as e:                            # run_loop never returns; belt and braces
                log(f"kalshi to jarvis: restarting after {e.__class__.__name__}")
                time.sleep(60)
    p, err = make()
    if err:
        print(redact(err, secrets))
        return 1
    if a.emit:
        print(MARK_A + json.dumps(p, separators=(",", ":"), ensure_ascii=True) + MARK_B, flush=True)
        return 0
    if a.check:
        print(json.dumps(p, indent=2, ensure_ascii=False))
        return 0
    last_file = os.path.abspath(st["git_dir"]).rstrip("/\\") + ".last.json"
    last = (_jload(last_file) or {}) if a.cron else {}
    if a.cron:                     # quiet while nothing changed: a push only on a change, or every KEEPALIVE_S
        if last.get("sig") == _sig(p) and time.time() - float(last.get("t") or 0) < KEEPALIVE_S - 5:
            return 0
    n = int(last.get("n") or 0) + 1
    r = push_fn(p, prune=bool(a.cron and n % PRUNE_EVERY == 0))      # cron: drop the old commits every 30 pushes
    if a.cron:
        if r.get("ok"):
            try:
                os.makedirs(os.path.dirname(last_file), exist_ok=True)
                with open(last_file, "w", encoding="utf-8") as fh:
                    json.dump({"sig": _sig(p), "t": time.time(), "n": n, "commit": r.get("commit")}, fh)
            except OSError:
                pass
        if not r.get("ok") or last.get("sig") != _sig(p):      # keep-alive pushes stay out of the log
            log(f"kalshi to jarvis: {'pushed ' + str(r.get('commit')) if r.get('ok') else 'push FAILED: ' + redact(str(r.get('error')))}")
        return 0 if r.get("ok") else 1
    print(json.dumps(r))
    if r.get("ok") and getattr(a, "publish", "git") != "git":
        print("published with:", a.publish, ("-> " + r["url"] + "/kalshi.json") if r.get("url") else "")
    elif r.get("ok"):
        print("phone reads it at:", phone_url(st["repo"]))
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
