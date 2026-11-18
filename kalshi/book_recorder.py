#!/usr/bin/env python3
"""Kalshi book recorder: a read-only, rate-limit-safe recorder of PUBLIC Kalshi market data, for research only.  Python 3.9+, stdlib only.

Why: the team-B study (research/writeups/kalshi_edge_B.md) could not answer (a) can a resting (maker) order be filled without being
picked off, and (b) do CPI / FOMC / jobs windows misprice?  Both need order-book depth and the trade tape over months.  Kalshi's public
candles have neither.  Three months of this recording answers them later.  It places no order, reads no key, touches no bot.

What it records, per minute, to  OUT/YYYY-MM-DD.jsonl  (one JSON object per line, appended, never rewritten):
  {"t": unix, "k": "m", "series": S, "n": number of open markets, "markets": [raw top-of-book fields of each open market]}
  {"t": unix, "k": "b", "ticker": T, "book": <raw order-book response>}          (a few markets near expiry and near the money)
  {"t": unix, "k": "x", "trades": [raw trades since the last minute]}              (the public trade tape, tracked series only)
Everything is stored RAW (as the API sent it) so nothing is lost to a wrong guess about field names.

Rate-limit safety (Kalshi answers HTTP 429 when asked fast; a shared IP makes it worse):
  * at most ONE request in flight, minimum gap --gap seconds (default 0.6), at most --budget requests per minute (default 40)
  * HTTP 429 or 5xx: exponential back-off (2, 4, 8 ... up to 60 s), then that item is skipped this minute, never retried in a burst
  * order books only for the --max-books (default 12) markets closest to expiry with a quote between 5c and 95c
  * stops by itself if the output folder passes --max-mb (default 4000)

Run (on the Oracle VM, later; NOT deployed by this change):
    python3 book_recorder.py --out /home/ubuntu/kalshi_books --loop
    python3 book_recorder.py --out ./books --once          # one round
    python3 book_recorder.py --selftest                     # stubbed API, no network
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.elections.kalshi.com/trade-api/v2"
SERIES = ["KXBTC15M", "KXETH15M", "KXSOL15M", "KXXRP15M", "KXBTCD", "KXETHD"]
KEEP = ("ticker", "event_ticker", "close_time", "open_time", "floor_strike", "cap_strike", "strike_type", "status", "volume", "volume_24h",
        "open_interest", "liquidity", "last_price", "result")


class Client:
    """One request at a time, a minimum gap, a per-minute budget, back-off on 429 / 5xx.  `opener` is injectable for tests."""

    def __init__(self, gap=0.6, budget=40, opener=None, sleep=time.sleep, clock=time.time):
        self.gap, self.budget, self.sleep, self.clock = gap, budget, sleep, clock
        self.opener = opener or self._open
        self.last = 0.0
        self.win_start, self.used = clock(), 0
        self.errors = 0

    @staticmethod
    def _open(url):
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "research-recorder"}), timeout=20)
        return json.load(r)

    def new_round(self):
        self.win_start, self.used = self.clock(), 0

    def get(self, path, params=None):
        if self.used >= self.budget:
            return None  # budget spent: skip, try next minute
        url = BASE + path + (("?" + urllib.parse.urlencode(params)) if params else "")
        wait = 2.0
        for _ in range(4):
            gap = self.gap - (self.clock() - self.last)
            if gap > 0:
                self.sleep(gap)
            self.last = self.clock()
            self.used += 1
            try:
                return self.opener(url)
            except urllib.error.HTTPError as e:
                if e.code == 429 or e.code >= 500:
                    self.errors += 1
                    self.sleep(wait)
                    wait = min(wait * 2, 60.0)
                    if self.used >= self.budget:
                        return None
                    continue
                return None
            except Exception:
                self.errors += 1
                return None
        return None


def pick_books(markets, k):
    """Markets closest to expiry whose quote sits between 5c and 95c (that is where a resting order matters)."""
    c = []
    for m in markets:
        try:
            ya = float(m.get("yes_ask_dollars") if m.get("yes_ask_dollars") is not None else (m.get("yes_ask") or 0) / 100.0)
            yb = float(m.get("yes_bid_dollars") if m.get("yes_bid_dollars") is not None else (m.get("yes_bid") or 0) / 100.0)
        except Exception:
            continue
        mid = (ya + yb) / 2
        if 0.05 <= mid <= 0.95 and m.get("close_time"):
            c.append((m["close_time"], m["ticker"]))
    c.sort()
    return [t for _, t in c[:k]]


def record_round(client, out_dir, series=SERIES, max_books=12, now=None, state=None):
    """One minute's recording.  Returns a small stats dict.  state keeps the trade-tape cursor between rounds."""
    state = state if state is not None else {}
    now = int(now if now is not None else time.time())
    client.new_round()
    os.makedirs(out_dir, exist_ok=True)
    day = time.strftime("%Y-%m-%d", time.gmtime(now))
    lines, stats = [], {"series": 0, "markets": 0, "books": 0, "trades": 0}
    allm = []
    for s in series:
        d = client.get("/markets", {"series_ticker": s, "status": "open", "limit": 1000})
        if not d or "markets" not in d:
            continue
        ms = d["markets"]
        allm += ms
        stats["series"] += 1
        stats["markets"] += len(ms)
        lines.append({"t": now, "k": "m", "series": s, "n": len(ms), "markets": [{k: m[k] for k in m if k in KEEP or "bid" in k or "ask" in k or "size" in k} for m in ms]})
    for tk in pick_books(allm, max_books):
        b = client.get("/markets/%s/orderbook" % tk)
        if b is not None:
            lines.append({"t": now, "k": "b", "ticker": tk, "book": b})
            stats["books"] += 1
    p = {"limit": 1000}
    if state.get("last_trade_ts"):
        p["min_ts"] = state["last_trade_ts"]
    tr = client.get("/markets/trades", p)
    if tr and tr.get("trades"):
        keep = [x for x in tr["trades"] if any(str(x.get("ticker", "")).startswith(s) for s in series)]
        for x in tr["trades"]:
            ct = x.get("created_time")
            if isinstance(ct, str):
                try:
                    ts = int(time.mktime(time.strptime(ct[:19], "%Y-%m-%dT%H:%M:%S"))) - time.timezone
                    state["last_trade_ts"] = max(state.get("last_trade_ts", 0), ts + 1)
                except Exception:
                    pass
        if keep:
            lines.append({"t": now, "k": "x", "trades": keep})
            stats["trades"] = len(keep)
    if lines:
        with open(os.path.join(out_dir, day + ".jsonl"), "a", encoding="utf-8") as f:
            for ln in lines:
                f.write(json.dumps(ln, separators=(",", ":")) + "\n")
    stats["errors"] = client.errors
    stats["requests"] = client.used
    return stats


