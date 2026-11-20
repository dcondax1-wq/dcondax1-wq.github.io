# Jarvis for the Kalshi bot: setup

**For the bot's own Claude chat ("kalshi-server", on the bot's server).** The owner pasted: "Set up Jarvis for my Kalshi
bot by following this page", maybe with `(sha256 <hex>)` at the end. Do the steps below in order. Each step is a few
shell commands. Show the owner the short results. Step 3 needs two clicks from him on GitHub.

**What it does:** a small script reads the bot's own files every minute and publishes the numbers to his phone app
(Jarvis): the balance, P&L for today, this week and all time, open bets, the last trades, the three strategies and the
24 h equity curve. It pushes one small JSON file to its own public repo, `demetrades2000-coder/kalshi-feed`. Nothing
else is written anywhere.

## Rules: read these first
- **Never touch trading.** Don't edit, restart, stop or reconfigure any `kalshi-*` service, cron job, settings file
  (`bot_settings.json`, `combo_settings.json`, `sniper_settings.json`, ...), `paused.txt`, `trades.db` or any other bot
  file. Don't import the bot's Python modules.
- **Never print secrets.** That means `.env`, `.env2`, `keys/`, the Discord token, the dashboard token or URL, and the
  server's IP address. The only thing you show the owner from step 3 is the deploy key's PUBLIC line (it starts with
  `ssh-ed25519`).
- **The deploy key goes on `kalshi-feed` only.** Never add it to `nq-dashboard` (his phone app) or any other repo.
- **No Kalshi API calls.** The script only reads files: `trades.db` (opened read-only), `account_truth.json`,
  `autotrader_status.json`, `autotune_state.json`, the three settings files and `paused.txt`.
  It never opens `.env`, `keys/` or `sniper.db`.
- **Everything new goes in `~/kalshi_jarvis`.** Nothing in `/home/ubuntu/kalshi` changes. The script runs once a
  minute at low priority (`nice`/`ionice`), and a run takes well under a second. Cron always runs the copy you fetch
  here; it never updates itself.
- **Stop and ask the owner on anything unexpected:** a missing file, an error you don't understand, a hash that doesn't
  match, or a step that would need `sudo` or a change to the bot.

## 1. Get the script and check it
```
mkdir -p ~/kalshi_jarvis && cd ~/kalshi_jarvis
curl -fsSL https://dcondax1-wq.github.io/kalshi/kalshi_status_vm.py -o ~/kalshi_jarvis/kalshi_status_vm.py
python3 --version && git --version && sha256sum kalshi_status_vm.py
```
**If the owner's message includes `sha256 <hex>`, check it and stop on a mismatch.** Put his hex in place of `<hex>`
(two spaces before the file name):
```
cd ~/kalshi_jarvis && echo "<hex>  kalshi_status_vm.py" | sha256sum -c
```
It must print `kalshi_status_vm.py: OK`. If it prints `FAILED`, delete the file (`rm ~/kalshi_jarvis/kalshi_status_vm.py`),
don't run it, and tell the owner the hash didn't match.

The script is one file of Python 3.9+, standard library only, and you may read it all. If `git` is missing, stop and ask
the owner; installing it needs `sudo apt-get install -y git`.

