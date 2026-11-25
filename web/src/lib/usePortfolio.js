// Talks to the local tracker server: loads and saves the portfolio (with the
// same version check as before, so an older window can't overwrite newer
// data), refreshes live prices, downloads past closes and checks for updates.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {num} from './format.js';

const EMPTY = {
  ready: false, demo: false, rev: 0,
  transactions: [], dividends: [], expected: [], prices: {}, manual: {},
  settings: {p1: 'Me', p2: '', joint: 'Joint', feeDiscount: 100},
  asof: '',
};

function fromServer(d, asof) {
  d = d || {};
  const manual = {};
  (d.manual || []).forEach(s => { manual[s] = 1; });
  const st = d.settings || {};
  return {
    ready: true, demo: !!d.demo, rev: d.rev || 0,
    transactions: d.transactions || [], dividends: d.dividends || [], expected: d.expected || [],
    prices: d.prices || {}, manual,
    settings: {
      p1: st.p1 || 'Me',
      p2: st.p2 == null ? 'Person 2' : st.p2,
      joint: st.joint || 'Joint',
      feeDiscount: num(st.feeDiscount) || 100,
    },
    asof: asof || '',
  };
}

function loadNames() {
  try { return JSON.parse(localStorage.getItem('etfNames')) || {}; } catch { return {}; }
}

