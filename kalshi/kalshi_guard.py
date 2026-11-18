#!/usr/bin/env python3
"""Kalshi risk guard (kalshi_guard.py): the gate every order of the owner's Kalshi bot passes before it can reach Kalshi.

ONE FILE. Python 3.9+, standard library only, no network for the checks, no keys, never places an order itself. It lives
on the bot's VM beside kalshi_status_vm.py (~/kalshi_jarvis/kalshi_guard.py); its state is in ~/kalshi_jarvis/guard/
(KALSHI_GUARD_HOME overrides). In the repo: tools/kalshi_kit/public/kalshi_guard.py, tests tests/test_kalshi_guard.py.

How the bot uses it (GUARD_SETUP.md has the exact steps for the bot's own Claude chat):

    import sys; sys.path.insert(0, "/home/ubuntu/kalshi_jarvis")
    import kalshi_guard
    GUARD = kalshi_guard.Guard()                                    # once, at start
    d = GUARD.check({"ticker": tk, "side": "yes", "action": "buy", "count": 5, "price_cents": 42,
                     "fair": 0.47, "close_ts": close_unix, "strategy": "latefav"}, balance=bal)
    if d["send"]:                                                   # True only in LIVE mode with every check passed
        resp = <the bot's own create-order call>
        GUARD.record_fill(d["id"], filled_count, avg_price_cents)   # optional; without it the full order stays booked
    # else: do not send. d["mode"] is "paper" / "dry_run" / "live"; d["reasons"] says why it was blocked.
    GUARD.record_settle(tk, pnl_usd)                                # optional: when a market settles

The three modes (never live by default):
  paper    the default, and what any missing, broken or out-of-date switch means. Nothing is sent.
  dry_run  the bot runs its real order path up to the send; the guard logs the exact order it would send
           (guard/orders.jsonl) and says "don't send".
  live     only after the OWNER types the phrase:  python3 kalshi_guard.py live   (it shows the phrase:
           "GO LIVE <today ET> STOP <daily stop>"). Live falls back to paper by itself when the limits change, when this
           file is updated, when the kill switch is used, or when the optional --hours ran out: then the phrase again.

The checks (each order, all in code below, pure functions):
  kill switch file guard/KILL; valid order; price 1-99 c (and the limits' min/max); max contracts; max $ per order (and
  max % of the balance); max $ open in one market; max $ bought per ET day; daily stop-loss (no new buys once the day's
  realized loss reaches it, and no buy that could lose more than the room left); max $ open in total; max orders per day;
  no new buys in the last N seconds before the market closes unless the strategy is listed in late_ok_strategies;
  close time required; price sanity (never pay more than fair + x cents); fee-aware EV (fair - price - fee >= min edge);
  quote age; enough balance. Sells only reduce a position the guard knows of. Any internal error blocks (fail closed).

Fee: Kalshi's taker fee 0.07 * P * (1 - P) per contract, rounded UP to the next cent per contract (fee_rate in limits).

Command line (on the VM, in ~/kalshi_jarvis):
  python3 kalshi_guard.py status              the mode, the limits, today's room (plain words)
  python3 kalshi_guard.py init                make guard/ with the default limits (paper); safe to repeat
  python3 kalshi_guard.py limits [--set k=v]  show / change the limits (a change drops LIVE back to paper)
  python3 kalshi_guard.py live [--phrase ..]  the OWNER arms real money (types the phrase); [--hours N] to expire
  python3 kalshi_guard.py paper | dry-run     back to no real orders (no phrase needed to be safer)
  python3 kalshi_guard.py kill [why] | unkill stop every order now (also disarms live) / lift it (stays paper)
  python3 kalshi_guard.py check --order JSON  what the guard says about one order (logged as "manual", nothing sent)
  python3 kalshi_guard.py notify --from-bot DIR   phone alerts (ntfy) for fills, losses, kill switch, stop, mode
  python3 kalshi_guard.py public              the redacted risk block the status feed publishes
  python3 kalshi_guard.py selftest            quick checks of the maths in this copy
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import importlib.util
import json
import math
import os
import re
import sqlite3
import sys
import time
import urllib.request

GUARD_VERSION = "2026-11-13.1"
HOME_ENV = "KALSHI_GUARD_HOME"
DEFAULT_HOME = os.path.join("~", "kalshi_jarvis", "guard")
DEFAULT_BOT_DIR = "/home/ubuntu/kalshi"
MODES = ("paper", "dry_run", "live")
SAFE_MODES = ("paper", "dry_run")

# The limits: the owner's to set (guard/limits.json). Small by default: the account held about $56 on 2026-11-12.
DEFAULT_LIMITS = {
    "max_order_usd": 5.0,            # one order's cost + fee
    "max_order_pct_balance": 0.10,   # ... and at most this share of the balance (when the bot passes the balance)
    "max_market_usd": 10.0,          # money open in one market (ticker), this order included
    "max_day_usd": 25.0,             # money spent on buys in one ET day
    "daily_stop_usd": 10.0,          # realized loss in one ET day that stops new buys until the next ET day
    "max_open_usd": 25.0,            # money open across all markets
    "max_orders_day": 40,            # orders sent per ET day
    "max_contracts": 200,            # contracts in one order
    "no_trade_last_s": 60,           # no new buys this close to the market's close ...
    "late_ok_strategies": [],        # ... unless the order's strategy is listed here (e.g. ["latefav"])
    "hard_last_s": 5,                # never inside the last 5 s, listed or not
    "require_close_time": True,      # an order without the market's close time is blocked
    "require_fair": True,            # an order without the bot's fair value is blocked
    "max_over_fair_cents": 0.0,      # never pay more than fair + this
    "min_edge_cents": 1.0,           # fair - price - fee, per contract, at least this
    "fee_rate": 0.07,                # Kalshi taker fee rate
    "min_price_cents": 1,
    "max_price_cents": 99,
    "max_quote_age_s": 30,           # an order priced off a quote older than this is blocked (when quote_ts is given)
}
# Typo guards: a value outside these bounds is refused (the default is kept and the problem is reported).
BOUNDS = {
    "max_order_usd": (0.0, 1000.0), "max_order_pct_balance": (0.0, 1.0), "max_market_usd": (0.0, 5000.0),
    "max_day_usd": (0.0, 20000.0), "daily_stop_usd": (0.0, 5000.0), "max_open_usd": (0.0, 20000.0),
    "max_orders_day": (0, 5000), "max_contracts": (1, 100000), "no_trade_last_s": (0, 86400), "hard_last_s": (0, 3600),
    "max_over_fair_cents": (0.0, 20.0), "min_edge_cents": (-5.0, 50.0), "fee_rate": (0.0, 0.2),
    "min_price_cents": (1, 99), "max_price_cents": (1, 99), "max_quote_age_s": (1, 86400),
}
BOOLS = ("require_close_time", "require_fair")
INTS = ("max_orders_day", "max_contracts", "no_trade_last_s", "hard_last_s", "min_price_cents", "max_price_cents", "max_quote_age_s")

PLAIN = {   # reason code -> plain words (the phone shows these)
    "KILL": "kill switch is on", "GUARD_ERROR": "the guard hit an error (blocked to be safe)", "BAD_ORDER": "the order is not valid",
    "PRICE_RANGE": "price outside the allowed range", "CONTRACTS": "too many contracts in one order",
    "ORDER_USD": "order bigger than the per-order cap", "ORDER_PCT": "order bigger than the share of the balance allowed",
    "BALANCE": "not enough balance", "MARKET_USD": "too much money in this market", "DAY_USD": "daily spend cap reached",
    "DAY_STOP": "daily stop-loss hit: no new buys until tomorrow (ET)", "STOP_ROOM": "this order could lose more than the room left today",
    "OPEN_USD": "too much money open in total", "ORDERS_DAY": "too many orders today", "CLOSED": "the market has closed",
    "CLOSE_WINDOW": "too close to the market's close", "CLOSE_UNKNOWN": "the market's close time is unknown",
    "NO_FAIR": "no fair value from the bot", "OVER_FAIR": "price above fair value", "EV": "no edge after Kalshi's fee",
    "QUOTE_STALE": "the price is from an old quote", "NOT_HELD": "selling more than the guard knows is held",
}

LOG_MAX_BYTES = 1_000_000
INTENDED_KEEP = 10
SENT_LOG_KEEP = 300
LOCK_TIMEOUT_S = 5.0
_TICKER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


# ------------------------------------------------------------------------------------------------- ET days (no tzdata)
def _nth_sunday(year, month, n):
    d = _dt.date(year, month, 1)
    return d + _dt.timedelta(days=(6 - d.weekday()) % 7 + 7 * (n - 1))


def _utc(d, hour=0):
    return _dt.datetime(d.year, d.month, d.day, hour, tzinfo=_dt.timezone.utc).timestamp()


def et_offset(t):
    y = _dt.datetime.fromtimestamp(t, _dt.timezone.utc).year
    return -4 * 3600 if _utc(_nth_sunday(y, 3, 2), 7) <= t < _utc(_nth_sunday(y, 11, 1), 6) else -5 * 3600


def et_day(t):
    return _dt.datetime.fromtimestamp(t + et_offset(t), _dt.timezone.utc).date().isoformat()


def et_midnight(day):
    d = _dt.date.fromisoformat(day)
    t = _utc(d) + 4 * 3600
    return t if et_offset(t) == -4 * 3600 else _utc(d) + 5 * 3600


def et_text(t):
    d = _dt.datetime.fromtimestamp(t + et_offset(t), _dt.timezone.utc)
    return f"{d:%b} {d.day}, {d.hour % 12 or 12}:{d:%M} {'AM' if d.hour < 12 else 'PM'} ET"


# ------------------------------------------------------------------------------------------------- money maths (pure)
def _f(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def fee_cents(price_cents, rate=0.07):
    """Kalshi's fee for ONE contract at price_cents, in cents: rate * P * (1 - P), rounded up to the next cent.
    Integer maths (no float edge cases): rate in hundredths of a basis point."""
    p = int(price_cents)
    if not 0 < p < 100:
        return 0
    r = int(round(float(rate) * 1_000_000))                     # 0.07 -> 70,000
    return -(-r * p * (100 - p) // 100_000_000)                  # ceil(r * p * (100-p) / 1e8)


def order_fee_cents(price_cents, count, rate=0.07):
    """Per contract rounded up, times the contracts (never less than Kalshi's own per-order rounding)."""
    return fee_cents(price_cents, rate) * int(count)


def ev_cents(fair, price_cents, rate=0.07):
    """Expected value of buying one contract at price_cents when the side wins with chance `fair`, after the fee."""
    return float(fair) * 100.0 - int(price_cents) - fee_cents(price_cents, rate)


def phrase_for(day, daily_stop):
    s = float(daily_stop)
    amt = str(int(s)) if s == int(s) else f"{s:.2f}"
    return f"GO LIVE {day} STOP {amt}"


def norm_phrase(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().upper()


# ------------------------------------------------------------------------------------------------- limits (pure)
def load_limits(raw):
    """raw (dict or anything) -> (limits, problems). Unknown keys ignored, bad values keep the default."""
    lim, probs = dict(DEFAULT_LIMITS), []
    src = raw if isinstance(raw, dict) else {}
    if raw is not None and not isinstance(raw, dict):
        probs.append("limits.json is not an object: defaults used")
    for k, v in src.items():
        if k not in DEFAULT_LIMITS:
            continue
        if k in BOOLS:
            if isinstance(v, bool):
                lim[k] = v
            elif str(v).strip().lower() in ("true", "1", "yes", "on", "false", "0", "no", "off"):
                lim[k] = str(v).strip().lower() in ("true", "1", "yes", "on")
            else:
                probs.append(f"{k}: not true/false, kept {lim[k]}")
            continue
        if k == "late_ok_strategies":
            items = v if isinstance(v, (list, tuple)) else str(v).split(",") if isinstance(v, str) else None
            if items is None:
                probs.append(f"{k}: not a list, kept {lim[k]}")
            else:
                lim[k] = sorted({str(x).strip().lower()[:40] for x in items if str(x).strip()})
            continue
        x = _f(v)
        lo, hi = BOUNDS[k]
        if x is None or not lo <= x <= hi:
            probs.append(f"{k}: {v!r} is outside {lo}-{hi}, kept {lim[k]}")
            continue
        lim[k] = int(x) if k in INTS else round(x, 4)
    if lim["min_price_cents"] > lim["max_price_cents"]:
        probs.append("min_price_cents is above max_price_cents: both reset")
        lim["min_price_cents"], lim["max_price_cents"] = DEFAULT_LIMITS["min_price_cents"], DEFAULT_LIMITS["max_price_cents"]
    return lim, probs


def limits_sha(lim):
    return hashlib.sha256(json.dumps(lim, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def parse_set(pairs):
    """["max_order_usd=5", "late_ok_strategies=latefav,gold"] -> dict (strings; load_limits validates)."""
    out = {}
    for p in pairs or []:
        k, sep, v = str(p).partition("=")
        k = k.strip()
        if not sep or k not in DEFAULT_LIMITS:
            raise ValueError(f"unknown setting {k!r}: one of {', '.join(DEFAULT_LIMITS)}")
        out[k] = v.strip()
    return out


# ------------------------------------------------------------------------------------------------- the mode (pure)
def resolve_mode(rec, lim, kill, now):
    """The switch file + the limits + the kill switch -> (mode, why). Anything unclear is paper."""
    if kill:
        return "paper", "kill switch is on"
    if not isinstance(rec, dict) or rec.get("mode") not in MODES:
        return "paper", "not armed (paper is the default)"
    m = rec["mode"]
    if m in SAFE_MODES:
        return m, "set by you" if m == "paper" else "dry run: orders are logged, not sent"
    if rec.get("guard_version") != GUARD_VERSION:
        return "paper", "the guard was updated since you armed live: type the phrase again"
    if rec.get("limits_sha") != limits_sha(lim):
        return "paper", "the limits changed since you armed live: type the phrase again"
    day = str(rec.get("day") or "")
    if norm_phrase(rec.get("phrase")) != norm_phrase(phrase_for(day, lim["daily_stop_usd"])):
        return "paper", "the live switch was not set with the phrase"
    until = _f(rec.get("until"))
    if until and now >= until:
        return "paper", "the live time you set ran out"
    t = _f(rec.get("t"))
    return "live", "armed by you" + (f" on {et_text(t)}" if t else "") + (f", until {et_text(until)}" if until else "")


# ------------------------------------------------------------------------------------------------- the book (pure)
def empty_book(day):
    return {"day": day, "spend_usd": 0.0, "pnl_usd": 0.0, "orders": 0, "sent": 0, "blocked": 0, "open": {}, "pending": {}}


def roll_book(book, now):
    """A new ET day resets the day's numbers; open positions stay, positions whose market closed over an hour ago go."""
    day = et_day(now)
    b = book if isinstance(book, dict) and isinstance(book.get("open"), dict) else empty_book(day)
    if b.get("day") != day:
        b = {**empty_book(day), "open": b.get("open") or {}, "pending": b.get("pending") or {}}
    for tk in list(b["open"]):
        ct = _f((b["open"][tk] or {}).get("close_ts"))
        if ct and ct < now - 3600:
            b["open"].pop(tk, None)
    for k in list(b.get("pending") or {}):
        if (_f(b["pending"][k].get("t")) or 0) < now - 86400:
            b["pending"].pop(k, None)
    return b


def open_usd(book, ticker=None):
    rows = [book["open"].get(ticker) or {}] if ticker else list(book["open"].values())
    return round(sum((_f((r.get(s) or {}).get("usd")) or 0.0) for r in rows for s in ("yes", "no")), 4)


def held(book, ticker, side):
    return int(((book["open"].get(ticker) or {}).get(side) or {}).get("n") or 0)


def _pos(book, ticker, side, close_ts=None):
    r = book["open"].setdefault(ticker, {})
    if close_ts:
        r["close_ts"] = close_ts
    return r.setdefault(side, {"n": 0, "usd": 0.0})


def book_order(book, order, cost_usd, oid, now):
    """Count a sent (or, in paper / dry run, simulated) order at once: the full cost is assumed filled until record_fill."""
    if order["action"] == "buy":
        p = _pos(book, order["ticker"], order["side"], order.get("close_ts"))
        p["n"] += order["count"]
        p["usd"] = round(p["usd"] + cost_usd, 4)
        book["spend_usd"] = round(book["spend_usd"] + cost_usd, 4)
    else:
        p = _pos(book, order["ticker"], order["side"])
        n = p["n"]
        if n > 0:
            take = min(order["count"], n)
            basis = p["usd"] * take / n
            p["n"] -= take
            p["usd"] = round(max(0.0, p["usd"] - basis), 4)
            book["pnl_usd"] = round(book["pnl_usd"] + (take * order["price_cents"] - order_fee_cents(order["price_cents"], take,
                                                                                                    order.get("_rate", 0.07))) / 100.0 - basis, 4)
    book["sent"] += 1
    book["pending"][oid] = {"t": now, "ticker": order["ticker"], "side": order["side"], "action": order["action"],
                            "count": order["count"], "price_cents": order["price_cents"], "usd": cost_usd}
    return book


def fill_book(book, oid, filled, avg_price_cents=None, rate=0.07):
    """The real fill of a sent order: un-book what did not fill (buys), re-price at the fill's average."""
    pend = (book.get("pending") or {}).pop(oid, None)
    if not pend or pend["action"] != "buy":
        return book
    filled = max(0, min(int(filled), pend["count"]))
    px = int(avg_price_cents) if avg_price_cents is not None and 0 < int(avg_price_cents) < 100 else pend["price_cents"]
    real = (filled * px + order_fee_cents(px, filled, rate)) / 100.0
    delta = real - pend["usd"]
    p = _pos(book, pend["ticker"], pend["side"])
    p["n"] = max(0, p["n"] - (pend["count"] - filled))
    p["usd"] = round(max(0.0, p["usd"] + delta), 4)
    book["spend_usd"] = round(max(0.0, book["spend_usd"] + delta), 4)
    return book


def settle_book(book, ticker, pnl_usd):
    book["open"].pop(ticker, None)
    x = _f(pnl_usd)
    if x is not None:
        book["pnl_usd"] = round(book["pnl_usd"] + x, 4)
    return book


def merge_books(own, other):
    """The cautious merge of the guard's own book and the bot's trades.db: the bigger spend / exposure, the worse P&L."""
    if not other:
        return own
    b = json.loads(json.dumps(own))
    b["spend_usd"] = max(b["spend_usd"], other.get("spend_usd") or 0.0)
    b["pnl_usd"] = min(b["pnl_usd"], other.get("pnl_usd") or 0.0)
    b["orders_db"] = int(other.get("orders") or 0)
    for tk, r in (other.get("open") or {}).items():
        mine = b["open"].setdefault(tk, {})
        for s in ("yes", "no"):
            o = r.get(s) or {}
            m = mine.setdefault(s, {"n": 0, "usd": 0.0})
            m["n"] = max(m["n"], int(o.get("n") or 0))
            m["usd"] = max(m["usd"], _f(o.get("usd")) or 0.0)
        if r.get("close_ts") and not mine.get("close_ts"):
            mine["close_ts"] = r["close_ts"]
    return b


def book_from_rows(rows, now):
    """trades.db rows (ts, ticker, side, book, filled, avg_price, pnl, result, close_ts) of real (mode='live') orders ->
    today's spend and realized P&L (by order time, ET, as the phone shows it) and what is open."""
    day = et_day(now)
    t0 = et_midnight(day)
    b = empty_book(day)
    n_today = 0
    for ts, tk, side, bk, filled, avg, pnl, result, close_ts in rows:
        ts, filled, avg = _f(ts), _f(filled) or 0.0, _f(avg)
        sell = str(bk or "main") in ("exit", "partial")
        sd = "no" if str(side or "").strip().lower() in ("no", "n", "down") else "yes"
        if ts is not None and ts >= t0:
            n_today += 1
            if not sell and avg is not None:
                b["spend_usd"] += filled * avg
            if _f(pnl) is not None:
                b["pnl_usd"] += float(pnl)
        if result is None and not sell and avg is not None and filled > 0:
            ct = _f(close_ts)
            if ct and ct < now - 3600:
                continue
            p = _pos(b, str(tk), sd, ct)
            p["n"] += int(filled)
            p["usd"] += filled * avg
    b["spend_usd"], b["pnl_usd"], b["orders"] = round(b["spend_usd"], 4), round(b["pnl_usd"], 4), n_today
    return b


def read_db_rows(bot_dir, since=None):
    """The bot's trades.db, read-only: its real (mode='live') filled orders. [] when it is not there."""
    db = os.path.join(bot_dir or "", "trades.db")
    if not bot_dir or not os.path.isfile(db):
        return []
    con = sqlite3.connect("file:" + urllib.request.pathname2url(os.path.abspath(db)) + "?mode=ro", uri=True, timeout=5)
    try:
        con.execute("PRAGMA query_only=1")
        q = ("SELECT ts, ticker, side, COALESCE(book,'main'), filled, avg_price, pnl, result, close_ts FROM orders "
             "WHERE mode='live' AND filled>0" + (" AND ts>=?" if since else "") + " ORDER BY ts, rowid")
        return con.execute(q, (since,) if since else ()).fetchall()
    finally:
        con.close()


def unguarded(rows, sent_log, since):
    """Real orders in trades.db after the guard was installed with no matching send the guard approved (same ticker,
    approved up to 15 min before). These mean an order path that skips the guard."""
    out = []
    for r in rows:
        ts, tk = _f(r[0]), str(r[1])
        if ts is None or not since or ts < since:
            continue
        if not any(s.get("ticker") == tk and ts - 900 <= (_f(s.get("t")) or 0) <= ts + 60 for s in sent_log):
            out.append({"t": int(ts), "ticker": tk})
    return out


# ------------------------------------------------------------------------------------------------- one order (pure)
def normalize_order(raw):
    """The bot's order -> (order, problem). price_cents (1-99) or price (0-1 dollars); fair 0-1 for the side bought."""
    if not isinstance(raw, dict):
        return None, "not an object"
    tk = str(raw.get("ticker") or "").strip()
    if not _TICKER.fullmatch(tk):
        return None, "bad ticker"
    side = str(raw.get("side") or "").strip().lower()
    if side not in ("yes", "no"):
        return None, "side must be yes or no"
    action = str(raw.get("action") or "buy").strip().lower()
    if action not in ("buy", "sell"):
        return None, "action must be buy or sell"
    cnt = _f(raw.get("count", raw.get("contracts")))
    if cnt is None or cnt != int(cnt) or cnt < 1:
        return None, "count must be a whole number of contracts, 1 or more"
    pc = _f(raw.get("price_cents"))
    if pc is None:
        p = _f(raw.get("price"))
        pc = None if p is None else round(p * 100) if p <= 1 else p
    if pc is None or pc != int(pc) or not 1 <= pc <= 99:
        return None, "price must be 1-99 cents"
    fair = _f(raw.get("fair"))
    if fair is not None and not 0 <= fair <= 1:
        return None, "fair must be a chance from 0 to 1"
    ct = _f(raw.get("close_ts"))
    if ct is None and raw.get("closes"):
        try:
            ct = _dt.datetime.fromisoformat(str(raw["closes"]).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None, "closes is not an ISO time"
    return {"ticker": tk, "side": side, "action": action, "count": int(cnt), "price_cents": int(pc), "fair": fair,
            "close_ts": ct, "strategy": str(raw.get("strategy") or "").strip().lower()[:40],
            "quote_ts": _f(raw.get("quote_ts"))}, None


def check_order(raw, lim, book, mode, now, kill=False, balance=None):
    """Every check on one order. Pure: -> decision {"ok", "send", "mode", "reasons" [{code, text}], "cost_usd",
    "fee_usd", "ev_cents", "order"}. ok = every risk check passed; send = ok and LIVE (the only case the bot may send)."""
    reasons = []

    def no(code, extra=""):
        reasons.append({"code": code, "text": PLAIN[code] + (f" ({extra})" if extra else "")})

    if kill:
        no("KILL")
    o, prob = normalize_order(raw)
    if o is None:
        no("BAD_ORDER", prob)
        return {"ok": False, "send": False, "mode": mode, "reasons": reasons, "cost_usd": None, "fee_usd": None,
                "ev_cents": None, "order": None}
    rate = lim["fee_rate"]
    fee_c = order_fee_cents(o["price_cents"], o["count"], rate)
    cost = (o["count"] * o["price_cents"] + fee_c) / 100.0
    fee1 = fee_cents(o["price_cents"], rate)
    ev = None if o["fair"] is None else round(ev_cents(o["fair"], o["price_cents"], rate), 4)
    if not lim["min_price_cents"] <= o["price_cents"] <= lim["max_price_cents"]:
        no("PRICE_RANGE", f"{o['price_cents']} c, allowed {lim['min_price_cents']}-{lim['max_price_cents']} c")
    if o["count"] > lim["max_contracts"]:
        no("CONTRACTS", f"{o['count']} > {lim['max_contracts']}")
    if o["quote_ts"] is not None and now - o["quote_ts"] > lim["max_quote_age_s"]:
        no("QUOTE_STALE", f"{int(now - o['quote_ts'])} s old")
    if o["action"] == "buy":
        bal = _f(balance)
        if cost > lim["max_order_usd"] + 1e-9:
            no("ORDER_USD", f"${cost:.2f} > ${lim['max_order_usd']:.2f}")
        if bal is not None:
            if cost > bal + 1e-9:
                no("BALANCE", f"${cost:.2f} > ${bal:.2f}")
            elif cost > lim["max_order_pct_balance"] * bal + 1e-9:
                no("ORDER_PCT", f"${cost:.2f} > {lim['max_order_pct_balance'] * 100:.0f}% of ${bal:.2f}")
        if open_usd(book, o["ticker"]) + cost > lim["max_market_usd"] + 1e-9:
            no("MARKET_USD", f"${open_usd(book, o['ticker']) + cost:.2f} > ${lim['max_market_usd']:.2f}")
        if book["spend_usd"] + cost > lim["max_day_usd"] + 1e-9:
            no("DAY_USD", f"${book['spend_usd'] + cost:.2f} > ${lim['max_day_usd']:.2f}")
        room = lim["daily_stop_usd"] + book["pnl_usd"]                    # loss still allowed today
        if room <= 1e-9:
            no("DAY_STOP", f"today ${book['pnl_usd']:.2f}, stop ${lim['daily_stop_usd']:.2f}")
        elif cost > room + 1e-9:
            no("STOP_ROOM", f"${cost:.2f} > ${room:.2f} left")
        if open_usd(book) + cost > lim["max_open_usd"] + 1e-9:
            no("OPEN_USD", f"${open_usd(book) + cost:.2f} > ${lim['max_open_usd']:.2f}")
        if o["close_ts"] is None:
            if lim["require_close_time"]:
                no("CLOSE_UNKNOWN")
        else:
            left = o["close_ts"] - now
            if left <= 0:
                no("CLOSED")
            elif left < lim["hard_last_s"]:
                no("CLOSE_WINDOW", f"{int(left)} s left, never inside {lim['hard_last_s']} s")
            elif left < lim["no_trade_last_s"] and o["strategy"] not in lim["late_ok_strategies"]:
                no("CLOSE_WINDOW", f"{int(left)} s left, limit {lim['no_trade_last_s']} s")
        if o["fair"] is None:
            if lim["require_fair"]:
                no("NO_FAIR")
        else:
            if o["price_cents"] > o["fair"] * 100 + lim["max_over_fair_cents"] + 1e-9:
                no("OVER_FAIR", f"{o['price_cents']} c > fair {o['fair'] * 100:.1f} c + {lim['max_over_fair_cents']:g}")
            if ev < lim["min_edge_cents"] - 1e-9:
                no("EV", f"{ev:+.2f} c per contract after a {fee1} c fee, need {lim['min_edge_cents']:+g}")
    else:
        if o["count"] > held(book, o["ticker"], o["side"]):
            no("NOT_HELD", f"{o['count']} > {held(book, o['ticker'], o['side'])} held")
        if o["fair"] is not None and o["price_cents"] < o["fair"] * 100 - lim["max_over_fair_cents"] - 1e-9:
            no("OVER_FAIR", f"selling at {o['price_cents']} c, below fair {o['fair'] * 100:.1f} c")
    if o["action"] == "buy" and (book.get("sent") or 0) >= lim["max_orders_day"]:
        no("ORDERS_DAY", f"{book.get('sent')} sent, cap {lim['max_orders_day']}")
    ok = not reasons
    return {"ok": ok, "send": ok and mode == "live", "mode": mode, "reasons": reasons, "cost_usd": round(cost, 4),
            "fee_usd": fee_c / 100.0, "ev_cents": ev, "order": o}


# ------------------------------------------------------------------------------------------------- files
def home_dir(home=None):
    return os.path.abspath(os.path.expanduser(home or os.environ.get(HOME_ENV) or DEFAULT_HOME))


def _jload(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _atomic(path, obj):
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1, sort_keys=True)
    os.replace(tmp, path)


class _Lock:
    """One process at a time on the state (the bot runs several services). POSIX flock; elsewhere a no-op."""

    def __init__(self, path):
        self.path, self.fh = path, None

    def __enter__(self):
        try:
            import fcntl
        except ImportError:
            return self
        self.fh = open(self.path, "a")
        end = time.time() + LOCK_TIMEOUT_S
        while True:
            try:
                fcntl.flock(self.fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except OSError:
                if time.time() > end:
                    self.fh.close()
                    self.fh = None
                    raise TimeoutError("guard state is locked")
                time.sleep(0.02)

    def __exit__(self, *a):
        if self.fh:
            try:
                import fcntl
                fcntl.flock(self.fh, fcntl.LOCK_UN)
            finally:
                self.fh.close()


class Guard:
    """The file side: guard/limits.json, mode.json, state.json, orders.jsonl, KILL. Every method is fail-closed."""

    def __init__(self, home=None, bot_dir=None, clock=time.time):
        self.home = home_dir(home)
        self.bot_dir = bot_dir if bot_dir is not None else (DEFAULT_BOT_DIR if os.path.isdir(DEFAULT_BOT_DIR) else None)
        self.clock = clock
        self.p = {n: os.path.join(self.home, f) for n, f in (("limits", "limits.json"), ("mode", "mode.json"),
                                                             ("state", "state.json"), ("log", "orders.jsonl"),
                                                             ("kill", "KILL"), ("lock", ".lock"), ("ntfy", "ntfy.json"),
                                                             ("notify", "notify_state.json"))}

    # --- setup and reading
    def init(self):
        os.makedirs(self.home, exist_ok=True)
        try:
            os.chmod(self.home, 0o700)
        except OSError:
            pass
        if not os.path.exists(self.p["limits"]):
            _atomic(self.p["limits"], DEFAULT_LIMITS)
        if not os.path.exists(self.p["mode"]):
            _atomic(self.p["mode"], {"mode": "paper", "t": int(self.clock()), "by": "init"})
        st = _jload(self.p["state"]) or {}
        if not st.get("installed_t"):
            st["installed_t"] = int(self.clock())
            _atomic(self.p["state"], st)
        return self

    def limits(self):
        return load_limits(_jload(self.p["limits"]) if os.path.exists(self.p["limits"]) else None)

    def kill_on(self):
        return os.path.exists(self.p["kill"])

    def mode(self, now=None):
        lim, _ = self.limits()
        return resolve_mode(_jload(self.p["mode"]), lim, self.kill_on(), float(now or self.clock()))

    def _state(self):
        st = _jload(self.p["state"])
        return st if isinstance(st, dict) else {}

    def _db_book(self, now):
        try:
            return book_from_rows(read_db_rows(self.bot_dir, et_midnight(et_day(now)) - 40 * 86400), now) if self.bot_dir else None
        except Exception:
            return None

    # --- the gate
    def check(self, order, balance=None, now=None, note=None):
        """The decision for one order (see check_order). Books the order when it may go (live: sent; paper / dry run:
        simulated in a separate paper book). Never raises: any error -> blocked, GUARD_ERROR."""
        now = float(now or self.clock())
        try:
            with _Lock(self.p["lock"]):
                lim, _ = self.limits()
                mode, why = self.mode(now)
                st = self._state()
                key = "live" if mode == "live" else "paper"
                own = roll_book(st.get(key), now)
                book = merge_books(own, self._db_book(now)) if key == "live" else own
                d = check_order(order, lim, book, mode, now, kill=self.kill_on(), balance=balance)
                d["id"] = f"{int(now * 1000)}-{os.getpid()}-{(st.get('seq') or 0) + 1}"
                d["mode_why"] = why
                st["seq"] = (st.get("seq") or 0) + 1
                if d["ok"] and note != "manual":
                    o = dict(d["order"], _rate=lim["fee_rate"])
                    book_order(own, o, d["cost_usd"], d["id"], now)
                    if d["send"]:
                        st["sent_log"] = (st.get("sent_log") or [])[-SENT_LOG_KEEP + 1:] + [
                            {"t": int(now), "ticker": o["ticker"], "side": o["side"], "count": o["count"]}]
                elif not d["ok"]:
                    own["blocked"] = (own.get("blocked") or 0) + 1
                    st["last_block"] = {"t": int(now), "text": "; ".join(r["text"] for r in d["reasons"])[:200],
                                        "codes": [r["code"] for r in d["reasons"]]}
                own["orders"] = (own.get("orders") or 0) + (0 if note == "manual" else 1)
                st[key] = own
                st["last_check_t"] = int(now)
                st.setdefault("installed_t", int(now))
                row = self._log_row(d, now, note)
                st["intended"] = (st.get("intended") or [])[-INTENDED_KEEP + 1:] + [row]
                os.makedirs(self.home, exist_ok=True)
                _atomic(self.p["state"], st)
                self._log(row, d)
                return d
        except Exception as e:
            return {"ok": False, "send": False, "mode": "paper", "id": None, "cost_usd": None, "fee_usd": None, "ev_cents": None,
                    "order": None, "reasons": [{"code": "GUARD_ERROR", "text": f"{PLAIN['GUARD_ERROR']}: {e.__class__.__name__}"}]}

    @staticmethod
    def _log_row(d, now, note):
        o = d.get("order") or {}
        return {"t": int(now), "ticker": o.get("ticker"), "side": o.get("side"), "action": o.get("action"),
                "contracts": o.get("count"), "price": None if o.get("price_cents") is None else o["price_cents"] / 100.0,
                "cost": d.get("cost_usd"), "ev": d.get("ev_cents"), "mode": d.get("mode"), "send": bool(d.get("send")),
                "ok": bool(d.get("ok")), "why": "; ".join(r["text"] for r in d.get("reasons") or [])[:160] or None,
                **({"note": note} if note else {})}

    def _log(self, row, d):
        try:
            p = self.p["log"]
            full = {**row, "id": d.get("id"), "order": d.get("order"), "codes": [r["code"] for r in d.get("reasons") or []]}
            with open(p, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(full, separators=(",", ":"), default=str) + "\n")
            if os.path.getsize(p) > LOG_MAX_BYTES:
                with open(p, "r", encoding="utf-8") as fh:
                    lines = fh.readlines()
                with open(p, "w", encoding="utf-8") as fh:
                    fh.writelines(lines[len(lines) // 2:])
        except OSError:
            pass

    def _update(self, fn, now=None):
        now = float(now or self.clock())
        try:
            with _Lock(self.p["lock"]):
                st = self._state()
                fn(st, now)
                _atomic(self.p["state"], st)
                return True
        except Exception:
            return False

    def record_fill(self, oid, filled, avg_price_cents=None, now=None):
        """The real fill of an order the guard let through (filled contracts, average price in cents)."""
        lim, _ = self.limits()

        def fn(st, now):
            for key in ("live", "paper"):
                if oid in ((st.get(key) or {}).get("pending") or {}):
                    st[key] = fill_book(roll_book(st[key], now), oid, filled, avg_price_cents, lim["fee_rate"])
        return self._update(fn, now)

    def record_settle(self, ticker, pnl_usd, now=None, paper=None):
        """A market settled (or was sold off): its realized P&L in dollars, fees included."""
        mode, _ = self.mode(now)
        key = ("paper" if paper else "live") if paper is not None else ("live" if mode == "live" else "paper")
        return self._update(lambda st, now: st.__setitem__(key, settle_book(roll_book(st.get(key), now), ticker, pnl_usd)), now)

    # --- switches (CLI)
    def set_mode(self, mode, phrase=None, hours=None, tty=None, now=None):
        """paper / dry_run: always allowed. live: only with the exact phrase for today's ET day and the current daily stop."""
        now = float(now or self.clock())
        lim, probs = self.limits()
        if mode not in MODES:
            return False, f"unknown mode {mode!r}"
        if mode in SAFE_MODES:
            _atomic(self.p["mode"], {"mode": mode, "t": int(now), "by": "cli"})
            return True, f"{mode}: no real orders"
        if self.kill_on():
            return False, "the kill switch is on: run 'unkill' first, then arm again"
        if probs:
            return False, "fix limits.json first: " + "; ".join(probs)
        want = phrase_for(et_day(now), lim["daily_stop_usd"])
        if norm_phrase(phrase) != norm_phrase(want):
            return False, f"not armed: the phrase must be exactly: {want}"
        h = _f(hours)
        rec = {"mode": "live", "t": int(now), "day": et_day(now), "phrase": want, "limits_sha": limits_sha(lim),
               "guard_version": GUARD_VERSION, "until": int(now + h * 3600) if h and h > 0 else None, "tty": bool(tty), "by": "cli"}
        _atomic(self.p["mode"], rec)
        m, why = self.mode(now)
        return m == "live", f"LIVE: real orders within the limits ({why})"

    def kill(self, why="", now=None):
        now = float(now or self.clock())
        os.makedirs(self.home, exist_ok=True)
        with open(self.p["kill"], "w", encoding="utf-8") as fh:
            fh.write(json.dumps({"t": int(now), "why": str(why or "")[:120]}))
        _atomic(self.p["mode"], {"mode": "paper", "t": int(now), "by": "kill"})
        return True

    def unkill(self):
        try:
            os.remove(self.p["kill"])
        except FileNotFoundError:
            pass
        return True

    def set_limits(self, changes, now=None):
        raw = _jload(self.p["limits"])
        cur = raw if isinstance(raw, dict) else dict(DEFAULT_LIMITS)
        lim, probs = load_limits({**cur, **changes})
        bad = [p for p in probs if p.split(":")[0] in changes]
        if bad:
            return False, "; ".join(bad)
        before, _ = self.limits()
        armed = (_jload(self.p["mode"]) or {}).get("mode") == "live"
        _atomic(self.p["limits"], lim)
        changed = limits_sha(before) != limits_sha(lim)
        return True, "limits saved" + (": LIVE is off until you type the phrase again" if changed and armed else "")

    # --- what the phone sees
    def public(self, now=None, alerts_vm=None):
        """The risk block of kalshi.json: numbers and fixed words only (the status script cleans it again)."""
        now = float(now or self.clock())
        lim, probs = self.limits()
        mode, why = self.mode(now)
        st = self._state()
        key = "live" if mode == "live" else "paper"
        book = roll_book(st.get(key), now)
        if key == "live":
            book = merge_books(book, self._db_book(now))
        rec = _jload(self.p["mode"]) or {}
        kill = _jload(self.p["kill"]) if self.kill_on() else None
        stop_room = round(lim["daily_stop_usd"] + book["pnl_usd"], 2)
        ug = []
        try:
            if self.bot_dir and st.get("installed_t"):
                ug = unguarded(read_db_rows(self.bot_dir, st["installed_t"]), st.get("sent_log") or [], st["installed_t"])
        except Exception:
            ug = []
        if alerts_vm is None:
            alerts_vm = bool((_jload(self.p["ntfy"]) or {}).get("topic"))
        out = {"v": 1, "mode": mode, "why": why, "kill": bool(self.kill_on()),
               "kill_t": (kill or {}).get("t") if isinstance(kill, dict) else None,
               "connected": bool(st.get("last_check_t")), "last_check_t": st.get("last_check_t"),
               "installed_t": st.get("installed_t"), "armed_t": rec.get("t") if mode == "live" else None,
               "until": rec.get("until") if mode == "live" else None, "version": GUARD_VERSION,
               "limits": {k: lim[k] for k in ("max_order_usd", "max_order_pct_balance", "max_market_usd", "max_day_usd",
                                              "daily_stop_usd", "max_open_usd", "max_orders_day", "no_trade_last_s",
                                              "max_over_fair_cents", "min_edge_cents", "fee_rate")},
               "limits_ok": not probs,
               "today": {"day": book["day"], "spend": round(book["spend_usd"], 2), "pnl": round(book["pnl_usd"], 2),
                         "orders": book.get("orders") or 0, "sent": book.get("sent") or 0, "blocked": book.get("blocked") or 0},
               "open": round(open_usd(book), 2),
               "room": {"day": round(max(0.0, lim["max_day_usd"] - book["spend_usd"]), 2), "stop": max(0.0, stop_room),
                        "open": round(max(0.0, lim["max_open_usd"] - open_usd(book)), 2)},
               "stopped": stop_room <= 1e-9, "unguarded": len(ug), "alerts_vm": bool(alerts_vm),
               "last_block": {k: (st.get("last_block") or {}).get(k) for k in ("t", "text")} if st.get("last_block") else None,
               "intended": [{k: r.get(k) for k in ("t", "ticker", "side", "action", "contracts", "price", "cost", "send", "why")}
                            for r in reversed(st.get("intended") or [])],
               "go_live": phrase_for(et_day(now), lim["daily_stop_usd"]) if mode != "live" else None}
        return out


_DEFAULT = {}


def default_guard():
    """One Guard per process (home: $KALSHI_GUARD_HOME or ~/kalshi_jarvis/guard)."""
    if "g" not in _DEFAULT:
        _DEFAULT["g"] = Guard()
    return _DEFAULT["g"]


def _filled_from(resp, count):
    """The filled contracts in the bot's own order response, when it says (Kalshi: order.fill_count); else None."""
    o = resp.get("order") if isinstance(resp, dict) and isinstance(resp.get("order"), dict) else resp
    if not isinstance(o, dict):
        return None
    for k in ("fill_count", "filled", "filled_count"):
        x = _f(o.get(k))
        if x is not None:
            return max(0, min(int(x), int(count)))
    return None


def guarded_send(order, send, balance=None, guard=None):
    """The one-line way in: check `order`; call `send()` (the bot's own create-order call, no arguments) ONLY when the
    guard says send; book the fill from its answer when it carries one. -> (decision, response or None).
    In paper / dry run, or when any check fails, send() is never called."""
    g = guard or default_guard()
    d = g.check(order, balance=balance)
    if not d.get("send"):
        return d, None
    resp = send()
    n = _filled_from(resp, d["order"]["count"])
    if n is not None:
        g.record_fill(d["id"], n)
    return d, resp


def feed_alerts(risk, now=None):
    """The risk block -> alert rows for kalshi.json (t, level, text), most serious first."""
    now = int(now or time.time())
    if not isinstance(risk, dict):
        return []
    out = []
    if risk.get("unguarded"):
        out.append({"t": now, "level": "bad", "text": f"{risk['unguarded']} real order(s) did not go through the risk guard"})
    if risk.get("kill"):
        out.append({"t": int(risk.get("kill_t") or now), "level": "bad", "text": "Kill switch on: the bot places no orders"})
    if risk.get("stopped"):
        out.append({"t": now, "level": "bad", "text": f"Daily stop-loss hit (${(risk.get('limits') or {}).get('daily_stop_usd', 0):g}): "
                                                     "no new buys until tomorrow ET"})
    if not risk.get("connected"):
        out.append({"t": now, "level": "warn", "text": "Risk guard installed, but the bot has not asked it about an order yet"})
    if risk.get("limits_ok") is False:
        out.append({"t": now, "level": "warn", "text": "limits.json has a bad value: the default is used for it"})
    lb = risk.get("last_block") or {}
    if lb.get("t") and now - int(lb["t"]) < 3600:
        out.append({"t": int(lb["t"]), "level": "info", "text": "Guard blocked an order: " + str(lb.get("text") or "")[:120]})
    if risk.get("mode") == "dry_run":
        out.append({"t": now, "level": "info", "text": "Dry run: orders are logged, none is sent"})
    return out


# ------------------------------------------------------------------------------------------------- phone alerts (ntfy)
def _tid(r):
    return "|".join(str(r.get(k)) for k in ("t", "ticker", "side", "action", "contracts", "price"))


def events(prev, cur):
    """Two kalshi.json payloads (the last one alerted on, the new one) -> messages [{key, title, body, priority, tags}].
    Fills, settled losses, the kill switch, the daily stop, the mode, orders around the guard, a bot in trouble."""
    msgs = []
    if not isinstance(cur, dict):
        return msgs
    prev = prev if isinstance(prev, dict) else {}
    pr, cr = prev.get("risk") or {}, cur.get("risk") or {}
    seen = {_tid(r) for r in prev.get("trades") or [] if isinstance(r, dict)}
    settled = {_tid(r) for r in prev.get("trades") or [] if isinstance(r, dict) and r.get("pnl") is not None}
    for r in reversed([r for r in cur.get("trades") or [] if isinstance(r, dict)]):
        k = _tid(r)
        what = f"{str(r.get('action') or 'buy').upper()} {r.get('contracts') or '?'} {str(r.get('side') or '').upper()} " \
               f"@ {round((_f(r.get('price')) or 0) * 100)}c {r.get('title') or r.get('ticker') or ''}".strip()
        if k not in seen:
            msgs.append({"key": "fill:" + k, "title": "Kalshi fill", "body": what, "priority": "default", "tags": "moneybag"})
        pnl = _f(r.get("pnl"))
        if pnl is not None and k not in settled and pnl < -0.005:
            msgs.append({"key": "loss:" + k, "title": f"Kalshi loss -${-pnl:,.2f}", "body": what, "priority": "high", "tags": "small_red_triangle_down"})
    if cr.get("kill") and not pr.get("kill"):
        msgs.append({"key": f"kill:{cr.get('kill_t')}", "title": "Kalshi KILL SWITCH ON", "body": "The bot places no orders.",
                     "priority": "urgent", "tags": "octagonal_sign"})
    if pr.get("kill") and not cr.get("kill") and cr:
        msgs.append({"key": f"unkill:{cur.get('t')}", "title": "Kalshi kill switch off", "body": "Still paper until you arm live.",
                     "priority": "default", "tags": "white_check_mark"})
    if cr.get("stopped") and not pr.get("stopped"):
        msgs.append({"key": f"stop:{(cr.get('today') or {}).get('day')}", "title": "Kalshi daily stop hit",
                     "body": f"Down ${-(_f((cr.get('today') or {}).get('pnl')) or 0):,.2f} today: no new buys until tomorrow ET.",
                     "priority": "high", "tags": "warning"})
    if cr.get("mode") and pr.get("mode") and cr["mode"] != pr["mode"]:
        live = cr["mode"] == "live"
        msgs.append({"key": f"mode:{cr['mode']}:{cur.get('t')}", "title": "Kalshi LIVE: real money" if live else f"Kalshi now {cr['mode'].replace('_', ' ')}",
                     "body": str(cr.get("why") or "")[:140], "priority": "high" if live else "default", "tags": "rotating_light" if live else "pause_button"})
    if (cr.get("unguarded") or 0) > (pr.get("unguarded") or 0):
        msgs.append({"key": f"unguarded:{cr['unguarded']}", "title": "Kalshi order outside the guard",
                     "body": "A real order did not go through the risk guard. Check the bot.", "priority": "urgent", "tags": "rotating_light"})
    pbad = {a.get("text") for a in prev.get("alerts") or [] if isinstance(a, dict) and a.get("level") == "bad"}
    for a in cur.get("alerts") or []:
        if isinstance(a, dict) and a.get("level") == "bad" and a.get("text") not in pbad and "guard" not in str(a.get("text")).lower() \
                and "kill switch" not in str(a.get("text")).lower() and "stop-loss" not in str(a.get("text")).lower():
            msgs.append({"key": f"bad:{et_day(_f(cur.get('t')) or time.time())}:" + str(a.get("text"))[:80], "title": "Kalshi bot: needs you", "body": str(a.get("text"))[:160],
                         "priority": "high", "tags": "warning"})
    return msgs


def ntfy_post(base, topic, body, title=None, priority=None, tags=None, opener=None, timeout=15):
    """POST one message to ntfy (free, no account). -> (ok, why). The topic is never printed by this function."""
    url = f"{str(base or 'https://ntfy.sh').rstrip('/')}/{topic}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", str(topic or "")):
        return False, "bad ntfy topic"
    h = {"User-Agent": "kalshi-guard/1"}
    if title:
        h["Title"] = str(title).encode("ascii", "replace").decode()[:120]
    if priority:
        h["Priority"] = str(priority)
    if tags:
        h["Tags"] = str(tags)
    req = urllib.request.Request(url, data=str(body).encode("utf-8"), headers=h, method="POST")
    try:
        with (opener or urllib.request.urlopen)(req, timeout=timeout) as r:
            return 200 <= getattr(r, "status", 200) < 300, "ok"
    except Exception as e:
        return False, f"ntfy: {e.__class__.__name__}"


def _load_status_module(here=None):
    here = here or os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "kalshi_status_vm.py")
    spec = importlib.util.spec_from_file_location("kalshi_status_vm_for_guard", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def notify(feed, home=None, post=None, dry=False, say=print, topic=None, base=None):
    """One alert round on a kalshi.json payload: compare with the last payload alerted on, send what is new.
    The first round only records (no flood of old trades). -> number sent. topic / base override guard/ntfy.json
    (the PC passes its own topic)."""
    g = Guard(home, bot_dir="")
    cfg = _jload(g.p["ntfy"]) or {}
    topic = str(topic if topic is not None else cfg.get("topic") or "").strip()
    base = str(base or cfg.get("ntfy") or "https://ntfy.sh")
    st = _jload(g.p["notify"]) or {}
    prev = st.get("prev")
    now = time.time()
    retry = [m for m in st.get("retry") or [] if isinstance(m, dict) and now - (_f(m.get("t0")) or 0) < 6 * 3600]
    msgs = retry + (events(prev, feed) if prev else [])
    sent_keys = set(st.get("sent") or [])
    n, failed = 0, []
    for m in msgs:
        if m["key"] in sent_keys:
            continue
        if dry or not topic:
            say(f"[{'dry' if dry else 'no topic'}] {m['title']}: {m['body']}")
            sent_keys.add(m["key"])
            continue
        ok, why = (post or ntfy_post)(base, topic, m["body"], title=m["title"], priority=m.get("priority"), tags=m.get("tags"))
        if ok:
            n += 1
            sent_keys.add(m["key"])
        else:
            say(f"alert not sent ({why}): {m['title']}")
            if all(m["key"] != x["key"] for x in failed):
                failed.append({**m, "t0": m.get("t0") or now})
    keep = {"t": feed.get("t"), "trades": feed.get("trades") or [], "alerts": feed.get("alerts") or [], "risk": feed.get("risk") or {}}
    if not dry:
        os.makedirs(g.home, exist_ok=True)
        _atomic(g.p["notify"], {"prev": keep, "sent": sorted(sent_keys)[-500:], "retry": failed[-20:], "t": int(now)})
    return n


# ------------------------------------------------------------------------------------------------- self-test
def selftest():
    ok = []
    ok.append(fee_cents(50) == 2 and fee_cents(1) == 1 and fee_cents(99) == 1 and fee_cents(90) == 1 and fee_cents(30) == 2)
    ok.append(order_fee_cents(50, 10) == 20)
    lim = dict(DEFAULT_LIMITS)
    b = empty_book(et_day(1_800_000_000))
    good = {"ticker": "KXTEST-1", "side": "yes", "action": "buy", "count": 5, "price_cents": 40, "fair": 0.5,
            "close_ts": 1_800_000_000 + 3600}
    d = check_order(good, lim, b, "paper", 1_800_000_000)
    ok.append(d["ok"] and not d["send"])
    ok.append(check_order(good, lim, b, "live", 1_800_000_000)["send"])
    ok.append(not check_order(good, lim, b, "live", 1_800_000_000, kill=True)["send"])
    ok.append(not check_order({**good, "count": 50}, lim, b, "live", 1_800_000_000)["send"])
    ok.append(resolve_mode(None, lim, False, 0)[0] == "paper")
    return all(ok), f"{sum(ok)}/{len(ok)}"


# ------------------------------------------------------------------------------------------------- command line
def _card(g, now=None):
    pub = g.public(now)
    lim = pub["limits"]
    t = pub["today"]
    lines = [f"mode: {pub['mode'].upper().replace('_', ' ')} ({pub['why']})",
             f"kill switch: {'ON' if pub['kill'] else 'off'}   bot connected: {'yes' if pub['connected'] else 'not yet'}",
             f"limits: ${lim['max_order_usd']:g}/order, ${lim['max_market_usd']:g}/market, ${lim['max_day_usd']:g}/day, "
             f"stop -${lim['daily_stop_usd']:g}/day, ${lim['max_open_usd']:g} open, {lim['max_orders_day']} orders/day, "
             f"no buys in the last {lim['no_trade_last_s']} s",
             f"today {t['day']}: spent ${t['spend']:.2f}, P&L ${t['pnl']:+.2f}, {t['sent']} sent, {t['blocked']} blocked; "
             f"open ${pub['open']:.2f}; loss room ${pub['room']['stop']:.2f}" + ("  STOPPED for today" if pub["stopped"] else "")]
    if pub["unguarded"]:
        lines.append(f"WARNING: {pub['unguarded']} real order(s) skipped the guard")
    if pub.get("go_live"):
        lines.append(f"to go live, the owner types: python3 kalshi_guard.py live   (phrase: {pub['go_live']})")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="kalshi_guard.py", description="Kalshi risk guard: limits, paper/live switch, kill switch.")
    ap.add_argument("--home", default=None, help="guard folder (default ~/kalshi_jarvis/guard or $KALSHI_GUARD_HOME)")
    ap.add_argument("--bot-dir", default=None, help="the bot's folder with trades.db (default /home/ubuntu/kalshi)")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("status")
    sub.add_parser("init")
    sub.add_parser("public")
    sub.add_parser("selftest")
    sp = sub.add_parser("limits")
    sp.add_argument("--set", nargs="*", default=None, metavar="KEY=VALUE")
    sp = sub.add_parser("live")
    sp.add_argument("--phrase", default=None)
    sp.add_argument("--hours", type=float, default=None)
    sub.add_parser("paper")
    sub.add_parser("dry-run")
    sp = sub.add_parser("kill")
    sp.add_argument("why", nargs="*")
    sub.add_parser("unkill")
    sp = sub.add_parser("check")
    sp.add_argument("--order", required=True)
    sp.add_argument("--balance", type=float, default=None)
    sp = sub.add_parser("notify")
    sp.add_argument("--from-bot", default=None)
    sp.add_argument("--feed", default=None, help="a kalshi.json file instead of the bot's files")
    sp.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    g = Guard(a.home, bot_dir=a.bot_dir)
    cmd = a.cmd or "status"
    if cmd == "selftest":
        good, n = selftest()
        print(f"selftest {'OK' if good else 'FAILED'} ({n})")
        return 0 if good else 1
    if cmd == "init":
        g.init()
        print(f"guard ready in {g.home}\n" + _card(g))
        return 0
    if cmd == "status":
        print(_card(g))
        return 0
    if cmd == "public":
        print(json.dumps(g.public(), indent=1))
        return 0
    if cmd == "limits":
        if a.set:
            try:
                ok, msg = g.set_limits(parse_set(a.set))
            except ValueError as e:
                ok, msg = False, str(e)
            print(msg)
            if not ok:
                return 1
        lim, probs = g.limits()
        print(json.dumps(lim, indent=1))
        for p in probs:
            print("problem:", p)
        return 0
    if cmd == "live":
        lim, _ = g.limits()
        want = phrase_for(et_day(time.time()), lim["daily_stop_usd"])
        phrase, tty = a.phrase, False
        if phrase is None:
            print(_card(g))
            print("\nREAL MONEY. The bot may then lose up to the daily stop each day, within the limits above.")
            if not sys.stdin.isatty():
                print(f"not armed: type it yourself:  python3 kalshi_guard.py live --phrase \"{want}\"")
                return 1
            tty = True
            phrase = input(f"Type exactly  {want}  and press Enter: ")
        ok, msg = g.set_mode("live", phrase=phrase, hours=a.hours, tty=tty)
        print(msg)
        return 0 if ok else 1
    if cmd in ("paper", "dry-run"):
        ok, msg = g.set_mode("paper" if cmd == "paper" else "dry_run")
        print(msg)
        return 0 if ok else 1
    if cmd == "kill":
        g.kill(" ".join(a.why))
        print("KILL SWITCH ON: every order is blocked, live is disarmed. 'unkill' lifts it (the bot stays paper).")
        return 0
    if cmd == "unkill":
        g.unkill()
        print("kill switch off: still " + g.mode()[0] + " (arm live again with the phrase if you want real money)")
        return 0
    if cmd == "check":
        try:
            order = json.loads(a.order)
        except ValueError:
            print("--order must be JSON")
            return 2
        d = g.check(order, balance=a.balance, note="manual")
        print(json.dumps({k: d.get(k) for k in ("ok", "send", "mode", "cost_usd", "fee_usd", "ev_cents", "reasons")}, indent=1))
        return 0
    if cmd == "notify":
        if a.feed:
            feed = _jload(a.feed)
        else:
            mod = _load_status_module()
            feed = mod.bot_payload(a.from_bot or DEFAULT_BOT_DIR)
        if not isinstance(feed, dict):
            print("no feed")
            return 1
        n = notify(feed, home=a.home, dry=a.dry)
        if n:
            print(f"{n} alert(s) sent")
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