## 2. Run it once and show the JSON
```
cd ~/kalshi_jarvis && nice -n 15 python3 -I kalshi_status_vm.py --from-bot /home/ubuntu/kalshi --check
```
This prints exactly what will be public. Show the owner the top part: `status`, `balance`, `today_pnl`, `week_pnl`,
`total_pnl` and the `strategies`. Then check the numbers:
- `balance` should match `account_truth.json` `total`.
- `today_pnl` should match today on Discord `/money` (the bot's own P&L, by ET day).
- The week starts Monday 00:00 ET. If Discord's week is a rolling 7 days, add `--week rolling7` to steps 2, 4 and 5.

If the output says `trades.db could not be read`, or anything looks wrong, stop and tell the owner.

## 3. The feed repo and its deploy key (the owner: two things on GitHub)
Make the key:
```
ssh-keygen -t ed25519 -N "" -C "kalshi-jarvis server" -f ~/kalshi_jarvis/deploy_key
cat ~/kalshi_jarvis/deploy_key.pub
```
Show the owner **only** the `.pub` line, and tell him:

> 1. On GitHub, make a new repository: name **`kalshi-feed`**, **Public**, and leave it empty (no README, no
>    .gitignore, no license). Click **Create repository**.
> 2. In **kalshi-feed** → **Settings** → **Deploy keys** → **Add deploy key**. Title: `kalshi-jarvis server`. Key: paste
>    this line. Tick **Allow write access**, then **Add key**.
>
> Tell me "OK" when both are done. This key can only write to kalshi-feed, never to your Jarvis app.
>
> Never turn on **GitHub Pages** for kalshi-feed (Settings → Pages stays off): a Pages site there would be served from the
> same address as your Jarvis app, and this server could then publish pages that read Jarvis's saved keys.

Never show `deploy_key`, the private half.

## 4. Wait for his OK, then push once
```
cd ~/kalshi_jarvis && python3 -I kalshi_status_vm.py --from-bot /home/ubuntu/kalshi --once --git-dir ~/kalshi_jarvis/pub.git --deploy-key ~/kalshi_jarvis/deploy_key
```
Expect `"ok": true` and the address the phone reads. The first push into the empty repo creates its `main` branch, and
it adds github.com to `~/.ssh/known_hosts`.

If it fails, the error ends with what to fix:
- the repo doesn't exist yet;
- the key isn't added;
- the key is read-only (**Allow write access** isn't ticked).

Ask the owner to fix that, then run the line again.

## 5. Every minute: one cron line
```
crontab -l 2>/dev/null | grep -q kalshi_status_vm.py || ( crontab -l 2>/dev/null; echo '* * * * * cd $HOME/kalshi_jarvis && flock -n .lock nice -n 15 ionice -c3 python3 -I kalshi_status_vm.py --from-bot /home/ubuntu/kalshi --cron --git-dir pub.git --deploy-key deploy_key >> cron.log 2>&1' ) | crontab -
crontab -l | grep kalshi_status_vm.py
```
This keeps every existing cron line and adds one. Each minute it reads the files and pushes only when the numbers
changed, plus once every 3 minutes so the phone knows it's alive. `cron.log` gets one line per change and any errors.

## 6. Check it
```
sleep 75; tail -3 ~/kalshi_jarvis/cron.log
curl -fsSL "https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json" | head -c 300; echo
```
The address can lag a few minutes behind the push. When it shows the bot's numbers, tell the owner in one line:
"Done: Jarvis shows your Kalshi bot now, updated every minute."

## The v3 fields (2026-11-03): what the Kalshi page shows from them
The script already sends these from the bot's own files: nothing to wire for the basics. They are all optional and
additive (`"v": 3` when any is present); the page works without them, from the last 40 trades, and says so.

| field | from the bot's files | the page shows |
|---|---|---|
| `categories` [{name, group, trades, wins, losses, pnl, staked}] | every settled buy, by coin (Bitcoin, Ethereum, HYPE, Gold …) | By market: P&L bars, win rate, ROI |
| `buckets` [{lo, hi, trades, wins, losses, pnl, staked}] | every settled buy, by the price paid (90-95¢, 95-97¢, 97-99¢ …) | By price: win rate vs break-even, ROI |
| `calibration` [{p, n, hit}] + `calib_basis` | the price paid as the predicted chance (`"price"`) | Calibration chart |
| `alerts` [{t, level, text}] | paused / blocked / a service down / no word; 3+ losses in a row; a day down 10%+ of the balance | Alerts card |
| `kelly` {fraction, bankroll, max_bet, min_edge} | `KELLY_FRACTION`, `MAX_BET`, `MIN_EDGE` in `bot_settings.json` / `combo_settings.json`, if they exist | Edge & sizing: Kelly per bet |
| `stats` {trades, wins, losses, staked, pnl, avg_price} | every settled buy | All-time win rate and ROI |
| rows: `category` | the market's category | the Market line of an open bet |

**One thing only the bot can add: its own chance.** `prob` (0-1) on `positions` and `trades` is the bot's estimated
chance that the side it holds wins. The script cannot see it in `trades.db`. With it the page shows live edge (chance −
price), EV and Kelly per open bet, and calibrates on the bot's own chance (`calib_basis` becomes `"model"`). To add it,
the bot writes it to a column the script can read (for example `orders.model_p`); ask the owner before changing the bot,
and never change its trading.

`python3 -I kalshi_status_vm.py --sample` prints the full v3 shape.

## Later
- **Update the script:** only when the owner asks, with a new `sha256` in his message. Run step 1 again, including the
  hash check. Cron uses the new file from the next minute.
- **Pause publishing:** `crontab -l | grep -v kalshi_status_vm.py | crontab -`. Turn it back on with step 5.
- **The log:** `tail ~/kalshi_jarvis/cron.log`. Clear it any time with `: > ~/kalshi_jarvis/cron.log`.
- **Remove it:** run the pause line, then `rm -rf ~/kalshi_jarvis`. Ask the owner to delete the deploy key on GitHub
  (kalshi-feed → Settings → Deploy keys) or the whole kalshi-feed repo.
