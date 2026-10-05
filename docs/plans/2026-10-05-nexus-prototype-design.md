# NEXUS Prototype — Design

**Goal:** A static web prototype (GitHub Pages) that demonstrates the NEXUS core loop
`INTENT → CONTEXT → PLAN → CONFIRM → ACT → UPDATE → REMEMBER → NEXT` end-to-end.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Hosting | Static files only, GitHub Pages | Zero infra, judge can open a link |
| Stack | Vanilla HTML/CSS/JS, no build step | Push-and-serve; easy to edit during the hackathon |
| Intelligence | Fully local rule-based engine over seeded data | Never fails live; no keys in the browser |
| Realtime | `BroadcastChannel` (+ `storage` event fallback) | Second tab updates live, simulating the WebSocket |
| Persistence | `localStorage`, with a Reset Demo button | Survives reloads; repeatable demos |

## Architecture

```
index.html       shell + nav (Home · Discover · Community · Event · My Space)
css/style.css    tokens, light/dark, mobile-first
js/data.js       seed graph: users, communities, events, venues, memories, opportunities
js/store.js      state, save/load, realtime bus, API trace
js/engine.js     the single NEXUS intelligence layer
js/app.js        router, screens, action cards, voice input
```

`engine.js` mirrors the spec's API (`/intent`, `/context/query`, `/match`,
`/actions/proposals`, `/actions/{id}/confirm`, `/actions/execute`, `/venues/search`,
`/venues/{id}/book`, `/memory`, `/projects/from-event`) as functions returning the same
envelope (`success`, `data`, `request_id`, `timestamp`). Every call and realtime event is
recorded and visible in the **Under the hood** drawer.

One generic matcher (`match`) scores people on skill, highlights, community, availability,
reliability and shared history, returning human-readable reasons. The same code finds
players, Rahul the video editor, and Priya the React developer.

Actions follow `validate → authorize → execute → emit → remember`, and only run after the
user confirms a proposal card. Simulated integrations (booking, payment, invite replies,
collaborator acceptance) are visibly badged **SIMULATED**.

## Demo flow (state machine on the event)

GAME_OPEN → PLAYER_JOINED → RECRUITING → FULL → VENUE_SELECTION → BOOKING_PENDING →
CONFIRMED → COMPLETED → MEMORY_CREATED → TALENT_SEARCH → COLLABORATION_REQUESTED →
PROJECT_CREATED

## Out of scope

Real LLM, real backend, real payments/bookings, auth, media upload infrastructure.
