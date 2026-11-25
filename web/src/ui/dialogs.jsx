// Add/edit dialogs, Settings and delete confirmations, with the same checks as
// the original page (required fields, the oversell warning that asks twice).
import {useState} from 'react';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Grid} from '@astryxdesign/core/Grid';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Banner} from '@astryxdesign/core/Banner';
import {fmt, nt, num, normDate, localToday, uid} from '../lib/format.js';
import {PEOPLE, pname, estCosts, heldOn, hasOthers} from '../lib/calc.js';

function Shell({title, subtitle, onClose, onSubmit, submitLabel, submitVariant = 'primary', children}) {
  return (
    <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} purpose="form" width={480}>
      <DialogHeader title={title} subtitle={subtitle} onOpenChange={open => { if (!open) onClose(); }} />
      <form onSubmit={e => { e.preventDefault(); onSubmit(); }} noValidate>
        <VStack gap={4} padding={4}>
          {children}
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" onClick={onClose} />
            <Button label={submitLabel} type="submit" variant={submitVariant} />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );
}

function Choice({label, value, onChange, options}) {
  return (
    <VStack gap={1}>
      <Text type="label">{label}</Text>
      <SegmentedControl label={label} value={value} onChange={onChange} layout="fill">
        {options.map(([v, l]) => <SegmentedControlItem key={v} value={v} label={l} />)}
      </SegmentedControl>
    </VStack>
  );
}

const err = message => (message ? {type: 'error', message} : undefined);

export function TransactionDialog({tx, data, filter, solo, onSave, onClose}) {
  const [f, setF] = useState(() => ({
    type: tx ? tx.type : 'buy',
    date: tx ? normDate(tx.date) || localToday() : localToday(),
    symbol: tx ? tx.symbol : '',
    shares: tx ? String(tx.shares) : '',
    price: tx ? String(tx.price) : '',
    person: tx ? tx.person || 'p1' : filter !== 'all' ? filter : 'p1',
    costs: tx && tx.costs != null ? String(tx.costs) : '',
  }));
  const [errors, setErrors] = useState({});
  const [warnedFor, setWarnedFor] = useState('');
  const [warning, setWarning] = useState('');
  const set = k => v => { setF(x => ({...x, [k]: v})); setErrors(e => ({...e, [k]: ''})); };
  const amount = num(f.shares) * num(f.price);
  const estimate = amount ? estCosts(data.settings, f.type, f.shares, f.price, f.symbol.trim()) : 0;

  function submit() {
    const sym = f.symbol.trim().toUpperCase();
    const e = {};
    if (!sym) e.symbol = 'Enter a code';
    if (!(num(f.shares) > 0)) e.shares = 'More than 0';
    if (!(num(f.price) > 0)) e.price = 'More than 0';
    if (!f.date) e.date = 'Pick a date';
    setErrors(e);
    if (Object.keys(e).length) return;
    const who = solo ? 'p1' : f.person;
    if (f.type === 'sell') {
      const q = num(f.shares), held = heldOn(data, sym, who, f.date, tx && tx.id);
      const key = [sym, who, q, f.date].join('|');
      if (q > held + 1e-9 && warnedFor !== key) {
        // Warn once; a second press records it anyway.
        setWarnedFor(key);
        setWarning(pname(data.settings, who) + ' holds only ' + fmt(Math.max(0, held)) + ' shares of ' + sym + ' on that date. Press the button again to record it anyway.');
        return;
      }
    }
    onSave(tx ? tx.id : uid(), {
      type: f.type, date: f.date, symbol: sym, shares: num(f.shares), price: num(f.price), person: who,
      costs: f.costs.trim() === '' ? null : num(f.costs),
    });
    onClose();
  }

  return (
    <Shell title={tx ? 'Edit transaction' : 'Add transaction'} onClose={onClose} onSubmit={submit} submitLabel={tx ? 'Save changes' : 'Add transaction'}>
      <Choice label="Type" value={f.type} onChange={set('type')} options={[['buy', 'Buy'], ['sell', 'Sell']]} />
      <Grid columns={{minWidth: 180, max: 2, repeat: 'fit'}} gap={3}>
        <DateInput label="Date" value={f.date} onChange={v => set('date')(v || '')} format="date" status={err(errors.date)} />
        <TextInput label="Code" value={f.symbol} onChange={set('symbol')} placeholder="00990A" description="ETF or stock, e.g. 00990A or 2330" autoComplete="off" autoCapitalize="characters" status={err(errors.symbol)} />
      </Grid>
      {!solo && (
        <Choice label="Owner" value={f.person} onChange={set('person')} options={PEOPLE.map(k => [k, pname(data.settings, k)])} />
      )}
      <Grid columns={{minWidth: 180, max: 2, repeat: 'fit'}} gap={3}>
        <TextInput label="Shares" value={f.shares} onChange={set('shares')} inputMode="decimal" placeholder="1000" status={err(errors.shares)} />
        <TextInput label="Price" value={f.price} onChange={set('price')} inputMode="decimal" placeholder="12.10" description="NT$ per share" status={err(errors.price)} />
      </Grid>
      <TextInput
        label="Fees & tax" value={f.costs} onChange={set('costs')} inputMode="decimal" isOptional
        placeholder={estimate ? '≈ ' + fmt(estimate) : ''}
        description="NT$ total, as shown in your broker's app. Leave empty to use the estimate."
      />
      {amount > 0 && <Text type="supporting" color="secondary">Amount: {nt(amount, amount % 1 ? 2 : 0)}</Text>}
      {warning && <Banner status="warning" title={warning} />}
    </Shell>
  );
}

