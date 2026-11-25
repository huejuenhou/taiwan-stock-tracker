import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Table} from '@astryxdesign/core/Table';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {PencilSquareIcon, TrashIcon} from '@heroicons/react/24/outline';
import {Icon} from '@astryxdesign/core/Icon';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {fmt, nt, num, normDate, slashDate, localToday} from '../lib/format.js';
import {matchFilter, expDetail, expTag} from '../lib/calc.js';
import {Figure, Symbol, Person, StatCard, StatGrid, SectionHeader} from '../ui/parts.jsx';

function PaymentsTable({rows, data, solo, names, today, onEdit, onDelete, empty}) {
  const columns = [
    {key: 'pay', header: 'Pay date', renderCell: r => <Figure main={slashDate(r.payDate)} sub={'ex ' + slashDate(r.exDate)} />},
    {key: 'symbol', header: 'Code', renderCell: r => <Symbol symbol={r.symbol} name={names[r.symbol]} />},
    !solo && {key: 'person', header: 'Owner', renderCell: r => <Person settings={data.settings} person={r.person} />},
    {key: 'approx', header: 'Approx.', align: 'end', renderCell: r => {
      const d = expDetail(data, r);
      return <Figure main={(r.status === 'announced' ? '' : '≈') + nt(d.amount)} sub={fmt(d.shares) + ' × ' + fmt(num(r.perUnit), 2)} />;
    }},
    {key: 'actual', header: 'Actual', align: 'end', renderCell: r => (
      r.actual != null
        ? <Text hasTabularNumbers textWrap="nowrap" style={{color: 'var(--color-text-red)'}}>{(r.status === 'estimate' ? '≈' : '+') + nt(num(r.actual))}</Text>
        : <Text color="secondary">—</Text>
    )},
    {key: 'status', header: 'Status', renderCell: r => { const [variant, label] = expTag(r, expDetail(data, r), today); return <Badge variant={variant} label={label} />; }},
    {key: 'actions', header: '', align: 'end', renderCell: r => (
      <HStack gap={1} hAlign="end">
        <IconButton label="Edit" tooltip="Edit" size="sm" variant="ghost" icon={<Icon icon={PencilSquareIcon} />} onClick={() => onEdit(r)} />
        <IconButton label="Delete" tooltip="Delete" size="sm" variant="ghost" icon={<Icon icon={TrashIcon} />} onClick={() => onDelete(r)} />
      </HStack>
    )},
  ].filter(Boolean);
  return (
    <Card padding={0}>
      <Table data={rows} columns={columns} idKey="id" density="compact" hasHover emptyState={empty} />
    </Card>
  );
}

export function DividendsPage({data, filter, solo, names, onAdd, onEdit, onDelete}) {
  const today = localToday();
  const rows = data.expected
    .filter(r => matchFilter(filter, r.person))
    .slice()
    .sort((a, b) => normDate(a.payDate).localeCompare(normDate(b.payDate)) || a.symbol.localeCompare(b.symbol));
  const isPaid = r => r.actual != null || normDate(r.payDate) < today;
  const pending = rows.filter(r => r.actual == null);
  const pendingTotal = pending.reduce((s, r) => s + expDetail(data, r).amount, 0);
  const received = rows.reduce((s, r) => (r.actual != null ? s + num(r.actual) : s), 0);
  const thisYear = today.slice(0, 4);
  const yearTotal = pending.reduce((s, r) => (normDate(r.payDate).slice(0, 4) === thisYear ? s + expDetail(data, r).amount : s), 0);
  const upcoming = pending.filter(r => normDate(r.payDate) >= today);
  const nextDate = upcoming.length ? normDate(upcoming[0].payDate) : '';
  const nextRows = upcoming.filter(r => normDate(r.payDate) === nextDate);
  const nextAmt = nextRows.reduce((s, r) => s + expDetail(data, r).amount, 0);
  const nextSyms = [...new Set(nextRows.map(r => r.symbol))].join(', ');
  const unconfirmed = rows.filter(r => r.actual != null && r.status === 'estimate').length;
  const coming = rows.filter(r => !isPaid(r));
  const paid = rows.filter(isPaid).reverse();
  const count = n => (n ? n + (n === 1 ? ' payment' : ' payments') : '');
  const tableProps = {data, solo, names, today, onEdit, onDelete};

  return (
    <VStack gap={8}>
      <StatGrid>
        <StatCard label="Next payment" value={nextDate ? nextDate.slice(5).replace('-', '/') : '—'} sub={nextDate ? '≈' + nt(nextAmt) + ' · ' + nextSyms : 'nothing scheduled'} />
        <StatCard label={'Still to pay in ' + thisYear} value={'≈' + nt(yearTotal)} sub="by payment date" />
        <StatCard label="All expected" value={'≈' + nt(pendingTotal)} sub={count(pending.length) || 'none'} />
        <StatCard label="Received" value={nt(received)} sub={unconfirmed ? unconfirmed + ' still to confirm' : 'actual amounts entered'} />
      </StatGrid>
      <VStack gap={3}>
        <SectionHeader title="Coming up" count={count(coming.length)}>
          <Button label="Add expected" variant="primary" size="sm" onClick={onAdd} />
        </SectionHeader>
        <PaymentsTable
          rows={coming} {...tableProps}
          empty={<EmptyState title="No expected payments" description="Add a payment date and approximate amount, then correct it later." actions={<Button label="Add expected" variant="primary" onClick={onAdd} />} />}
        />
      </VStack>
      <VStack gap={3}>
        <SectionHeader title="Paid" count={count(paid.length)} />
        <PaymentsTable
          rows={paid} {...tableProps}
          empty={<EmptyState title="Nothing paid yet" description="Payments move here once their date has passed or you enter the actual amount." isCompact />}
        />
      </VStack>
      <Text type="supporting" color="secondary">
        Dividends are kept on this page only and are not part of the profit numbers on the other pages.
      </Text>
    </VStack>
  );
}
