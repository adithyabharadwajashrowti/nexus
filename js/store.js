// State, persistence, the realtime bus (stands in for /ws/community/{id}) and the API trace.
(function () {
  const NX = window.NX;
  const KEY = 'nexus_state_v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  const listeners = new Set();
  const notify = (msg, remote) => listeners.forEach((fn) => fn(msg, remote));

  let bc = null;
  try {
    bc = new BroadcastChannel('nexus');
  } catch (e) {
    bc = null;
  }

  const store = {
    state: load() || NX.seed(),
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(store.state));
      } catch (e) {
        /* storage unavailable: the demo still works in memory */
      }
    },
    // Broadcast a realtime event to this tab and every other open tab.
    emit(event, payload, text) {
      const msg = { id: `evt_msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, event, payload, text, ts: Date.now() };
      store.state.activity.unshift(msg);
      store.state.activity = store.state.activity.slice(0, 60);
      store.save();
      NX.trace.push({ kind: 'ws', path: `/ws/community/${payload.community_id || ''}`, event, res: { event, payload } });
      if (bc) bc.postMessage(msg);
      notify(msg, false);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      store.state = NX.seed();
      store.save();
      if (bc) bc.postMessage({ event: 'DEMO_RESET', payload: {}, ts: Date.now() });
      notify({ event: 'DEMO_RESET', payload: {} }, false);
    },
  };

  if (bc) {
    bc.onmessage = (e) => {
      store.state = load() || store.state;
      notify(e.data, true);
    };
  }
  // Fallback for browsers/origins without BroadcastChannel.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    store.state = load() || store.state;
    if (!bc) notify(null, true);
  });

  const traceListeners = new Set();
  NX.trace = {
    items: [],
    push(item) {
      NX.trace.items.unshift({ ...item, ts: new Date().toISOString() });
      NX.trace.items = NX.trace.items.slice(0, 150);
      traceListeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      traceListeners.add(fn);
    },
  };

  NX.store = store;
})();