export function ExpectedDialog({exp, data, filter, solo, onSave, onClose}) {
  const [f, setF] = useState(() => ({
    symbol: exp ? exp.symbol : '',
    person: exp ? exp.person || 'p1' : filter !== 'all' ? filter : 'p1',
    exDate: exp ? normDate(exp.exDate) : '',
    payDate: exp ? normDate(exp.payDate) : '',
    perUnit: exp ? String(exp.perUnit) : '',
    actual: exp && exp.actual != null ? String(exp.actual) : '',
    status: exp ? exp.status : 'estimate',
  }));
  const [errors, setErrors] = useState({});
  const set = k => v => { setF(x => ({...x, [k]: v})); setErrors(e => ({...e, [k]: ''})); };

  function submit() {
    const sym = f.symbol.trim().toUpperCase();
    const e = {};
    if (!sym) e.symbol = 'Enter a code';
    if (!f.exDate) e.exDate = 'Pick a date';
    if (!f.payDate) e.payDate = 'Pick a date';
    setErrors(e);
    if (Object.keys(e).length) return;
    const actual = f.actual.trim() === '' ? null : num(f.actual);
    // Typing a new actual amount confirms the payment.
    const status = actual != null && (!exp || actual !== exp.actual) ? 'announced' : f.status;
    onSave(exp ? exp.id : uid(), {
      symbol: sym, person: solo ? 'p1' : f.person, exDate: f.exDate, payDate: f.payDate,
      perUnit: num(f.perUnit), status, actual,
    });
    onClose();
  }

  return (
    <Shell title={exp ? 'Edit expected payment' : 'Add expected payment'} onClose={onClose} onSubmit={submit} submitLabel={exp ? 'Save changes' : 'Add payment'}>
      <TextInput label="Code" value={f.symbol} onChange={set('symbol')} placeholder="00400A" autoComplete="off" status={err(errors.symbol)} />
      {!solo && <Choice label="Owner" value={f.person} onChange={set('person')} options={PEOPLE.map(k => [k, pname(data.settings, k)])} />}
      <Grid columns={{minWidth: 180, max: 2, repeat: 'fit'}} gap={3}>
        <DateInput label="Ex-dividend date" value={f.exDate || undefined} onChange={v => set('exDate')(v || '')} format="date" status={err(errors.exDate)} />
        <DateInput label="Payment date" value={f.payDate || undefined} onChange={v => set('payDate')(v || '')} format="date" status={err(errors.payDate)} />
      </Grid>
      <Grid columns={{minWidth: 180, max: 2, repeat: 'fit'}} gap={3}>
        <TextInput label="Per share" value={f.perUnit} onChange={set('perUnit')} inputMode="decimal" placeholder="0.12" description="NT$ expected" />
        <TextInput label="Actual received" value={f.actual} onChange={set('actual')} inputMode="decimal" placeholder="Leave blank until paid" description="NT$ total, after fees" isOptional />
      </Grid>
      <Choice label="Status" value={f.status} onChange={set('status')} options={[['estimate', 'Estimate'], ['announced', 'Announced']]} />
    </Shell>
  );
}