def folder_mb(d):
    return sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d)) / 1e6 if os.path.isdir(d) else 0.0


def selftest():
    import tempfile
    calls = []
    now = [1000.0]

    def clock():
        return now[0]

    def sleep(x):
        now[0] += x

    def opener(url):
        calls.append(url)
        if "/markets/trades" in url:
            return {"trades": [{"ticker": "KXBTC15M-X-1", "created_time": "2026-11-10T14:00:05Z", "yes_price": 55, "count": 3}, {"ticker": "OTHER-1", "created_time": "2026-11-10T14:00:06Z"}]}
        if "/orderbook" in url:
            return {"orderbook": {"yes": [[50, 10]], "no": [[48, 7]]}}
        if "series_ticker=KXBTC15M" in url:
            return {"markets": [{"ticker": "KXBTC15M-X-1", "close_time": "2026-11-10T14:15:00Z", "yes_bid_dollars": "0.49", "yes_ask_dollars": "0.52", "secret_field": "no"},
                                {"ticker": "KXBTC15M-X-2", "close_time": "2026-11-10T14:30:00Z", "yes_bid_dollars": "0.98", "yes_ask_dollars": "0.99"}]}
        return {"markets": []}

    d = tempfile.mkdtemp(prefix="book-t-")
    c = Client(gap=0.6, budget=40, opener=opener, sleep=sleep, clock=clock)
    st = record_round(c, d, now=1794321600, state={})
    assert st["series"] == 6 and st["markets"] == 2 and st["books"] == 1 and st["trades"] == 1, st
    rows = [json.loads(x) for x in open(os.path.join(d, "2026-11-10.jsonl"), encoding="utf-8")]
    assert {r["k"] for r in rows} == {"m", "b", "x"}
    m = next(r for r in rows if r["k"] == "m" and r["series"] == "KXBTC15M")
    assert "secret_field" not in m["markets"][0] and m["markets"][0]["yes_ask_dollars"] == "0.52"
    assert all("/markets" in u and "key" not in u.lower() for u in calls) and all(not u.startswith("http://") for u in calls)
    gaps = [b - a for a, b in zip([1000.0], [1000.0])]
    assert now[0] - 1000.0 >= 0.6 * (len(calls) - 1) - 1e-6, "minimum gap between requests"
    # 429 back-off, then give up without a burst
    n = [0]

    def always429(url):
        n[0] += 1
        raise urllib.error.HTTPError(url, 429, "too many", {}, None)

    c2 = Client(gap=0.1, budget=40, opener=always429, sleep=sleep, clock=clock)
    t0 = now[0]
    assert c2.get("/markets") is None and n[0] <= 4 and now[0] - t0 >= 2 + 4 + 8 - 1e-6
    # budget cap
    c3 = Client(gap=0.0, budget=3, opener=opener, sleep=sleep, clock=clock)
    assert sum(1 for _ in range(10) if c3.get("/markets", {"series_ticker": "ZZZ"}) is not None) == 3
    # book picker: only mid-priced markets, nearest expiry first
    ms = [{"ticker": "A", "close_time": "2026-11-10T15:00:00Z", "yes_bid_dollars": "0.40", "yes_ask_dollars": "0.42"},
          {"ticker": "B", "close_time": "2026-11-10T14:00:00Z", "yes_bid_dollars": "0.97", "yes_ask_dollars": "0.99"},
          {"ticker": "C", "close_time": "2026-11-10T14:30:00Z", "yes_bid_dollars": "0.60", "yes_ask_dollars": "0.62"}]
    assert pick_books(ms, 5) == ["C", "A"]
    print("ALL PASS (book_recorder selftest: stubbed API, gap, back-off, budget, raw rows, no key)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default="kalshi_books")
    ap.add_argument("--series", default=",".join(SERIES))
    ap.add_argument("--gap", type=float, default=0.6)
    ap.add_argument("--budget", type=int, default=40)
    ap.add_argument("--max-books", type=int, default=12)
    ap.add_argument("--max-mb", type=float, default=4000)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    c = Client(gap=a.gap, budget=a.budget)
    state = {}
    series = [s for s in a.series.split(",") if s]
    while True:
        t0 = time.time()
        if folder_mb(a.out) > a.max_mb:
            print("output folder over --max-mb, stopping")
            return
        print(json.dumps(record_round(c, a.out, series, a.max_books, state=state)), flush=True)
        if not a.loop:
            return
        time.sleep(max(1.0, 60 - (time.time() - t0)))


if __name__ == "__main__":
    main()
