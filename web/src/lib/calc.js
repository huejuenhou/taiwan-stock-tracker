// The tracker's calculations, moved unchanged from the original page:
// average-cost positions and realized P/L, fees and tax, daily results and
// dividend estimates. Every function takes the data it needs, so the numbers
// can be checked against the old page.
import {num, normDate} from './format.js';

export const PEOPLE = ['p1', 'p2', 'joint'];
const DEFAULT_NAMES = {p1: 'Me', p2: 'Person 2', joint: 'Joint'};

export function pname(settings, k) {
  return settings[k] || DEFAULT_NAMES[k] || k;
}

// One person: the second name is empty and nobody else has trades or payments.
export function hasOthers(s) {
  const other = x => x.person === 'p2' || x.person === 'joint';
  return s.transactions.some(other) || s.expected.some(other);
}
export function isSolo(s) {
  return !String(s.settings.p2 || '').trim() && !hasOthers(s);
}
export const matchFilter = (filter, person) => filter === 'all' || person === filter;

// Costs of a trade: broker commission both ways, plus tax when selling.
// Sell tax is 0.1% for ETFs (codes starting "00") and 0.3% for stocks.
const FEE_RATE = 0.001425, ETF_SELL_TAX = 0.001, STOCK_SELL_TAX = 0.003, MIN_FEE = 20, MIN_FEE_ODD_LOT = 1;
export const isEtf = symbol => /^00/.test(String(symbol || ''));
export function estCosts(settings, type, shares, price, symbol) {
  const amt = num(shares) * num(price);
  if (!(amt > 0)) return 0;
  const share = num(settings.feeDiscount) / 100 || 1;
  const fee = Math.max(Math.floor(amt * FEE_RATE * share), num(shares) < 1000 ? MIN_FEE_ODD_LOT : MIN_FEE);
  return fee + (type === 'sell' ? Math.floor(amt * (isEtf(symbol) ? ETF_SELL_TAX : STOCK_SELL_TAX)) : 0);
}
// A trade's own figure (typed from the broker app) wins over the estimate.
export const txCosts = (settings, t) =>
  t.costs != null ? num(t.costs) : estCosts(settings, t.type, t.shares, t.price, t.symbol);

// Positions and realized P/L, by average cost.
export function compute(s) {
  const txs = s.transactions.map((t, i) => ({t, i}));
  txs.sort((a, b) => {
    const da = normDate(a.t.date), db = normDate(b.t.date);
    if (da < db) return -1;
    if (da > db) return 1;
    return a.i - b.i;
  });
  const groups = {};
  txs.forEach(o => {
    const key = (o.t.person || 'p1') + '|' + o.t.symbol;
    (groups[key] = groups[key] || []).push(o.t);
  });
  const positions = [], realizedByPerson = {p1: 0, p2: 0, joint: 0}, txRealized = {};
  Object.keys(groups).forEach(key => {
    const [person, symbol] = key.split('|');
    let sh = 0, cost = 0;
    groups[key].forEach(t => {
      const q = num(t.shares), px = num(t.price);
      if (t.type === 'sell') {
        const avg = sh > 0 ? cost / sh : 0;
        const r = (px - avg) * q - txCosts(s.settings, t);
        txRealized[t.id] = r;
        realizedByPerson[person] = (realizedByPerson[person] || 0) + r;
        cost -= avg * q;
        sh -= q;
        if (sh <= 1e-9) { sh = 0; cost = 0; }
      } else {
        sh += q;
        cost += q * px + txCosts(s.settings, t);
      }
    });
    if (sh > 1e-9) {
      const price = num(s.prices[symbol]);
      const mkt = sh * price;
      positions.push({person, symbol, shares: sh, cost, avgCost: cost / sh, price, mkt, unreal: mkt - cost});
    }
  });
  positions.sort((a, b) => b.mkt - a.mkt);
  return {positions, realizedByPerson, txRealized};
}

export function totals(c, filterFn) {
  let mkt = 0, cost = 0, realized = 0;
  c.positions.forEach(p => { if (filterFn(p.person)) { mkt += p.mkt; cost += p.cost; } });
  PEOPLE.forEach(k => { if (filterFn(k)) realized += c.realizedByPerson[k] || 0; });
  const unreal = mkt - cost;
  return {mkt, cost, unreal, unrealPct: cost > 0 ? (unreal / cost) * 100 : 0, realized, total: unreal + realized};
}

