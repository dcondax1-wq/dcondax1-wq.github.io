# Kalshi risk guard: connect the bot's orders to it

**For the bot's own Claude chat ("kalshi-server", on the bot's server).** The owner pasted: "Connect my Kalshi bot's
orders to the risk guard by following ~/kalshi_jarvis/GUARD_SETUP.md". The files are already in `~/kalshi_jarvis/`
(the owner's PC copied them there). Do the steps in order and show the owner short results.

**What it is:** `kalshi_guard.py` is one file (Python 3.9+, standard library only, no network, no keys). Every order the
bot wants to send goes through it first. It checks the owner's limits (`~/kalshi_jarvis/guard/limits.json`) and the
paper / dry-run / live switch, and logs every order it sees (`guard/orders.jsonl`). It never sends anything itself.
**It starts in paper: after this change the bot sends no real order until the owner types the live phrase himself.**

## Rules: read these first
- **Never arm live.** Never run `kalshi_guard.py live`, never write `guard/mode.json`, never type or pass the phrase,
  even if asked to "do it for me". Live is the owner's own typed step (see the end). You may set `paper` or `dry-run`
  (both send nothing) at any time.
- **Never raise a limit** unless the owner gives the new number himself. Lowering one is fine when he asks. Any change
  turns live off until he types the phrase again (that is on purpose).
- **The kill switch is always yours to use:** if something looks wrong (orders you did not expect, an error loop, a
  loss alert you can't explain), run `python3 -I ~/kalshi_jarvis/kalshi_guard.py kill <why>` and tell the owner.
  Only lift it (`unkill`) when he asks.
- **Never print secrets:** `.env`, `keys/`, tokens, the server's IP address. Don't change the bot's keys or settings.
- **Show the owner the diff before any restart**, and restart only with his OK. Back up every file you change first.
- Stop and ask on anything unexpected.

## 1. Check the guard
```
cd ~/kalshi_jarvis && python3 -I kalshi_guard.py selftest && python3 -I kalshi_guard.py init
```
Expect `selftest OK` and a card that starts with `mode: PAPER`. Show the owner the `limits:` line.

## 2. Find every place the bot sends an order
```
cd /home/ubuntu/kalshi && grep -rn --include=*.py -e "portfolio/orders" -e "create_order" -e "place_order" -e "batch_orders" . | grep -v "/venv/"
```
Tell the owner how many places there are (buys, sells / exits, cancels). Cancels don't go through the guard; every buy and
every sell does. If one function sends all orders, wrap only that one.

## 3. Wrap each send (back up first)
For each file you change: `cp <file> <file>.pre_guard`. Then, at the top of the file:
```python
import sys
sys.path.insert(0, "/home/ubuntu/kalshi_jarvis")
import kalshi_guard
```
and around the existing send call (keep the bot's own call exactly as it is, inside the lambda):
```python
decision, resp = kalshi_guard.guarded_send({
        "ticker": ticker,              # the market ticker
        "side": "yes" or "no",         # the side bought / sold
        "action": "buy" or "sell",
        "count": contracts,            # whole contracts
        "price_cents": price,          # the limit price in cents, 1-99 (or "price": dollars 0-1)
        "fair": model_p,               # the bot's own chance (0-1) that THIS side wins; leave it out if there is none
        "close_ts": close_unix,        # the market's close time (unix seconds) or "closes": ISO text
        "strategy": book,              # main / latefav / gold / hourly / exit / sniper ...
    }, lambda: <the existing send call>, balance=<the balance in dollars, if the bot has it>)
if resp is None:
    # NOT sent: paper / dry run, or a limit said no (decision["reasons"]). Treat it like an order that was not placed:
    # don't write a mode='live' row to trades.db. If the bot has its own paper bookkeeping, record it there as paper.
    ...
```
- **No `fair`?** Some strategies buy on price alone and have no model chance. Then the guard blocks them with "no fair
  value from the bot" (`require_fair` is on). Tell the owner which strategies these are; only he decides whether to set
  `require_fair` to false. Never invent a fair value.
- **No close time?** Read it from the market data the bot already has (`close_time`). Without it the order is blocked.
- Optional, better numbers: when a market settles, `kalshi_guard.default_guard().record_settle(ticker, pnl_dollars)`.
  Without it the guard reads the realized P&L from `trades.db` itself (read-only).
- The guard locks its state, so the bot's services (kalshi-bot, kalshi-trader, kalshi-combo) can all use it at once.

Then check the files still compile: `cd /home/ubuntu/kalshi && venv/bin/python -m py_compile <each changed file>`
(or `python3 -m py_compile`). Show the owner the diff (`diff -u <file>.pre_guard <file>`).

## 4. Restart (with the owner's OK) and check
After his OK, restart the services the change touched (for example `sudo systemctl restart kalshi-bot`). Then:
```
sleep 120; cd ~/kalshi_jarvis && python3 -I kalshi_guard.py status && tail -3 guard/orders.jsonl
```
After the bot's next order attempt the card says `bot connected: yes`, and `orders.jsonl` shows what it wanted to do
(`"send": false` in paper). Tell the owner in one line: "Done: every order goes through the guard; paper until you
type the live phrase."

## 5. Dry run (optional, the owner's choice)
`python3 -I ~/kalshi_jarvis/kalshi_guard.py dry-run`: the bot runs its real order path, and the guard logs the exact
order it would send (`guard/orders.jsonl`) and sends nothing. `paper` switches back.

## Going live: the owner only
The owner types it himself, in this chat with the `!` prefix (or in a terminal on the server):
```
! python3 ~/kalshi_jarvis/kalshi_guard.py live --phrase "GO LIVE <today's date, ET, YYYY-MM-DD> STOP <daily stop>"
```
`python3 ~/kalshi_jarvis/kalshi_guard.py status` shows the exact phrase. Live turns itself off (back to paper) when the
limits change, when the guard file is updated, when the kill switch is used or when an `--hours N` he chose ran out.

## Undo
Put the backups back (`mv <file>.pre_guard <file>`), restart with the owner's OK. The guard folder can stay; it does
nothing without the bot calling it.