export function usePortfolio() {
  const [data, setData] = useState(EMPTY);
  const dataRef = useRef(EMPTY);
  const [hist, setHist] = useState(null);
  const [names, setNames] = useState(loadNames);
  const [warning, setWarning] = useState('');
  const [sync, setSync] = useState({state: 'idle', text: ''});
  const [foot, setFoot] = useState('');
  const [isRefreshing, setRefreshing] = useState(false);
  const [update, setUpdate] = useState(null);

  // ---- saving ------------------------------------------------------------
  const save = useRef({timer: null, saving: false, pending: false, userDirty: false});

  const doSave = useCallback(() => {
    const sv = save.current;
    if (sv.saving) { sv.pending = true; return; }
    sv.saving = true;
    const hadEdit = sv.userDirty;
    sv.userDirty = false;
    const d = dataRef.current;
    fetch('/api/data', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        rev: d.rev, transactions: d.transactions, dividends: d.dividends, expected: d.expected,
        prices: d.prices, manual: Object.keys(d.manual), settings: d.settings,
      }),
    })
      .then(r => {
        if (r.status === 409) {
          // Another window saved first. Take its data instead of overwriting it.
          return r.json().then(j => {
            const lost = hadEdit || sv.userDirty;
            sv.userDirty = false;
            sv.pending = false;
            const next = fromServer(j.data, dataRef.current.asof);
            dataRef.current = next;
            setData(next);
            if (lost) setWarning("Another window changed the portfolio first, so your last change here wasn't saved. This window now shows the latest data. Please make the change again.");
          });
        }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json().then(j => {
          dataRef.current = {...dataRef.current, rev: j.rev};
          setData(dataRef.current);
        });
      })
      .catch(() => setWarning("Couldn't save to disk. Is the tracker still running?"))
      .then(() => {
        sv.saving = false;
        if (sv.pending) { sv.pending = false; doSave(); }
      });
  }, []);

  // auto = a background price update, as opposed to something the person did.
  const commit = useCallback((change, auto = false) => {
    const next = {...dataRef.current, ...change(dataRef.current)};
    dataRef.current = next;
    setData(next);
    const sv = save.current;
    if (!auto) sv.userDirty = true;
    clearTimeout(sv.timer);
    sv.timer = setTimeout(doSave, 250);
  }, [doSave]);

  // ---- past closing prices --------------------------------------------------
  const histState = useRef({timer: null, loading: false});
  const loadHistory = useCallback(() => {
    const h = histState.current;
    if (h.loading) return;
    h.loading = true;
    clearTimeout(h.timer);
    fetch('/api/history')
      .then(r => r.json())
      .then(d => {
        setHist(d);
        if (d.busy) h.timer = setTimeout(loadHistory, 3000);
      })
      .catch(() => { h.timer = setTimeout(loadHistory, 30000); })
      .then(() => { h.loading = false; });
  }, []);

  // ---- live prices -----------------------------------------------------------
  const refresh = useRef({busy: false, again: false});
  const refreshPrices = useCallback(manual => {
    const rf = refresh.current;
    if (rf.busy) { if (!manual) rf.again = true; return; }
    const list = [...new Set(dataRef.current.transactions.map(t => t.symbol).filter(Boolean))];
    if (!list.length) {
      if (manual) setFoot('Add a transaction first, then prices update automatically.');
      return;
    }
    rf.busy = true;
    setRefreshing(true);
    setSync({state: 'busy', text: 'Updating prices…'});
    const minShow = new Promise(res => setTimeout(res, 800));
    const quotes = fetch('/api/prices?symbols=' + encodeURIComponent(list.join(','))).then(r => r.json());
    Promise.all([quotes, minShow])
      .then(([d]) => {
        const q = (d && d.quotes) || {};
        let hit = 0;
        setNames(prev => {
          const n = {...prev};
          list.forEach(s => { if (q[s] && q[s].name) n[s] = q[s].name; });
          try { localStorage.setItem('etfNames', JSON.stringify(n)); } catch { /* private mode */ }
          return n;
        });
        const cur = dataRef.current;
        const prices = {...cur.prices};
        let changed = 0;
        list.forEach(s => {
          const x = q[s];
          if (x && Number.isFinite(x.price) && x.price > 0) {
            hit++;
            if (!cur.manual[s] && num(prices[s]) !== x.price) { prices[s] = x.price; changed++; }
          }
        });
        const asof = (d && d.asof) || cur.asof;
        if (changed) commit(() => ({prices, asof}), true);
        else { dataRef.current = {...cur, asof}; setData(dataRef.current); }
        const hhmm = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        if (hit) {
          setSync({state: 'ok', text: 'Updated ' + hhmm});
          setFoot('Prices update every 5 minutes · last refreshed ' + hhmm + (d.asof ? ' · exchange date ' + d.asof : '') + ' · NT$');
        } else {
          setSync({state: 'warn', text: 'No quotes'});
          setFoot("Couldn't get live quotes (market closed or codes not found). Use Edit prices to set them by hand. · NT$");
        }
      })
      .catch(() => {
        setSync({state: 'warn', text: 'Update failed'});
        setFoot('Price service unavailable. Set prices by hand with Edit prices. · NT$');
      })
      .then(() => {
        rf.busy = false;
        setRefreshing(false);
        if (rf.again) { rf.again = false; refreshPrices(false); }
      });
  }, [commit]);

  // ---- updates from GitHub ------------------------------------------------------
  const checkUpdate = useCallback(() => {
    fetch('/api/update').then(r => r.json()).then(u => {
      setUpdate(prev => (prev && prev.phase !== 'offer' ? prev : u.available ? {...u, phase: 'offer'} : null));
    }).catch(() => {});
  }, []);
  const installUpdate = useCallback(() => {
    setUpdate(u => ({...u, phase: 'installing'}));
    fetch('/api/update', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})
      .then(r => r.json())
      .then(res => {
        if (!res.ok) throw new Error(res.error || 'update failed');
        setUpdate(u => ({...u, phase: 'restarting', installed: res.version}));
        let tries = 0;
        const wait = () => setTimeout(() => {
          fetch('/api/update').then(r => r.json()).then(u => {
            if (u.current === res.version) window.location.reload();
            else if (++tries < 30) wait();
          }).catch(() => { if (++tries < 30) wait(); });
        }, 1000);
        wait();
      })
      .catch(e => setUpdate(u => ({...u, phase: 'failed', error: e.message})));
  }, []);

  // ---- start -------------------------------------------------------------------
  useEffect(() => {
    let timer = null;
    fetch('/api/data')
      .then(r => r.json())
      .then(d => {
        dataRef.current = fromServer(d);
        setData(dataRef.current);
        refreshPrices(false);
        loadHistory();
        checkUpdate();
        timer = setInterval(() => { refreshPrices(false); loadHistory(); }, 5 * 60 * 1000);
      })
      .catch(() => {
        dataRef.current = {...EMPTY, ready: true};
        setData(dataRef.current);
        setWarning("Couldn't reach the tracker. Quit and open it again.");
      });
    const updTimer = setInterval(checkUpdate, 6 * 60 * 60 * 1000);
    return () => { clearInterval(timer); clearInterval(updTimer); };
  }, [refreshPrices, loadHistory, checkUpdate]);

  // ---- edits ---------------------------------------------------------------------
  const actions = useMemo(() => ({
    saveTx(id, rec) {
      const body = {
        id, type: rec.type === 'sell' ? 'sell' : 'buy', date: rec.date || '', symbol: rec.symbol,
        shares: num(rec.shares), price: num(rec.price), person: rec.person || 'p1',
        costs: rec.costs == null ? null : num(rec.costs),
      };
      const isNew = !dataRef.current.transactions.some(t => t.id === id);
      commit(d => ({transactions: isNew ? [...d.transactions, body] : d.transactions.map(t => (t.id === id ? body : t))}));
      if (isNew && body.symbol && !dataRef.current.prices[body.symbol]) refreshPrices(false);
      setTimeout(loadHistory, 800); // a new symbol or earlier date may need more past prices
    },
    removeTx(id) { commit(d => ({transactions: d.transactions.filter(t => t.id !== id)})); },
    saveExp(id, rec) {
      const body = {
        id, symbol: rec.symbol, person: rec.person || 'p1', exDate: rec.exDate, payDate: rec.payDate,
        perUnit: num(rec.perUnit), status: rec.status === 'announced' ? 'announced' : 'estimate', actual: rec.actual,
      };
      commit(d => {
        const has = d.expected.some(x => x.id === id);
        return {expected: has ? d.expected.map(x => (x.id === id ? body : x)) : [...d.expected, body]};
      });
    },
    removeExp(id) { commit(d => ({expected: d.expected.filter(x => x.id !== id)})); },
    saveSettings(settings) { commit(() => ({settings})); },
    savePrices(typed) {
      // typed: symbol -> string as entered. Empty = follow the live price again.
      let cleared = false;
      commit(d => {
        const prices = {...d.prices}, manual = {...d.manual};
        Object.keys(typed).forEach(s => {
          const raw = String(typed[s]).trim();
          if (raw === '') { if (manual[s]) { delete manual[s]; cleared = true; } return; }
          const v = num(raw);
          if (v > 0 && v !== num(prices[s])) { prices[s] = v; manual[s] = 1; }
        });
        return {prices, manual};
      });
      if (cleared) refreshPrices(false);
    },
  }), [commit, refreshPrices, loadHistory]);

  return {
    data, hist, names, warning, setWarning, sync, foot, isRefreshing, update,
    refreshPrices, loadHistory, installUpdate, actions,
  };
}