export function PricesDialog({data, onSave, onClose}) {
  const symbols = [...new Set(data.transactions.map(t => t.symbol).filter(Boolean))];
  const [typed, setTyped] = useState(() => Object.fromEntries(symbols.map(s => [s, data.prices[s] ? String(data.prices[s]) : ''])));
  return (
    <Shell
      title="Edit current prices"
      subtitle="A price you type here stays until you empty its field. Empty fields follow the live price (NT$)."
      onClose={onClose} onSubmit={() => { onSave(typed); onClose(); }} submitLabel="Save prices">
      <Grid columns={{minWidth: 180, max: 2, repeat: 'fit'}} gap={3}>
        {symbols.map(s => (
          <TextInput
            key={s} label={s + (data.manual[s] ? ' · typed by you' : '')} value={typed[s]} inputMode="decimal" hasClear
            onChange={v => setTyped(x => ({...x, [s]: v}))}
          />
        ))}
      </Grid>
    </Shell>
  );
}

export function SettingsDialog({data, onSave, onClose}) {
  const s = data.settings;
  const [f, setF] = useState({p1: pname(s, 'p1'), p2: s.p2 || '', joint: pname(s, 'joint'), fee: String(num(s.feeDiscount) || 100)});
  const set = k => v => setF(x => ({...x, [k]: v}));
  const others = hasOthers(data);
  return (
    <Shell
      title="Settings" onClose={onClose} submitLabel="Save"
      onSubmit={() => {
        onSave({
          p1: f.p1.trim() || 'Me', p2: f.p2.trim(), joint: f.joint.trim() || 'Joint',
          feeDiscount: Math.min(100, Math.max(1, num(f.fee) || 100)),
        });
        onClose();
      }}>
      <TextInput label="Your name" value={f.p1} onChange={set('p1')} />
      <TextInput
        label="Second person" value={f.p2} onChange={set('p2')} isOptional placeholder="Leave empty if it's just you"
        description={others ? 'Keep a name here: the second person or the shared label still has trades.' : 'Add a name to track two people, separately and together.'}
      />
      {(f.p2.trim() || others) && (
        <TextInput label="Shared label" value={f.joint} onChange={set('joint')} description="for holdings you both own together" />
      )}
      <TextInput
        label="Commission you pay, % of the standard rate" value={f.fee} onChange={set('fee')} inputMode="decimal"
        description="Standard is 0.1425% per trade. Type 100 for no discount, 60 for 6折, 28 for 2.8折. Sell tax is added automatically: 0.1% for ETFs, 0.3% for stocks."
      />
    </Shell>
  );
}

export function ConfirmDialog({title, subtitle, onConfirm, onClose}) {
  return (
    <Shell title={title} subtitle={subtitle} onClose={onClose} onSubmit={() => { onConfirm(); onClose(); }} submitLabel="Delete" submitVariant="destructive">
      <Text color="secondary">This can't be undone.</Text>
    </Shell>
  );
}
