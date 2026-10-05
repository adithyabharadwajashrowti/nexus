// Runs the judge's demo script against the engine, headless. Usage: node tests/demo-flow.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = {};
const ctx = {
  window: {}, console, setTimeout,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  addEventListener() {},
  BroadcastChannel: undefined,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data.js', 'store.js', 'engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const { engine: E, store: S } = ctx.NX;
E.speed = 0;
const st = () => S.state;
const events = [];
S.subscribe((m) => events.push(m.event));

(async () => {
  // 1-3: intent + context
  const it = E.intent('I want to play football this Friday').data;
  assert.equal(it.intent.type, 'JOIN_EVENT');
  assert.equal(it.entities.activity, 'football');
  assert.equal(new Date(it.entities.date + 'T12:00').getDay(), 5);
  const cx = E.context(it).data;
  assert.equal(cx.events.join(), 'evt_001');
  assert.ok(cx.memory.length > 0, 'memory retrieved');

  // 4: join 11 -> 12
  const ev = () => st().events.evt_001;
  assert.equal(ev().participants.length, 11);
  let p = E.propose({ type: 'JOIN_EVENT', target_id: 'evt_001' }, { title: 'Join' });
  let r = await E.confirm(p.proposal_id, 'APPROVE');
  assert.equal(r.status, 'SUCCEEDED');
  assert.equal(ev().participants.length, 12);
  assert.ok(events.includes('EVENT_PARTICIPANT_ADDED'));
  // idempotent: same proposal again does not add twice
  await E.confirm(p.proposal_id, 'APPROVE');
  assert.equal(ev().participants.length, 12);

  // 5-6: candidates + invite all -> 16/16
  const cands = E.playerCandidates('evt_001');
  const picks = cands.filter((m) => m.available && m.score >= 0.8).slice(0, 4).map((m) => m.user_id);
  console.log('invite picks:', picks.join(', '));
  assert.equal(picks.length, 4);
  assert.ok(!picks.includes('usr_manoj') && !picks.includes('usr_zoya'));
  p = E.propose({ type: 'INVITE_MEMBER', target_id: 'evt_001' }, { title: 'Invite' });
  r = await E.confirm(p.proposal_id, 'APPROVE', { user_ids: picks });
  assert.equal(r.status, 'SUCCEEDED');
  await E.simulateReplies('evt_001', picks);
  assert.equal(ev().participants.length, 16);
  assert.equal(ev().phase, 'VENUE_SELECTION');

  // 7-9: venue recommendation + booking
  const venues = E.searchVenues('evt_001').data.venues;
  console.log('top venue:', venues[0].name, '-', venues[0].ai_reason);
  assert.equal(venues[0].id, 'venue_001');
  p = E.propose({ type: 'BOOK_VENUE', target_id: 'evt_001' }, { title: 'Book' });
  r = await E.confirm(p.proposal_id, 'APPROVE', { venue_id: 'venue_001' });
  assert.equal(r.status, 'SUCCEEDED', r.error);
  assert.equal(ev().status, 'CONFIRMED');
  assert.equal(ev().booking.mode, 'SIMULATED');
  // 11: memory
  assert.ok(st().memories.some((m) => m.type === 'DECISION' && /HSR/.test(m.summary)));
  assert.ok(E.memoryQuery('com_friday_football', 'venue').data.items.length >= 3);

  p = E.propose({ type: 'COMPLETE_EVENT', target_id: 'evt_001' }, { title: 'Done' });
  r = await E.confirm(p.proposal_id, 'APPROVE');
  assert.equal(ev().status, 'COMPLETED');

  // 12-14: reel -> Rahul -> project
  const it2 = E.intent('I need someone to make a reel from this game').data;
  assert.equal(it2.intent.type, 'FIND_SKILL');
  assert.equal(it2.entities.skill, 'Video Editing');
  assert.equal(it2.entities.source, 'event');
  const cx2 = E.context(it2).data;
  const m = E.match({ skill: 'Video Editing', purpose: 'talent', communityId: cx2.community_id, window: 'weekend' }).data.matches;
  console.log('reel match:', m[0].user_id, m[0].reasons);
  assert.equal(m[0].user_id, 'usr_rahul');
  p = E.propose({ type: 'REQUEST_COLLABORATION', target_id: 'usr_rahul' }, { title: 'Collab' });
  r = await E.confirm(p.proposal_id, 'APPROVE', { user_id: 'usr_rahul', skill: 'Video Editing', source_event_id: 'evt_001' });
  assert.equal(r.status, 'SUCCEEDED', r.error);
  assert.equal(st().projects[r.project_id].name, 'Friday Football Highlight Reel');
  assert.equal(ev().phase, 'PROJECT_CREATED');

  // 15: same layer, different domain
  const it3 = E.intent('I need a React developer for my startup').data;
  assert.equal(it3.intent.type, 'FIND_SKILL');
  assert.equal(it3.entities.skill, 'React');
  const cx3 = E.context(it3).data;
  assert.equal(cx3.community_id, 'com_blr_builders');
  const m3 = E.match({ skill: 'React', purpose: 'talent', communityId: cx3.community_id }).data.matches;
  console.log('react match:', m3.map((x) => `${x.user_id}:${x.score}`).join(' '));
  assert.equal(m3[0].user_id, 'usr_priya');

  // other intents
  const types = {
    'Who should I meet?': 'WHO_SHOULD_I_MEET', 'Who needs me?': 'WHO_NEEDS_ME',
    'What is happening in my community': 'SUMMARIZE_COMMUNITY', 'organize badminton on saturday morning': 'CREATE_EVENT',
    'any events this weekend?': 'FIND_EVENT', 'find a venue': 'FIND_VENUE', 'blah': 'UNKNOWN',
  };
  for (const [t, ty] of Object.entries(types)) assert.equal(E.intent(t).data.intent.type, ty, t);
  assert.equal(E.whoShouldIMeet().data.matches[0].user_id, 'usr_ananya');
  assert.ok(E.whoNeedsMe().data.opportunities.some((o) => o.opportunity_id === 'opp_001'));

  console.log('realtime events:', [...new Set(events)].join(', '));
  console.log('\nAll demo steps passed.');
})().catch((e) => { console.error(e); process.exit(1); });
