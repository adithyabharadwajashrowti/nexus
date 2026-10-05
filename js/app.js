// UI: router, five screens, the Home action-card thread, voice input, toasts and the trace drawer.
(function () {
  const NX = window.NX;
  const E = NX.engine;
  const st = () => NX.store.state;
  const save = () => NX.store.save();
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const user = (id) => st().users[id];
  const first = (id) => E.firstName(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let seq = 0;
  const uid = () => `card_${Date.now().toString(36)}${seq++}`;
  const card = (id) => st().thread.find((c) => c.id === id);

  const SUGGESTIONS = [
    'I want to play football this Friday',
    'I need someone to make a reel from this game',
    'I need a React developer for my startup',
    'Who should I meet?',
    'Who needs me?',
  ];

  // ---------------------------------------------------------------- small views

  function avatar(id, cls = '') {
    const u = user(id);
    const ini = u.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
    return `<span class="av ${cls}" style="--h:${u.hue}" title="${esc(u.name)}">${esc(ini)}</span>`;
  }
  const verified = (id) => (user(id).verified ? '<span class="verified" title="Verified">✓</span>' : '');
  const simBadge = (label = 'Simulated') => `<span class="badge sim">${esc(label)}</span>`;

  const lastCounts = {};
  let prevCounts = {};
  function countBar(ev) {
    const n = ev.participants.length;
    const bump = prevCounts[ev.id] !== undefined && prevCounts[ev.id] !== n;
    lastCounts[ev.id] = n;
    return `<div class="count ${bump ? 'bump' : ''}">
      <div class="count-num"><b>${n}</b><span>/ ${ev.capacity} players</span></div>
      <div class="bar"><i style="width:${Math.min(100, (n / ev.capacity) * 100)}%"></i></div>
    </div>`;
  }
  const statusPill = (ev) => `<span class="pill s-${ev.status.toLowerCase()}">${esc(ev.status)}</span>`;
  const when = (ev) => `${E.fmtDate(ev.schedule.date)} · ${E.fmtTime(ev.schedule.start)}`;

  function eventMini(ev) {
    return `<a class="ev-mini" href="#/event/${ev.id}">
      <div class="ev-mini-top">
        <div><div class="ev-name">${esc(ev.name)}</div>
        <div class="muted small">${when(ev)} · ${ev.location.name ? esc(ev.location.name) : 'Venue not decided'}</div></div>
        ${statusPill(ev)}
      </div>
      ${countBar(ev)}
    </a>`;
  }

  function memLine(m) {
    return `<div class="mem"><span class="mem-dot"></span><span>${esc(m.summary)}</span></div>`;
  }

  function personRow(m, opts = {}) {
    const u = user(m.user_id);
    const input = opts.input ? `<input type="${opts.input}" name="${opts.name}" value="${u.id}" data-sel="${opts.card}" ${opts.checked ? 'checked' : ''} ${opts.disabled ? 'disabled' : ''}>` : '';
    return `<label class="person ${opts.faded ? 'faded' : ''}">
      ${input}${avatar(u.id)}
      <div class="person-body">
        <div class="person-top"><b>${esc(u.name)}</b>${verified(u.id)}<span class="muted small">${esc(u.headline)}</span>
          ${m.fit ? `<span class="fit fit-${m.fit.split(' ')[0].toLowerCase()}">${m.fit}</span>` : ''}</div>
        ${m.reasons?.length ? `<ul class="why">${m.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${m.cons?.length ? `<ul class="why cons">${m.cons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      </div>
    </label>`;
  }

  // ---------------------------------------------------------------- planning (intent → card)

  function planTurn(turn) {
    const it = turn.intent;
    const t = it.intent.type;
    const ctx = it.intent.type !== 'UNKNOWN' ? E.context(it).data : null;
    turn.ctx = ctx;
    const planners = {
      JOIN_EVENT: planJoin, FIND_EVENT: planEvents, CREATE_EVENT: planCreate, FIND_SKILL: planMatch,
      FIND_PERSON: planMatch, FIND_VENUE: planVenueIntent, INVITE_MEMBER: planInviteIntent,
      WHO_SHOULD_I_MEET: planMeet, WHO_NEEDS_ME: planNeeds, SUMMARIZE_COMMUNITY: planSummary,
    };
    (planners[t] || planUnknown)(turn, ctx);
  }

  function planJoin(turn, ctx) {
    const ev = st().events[ctx.events[0]];
    if (!ev) return planCreate(turn, ctx);
    turn.kind = 'join';
    turn.data = { event_id: ev.id };
    if (ev.participants.includes(st().meId)) {
      turn.note = "You're already in this game. Here's where it stands:";
      turn.followNow = true;
      return;
    }
    const known = ctx.people.slice(0, 3).map(first);
    const others = ev.participants.length - known.length;
    turn.proposal = E.propose({ type: 'JOIN_EVENT', target_id: ev.id }, {
      title: `Join ${ev.name}`,
      summary: `Join the ${E.fmtDate(ev.schedule.date)} ${E.fmtTime(ev.schedule.start)} game.`,
      reason: [
        `You've played ${user(st().meId).gamesPlayed} games with this community`,
        'You are usually free Friday evenings',
        known.length ? `${known.join(', ')}${others > 0 ? ` and ${others} others` : ''} are in` : null,
      ].filter(Boolean),
    });
  }

  function planInvite(eventId) {
    const ev = st().events[eventId];
    const need = ev.capacity - ev.participants.length;
    const all = E.playerCandidates(eventId);
    const picks = all.filter((m) => m.available && m.score >= 0.8).slice(0, need);
    const turn = { id: uid(), system: true, kind: 'invite', data: { event_id: eventId, candidates: all.map((m) => m.user_id), matches: all, selected: picks.map((m) => m.user_id), need } };
    turn.lead = `${need} spot${need === 1 ? '' : 's'} left. These members fit Friday evening best:`;
    turn.proposal = E.propose({ type: 'INVITE_MEMBER', target_id: eventId }, {
      title: 'Invite all', summary: `Send invites to ${picks.length} players.`,
      reason: ['Free Friday evening', 'High show-up rate', 'Already in Friday Football'],
    });
    return turn;
  }

  function planVenue(eventId) {
    const ev = st().events[eventId];
    const res = E.searchVenues(eventId).data;
    const turn = {
      id: uid(), system: true, kind: 'venue',
      data: { event_id: eventId, venues: res.venues, selected: res.venues[0].id, memory: res.memory_used },
    };
    const left = ev.capacity - ev.participants.length;
    turn.lead = left > 0 ? `${left} spot${left === 1 ? '' : 's'} still open, but you can lock the venue now.` : `${ev.name} is full. Time to lock a venue.`;
    turn.proposal = E.propose({ type: 'BOOK_VENUE', target_id: eventId }, {
      title: 'Confirm venue', summary: `Book for ${when(ev)}.`, reason: [res.venues[0].ai_reason], simulated: true,
    });
    return turn;
  }

  function planComplete(eventId) {
    const ev = st().events[eventId];
    const turn = { id: uid(), system: true, kind: 'complete', data: { event_id: eventId } };
    turn.lead = `${ev.name} is on. After the game, I'll record how it went for the community.`;
    turn.proposal = E.propose({ type: 'COMPLETE_EVENT', target_id: eventId }, {
      title: 'Mark game as played', summary: 'Save the result and the clips people uploaded.',
      reason: ['Demo shortcut: fast-forwards to after the game'], simulated: true,
    });
    return turn;
  }

  function hint(lead, chips) {
    return { id: uid(), system: true, kind: 'hint', lead, data: { chips } };
  }

  function planNextForEvent(ev) {
    if (['GAME_OPEN', 'PLAYER_JOINED', 'RECRUITING'].includes(ev.phase) && ev.participants.length < ev.capacity && !st().invitations.some((i) => i.event_id === ev.id)) return planInvite(ev.id);
    if (ev.status === 'OPEN') return planVenue(ev.id);
    if (ev.status === 'CONFIRMED') return planComplete(ev.id);
    if (ev.project_id) return hint('This game already has a highlight reel project.', ['I need a React developer for my startup']);
    return hint('Game recorded. Want something made from it?', ['I need someone to make a reel from this game']);
  }

  function planMatch(turn, ctx) {
    const en = turn.intent.entities;
    const skill = en.skill;
    if (!skill) return planUnknown(turn);
    const fromEvent = en.source === 'event' ? E.activeEvent() : null;
    if (fromEvent) {
      fromEvent.phase = 'TALENT_SEARCH';
      save();
    }
    const res = E.match({
      skill, purpose: 'talent', communityId: ctx.community_id,
      window: fromEvent || /weekend/.test(turn.input.toLowerCase()) ? 'weekend' : null,
      date: en.date, dayLabel: en.day_label, time: en.time_preference,
    }).data.matches;
    if (!res.length) {
      turn.kind = 'empty';
      turn.lead = `I couldn't find anyone with ${skill} yet.`;
      return;
    }
    turn.kind = 'match';
    turn.data = { matches: res.slice(0, 3), selected: res[0].user_id, skill, source_event_id: fromEvent?.id || null, community_id: ctx.community_id };
    const top = user(res[0].user_id);
    turn.lead = fromEvent
      ? `For a reel from ${fromEvent.name}, ${first(top.id)} is the best fit:`
      : `For ${skill}, ${first(top.id)} is the best fit:`;
    const isStartup = !fromEvent;
    turn.proposal = E.propose({ type: 'REQUEST_COLLABORATION', target_id: res[0].user_id }, {
      title: 'Ask to collaborate',
      summary: fromEvent ? `Start “${fromEvent.name} Highlight Reel” with ${fromEvent.media.length} clips as source.` : `Invite them to a project for your startup.`,
      reason: [],
      simulated: true,
    });
    turn.data.project = isStartup
      ? { project_name: 'Startup MVP: Frontend', objective: 'Build the first version of the web app', deadline: 'In 2 weeks', tasks: ['Set up React app', 'Agree scope & screens', 'Ship landing + onboarding'] }
      : null;
  }

  function planEvents(turn, ctx) {
    turn.kind = 'events';
    const evs = Object.values(st().events).filter((e) => e.status !== 'COMPLETED');
    turn.data = { events: evs.map((e) => e.id) };
    turn.lead = 'Events you may want to join:';
  }

  function planCreate(turn) {
    const en = turn.intent.entities;
    turn.kind = 'create';
    turn.data = { ...en };
    turn.lead = `There's no ${en.activity} game ${en.day_label ? `on ${en.day_label}` : 'coming up'} yet. Want to start one?`;
    turn.proposal = E.propose({ type: 'CREATE_EVENT', params: { activity: en.activity, date: en.date, day_label: en.day_label, time_preference: en.time_preference } }, {
      title: `Create a ${en.activity} game`, summary: `${en.day_label ? `${en.day_label[0].toUpperCase()}${en.day_label.slice(1)}` : 'This weekend'}${en.time_preference ? `, ${en.time_preference}` : ''}. You'll be the organizer.`,
      reason: ['Nobody has posted one yet', 'NEXUS will find players once it exists'],
    });
  }

  function planVenueIntent(turn) {
    const ev = E.activeEvent();
    if (ev.status !== 'OPEN') {
      turn.kind = 'empty';
      turn.lead = `${ev.name} already has a venue: ${ev.location.name}.`;
      return;
    }
    Object.assign(turn, planVenue(ev.id), { id: turn.id, system: false, input: turn.input, intent: turn.intent });
  }

  function planInviteIntent(turn) {
    const ev = E.activeEvent();
    Object.assign(turn, planInvite(ev.id), { id: turn.id, system: false, input: turn.input, intent: turn.intent });
  }

  function planMeet(turn) {
    turn.kind = 'meet';
    turn.data = { matches: E.whoShouldIMeet().data.matches.slice(0, 3) };
    turn.lead = 'People you should meet:';
  }

  function planNeeds(turn) {
    turn.kind = 'needs';
    turn.data = { opportunities: E.whoNeedsMe().data.opportunities };
    turn.lead = 'These need your skills:';
  }

  function planSummary(turn, ctx) {
    turn.kind = 'summary';
    turn.data = E.summarize(ctx.community_id).data;
    turn.lead = `${st().communities[ctx.community_id].name}, right now:`;
  }

  function planUnknown(turn) {
    turn.kind = 'hint';
    turn.lead = "I'm not sure what to do with that yet. Try one of these:";
    turn.data = { chips: SUGGESTIONS };
  }

  // ---------------------------------------------------------------- asking & confirming

  async function ask(text, inputType = 'text') {
    text = (text || '').trim();
    if (!text) return;
    if (route.name !== 'home') {
      location.hash = '#/home';
      parseRoute();
    }
    const intentEnv = E.intent(text, inputType);
    const turn = { id: uid(), input: text, intent: intentEnv.data, kind: 'thinking' };
    st().thread.push(turn);
    save();
    render();
    scrollToCard(turn.id);
    await sleep(500);
    const t = card(turn.id);
    if (!t) return;
    planTurn(t);
    save();
    render();
    scrollToCard(t.id);
    if (t.followNow) {
      t.followNow = false;
      await sleep(300);
      append(planNextForEvent(st().events[t.data.event_id]));
    }
  }

  function append(turn) {
    st().thread.push(turn);
    save();
    render();
    scrollToCard(turn.id);
  }

  function paramsFor(c) {
    switch (c.kind) {
      case 'invite': return { user_ids: c.data.selected };
      case 'venue': return { venue_id: c.data.selected };
      case 'match': return { user_id: c.data.selected, skill: c.data.skill, source_event_id: c.data.source_event_id, community_id: c.data.community_id, ...(c.data.project || {}) };
      default: return {};
    }
  }

  async function confirmCard(id) {
    let c = card(id);
    if (!c || c.status) return;
    c.status = 'running';
    save();
    render();
    const res = await E.confirm(c.proposal.proposal_id, 'APPROVE', paramsFor(c));
    c = card(id);
    c.status = res.status === 'SUCCEEDED' ? 'done' : 'failed';
    c.result = res.message || res.error;
    if (res.project_id) c.data.project_id = res.project_id;
    save();
    render();
    if (c.status === 'done') await followUp(c);
  }

  function rejectCard(id) {
    const c = card(id);
    if (!c || c.status) return;
    E.confirm(c.proposal.proposal_id, 'REJECT');
    c.status = 'rejected';
    c.result = 'Okay, nothing changed.';
    save();
    render();
  }

  async function followUp(c) {
    await sleep(350);
    if (c.kind === 'join') return append(planNextForEvent(st().events[c.data.event_id]));
    if (c.kind === 'invite') {
      const id = c.id;
      card(id).waiting = true;
      save();
      render();
      await E.simulateReplies(c.data.event_id, c.data.selected);
      card(id).waiting = false;
      save();
      return append(planVenue(c.data.event_id));
    }
    if (c.kind === 'venue') return append(planComplete(c.data.event_id));
    if (c.kind === 'complete') return append(hint('Game recorded and saved to community memory. Next you could:', ['I need someone to make a reel from this game']));
    if (c.kind === 'match') {
      return append(hint('Same intelligence, different problem. Try:', c.data.source_event_id
        ? ['I need a React developer for my startup', 'Who should I meet?']
        : ['Who should I meet?', 'Who needs me?']));
    }
    if (c.kind === 'create') return append(hint('Your game is live. Next:', ['Who should I meet?']));
  }

  async function itemAction(cardId, item) {
    const c = card(cardId);
    if (!c) return;
    c.done = c.done || {};
    if (c.done[item]) return;
    let action;
    let meta;
    if (c.kind === 'meet') {
      action = { type: 'CONNECT_USER', target_id: item, params: { user_id: item } };
      meta = { title: `Meet ${first(item)}` };
    } else if (c.kind === 'needs') {
      action = { type: 'EXPRESS_INTEREST', target_id: item, params: { opportunity_id: item } };
      meta = { title: 'Offer to help' };
    } else if (c.kind === 'events') {
      action = { type: 'JOIN_EVENT', target_id: item };
      meta = { title: `Join ${st().events[item].name}` };
    } else return;
    const p = E.propose(action, meta);
    c.done[item] = 'running';
    save();
    render();
    const res = await E.confirm(p.proposal_id, 'APPROVE');
    const fresh = card(cardId);
    fresh.done[item] = res.status === 'SUCCEEDED' ? res.message : `✕ ${res.error}`;
    save();
    render();
  }

  // ---------------------------------------------------------------- card rendering

  function proposalBlock(c) {
    const p = c.proposal;
    if (!p) return '';
    if (c.status === 'done' || c.status === 'failed' || c.status === 'rejected') {
      return `<div class="result r-${c.status}">${c.status === 'done' ? '✓' : c.status === 'failed' ? '✕' : '–'} ${esc(c.result)}
        ${c.data?.project_id ? ` <a href="#/me">View project →</a>` : ''}
        ${p.simulated && c.status === 'done' ? simBadge() : ''}</div>
        ${c.waiting ? '<div class="waiting"><span class="spinner"></span> Waiting for replies…</div>' : ''}`;
    }
    const running = c.status === 'running';
    const label = c.kind === 'invite' ? `Invite ${c.data.selected.length === c.data.need ? 'all' : c.data.selected.length}` : p.title;
    return `<div class="proposal">
      ${p.summary ? `<div class="prop-summary">${esc(p.summary)}</div>` : ''}
      ${p.reason.length ? `<ul class="why">${p.reason.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      <div class="actions">
        <button class="btn primary" data-act="confirm" data-card="${c.id}" ${running ? 'disabled' : ''}>${running ? '<span class="spinner"></span> Working…' : esc(label)}</button>
        <button class="btn ghost" data-act="reject" data-card="${c.id}" ${running ? 'disabled' : ''}>Not now</button>
        ${p.simulated ? simBadge() : ''}
      </div>
    </div>`;
  }

  function understood(c) {
    if (!c.intent) return '';
    const en = c.intent.entities;
    const tags = [en.activity, en.skill, en.day_label && `${en.day_label}${en.date ? ` · ${E.fmtDate(en.date)}` : ''}`, en.time_preference, en.source && 'from this event']
      .filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="understood"><span class="tag intent">${esc(c.intent.intent.type)}</span>${tags}<span class="conf">${Math.round(c.intent.intent.confidence * 100)}%</span></div>`;
  }

  function ctxBlock(c) {
    const ctx = c.ctx;
    if (!ctx) return '';
    const mems = ctx.memory.map((id) => st().memories.find((m) => m.id === id)).filter(Boolean);
    const dis = ctx.discussions.map((id) => st().discussions.find((d) => d.id === id)).filter(Boolean).slice(-1);
    if (!mems.length && !dis.length) return '';
    return `<div class="ctx">
      ${dis.map((d) => `<div class="quote">${avatar(d.author, 'xs')}<span>“${esc(d.text)}” <span class="muted">· ${esc(first(d.author))}</span></span></div>`).join('')}
      ${mems.map(memLine).join('')}
    </div>`;
  }

  const BODIES = {
    thinking: () => '<div class="thinking"><span class="spinner"></span> Understanding…</div>',
    join(c) {
      const ev = st().events[c.data.event_id];
      return `${c.note ? `<p class="lead">${esc(c.note)}</p>` : ''}${eventMini(ev)}${ctxBlock(c)}`;
    },
    invite(c) {
      const sel = new Set(c.data.selected);
      const lock = !!c.status;
      const rows = c.data.matches.map((m) => personRow(m, {
        input: 'checkbox', name: `inv_${c.id}`, card: c.id, checked: sel.has(m.user_id), disabled: lock || !m.available, faded: !m.available || m.score < 0.8,
      }));
      return `${eventMini(st().events[c.data.event_id])}<div class="people">${rows.slice(0, 4).join('')}</div>
        ${rows.length > 4 ? `<details class="more"><summary>Also considered (${rows.length - 4})</summary><div class="people">${rows.slice(4).join('')}</div></details>` : ''}`;
    },
    venue(c) {
      const lock = !!c.status;
      return `<div class="venues">${c.data.venues.map((v, i) => `
        <label class="venue ${c.data.selected === v.id ? 'on' : ''}">
          <input type="radio" name="ven_${c.id}" value="${v.id}" data-sel="${c.id}" ${c.data.selected === v.id ? 'checked' : ''} ${lock ? 'disabled' : ''}>
          <div class="venue-body">
            <div class="person-top"><b>${esc(v.name)}</b>${i === 0 ? '<span class="fit fit-strong">Recommended</span>' : ''}</div>
            <div class="muted small">₹${v.price.toLocaleString('en-IN')} · ${v.distance} · ★ ${v.rating}</div>
            <div class="small">${esc(v.ai_reason)}</div>
          </div>
        </label>`).join('')}</div>
        <div class="muted small">Based on community memory · Venue availability ${simBadge('Simulated data')}</div>`;
    },
    complete: (c) => eventMini(st().events[c.data.event_id]),
    match(c) {
      const lock = !!c.status;
      const ev = c.data.source_event_id ? st().events[c.data.source_event_id] : null;
      return `${ev ? `<div class="source">Source: <b>${esc(ev.name)}</b> · ${ev.media.length} clips</div>` : ''}
        <div class="people">${c.data.matches.map((m, i) => personRow(m, {
          input: 'radio', name: `m_${c.id}`, card: c.id, checked: c.data.selected === m.user_id, disabled: lock, faded: i > 0 && c.data.selected !== m.user_id,
        })).join('')}</div>`;
    },
    meet(c) {
      return `<div class="people">${c.data.matches.map((m) => `
        <div class="person">${avatar(m.user_id)}<div class="person-body">
          <div class="person-top"><b>Meet ${esc(first(m.user_id))}</b>${verified(m.user_id)}<span class="muted small">${esc(user(m.user_id).headline)}</span></div>
          <p class="small">${esc(m.headline)}</p>
          <ul class="why">${m.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${itemBtn(c, m.user_id, 'Ask for an intro')}
        </div></div>`).join('')}</div>`;
    },
    needs(c) {
      return `<div class="people">${c.data.opportunities.map((o) => {
        const opp = st().opportunities[o.opportunity_id];
        return `<div class="person"><span class="av opp">★</span><div class="person-body">
          <div class="person-top"><b>${esc(opp.requirement)}</b><span class="muted small">${esc(opp.creator)}</span></div>
          <ul class="why">${o.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${itemBtn(c, opp.id, "I'm interested")}
        </div></div>`;
      }).join('') || '<p class="muted">Nothing right now.</p>'}</div>`;
    },
    events(c) {
      return c.data.events.map((id) => {
        const ev = st().events[id];
        const inIt = ev.participants.includes(st().meId);
        return `${eventMini(ev)}${inIt ? '<div class="muted small pad">You’re in.</div>' : itemBtn(c, id, 'Join')}`;
      }).join('');
    },
    create: () => '',
    summary(c) {
      const mems = c.data.memory.map((id) => st().memories.find((m) => m.id === id)).filter(Boolean);
      return `<ul class="plain">${c.data.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <h5>What the community remembers</h5>${mems.map(memLine).join('')}`;
    },
    hint: (c) => `<div class="chips">${c.data.chips.map((s) => `<button class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>`,
    empty: () => '',
  };

  function itemBtn(c, item, label) {
    const d = c.done?.[item];
    if (d === 'running') return '<button class="btn small" disabled><span class="spinner"></span></button>';
    if (d) return `<div class="result r-done small">${d.startsWith('✕') ? '' : '✓ '}${esc(d)}</div>`;
    return `<button class="btn small" data-act="item" data-card="${c.id}" data-item="${item}">${esc(label)}</button>`;
  }

  function renderCard(c) {
    return `<article class="card ${c.system ? 'system' : ''}" id="${c.id}">
      ${c.input ? `<div class="said">“${esc(c.input)}”</div>` : '<div class="said next">Next step</div>'}
      ${understood(c)}
      ${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}
      ${(BODIES[c.kind] || BODIES.empty)(c)}
      ${proposalBlock(c)}
    </article>`;
  }

  // ---------------------------------------------------------------- screens

  function renderHome(view) {
    if (!view.querySelector('.home')) {
      view.innerHTML = `<section class="home">
        <form class="ask" id="ask">
          <label for="q" class="ask-label">What do you want to do?</label>
          <div class="ask-row">
            <input id="q" autocomplete="off" placeholder="e.g. I want to play football this Friday">
            <button type="button" class="icon-btn" id="mic" title="Speak" aria-label="Speak">${ICON.mic}</button>
            <button type="submit" class="icon-btn primary" title="Go" aria-label="Go">${ICON.send}</button>
          </div>
          <div class="chips" id="starter"></div>
        </form>
        <div id="thread" class="thread"></div>
      </section>`;
    }
    const thread = st().thread;
    $('#starter').innerHTML = thread.length ? '' : SUGGESTIONS.slice(0, 3).map((s) => `<button type="button" class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join('');
    $('#thread').innerHTML = thread.length
      ? thread.map(renderCard).join('')
      : `<div class="empty-home"><p>NEXUS knows your communities: who’s free, what you decided last time, and who can help.</p><p class="muted">Tell it what you want to do.</p></div>`;
  }

  function renderDiscover(view) {
    const meet = E.whoShouldIMeet().data.matches.slice(0, 3);
    const needs = E.whoNeedsMe().data.opportunities;
    const evs = Object.values(st().events).filter((e) => e.status !== 'COMPLETED' && !e.participants.includes(st().meId));
    view.innerHTML = `<section class="page">
      <h1>Discover</h1>
      <h3>People you should meet</h3>
      <div class="grid">${meet.map((m) => `<div class="tile">${avatar(m.user_id, 'lg')}<b>${esc(user(m.user_id).name)}</b>${verified(m.user_id)}
        <p class="small">${esc(m.headline)}</p><button class="btn small" data-ask="Who should I meet?">Ask NEXUS</button></div>`).join('')}</div>
      <h3>Events you may want to join</h3>
      <div class="grid">${evs.map((e) => `<div class="tile">${eventMini(e)}</div>`).join('') || '<p class="muted">You’re in every upcoming event.</p>'}</div>
      <h3>Opportunities that need your skills</h3>
      <div class="grid">${needs.map((o) => {
        const opp = st().opportunities[o.opportunity_id];
        return `<div class="tile"><b>${esc(opp.requirement)}</b><p class="small muted">${esc(opp.creator)} · ${esc(opp.when)}</p>
          <ul class="why">${o.reasons.slice(0, 2).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${opp.interested.includes(st().meId) ? '<div class="result r-done small">✓ Interest sent</div>' : '<button class="btn small" data-ask="Who needs me?">Ask NEXUS</button>'}</div>`;
      }).join('')}</div>
    </section>`;
  }

  function discussionBlock(communityId, eventId) {
    const items = st().discussions.filter((d) => d.community_id === communityId && (!eventId || d.event_id === eventId || !d.event_id)).slice(-6);
    return `<div class="discussion">${items.map((d) => `<div class="msg">${avatar(d.author, 'sm')}<div><b>${esc(first(d.author))}</b> <span class="muted small">${ago(d.ts)}</span>
        <div>${esc(d.text)}${d.flagged ? ' <span class="badge flag">Flagged for review</span>' : ''}</div></div></div>`).join('')}
      <form class="post" data-post="${communityId}" data-event="${eventId || ''}"><input id="post_${communityId}" placeholder="Write something…" autocomplete="off"><button class="btn small">Post</button></form>
    </div>`;
  }

  function activityBlock(communityId) {
    const items = st().activity.filter((a) => !communityId || a.payload.community_id === communityId).slice(0, 10);
    return `<ul class="activity">${items.map((a) => `<li><span class="ev-type">${esc(a.event)}</span>${esc(a.text)} <span class="muted small">${ago(a.ts)}</span></li>`).join('') || '<li class="muted">No live activity yet. Join the game from Home and watch this update.</li>'}</ul>`;
  }

  function renderCommunity(view, id) {
    const c = st().communities[id] || st().communities.com_friday_football;
    const evs = Object.values(st().events).filter((e) => e.community_id === c.id);
    const mems = st().memories.filter((m) => m.community_id === c.id).sort((a, b) => b.ts - a.ts).slice(0, 4);
    const mine = user(st().meId).communities.map((cid) => st().communities[cid]);
    view.innerHTML = `<section class="page">
      <div class="tabs">${mine.map((m) => `<a href="#/community/${m.id}" class="${m.id === c.id ? 'on' : ''}">${esc(m.short)}</a>`).join('')}</div>
      <h1>${esc(c.name)}</h1>
      <p class="muted">${esc(c.description)} · ${c.members.length} members</p>
      <div class="cols">
        <div>
          <h3>Active events</h3>${evs.map(eventMini).join('') || '<p class="muted">None yet.</p>'}
          <h3>Discussion</h3>${discussionBlock(c.id)}
        </div>
        <div>
          <h3>Live <span class="live-dot"></span></h3>${activityBlock(c.id)}
          <h3>Community memory</h3>${mems.map(memLine).join('')}
          <h3>Members</h3><div class="avatars">${c.members.map((m) => avatar(m, 'sm')).join('')}</div>
        </div>
      </div>
    </section>`;
  }

  const PHASES = ['GAME_OPEN', 'PLAYER_JOINED', 'RECRUITING', 'FULL', 'VENUE_SELECTION', 'BOOKING_PENDING', 'CONFIRMED', 'COMPLETED', 'MEMORY_CREATED', 'TALENT_SEARCH', 'COLLABORATION_REQUESTED', 'PROJECT_CREATED'];

  function renderEvent(view, id) {
    const ev = st().events[id] || st().events.evt_001;
    const c = st().communities[ev.community_id];
    const pi = PHASES.indexOf(ev.phase);
    const mems = st().memories.filter((m) => m.source?.id === ev.id || (m.community_id === ev.community_id && m.source?.type === 'SEED')).slice(-4).reverse();
    const prj = ev.project_id ? st().projects[ev.project_id] : null;
    const inIt = ev.participants.includes(st().meId);
    view.innerHTML = `<section class="page">
      <a class="muted small" href="#/community/${c.id}">← ${esc(c.name)}</a>
      <div class="ev-head"><h1>${esc(ev.name)}${ev.status === 'CONFIRMED' ? ' · Confirmed' : ''}</h1>${statusPill(ev)}</div>
      <p class="muted">${when(ev)}–${E.fmtTime(ev.schedule.end)} · ${ev.location.name ? esc(ev.location.name) : `Venue not decided (usually ${esc(ev.location.preferred || '—')})`}</p>
      <ol class="stepper">${PHASES.map((p, i) => `<li class="${i < pi ? 'past' : i === pi ? 'now' : ''}">${p.replace(/_/g, ' ')}</li>`).join('')}</ol>
      <div class="cols">
        <div>
          ${countBar(ev)}
          <div class="avatars big">${ev.participants.map((p) => avatar(p, 'sm')).join('')}</div>
          <div class="facts">
            <div><span class="muted small">Booking</span><b>${esc(ev.booking.status)}</b> ${simBadge()}${ev.booking.reference ? `<span class="muted small"> ${esc(ev.booking.reference)}</span>` : ''}</div>
            <div><span class="muted small">Payment</span><b>${ev.payment.amount ? `₹${ev.payment.per_person} each` : '—'}</b> ${simBadge()}</div>
            ${ev.result ? `<div><span class="muted small">Result</span><b>${esc(ev.result)}</b></div>` : ''}
          </div>
          <h3>Discussion</h3>${discussionBlock(c.id, ev.id)}
        </div>
        <div>
          <h3>Media</h3>${ev.media.length ? `<ul class="plain">${ev.media.map((m) => `<li>▶ ${esc(m.title)} <span class="muted small">${m.length} · ${esc(first(m.by))}</span></li>`).join('')}</ul>` : '<p class="muted small">Clips appear after the game.</p>'}
          <h3>Memory</h3>${mems.map(memLine).join('')}
          <h3>Related project</h3>${prj ? projectTile(prj) : '<p class="muted small">None yet.</p>'}
          <div class="safety">
            ${inIt && ev.status !== 'COMPLETED' ? `<button class="btn ghost small" data-leave="${ev.id}">Leave event</button>` : ''}
            <button class="btn ghost small" data-report="${ev.id}">Report</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  function projectTile(p) {
    return `<div class="tile project"><b>${esc(p.name)}</b><p class="small">${esc(p.objective)}</p>
      <div class="avatars">${p.members.map((m) => `${avatar(m.user_id, 'sm')}`).join('')}<span class="muted small">${p.members.map((m) => `${first(m.user_id)} (${m.role})`).join(', ')}</span></div>
      <p class="muted small">Deadline: ${esc(p.deadline)}${p.source?.type === 'EVENT' ? ` · From ${esc(st().events[p.source.id].name)}` : ''}</p>
      ${p.tasks.length ? `<ul class="tasks">${p.tasks.map((t) => `<li>☐ ${esc(t.title)} <span class="muted small">${esc(first(t.owner))}</span></li>`).join('')}</ul>` : ''}</div>`;
  }

  function renderMe(view) {
    const u = user(st().meId);
    const prjs = Object.values(st().projects).filter((p) => p.members.some((m) => m.user_id === u.id));
    const mineActs = st().activity.filter((a) => /^You /.test(a.text || '')).length;
    view.innerHTML = `<section class="page">
      <div class="profile">${avatar(u.id, 'xl')}<div><h1>${esc(u.name)} ${verified(u.id)}</h1><p class="muted">${esc(u.headline)}</p>
        <p class="small">★ ${u.reputation.rating} community rating · ${u.reputation.reliability}% reliability</p></div></div>
      <div class="cols">
        <div>
          <h3>Skills</h3><div class="chips">${u.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
          <h3>Interests</h3><div class="chips">${u.interests.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
          <h3>Goals</h3><ul class="plain">${u.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
          <h3>Communities</h3>${u.communities.map((cid) => `<a class="row-link" href="#/community/${cid}">${esc(st().communities[cid].name)}</a>`).join('')}
        </div>
        <div>
          <h3>Projects</h3>${prjs.map(projectTile).join('') || '<p class="muted small">No projects yet. Ask NEXUS for a collaborator.</p>'}
          <h3>Contributions</h3><ul class="plain"><li>${u.gamesPlayed} games played</li><li>${mineActs} actions this session</li>${u.portfolio.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------- router & render

  const route = { name: 'home', arg: null };
  const SCREENS = { home: renderHome, discover: renderDiscover, community: renderCommunity, event: renderEvent, me: renderMe };

  function parseRoute() {
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    route.name = SCREENS[name] ? name : 'home';
    route.arg = arg || null;
  }

  function render() {
    const view = $('#view');
    prevCounts = { ...lastCounts };
    // Preserve typed text and focus across live re-renders.
    const active = document.activeElement;
    const focusId = active && view.contains(active) ? active.id : null;
    const values = {};
    view.querySelectorAll('input[id]').forEach((i) => (values[i.id] = i.value));
    if (view.dataset.route !== route.name) {
      view.innerHTML = '';
      view.dataset.route = route.name;
    }
    SCREENS[route.name](view, route.arg);
    Object.entries(values).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    });
    if (focusId) document.getElementById(focusId)?.focus();
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === route.name));
  }

  function scrollToCard(id) {
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  function ago(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  function toast(text) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  // ---------------------------------------------------------------- trace drawer

  function renderTrace() {
    const list = $('#trace-list');
    if (!$('#trace').classList.contains('open')) return;
    list.innerHTML = NX.trace.items.map((t) => `<details class="tr tr-${t.kind}">
      <summary><span class="m">${t.kind === 'ws' ? 'WS' : t.method}</span> ${esc(t.kind === 'ws' ? t.event : t.path)}</summary>
      ${t.req ? `<div class="muted small">request</div><pre>${esc(JSON.stringify(t.req, null, 2))}</pre>` : ''}
      <div class="muted small">${t.kind === 'ws' ? 'message' : 'response'}</div><pre>${esc(JSON.stringify(t.res, null, 2))}</pre>
    </details>`).join('') || '<p class="muted small">Ask NEXUS something. Every API call and realtime event shows up here.</p>';
  }

  // ---------------------------------------------------------------- voice

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Voice isn’t supported in this browser. Type instead.');
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    const mic = $('#mic');
    mic.classList.add('listening');
    let finalText = '';
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join('');
      $('#q').value = text;
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    rec.onerror = () => toast('Couldn’t hear that. Try again or type.');
    rec.onend = () => {
      mic.classList.remove('listening');
      if (finalText) {
        $('#q').value = '';
        ask(finalText, 'voice');
      }
    };
    rec.start();
  }

  // ---------------------------------------------------------------- events

  const ICON = {
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act],[data-ask],[data-leave],[data-report],#mic,#reset,#trace-btn,#trace-close');
      if (!t) return;
      if (t.dataset.ask) {
        e.preventDefault();
        return ask(t.dataset.ask);
      }
      if (t.dataset.act === 'confirm') return confirmCard(t.dataset.card);
      if (t.dataset.act === 'reject') return rejectCard(t.dataset.card);
      if (t.dataset.act === 'item') return itemAction(t.dataset.card, t.dataset.item);
      if (t.dataset.leave) {
        if (!confirm('Leave this event? Your spot will open for someone else.')) return;
        const p = E.propose({ type: 'LEAVE_EVENT', target_id: t.dataset.leave }, { title: 'Leave event' });
        return E.confirm(p.proposal_id, 'APPROVE').then((r) => toast(r.message || r.error));
      }
      if (t.dataset.report) return toast('Reported. A community moderator will review it.');
      if (t.id === 'mic') return startVoice();
      if (t.id === 'reset') {
        if (!confirm('Reset the demo to its starting state?')) return;
        NX.store.reset();
        location.hash = '#/home';
        return;
      }
      if (t.id === 'trace-btn' || t.id === 'trace-close') {
        $('#trace').classList.toggle('open');
        renderTrace();
      }
    });

    document.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.dataset.sel) return;
      const c = card(el.dataset.sel);
      if (!c || c.status) return;
      if (el.type === 'checkbox') {
        const set = new Set(c.data.selected);
        el.checked ? set.add(el.value) : set.delete(el.value);
        c.data.selected = c.data.candidates.filter((id) => set.has(id));
      } else {
        c.data.selected = el.value;
      }
      save();
      render();
    });

    document.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.id === 'ask') {
        const q = $('#q');
        const v = q.value;
        q.value = '';
        return ask(v);
      }
      if (e.target.dataset.post) {
        const input = e.target.querySelector('input');
        if (!input.value.trim()) return;
        E.postDiscussion(e.target.dataset.post, e.target.dataset.event || null, input.value.trim());
        input.value = '';
      }
    });

    window.addEventListener('hashchange', () => {
      parseRoute();
      render();
      window.scrollTo(0, 0);
    });

    NX.store.subscribe((msg, remote) => {
      if (msg?.event === 'DEMO_RESET') {
        NX.trace.items = [];
        Object.keys(lastCounts).forEach((k) => delete lastCounts[k]);
      }
      render();
      renderTrace();
      if (remote && msg?.text) toast(msg.text);
      else if (!remote && msg?.text && route.name !== 'home') toast(msg.text);
    });
    NX.trace.subscribe(renderTrace);
  }

  NX.app = { ask, render };

  parseRoute();
  bind();
  render();
})();
