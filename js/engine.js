// NEXUS intelligence layer. One engine for every use case: intent → context → match →
// proposal → confirm → execute (validate, authorize, execute, emit, remember).
// Each public function mirrors an endpoint from the spec and records it in the API trace.
(function () {
  const NX = window.NX;
  const S = () => NX.store.state;
  const save = () => NX.store.save();
  const emit = (...a) => NX.store.emit(...a);
  const me = () => S().users[S().meId];
  const user = (id) => S().users[id];
  const firstName = (id) => user(id).name.split(' ')[0];
  const sleep = (ms) => new Promise((r) => setTimeout(r, NX.engine.speed * ms));

  let seq = 0;
  const uid = (p) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

  function api(method, path, req, data) {
    const res = { success: true, data, request_id: uid('req'), timestamp: new Date().toISOString() };
    NX.trace.push({ kind: 'http', method, path, req, res });
    return res;
  }

  // ---------------------------------------------------------------- intent

  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const ACTIVITIES = {
    football: /\b(football|soccer|futsal)\b/,
    badminton: /\bbadminton\b/,
    cricket: /\bcricket\b/,
    basketball: /\bbasketball\b/,
    tennis: /\btennis\b/,
    running: /\b(run|running|jog|jogging)\b/,
  };
  const SKILLS = [
    ['React', /\b(react|frontend|front-end)\b/],
    ['Video Editing', /\b(reels?|video|videos|edit|editor|editing|highlights?|montage)\b/],
    ['UI Design', /\b(ui|ux|designer)\b/],
    ['Photography', /\b(photos?|photographer|pictures)\b/],
    ['Node.js', /\b(backend|back-end|node)\b/],
    ['AI/ML', /\b(ai|ml|machine learning)\b/],
  ];

  function parseWhen(t) {
    const today = new Date();
    let d = null;
    let label = null;
    if (/\b(today|tonight)\b/.test(t)) [d, label] = [today, 'today'];
    else if (/\btomorrow\b/.test(t)) {
      d = new Date(today);
      d.setDate(d.getDate() + 1);
      label = 'tomorrow';
    } else if (/\bweekend\b/.test(t)) [d, label] = [NX.dates.nextDow(6), 'this weekend'];
    else {
      DAY_NAMES.forEach((n, i) => {
        if (!d && new RegExp(`\\b(${n}|${DAY_SHORT[i]})\\b`).test(t)) [d, label] = [NX.dates.nextDow(i), n];
      });
    }
    let time = null;
    if (/\bmorning\b/.test(t)) time = 'morning';
    else if (/\bafternoon\b/.test(t)) time = 'afternoon';
    else if (/\b(evening|tonight|night)\b/.test(t)) time = 'evening';
    const clock = t.match(/\b(\d{1,2})(?::\d\d)?\s*(am|pm)\b/);
    if (clock) time = clock[2] === 'am' ? 'morning' : +clock[1] >= 5 && +clock[1] !== 12 ? 'evening' : 'afternoon';
    return { date: d ? NX.dates.iso(d) : null, day_label: label, time_preference: time };
  }

  function intent(text, inputType = 'text') {
    const t = text.toLowerCase().trim();
    const activity = Object.keys(ACTIVITIES).find((a) => ACTIVITIES[a].test(t)) || null;
    const skill = (SKILLS.find(([, re]) => re.test(t)) || [])[0] || null;
    const when = parseWhen(t);
    const budget = (t.match(/under\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/) || [])[1];
    const asksForPerson =
      /\b(need|looking for|find|hire|get|want)\b.*\b(someone|somebody|person|people|developer|dev|designer|editor|engineer|photographer|help)\b/.test(t) ||
      /\bwho can\b/.test(t);
    const source = /\b(this|the|that|our|last|from) (game|match|event)\b/.test(t) ? 'event' : null;
    const startup = /\b(startup|start-up|mvp|my company)\b/.test(t);

    let type;
    if (/who should i meet|people (i should|to) meet|introduce me|meet someone/.test(t)) type = 'WHO_SHOULD_I_MEET';
    else if (/who needs me|needs? my (skills|help)|opportunit|where can i help|can i help/.test(t)) type = 'WHO_NEEDS_ME';
    else if (skill && asksForPerson) type = 'FIND_SKILL';
    else if (/summar|recap|what('?s| is) (happening|new|going on)|catch me up/.test(t)) type = 'SUMMARIZE_COMMUNITY';
    else if (/\b(venue|ground|turf|court|book)\b/.test(t)) type = 'FIND_VENUE';
    else if (/\binvite\b/.test(t)) type = 'INVITE_MEMBER';
    else if (activity && /\b(organi[sz]e|create|host|set up|start|plan)\b/.test(t)) type = 'CREATE_EVENT';
    else if (activity) type = 'JOIN_EVENT';
    else if (/\b(events?|happening|plans|meetups?)\b/.test(t)) type = 'FIND_EVENT';
    else if (asksForPerson) type = 'FIND_PERSON';
    else type = 'UNKNOWN';

    const entities = {
      activity, skill, date: when.date, day_label: when.day_label,
      time_preference: when.time_preference, source, startup,
    };
    const found = Object.values(entities).filter(Boolean).length;
    const confidence = type === 'UNKNOWN' ? 0.32 : Math.min(0.97, 0.84 + found * 0.04);

    return api('POST', '/api/v1/intent',
      { input: { type: inputType, text }, user_id: S().meId, session_id: 'sess_demo' },
      {
        intent_id: uid('int'),
        intent: { type, confidence: +confidence.toFixed(2) },
        entities,
        constraints: { location: null, budget: budget ? +budget.replace(/,/g, '') : null, group_size: null },
        requires_context: type !== 'UNKNOWN',
      });
  }

  // ---------------------------------------------------------------- context

  function isAvailable(u, dateIso, time) {
    if (!dateIso) return u.availability.length > 0;
    const dow = new Date(`${dateIso}T12:00:00`).getDay();
    const day = DAY_SHORT[dow];
    return u.availability.some((a) => {
      if (a === day) return true;
      if (a.startsWith(`${day}_`)) return !time || a.endsWith(time);
      if (a === 'weekday_evening') return dow >= 1 && dow <= 5 && (!time || time === 'evening');
      if (a === 'weekend') return dow === 0 || dow === 6;
      return false;
    });
  }

  const AVAIL_TEXT = {
    fri_evening: 'Friday evenings', sat: 'Saturdays', sun: 'Sundays',
    weekday_evening: 'weekday evenings', mon_evening: 'Monday evenings', wed_evening: 'Wednesday evenings',
  };
  const availText = (u) => u.availability.map((a) => AVAIL_TEXT[a] || a).join(' & ');

  function pickCommunity(entities) {
    const mine = me().communities.map((id) => S().communities[id]);
    if (entities.activity) {
      const c = mine.find((c) => c.interests.includes(entities.activity));
      if (c) return c.id;
    }
    if (entities.source === 'event') {
      const ev = activeEvent();
      if (ev) return ev.community_id;
    }
    if (entities.startup || ['React', 'Node.js', 'AI/ML', 'UI Design'].includes(entities.skill)) {
      const c = mine.find((c) => c.category === 'Startups');
      if (c) return c.id;
    }
    return mine[0].id;
  }

  // The event the user is most engaged with (used for "this game").
  function activeEvent() {
    const evs = Object.values(S().events).filter((e) => e.participants.includes(S().meId));
    return evs.sort((a, b) => (b.updated || 0) - (a.updated || 0))[0] || S().events.evt_001;
  }

  function searchMemory(communityId, keywords) {
    const kw = keywords.filter(Boolean).map((k) => k.toLowerCase());
    return S().memories
      .filter((m) => !communityId || m.community_id === communityId)
      .map((m) => ({ m, hits: m.tags.filter((t) => kw.some((k) => k.includes(t) || t.includes(k))).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || b.m.ts - a.m.ts)
      .map((x) => x.m);
  }

  function memoryQuery(communityId, q) {
    const items = searchMemory(communityId, q.split(/\s+/));
    return api('GET', `/api/v1/communities/${communityId}/memory?q=${encodeURIComponent(q)}`, null, { items });
  }

  function findEvents(entities) {
    return Object.values(S().events)
      .filter((e) => e.status !== 'CANCELLED')
      .filter((e) => !entities.activity || e.activity === entities.activity)
      .filter((e) => !entities.date || e.schedule.date === entities.date || entities.day_label === 'this weekend');
  }

  function context(intentData) {
    const { intent: it, entities } = intentData;
    const communityId = pickCommunity(entities);
    const events = ['JOIN_EVENT', 'FIND_EVENT', 'CREATE_EVENT'].includes(it.type) ? findEvents(entities) : [];
    const ev = events[0];
    const known = ev ? ev.participants.filter((id) => user(id).playedWithMe > 0).sort((a, b) => user(b).playedWithMe - user(a).playedWithMe) : [];
    const keywords = [entities.activity, entities.skill, entities.startup && 'startup', it.type === 'FIND_VENUE' && 'venue', entities.source && 'media'];
    const memory = searchMemory(communityId, keywords).slice(0, 3);
    const discussions = S().discussions
      .filter((d) => d.community_id === communityId && (!ev || !d.event_id || d.event_id === ev.id))
      .slice(-3);
    const req = {
      intent_id: intentData.intent_id, user_id: S().meId,
      query: { community_id: communityId, intent_type: it.type, entities },
      include: ['people', 'events', 'discussions', 'memory'], limit: 10,
    };
    return api('POST', '/api/v1/context/query', req, {
      context_id: uid('ctx'), community_id: communityId,
      events: events.map((e) => e.id), people: known, discussions: discussions.map((d) => d.id),
      memory: memory.map((m) => m.id),
    });
  }

  // ---------------------------------------------------------------- matching

  // One scorer for every "find a person" problem: players, editors, developers.
  function scorePerson(u, req) {
    if (!u.skills.includes(req.skill)) return null;
    const reasons = [];
    const cons = [];
    let s = 0.35;
    const hl = u.highlights[req.skill] || [];
    reasons.push(...hl);
    s += Math.min(0.15, hl.length * 0.05);

    if (req.communityId && u.communities.includes(req.communityId)) {
      s += 0.15;
      if (req.purpose === 'talent') {
        reasons.push(u.workedWithCommunity ? 'Previously worked with your community' : `Member of ${S().communities[req.communityId].short}`);
      }
    }

    let avail;
    let availReason;
    if (req.window === 'weekend') {
      avail = u.availability.some((a) => a === 'sat' || a === 'sun' || a === 'weekend');
      availReason = 'Available this weekend';
    } else if (req.date) {
      avail = isAvailable(u, req.date, req.time);
      availReason = `Usually free ${req.dayLabel ? cap(req.dayLabel) : ''} ${req.time || ''}`.replace(/\s+/g, ' ').trim();
    } else {
      avail = u.availability.length > 0;
      availReason = `Available ${availText(u)}`;
    }
    if (avail) {
      s += 0.2;
      reasons.push(availReason);
    } else {
      s -= 0.3;
      cons.push(u.reputation.note && !u.availability.length ? u.reputation.note : u.availability.length ? `Only free ${availText(u)}` : 'Not available right now');
    }

    const rel = u.reputation.reliability;
    if (rel >= 90) {
      s += 0.1;
      reasons.push(req.purpose === 'talent' ? `Delivers on time (${rel}% reliability)` : `Shows up ${rel}% of the time`);
    } else if (rel < 75) {
      s -= 0.15;
      cons.push(u.reputation.note || `Reliability ${rel}%`);
    }
    if (u.playedWithMe && req.purpose === 'player') {
      s += 0.05;
      reasons.push(`Played with you ${u.playedWithMe} times`);
    }
    s = Math.max(0, Math.min(1, s));
    return { user_id: u.id, score: +s.toFixed(2), fit: s >= 0.8 ? 'Strong fit' : s >= 0.55 ? 'Good fit' : 'Weak fit', reasons, cons, available: avail };
  }

  function match(req) {
    const exclude = new Set([S().meId, ...(req.exclude || [])]);
    const results = Object.values(S().users)
      .filter((u) => !exclude.has(u.id))
      .map((u) => scorePerson(u, req))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return api('POST', '/api/v1/match', { requirement: req }, { matches: results });
  }

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function playerCandidates(eventId) {
    const ev = S().events[eventId];
    const dow = new Date(`${ev.schedule.date}T12:00:00`).getDay();
    return match({
      skill: 'Football', purpose: 'player', date: ev.schedule.date, time: 'evening',
      dayLabel: DAY_NAMES[dow], communityId: ev.community_id, exclude: ev.participants,
    }).data.matches;
  }

  function whoShouldIMeet() {
    const m = me();
    const list = Object.values(S().users)
      .filter((u) => u.id !== m.id && u.lookingFor.some((s) => m.skills.includes(s)))
      .map((u) => {
        const shared = u.communities.filter((c) => m.communities.includes(c)).map((c) => S().communities[c].short);
        const theyNeed = u.lookingFor.filter((s) => m.skills.includes(s));
        return {
          user_id: u.id,
          headline: `You're building an AI product. ${firstName(u.id)} ${u.doing} and is looking for ${u.lookingForText}.`,
          reasons: [
            `Looking for ${theyNeed.join(' & ')}, which you have`,
            shared.length ? `You're both in ${shared.join(' & ')}` : null,
            u.verified ? 'Verified member' : null,
          ].filter(Boolean),
          score: theyNeed.length + shared.length + (u.verified ? 0.5 : 0),
        };
      })
      .sort((a, b) => b.score - a.score);
    return api('POST', '/api/v1/match', { requirement: { type: 'WHO_SHOULD_I_MEET', user_id: m.id } }, { matches: list });
  }

  function whoNeedsMe() {
    const m = me();
    const list = Object.values(S().opportunities)
      .filter((o) => o.status === 'OPEN' && o.skills.some((s) => m.skills.includes(s)))
      .map((o) => ({
        opportunity_id: o.id,
        reasons: [
          `Needs ${o.skills.join(', ')}, which you have`,
          o.when === 'This weekend' ? "When: this weekend, and you're free Saturday" : `When: ${o.when}`,
          o.detail,
        ],
      }));
    return api('POST', '/api/v1/opportunities/search', { reverse: true, user_id: m.id }, { opportunities: list });
  }

  function summarize(communityId) {
    const c = S().communities[communityId];
    const evs = Object.values(S().events).filter((e) => e.community_id === communityId);
    const mems = S().memories.filter((m) => m.community_id === communityId).sort((a, b) => b.ts - a.ts).slice(0, 4);
    const recent = S().activity.filter((a) => a.payload.community_id === communityId).length;
    return api('POST', `/api/v1/communities/${communityId}/summary`, null, {
      community_id: communityId,
      lines: [
        `${c.members.length} members · ${evs.length} event${evs.length === 1 ? '' : 's'}`,
        ...evs.map((e) => `${e.name}: ${e.participants.length}/${e.capacity} · ${e.status}${e.location.name ? ` · ${e.location.name}` : ''}`),
        recent ? `${recent} updates since you opened NEXUS` : null,
      ].filter(Boolean),
      memory: mems.map((m) => m.id),
    });
  }

  // ---------------------------------------------------------------- venues

  function searchVenues(eventId) {
    const ev = S().events[eventId];
    const mems = searchMemory(ev.community_id, ['venue', 'budget', 'location']);
    const area = (mems.find((m) => m.signal?.kind === 'venue_area') || {}).signal?.value;
    const budget = (mems.find((m) => m.signal?.kind === 'budget_max') || {}).signal?.value;
    const venues = Object.values(S().venues)
      .map((v) => {
        let s = v.available ? 0.2 : -1;
        const why = [];
        if (area && v.area === area) {
          s += 0.5;
          why.push(`your community usually prefers ${area}`);
        }
        if (budget && v.price <= budget) {
          s += 0.3;
          why.push(`it's under ₹${budget.toLocaleString('en-IN')}`);
        } else if (budget) why.push(`over the usual ₹${budget.toLocaleString('en-IN')} budget`);
        s += v.rating * 0.02;
        return { ...v, score: +s.toFixed(2), why };
      })
      .sort((a, b) => b.score - a.score);
    venues.forEach((v, i) => {
      v.ai_reason = i === 0
        ? `Best match: ${v.why.join(' and ')}.`
        : cap(v.why.filter((w) => !w.includes('prefers')).join(', ') || `${v.distance} away`) + '.';
    });
    return api('POST', '/api/v1/venues/search',
      { event_id: eventId, constraints: { area, budget_max: budget } },
      { mode: 'SIMULATED', venues, memory_used: mems.map((m) => m.id) });
  }

  // ---------------------------------------------------------------- memory

  function remember(communityId, source, type, summary, facts, tags, signal) {
    const m = {
      id: uid('mem'), community_id: communityId, source, type, summary, facts,
      tags: tags || [], signal: signal || null, created_by: 'system', ts: Date.now(),
    };
    S().memories.push(m);
    api('POST', '/api/v1/memory', { community_id: communityId, source, memory: { type, summary, facts }, created_by: 'system' }, { memory_id: m.id });
    emit('MEMORY_CREATED', { community_id: communityId, memory_id: m.id }, `NEXUS remembered: ${summary}`);
    return m;
  }

  // ---------------------------------------------------------------- proposals & execution

  function propose(action, meta) {
    const p = {
      proposal_id: uid('prop'), action, title: meta.title, summary: meta.summary,
      reason: meta.reason || [], requires_confirmation: true, risk_level: meta.risk || 'LOW',
      simulated: !!meta.simulated, status: 'PENDING',
    };
    S().proposals[p.proposal_id] = p;
    save();
    return api('POST', '/api/v1/actions/proposals', { action }, p).data;
  }

  async function confirm(proposalId, decision, params = {}) {
    const p = S().proposals[proposalId];
    const execution_id = uid('exec');
    api('POST', `/api/v1/actions/${proposalId}/confirm`,
      { user_id: S().meId, confirmation: decision, parameters: params },
      { execution_id, status: decision === 'APPROVE' ? 'QUEUED' : 'CANCELLED' });
    if (!p) return { status: 'FAILED', error: 'Proposal not found' };
    if (decision !== 'APPROVE') {
      p.status = 'REJECTED';
      save();
      return { status: 'REJECTED', message: 'Okay, nothing changed.' };
    }
    p.status = 'APPROVED';
    return execute({
      execution_id, proposal_id: proposalId,
      action: { ...p.action, params: { ...(p.action.params || {}), ...params } },
      actor_id: S().meId, idempotency_key: proposalId,
    });
  }

  async function execute(exec) {
    const prior = S().executions[exec.idempotency_key];
    if (prior) return prior.result || { status: 'FAILED', error: 'Already in progress' };
    const handler = ACTIONS[exec.action.type];
    const fail = (error) => {
      api('POST', '/api/v1/actions/execute', exec, { execution_id: exec.execution_id, status: 'FAILED', error });
      return { status: 'FAILED', error };
    };
    if (!handler) return fail(`Unknown action ${exec.action.type}`);
    const invalid = handler.validate ? handler.validate(exec.action, exec.actor_id) : null;
    if (invalid) return fail(invalid);
    if (!authorize(exec.action, exec.actor_id)) return fail('Not allowed');
    S().executions[exec.idempotency_key] = { ...exec, status: 'RUNNING' };
    api('POST', '/api/v1/actions/execute', exec, { execution_id: exec.execution_id, status: 'RUNNING' });
    const result = { status: 'SUCCEEDED', ...(await handler.execute(exec.action, exec.actor_id)) };
    S().executions[exec.idempotency_key] = { ...exec, status: 'SUCCEEDED', result };
    save();
    return result;
  }

  function authorize(action, actorId) {
    const ev = S().events[action.target_id];
    if (ev) return S().communities[ev.community_id].members.includes(actorId);
    return !!user(actorId);
  }

  function touch(ev, phase) {
    if (phase) ev.phase = phase;
    ev.updated = Date.now();
  }

  function addParticipant(ev, userId) {
    const previous = ev.participants.length;
    ev.participants.push(userId);
    touch(ev, ev.participants.length >= ev.capacity ? 'FULL' : userId === S().meId ? 'PLAYER_JOINED' : 'RECRUITING');
    emit('EVENT_PARTICIPANT_ADDED', {
      community_id: ev.community_id, event_id: ev.id, user_id: userId,
      participant_count: { previous, current: ev.participants.length },
    }, `${userId === S().meId ? 'You' : firstName(userId)} joined ${ev.name} (${ev.participants.length}/${ev.capacity})`);
    if (ev.participants.length >= ev.capacity) {
      emit('EVENT_UPDATED', { community_id: ev.community_id, event_id: ev.id, phase: 'FULL' }, `${ev.name} is full`);
    }
  }

  const evOf = (a) => S().events[a.target_id];

  const ACTIONS = {
    JOIN_EVENT: {
      validate(a, actor) {
        const ev = evOf(a);
        if (!ev) return 'Event not found';
        if (ev.participants.includes(actor)) return "You're already in this game";
        if (ev.participants.length >= ev.capacity) return 'This game is full';
        return null;
      },
      execute(a, actor) {
        const ev = evOf(a);
        addParticipant(ev, actor);
        if (ev.participants.length < ev.capacity) touch(ev, 'RECRUITING');
        return { message: `You're in. ${ev.participants.length}/${ev.capacity} players.` };
      },
    },

    LEAVE_EVENT: {
      validate: (a, actor) => (evOf(a)?.participants.includes(actor) ? null : "You're not in this event"),
      execute(a, actor) {
        const ev = evOf(a);
        const previous = ev.participants.length;
        ev.participants = ev.participants.filter((id) => id !== actor);
        if (ev.status === 'OPEN') touch(ev, 'RECRUITING');
        emit('EVENT_PARTICIPANT_REMOVED', {
          community_id: ev.community_id, event_id: ev.id, user_id: actor,
          participant_count: { previous, current: ev.participants.length },
        }, `${actor === S().meId ? 'You' : firstName(actor)} left ${ev.name} (${ev.participants.length}/${ev.capacity})`);
        return { message: `You left ${ev.name}.` };
      },
    },

    INVITE_MEMBER: {
      validate: (a) => (!a.params?.user_ids?.length ? 'Pick at least one person' : null),
      execute(a, actor) {
        const ev = evOf(a);
        const ids = a.params.user_ids;
        ids.forEach((id) => {
          S().invitations.push({ id: uid('inv'), event_id: ev.id, user_id: id, invited_by: actor, status: 'SENT' });
          S().notifications.push({ id: uid('ntf'), user_id: id, text: `You're invited to ${ev.name}` });
        });
        touch(ev, 'RECRUITING');
        emit('INVITATION_SENT', { community_id: ev.community_id, event_id: ev.id, user_ids: ids },
          `Invited ${ids.map(firstName).join(', ')} to ${ev.name}`);
        return { message: `Invites sent to ${ids.map(firstName).join(', ')}.`, invited: ids };
      },
    },

    ACCEPT_INVITATION: {
      validate(a, actor) {
        const inv = S().invitations.find((i) => i.event_id === a.target_id && i.user_id === actor && i.status === 'SENT');
        if (!inv) return 'No open invitation';
        if (evOf(a).participants.length >= evOf(a).capacity) return 'Game is full';
        return null;
      },
      execute(a, actor) {
        const ev = evOf(a);
        S().invitations.find((i) => i.event_id === ev.id && i.user_id === actor && i.status === 'SENT').status = 'ACCEPTED';
        emit('INVITATION_ACCEPTED', { community_id: ev.community_id, event_id: ev.id, user_id: actor }, `${firstName(actor)} accepted the invite`);
        addParticipant(ev, actor);
        return { message: `${firstName(actor)} joined.` };
      },
    },

    BOOK_VENUE: {
      validate: (a) => (!S().venues[a.params?.venue_id] ? 'Pick a venue' : null),
      async execute(a) {
        const v = S().venues[a.params.venue_id];
        let ev = evOf(a);
        touch(ev, 'BOOKING_PENDING');
        ev.booking = { status: 'PENDING', mode: 'SIMULATED' };
        emit('VENUE_SELECTED', { community_id: ev.community_id, event_id: ev.id, venue_id: v.id }, `${v.name} selected for ${ev.name}`);
        await sleep(1100);
        ev = evOf(a); // state may have been reloaded by another tab
        const ref = `SIM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        api('POST', `/api/v1/venues/${v.id}/book`, { event_id: ev.id, slot: ev.schedule }, { status: 'CONFIRMED', mode: 'SIMULATED', reference: ref });
        ev.location = { name: v.name, venue_id: v.id, area: v.area };
        ev.booking = { status: 'CONFIRMED', mode: 'SIMULATED', reference: ref, price: v.price };
        const n = Math.max(ev.participants.length, 1);
        ev.payment = { status: 'SIMULATED', amount: v.price, per_person: Math.ceil(v.price / n), paid: 0 };
        ev.status = 'CONFIRMED';
        touch(ev, 'CONFIRMED');
        emit('BOOKING_CONFIRMED', { community_id: ev.community_id, event_id: ev.id, venue_id: v.id, mode: 'SIMULATED' }, `Booking confirmed at ${v.name} (simulated)`);
        emit('EVENT_UPDATED', { community_id: ev.community_id, event_id: ev.id, status: 'CONFIRMED' }, `${ev.name} is CONFIRMED`);
        remember(ev.community_id, { type: 'EVENT', id: ev.id }, 'DECISION',
          `Community selected ${v.name} for ${ev.name}.`,
          [`${v.area} preferred by most participants`, `Game at ${fmtTime(ev.schedule.start)} on ${fmtDate(ev.schedule.date)}`, `${ev.participants.length} players confirmed`, `₹${v.price} (₹${ev.payment.per_person} each)`],
          ['venue', v.area.toLowerCase(), 'football', 'decision'], { kind: 'venue_area', value: v.area });
        return { message: `${v.name} booked for ${fmtDate(ev.schedule.date)}, ${fmtTime(ev.schedule.start)}.`, reference: ref };
      },
    },

    COMPLETE_EVENT: {
      validate: (a) => (evOf(a)?.status !== 'CONFIRMED' ? 'Event must be confirmed first' : null),
      execute(a) {
        const ev = evOf(a);
        ev.status = 'COMPLETED';
        touch(ev, 'COMPLETED');
        ev.result = 'Bibs 5 – 4 Non-bibs';
        ev.media = [
          { id: uid('med'), type: 'video', title: "Kiran's long-range goal", by: 'usr_arjun', length: '0:14' },
          { id: uid('med'), type: 'video', title: 'Last-minute save', by: 'usr_meera', length: '0:09' },
          { id: uid('med'), type: 'video', title: 'Full second half', by: 'usr_karthik', length: '24:10' },
        ];
        emit('EVENT_UPDATED', { community_id: ev.community_id, event_id: ev.id, status: 'COMPLETED' }, `${ev.name} completed: ${ev.result}`);
        emit('MEDIA_ADDED', { community_id: ev.community_id, event_id: ev.id, count: ev.media.length }, `${ev.media.length} clips added to ${ev.name}`);
        remember(ev.community_id, { type: 'EVENT', id: ev.id }, 'OUTCOME',
          `${ev.name} was played at ${ev.location.name} with ${ev.participants.length} players.`,
          [`Result: ${ev.result}`, `${ev.media.length} clips uploaded`, 'Started on time at 7 PM'],
          ['football', 'outcome', 'media']);
        touch(ev, 'MEMORY_CREATED');
        return { message: `Game recorded: ${ev.result}. ${ev.media.length} clips saved.` };
      },
    },

    REQUEST_COLLABORATION: {
      validate: (a) => (!user(a.params?.user_id) ? 'Pick a person' : null),
      async execute(a, actor) {
        const p = a.params;
        const collab = { id: uid('col'), from: actor, to: p.user_id, skill: p.skill, source_event_id: p.source_event_id || null, status: 'REQUESTED' };
        S().collaborations.push(collab);
        let ev = p.source_event_id ? S().events[p.source_event_id] : null;
        const communityId = ev ? ev.community_id : p.community_id;
        if (ev) touch(ev, 'COLLABORATION_REQUESTED');
        emit('COLLABORATION_REQUESTED', { community_id: communityId, user_id: p.user_id }, `Collaboration request sent to ${firstName(p.user_id)}`);
        await sleep(1300);
        collab.status = 'ACCEPTED';
        emit('COLLABORATION_ACCEPTED', { community_id: communityId, user_id: p.user_id }, `${firstName(p.user_id)} accepted (simulated)`);
        ev = p.source_event_id ? S().events[p.source_event_id] : null;
        const project = ev ? projectFromEvent(ev, p.user_id, p.skill) : createProject(p, actor, communityId);
        return { message: `${firstName(p.user_id)} accepted. Project “${project.name}” created.`, project_id: project.id };
      },
    },

    CONNECT_USER: {
      execute(a, actor) {
        const id = a.params.user_id;
        S().connections.push({ id: uid('con'), from: actor, to: id, status: 'REQUESTED' });
        emit('CONNECTION_REQUESTED', { community_id: user(id).communities[0], user_id: id }, `You asked to meet ${firstName(id)}`);
        return { message: `Intro sent to ${firstName(id)}. NEXUS shared why you two should meet.` };
      },
    },

    EXPRESS_INTEREST: {
      execute(a, actor) {
        const o = S().opportunities[a.params.opportunity_id];
        o.interested.push(actor);
        emit('OPPORTUNITY_INTEREST', { community_id: me().communities[0], opportunity_id: o.id }, `You offered to help: ${o.requirement}`);
        return { message: `Sent. ${o.creator} will see your profile and portfolio.` };
      },
    },

    CREATE_EVENT: {
      execute(a, actor) {
        const p = a.params;
        let c = Object.values(S().communities).find((c) => c.interests.includes(p.activity));
        if (!c) {
          const cid = `com_${p.activity}`;
          c = S().communities[cid] = {
            id: cid, name: `${cap(p.activity)} — Bengaluru`, short: cap(p.activity), category: 'Sports',
            interests: [p.activity], location: 'Bengaluru', description: `People who play ${p.activity} in Bengaluru.`, members: [actor],
          };
          me().communities.push(cid);
          emit('COMMUNITY_CREATED', { community_id: cid }, `Community created: ${c.name}`);
        }
        const id = uid('evt');
        S().events[id] = {
          id, type: 'SPORTS_EVENT', activity: p.activity, name: `${cap(p.day_label || 'Weekend')} ${cap(p.activity)}`,
          community_id: c.id, organizer: actor,
          schedule: { date: p.date || NX.dates.iso(NX.dates.nextDow(6)), start: p.time_preference === 'morning' ? '07:00' : '18:00', end: '' },
          location: { name: null }, booking: { status: 'PENDING', mode: 'SIMULATED' }, payment: { status: 'SIMULATED' },
          capacity: p.activity === 'badminton' ? 4 : 10, participants: [actor], media: [], status: 'OPEN', phase: 'GAME_OPEN', updated: Date.now(),
        };
        emit('EVENT_CREATED', { community_id: c.id, event_id: id }, `You created ${S().events[id].name}`);
        return { message: `${S().events[id].name} created in ${c.name}.`, event_id: id };
      },
    },
  };

  function projectFromEvent(ev, collaboratorId, skill) {
    const project = {
      id: uid('prj'), name: `${ev.name} Highlight Reel`, objective: 'Create a 30-second highlight reel',
      members: [{ user_id: S().meId, role: 'Owner' }, { user_id: collaboratorId, role: skill || 'Video Editor' }],
      source: { type: 'EVENT', id: ev.id, media: ev.media.map((m) => m.id) },
      deadline: 'Sunday', community_id: ev.community_id, status: 'ACTIVE',
      tasks: [
        { title: 'Pick the best moments', owner: S().meId, done: false },
        { title: 'Edit 30-second cut', owner: collaboratorId, done: false },
        { title: 'Share with community', owner: S().meId, done: false },
      ],
      artifacts: [],
    };
    S().projects[project.id] = project;
    ev.project_id = project.id;
    touch(ev, 'PROJECT_CREATED');
    api('POST', '/api/v1/projects/from-event', { event_id: ev.id, collaborator_id: collaboratorId }, project);
    emit('PROJECT_CREATED', { community_id: ev.community_id, project_id: project.id }, `Project created: ${project.name}`);
    emit('PROJECT_MEMBER_ADDED', { community_id: ev.community_id, project_id: project.id, user_id: collaboratorId }, `${firstName(collaboratorId)} joined ${project.name}`);
    remember(ev.community_id, { type: 'PROJECT', id: project.id }, 'FACT', `${firstName(collaboratorId)} is editing the ${ev.name} highlight reel.`,
      ['Source: event clips', 'Deadline: Sunday'], ['video', 'reel', 'media', firstName(collaboratorId).toLowerCase()]);
    return project;
  }

  function createProject(p, actor, communityId) {
    const project = {
      id: uid('prj'), name: p.project_name || `${p.skill} collaboration`, objective: p.objective || '',
      members: [{ user_id: actor, role: 'Owner' }, { user_id: p.user_id, role: p.skill }],
      source: { type: 'INTENT' }, deadline: p.deadline || 'In 2 weeks', community_id: communityId, status: 'ACTIVE',
      tasks: (p.tasks || []).map((title, i) => ({ title, owner: i % 2 ? actor : p.user_id, done: false })),
      artifacts: [],
    };
    S().projects[project.id] = project;
    api('POST', '/api/v1/projects', { name: project.name, members: project.members }, project);
    emit('PROJECT_CREATED', { community_id: communityId, project_id: project.id }, `Project created: ${project.name}`);
    emit('PROJECT_MEMBER_ADDED', { community_id: communityId, project_id: project.id, user_id: p.user_id }, `${firstName(p.user_id)} joined ${project.name}`);
    remember(communityId, { type: 'PROJECT', id: project.id }, 'FACT', `${firstName(p.user_id)} is helping build ${project.name}.`,
      [`Skill: ${p.skill}`], [p.skill.toLowerCase(), 'startup', 'project']);
    return project;
  }

  // Simulates invitees replying to their invites, one at a time.
  async function simulateReplies(eventId, userIds) {
    for (const id of userIds) {
      await sleep(900);
      const ev = S().events[eventId];
      if (ev.participants.length >= ev.capacity) break;
      await execute({
        execution_id: uid('exec'), action: { type: 'ACCEPT_INVITATION', target_id: eventId },
        actor_id: id, idempotency_key: `accept_${eventId}_${id}`,
      });
    }
    const ev = S().events[eventId];
    if (ev.status === 'OPEN') {
      touch(ev, 'VENUE_SELECTION');
      emit('EVENT_UPDATED', { community_id: ev.community_id, event_id: ev.id, phase: 'VENUE_SELECTION' }, `${ev.name}: choosing a venue`);
    }
  }

  function postDiscussion(communityId, eventId, text) {
    const flagged = /\b(scam|send money|crypto giveaway|click this link)\b/i.test(text);
    const d = { id: uid('dis'), community_id: communityId, event_id: eventId || null, author: S().meId, text, ts: Date.now(), flagged };
    S().discussions.push(d);
    emit('DISCUSSION_CREATED', { community_id: communityId, discussion_id: d.id }, `You posted in ${S().communities[communityId].short}`);
    return d;
  }

  function fmtDate(isoDate) {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtTime(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  NX.engine = {
    speed: 1,
    intent, context, match, playerCandidates, whoShouldIMeet, whoNeedsMe, summarize,
    searchVenues, memoryQuery, searchMemory, remember, propose, confirm, execute,
    simulateReplies, postDiscussion, activeEvent, findEvents, pickCommunity, isAvailable,
    fmtDate, fmtTime, firstName,
  };
})();
