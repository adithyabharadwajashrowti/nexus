# NEXUS: prototype

> NEXUS turns “I want to do X” into the people, context, decisions and actions required to actually do X, with the user's approval.

A static, no-build web prototype of the NEXUS core loop:

`INTENT → CONTEXT → PLAN → CONFIRM → ACT → UPDATE → REMEMBER → NEXT`

Everything runs in the browser: there is no backend, no API key and no network dependency. The intelligence layer (`js/engine.js`) is a local rule-based engine over a seeded community graph. It mirrors the spec's API (`/intent`, `/context/query`, `/match`, `/actions/proposals`, `/actions/{id}/confirm`, `/actions/execute`, `/venues/search`, `/memory`, `/projects/from-event`) and returns the same response envelope. Open **Under the hood** to see every call and realtime event.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Go to **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. Open `https://<you>.github.io/<repo>/`.

## Demo script

1. Home: *“I want to play football this Friday”* (or tap the 🎤)
2. **Join Friday Football**: count goes 11 → 12 / 16
3. **Invite all**: 4 best-fit members accept one by one → 16 / 16
4. **Confirm venue**: HSR Football Arena (chosen from community memory) → **CONFIRMED** · `SIMULATED`
5. **Mark game as played**: result and clips are saved to memory
6. *“I need someone to make a reel from this game”*: Rahul, with the reasons why → **Ask to collaborate** → project created
7. *“I need a React developer for my startup”*: the same engine finds Priya
8. *“Who should I meet?”* / *“Who needs me?”*

**Realtime:** open the Community or Event screen in a second tab. It updates live (via `BroadcastChannel`) while you act in the first tab.

**Reset** in the header restores the seed data.

## Structure

```
index.html       shell + nav
css/style.css    design tokens, light/dark, mobile
js/data.js       seed graph (people, communities, events, venues, memories, opportunities)
js/store.js      state (localStorage), realtime bus, API trace
js/engine.js     NEXUS intelligence: intent, context, match, propose, confirm, execute, remember
js/app.js        screens, action cards, voice input
tests/           headless run of the full demo: node tests/demo-flow.test.js
```

## Honest labels

Venue booking, payment, invite replies and collaborator acceptance are simulated and badged **SIMULATED** in the UI.
