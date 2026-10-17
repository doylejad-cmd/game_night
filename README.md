# Family Game Night 🎲

A kid-friendly scorekeeping app for family game nights. It runs on iPhone as a home-screen web app:
it has its own icon, opens full-screen, works offline, and saves everything on the phone.

## What's in this folder

| File | What it is |
| --- | --- |
| `index.html` | The app page |
| `styles.css` | Colors, layout, animations |
| `app.js` | Everything the app does |
| `sw.js` | Lets the app work offline |
| `manifest.webmanifest` | App name and icon for the home screen |
| `icons/` | Home-screen icons |

## Putting it on your iPhone (one-time setup, ~10 minutes)

The app needs a web address (https) so Safari can install it. GitHub Pages hosts it for free.

1. Sign in or create a free account at **github.com**.
2. Click **+ → New repository**. Name it `game-night`, set it to **Public**, and click **Create repository**.
3. On the new repo page, click **uploading an existing file**. Drag in **everything inside this folder**
   (including the `icons` folder), then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**,
   pick branch **main** and folder **/ (root)**, then click **Save**.
5. After a minute or two the page shows your link, e.g. `https://YOUR-USERNAME.github.io/game-night/`.
6. On your iPhone, open that link in **Safari**. Tap the **Share** button, then **Add to Home Screen**, then **Add**.

Done. Launch it from the "Game Night" icon on your home screen.

> Only the app's code is public. Your players, games and scores never leave your phone.

## Updating the app later

Upload the changed files to the same GitHub repo (they replace the old ones). The next time you open the app
it downloads the update in the background, and the new version shows on the launch after that.

## Good to know

- **Your data lives on the phone.** Use **💾 Backup & Restore** at the bottom of the Game Night screen
  now and then to save a backup file to Files or iCloud Drive.
- **Keep the same web address.** iPhone keeps the data tied to the app's address. If you ever move the app
  to a different address, back up first, then restore in the new copy.
- **Timers:** the screen stays awake while a timer runs. iPhone pauses web apps in the background,
  so keep the app open during a countdown. The alarm beeps through the speaker, so turn the
  ring/silent switch off if you can't hear it.

## How to use it

- **Players** tab: add family members with a name, emoji buddy and color. Tap one to edit; 🗑️ deletes.
- **Games** tab: add a game with its **Game Name** and **Rules / Description**. Tap one to edit; 🗑️ deletes.
  - Turn on **🔁 Score by rounds** for games played in rounds (Uno, Yahtzee) and optionally set a **🎯 target score**.
- **Game Night** tab: tap **Start a New Game Night**, pick the players, then tap games in the order you'll play them.
  - Each game is its own tile. **Swipe** sideways (or tap the chips at the top) to move between games.
  - Tap a score box to type a number. Tap a box again to fix a mistake. **±** makes a score negative.
  - The **Total** column adds up every game. ⭐ marks each game's winner, and the last tile shows the 🏆 standings.
  - Top buttons: 📋 switches to a classic rows-and-columns table, ↕️ reorders games (drag the ☰ handle),
    ➕ adds a game, ⋯ adds/removes players, opens the timer, or finishes the night.
  - **Finish Game Night** saves the results to history and the Hall of Fame 🏆.
- **Round-by-round games** (only when *Score by rounds* is on) get two extra pieces on their tile:
  - A **🔁 Rounds** grid: one row per round, one column per player. Tap **＋ Add round** for a new row.
    Tap a box to fix it, use **± Neg** to make the selected box negative, or tap **R1/R2…** to clear or delete a round.
  - A **Game Total** column (to the left of Score) that adds up the rounds. With a target set, a bar shows progress,
    and the box turns gold with a cheer 🎉 when someone reaches it.
  - The Game Total is for reference only. You still type each player's **Score**, and only the Score counts
    toward tonight's **Total**, so a high-scoring game can't swamp the others.
  - Switch rounds on or off mid-night from the tile's ⋯ menu. Turning it off hides the rounds but keeps them.
  - Past game nights keep the full round-by-round sheet.
- **Timer** tab: a countdown (presets plus ±10s/±1m) and a stopwatch with laps.