// The latest exchange date uses live quotes so today moves during trading.
function closeOn(s, hist, symbol, date) {
  if (date === s.asof && num(s.prices[symbol]) > 0) return num(s.prices[symbol]);
  const c = hist.closes[symbol];
  return c && c[date] != null ? c[date] : null;
}

// Walks each person's holding in each symbol one trading day at a time.
// A day's result = value at close − value at prior close − bought + sold − costs.
export function dailyResults(s, hist, filter) {
  const groups = {};
  s.transactions.forEach(t => {
    const person = t.person || 'p1';
    if (!t.symbol || !matchFilter(filter, person)) return;
    const key = person + '|' + t.symbol, date = normDate(t.date);
    const g = (groups[key] = groups[key] || {person, symbol: t.symbol, byDate: {}});
    (g.byDate[date] = g.byDate[date] || []).push(t);
  });
  const days = {};
  Object.keys(groups).forEach(key => {
    const g = groups[key], dates = {};
    Object.keys(g.byDate).forEach(d => { dates[d] = 1; });
    Object.keys(hist.closes[g.symbol] || {}).forEach(d => { dates[d] = 1; });
    if (s.asof) dates[s.asof] = 1;
    const first = Object.keys(g.byDate).sort()[0];
    let shares = 0, prev = null;
    Object.keys(dates).sort().forEach(d => {
      if (d < first) return;
      const txs = g.byDate[d] || [];
      let close = closeOn(s, hist, g.symbol, d);
      if (shares <= 1e-9 && !txs.length) { if (close != null) prev = close; return; }
      if (close == null) close = prev != null ? prev : num(txs[0].price);
      let boughtQ = 0, boughtAmt = 0, soldQ = 0, soldAmt = 0, costs = 0;
      txs.forEach(t => {
        const q = num(t.shares), amt = q * num(t.price);
        costs += txCosts(s.settings, t);
        if (t.type === 'sell') { soldQ += q; soldAmt += amt; } else { boughtQ += q; boughtAmt += amt; }
      });
      const end = shares + boughtQ - soldQ;
      const pl = end * close - shares * (prev != null ? prev : close) - boughtAmt + soldAmt - costs;
      const day = (days[d] = days[d] || {date: d, pl: 0, rows: []});
      day.pl += pl;
      day.rows.push({
        costs, person: g.person, symbol: g.symbol, shares: end > 1e-9 ? end : shares, close, prev, pl,
        boughtQ, boughtAvg: boughtQ ? boughtAmt / boughtQ : 0, soldQ, soldAvg: soldQ ? soldAmt / soldQ : 0,
      });
      shares = end <= 1e-9 ? 0 : end;
      prev = close;
    });
  });
  return days;
}

// Dividends: shares held the day before the ex-dividend date.
export function sharesBefore(s, person, symbol, exDate) {
  const sh = s.transactions.reduce((sum, t) => {
    if (t.symbol !== symbol || (t.person || 'p1') !== person || normDate(t.date) >= exDate) return sum;
    return sum + (t.type === 'sell' ? -num(t.shares) : num(t.shares));
  }, 0);
  return Math.max(0, sh);
}
export function expDetail(s, r) {
  const shares = sharesBefore(s, r.person, r.symbol, normDate(r.exDate));
  return {shares, amount: shares * num(r.perUnit), received: r.actual != null};
}
export function expTag(r, d, today) {
  if (d.received) return r.status === 'estimate' ? ['warning', 'Received · est.'] : ['success', 'Received'];
  if (normDate(r.payDate) < today) return ['error', 'Enter actual'];
  return r.status === 'announced' ? ['info', 'Announced'] : ['neutral', 'Estimate'];
}

// Shares held of a symbol on a date, leaving one trade out (for the oversell check).
export function heldOn(s, symbol, person, date, exceptId) {
  return s.transactions.reduce((sum, x) => {
    if ((exceptId && x.id === exceptId) || x.symbol !== symbol || (x.person || 'p1') !== person || normDate(x.date) > date) return sum;
    return sum + (x.type === 'sell' ? -num(x.shares) : num(x.shares));
  }, 0);
}
