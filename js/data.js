// Seed data for the NEXUS demo: one community graph shared by every feature.
(function () {
  const NX = (window.NX = window.NX || {});

  function nextDow(dow, from = new Date()) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    return d;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  NX.dates = { nextDow, iso };

  function hue(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }

  NX.seed = function () {
    const friday = iso(nextDow(5));
    const saturday = iso(nextDow(6));
    const now = Date.now();
    const H = 3600 * 1000;
    const users = {};

    function add(u) {
      users[u.id] = {
        verified: false, skills: [], interests: [], goals: [], availability: [],
        communities: [], highlights: {}, lookingFor: [], playedWithMe: 0,
        reputation: { rating: 4.5, reliability: 90 }, ...u, hue: hue(u.name),
      };
    }

    add({
      id: 'usr_me', name: 'Alex Rao', headline: 'Building an AI product · Friday footballer',
      skills: ['Product', 'AI/ML', 'UI Design', 'Football'],
      interests: ['football', 'startups', 'community'],
      goals: ['Build an AI product', 'Grow a founding team'],
      availability: ['fri_evening', 'sat', 'sun'],
      communities: ['com_friday_football', 'com_blr_builders'],
      reputation: { rating: 4.7, reliability: 94 }, verified: true,
      portfolio: ['Designed the Friday Football sign-up flow', 'Speaker at AI Builders Meetup #3'],
      gamesPlayed: 6,
    });

    const FF = 'com_friday_football';
    const player = (id, name, pos, games, rel, played, extra = {}) =>
      add({
        id, name, headline: `${pos} · Friday Football`, skills: ['Football'],
        interests: ['football'], availability: ['fri_evening'], communities: [FF],
        highlights: { Football: [`Played ${games} Friday games`, pos] },
        reputation: { rating: 4.4 + (rel % 5) / 10, reliability: rel },
        playedWithMe: played, gamesPlayed: games, ...extra,
      });

    // Already in the game (11)
    player('usr_arjun', 'Arjun Mehta', 'Striker', 18, 96, 6, { verified: true });
    player('usr_karthik', 'Karthik S', 'Goalkeeper', 15, 94, 5);
    player('usr_vikram', 'Vikram Rao', 'Defender', 12, 90, 3);
    player('usr_sneha', 'Sneha Kulkarni', 'Midfielder', 10, 92, 4);
    player('usr_rohan', 'Rohan Gupta', 'Winger', 9, 88, 2);
    player('usr_meera', 'Meera Pillai', 'Defender', 14, 97, 5, { verified: true });
    player('usr_aditya', 'Aditya Jain', 'Midfielder', 6, 86, 1);
    player('usr_nikhil', 'Nikhil Bose', 'Striker', 8, 89, 2);
    player('usr_farhan', 'Farhan Ali', 'Defender', 11, 93, 3);
    player('usr_divya', 'Divya Menon', 'Winger', 7, 91, 2);
    player('usr_siddharth', 'Siddharth Kapoor', 'Midfielder', 13, 95, 4, {
      headline: 'Founder, sports-tech startup · Friday Football',
      communities: [FF, 'com_blr_builders'], skills: ['Football', 'Sales'], lookingFor: ['Product'],
      doing: 'is building a sports-tech startup',
      lookingForText: 'a product-minded AI builder',
    });

    // Members not yet in the game: the invite candidates
    player('usr_kiran', 'Kiran Shetty', 'Midfielder', 14, 97, 5, { verified: true });
    player('usr_varun', 'Varun Reddy', 'Defender', 11, 93, 4);
    player('usr_imran', 'Imran Khan', 'Winger', 9, 91, 3);
    player('usr_tara', 'Tara Joseph', 'Midfielder', 7, 89, 2);
    player('usr_zoya', 'Zoya Hussain', 'Striker', 3, 64, 1, {
      reputation: { rating: 4.0, reliability: 64, note: 'Dropped out of 3 of the last 5 games' },
    });
    player('usr_manoj', 'Manoj Kumar', 'Goalkeeper', 16, 95, 4, {
      availability: ['sat', 'sun'],
    });

    // Talent
    add({
      id: 'usr_rahul', name: 'Rahul Nair', headline: 'Video editor · sports & short-form',
      skills: ['Video Editing', 'Motion Graphics'], interests: ['football', 'film'],
      availability: ['sat', 'sun'], communities: [FF], workedWithCommunity: true,
      highlights: { 'Video Editing': ['Covered 4 community events', 'Edited 12 short-form reels'] },
      reputation: { rating: 4.9, reliability: 98 }, verified: true,
      portfolio: ['Friday Football: Monsoon Cup reel', 'HSR 5-a-side highlights', '12 Instagram reels'],
    });
    add({
      id: 'usr_sana', name: 'Sana Sheikh', headline: 'Freelance video editor',
      skills: ['Video Editing'], availability: ['sat'],
      highlights: { 'Video Editing': ['Edited 30+ product videos'] },
      reputation: { rating: 4.6, reliability: 84 },
    });
    add({
      id: 'usr_neha', name: 'Neha Iyer', headline: 'Photographer · occasional video',
      skills: ['Photography', 'Video Editing'], availability: ['mon_evening', 'wed_evening'],
      highlights: { 'Video Editing': ['Edited 3 wedding films'], Photography: ['Shot 40+ events'] },
      reputation: { rating: 4.5, reliability: 85 },
    });

    const BB = 'com_blr_builders';
    add({
      id: 'usr_priya', name: 'Priya Raman', headline: 'Frontend engineer · React',
      skills: ['React', 'TypeScript', 'UI Design'], interests: ['startups', 'design systems'],
      availability: ['weekday_evening', 'sat'], communities: [BB],
      highlights: { React: ['5 years building React apps', 'Shipped 3 startup MVPs', 'Open to early-stage startups'] },
      reputation: { rating: 4.8, reliability: 95 }, verified: true,
      doing: 'is a React engineer open to early-stage startups', lookingFor: ['AI/ML'],
      lookingForText: 'an AI product to build the frontend for',
    });
    add({
      id: 'usr_dev', name: 'Dev Patel', headline: 'Full-stack engineer · Node & React',
      skills: ['Node.js', 'React'], availability: ['sun'], communities: [BB],
      highlights: { React: ['2 years of React, mostly backend work'], 'Node.js': ['Built 4 production APIs'] },
      reputation: { rating: 4.4, reliability: 88 },
    });
    add({
      id: 'usr_ishaan', name: 'Ishaan Verma', headline: 'React Native developer',
      skills: ['React'], availability: [],
      highlights: { React: ['Built 2 React Native apps'] },
      reputation: { rating: 4.6, reliability: 92, note: 'Fully booked until next month' },
    });
    add({
      id: 'usr_ananya', name: 'Ananya Das', headline: 'Community growth · building a community app',
      skills: ['Community Growth', 'Marketing'], interests: ['community', 'startups'],
      availability: ['sat'], communities: [BB],
      doing: 'is working on community growth', lookingFor: ['AI/ML', 'Product'],
      lookingForText: 'a technical collaborator', verified: true,
    });

    const communities = {
      [FF]: {
        id: FF, name: 'Friday Football — Bengaluru', short: 'Friday Football', category: 'Sports',
        interests: ['football'], location: 'Bengaluru',
        description: 'A weekly 8-a-side game for people who work in and around HSR & Koramangala.',
        members: Object.values(users).filter((u) => u.communities.includes(FF)).map((u) => u.id),
      },
      [BB]: {
        id: BB, name: 'Bengaluru Builders', short: 'Builders', category: 'Startups',
        interests: ['startups', 'ai', 'react'], location: 'Bengaluru',
        description: 'Founders, engineers and designers building products in Bengaluru.',
        members: Object.values(users).filter((u) => u.communities.includes(BB)).map((u) => u.id),
      },
    };

    const events = {
      evt_001: {
        id: 'evt_001', type: 'SPORTS_EVENT', activity: 'football', name: 'Friday Football',
        community_id: FF, organizer: 'usr_arjun',
        schedule: { date: friday, start: '19:00', end: '20:00' },
        location: { name: null, preferred: 'HSR' },
        booking: { status: 'PENDING', mode: 'SIMULATED' },
        payment: { status: 'SIMULATED' },
        capacity: 16,
        participants: ['usr_arjun', 'usr_karthik', 'usr_vikram', 'usr_sneha', 'usr_rohan', 'usr_meera',
          'usr_aditya', 'usr_nikhil', 'usr_farhan', 'usr_divya', 'usr_siddharth'],
        media: [], status: 'OPEN', phase: 'GAME_OPEN', project_id: null,
      },
      evt_002: {
        id: 'evt_002', type: 'MEETUP', activity: 'meetup', name: 'AI Builders Meetup',
        community_id: BB, organizer: 'usr_priya',
        schedule: { date: saturday, start: '11:00', end: '13:00' },
        location: { name: 'Koramangala, Bengaluru' },
        booking: { status: 'CONFIRMED', mode: 'SIMULATED' }, payment: { status: 'FREE' },
        capacity: 40, participants: ['usr_priya', 'usr_ananya', 'usr_dev'],
        media: [], status: 'OPEN', phase: 'GAME_OPEN', tags: ['ai', 'startups'],
      },
    };

    const venues = {
      venue_001: { id: 'venue_001', name: 'HSR Football Arena', area: 'HSR', price: 1800, rating: 4.6, available: true, distance: '1.2 km' },
      venue_002: { id: 'venue_002', name: 'Koramangala Sports Hub', area: 'Koramangala', price: 2000, rating: 4.4, available: true, distance: '3.5 km' },
      venue_003: { id: 'venue_003', name: 'Indiranagar Turf Club', area: 'Indiranagar', price: 2400, rating: 4.7, available: true, distance: '7.8 km' },
    };

    const discussions = [
      { id: 'dis_1', community_id: FF, event_id: 'evt_001', author: 'usr_arjun', text: 'HSR again this Friday? Last week was perfect.', ts: now - 20 * H },
      { id: 'dis_2', community_id: FF, event_id: 'evt_001', author: 'usr_karthik', text: '+1 for HSR. Koramangala was ₹2.4k last time — too much.', ts: now - 19 * H },
      { id: 'dis_3', community_id: FF, event_id: 'evt_001', author: 'usr_meera', text: "I'll bring the ball. Someone grab bibs?", ts: now - 6 * H },
      { id: 'dis_4', community_id: BB, author: 'usr_priya', text: 'Anyone building with on-device models? Happy to help on the frontend.', ts: now - 30 * H },
      { id: 'dis_5', community_id: BB, author: 'usr_ananya', text: 'Looking for someone technical to help with a community app — DM me.', ts: now - 9 * H },
    ];

    const memory = (id, community_id, type, summary, facts, tags, signal, ageH) => ({
      id, community_id, type, summary, facts, tags, signal: signal || null,
      source: { type: 'SEED' }, created_by: 'system', ts: now - ageH * H,
    });
    const memories = [
      memory('mem_1', FF, 'PREFERENCE', 'Community usually prefers HSR.',
        ['7 of the last 9 Friday games were in HSR'], ['venue', 'hsr', 'football', 'location'],
        { kind: 'venue_area', value: 'HSR' }, 240),
      memory('mem_2', FF, 'PATTERN', 'Friday games typically happen at 7 PM.',
        ['Kick-off at 7 PM in 11 of the last 12 games'], ['football', 'time', 'friday'], null, 230),
      memory('mem_3', FF, 'FACT', 'Rahul has previously edited community events.',
        ['Edited the Monsoon Cup reel', 'Covered 4 events'], ['video', 'reel', 'rahul', 'media', 'editing'], null, 200),
      memory('mem_4', FF, 'PREFERENCE', 'Most members prefer venues under ₹2,000.',
        ['Poll in August: 12 of 15 voted for under ₹2,000'], ['venue', 'budget', 'price'],
        { kind: 'budget_max', value: 2000 }, 180),
      memory('mem_5', BB, 'PATTERN', 'Builders often look for frontend help on early MVPs.',
        ['5 requests for React help in the last month'], ['react', 'startup', 'frontend', 'developer'], null, 120),
    ];

    const opportunities = {
      opp_001: {
        id: 'opp_001', requirement: 'A college hackathon team needs a UI designer',
        creator: 'Team Pixel (RVCE)', skills: ['UI Design'], when: 'This weekend',
        detail: 'Two-day hackathon, they have 3 engineers and no designer.', status: 'OPEN', interested: [],
      },
      opp_002: {
        id: 'opp_002', requirement: "Ananya's community app needs an AI engineer",
        creator: 'Ananya Das', skills: ['AI/ML'], when: 'Ongoing',
        detail: 'Matching members to events using embeddings.', status: 'OPEN', interested: [],
      },
      opp_003: {
        id: 'opp_003', requirement: 'Startup launch video needs an editor',
        creator: 'Dev Patel', skills: ['Video Editing'], when: 'Next week',
        detail: '60-second launch video.', status: 'OPEN', interested: [],
      },
    };

    return {
      version: 1, meId: 'usr_me', users, communities, events, venues, discussions, memories,
      opportunities, projects: {}, proposals: {}, executions: {}, invitations: [],
      connections: [], collaborations: [], notifications: [], activity: [], thread: [],
    };
  };
})();
