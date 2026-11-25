import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {PencilSquareIcon, TrashIcon} from '@heroicons/react/24/outline';
import {Badge} from '@astryxdesign/core/Badge';
import {Grid} from '@astryxdesign/core/Grid';
import {Table} from '@astryxdesign/core/Table';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {StopIcon} from '@heroicons/react/24/solid';
import {PieChart, Pie, Cell, ResponsiveContainer, Tooltip} from 'recharts';
import {fmt, nt, signed, pctStr, roundPl, num, normDate, slashDate, shortDate} from '../lib/format.js';
import {totals, matchFilter, txCosts, pname} from '../lib/calc.js';
import {Amount, Figure, Symbol, Person, StatCard, StatGrid, SectionHeader} from '../ui/parts.jsx';

const SLICE_COLORS = [
  'var(--color-data-categorical-blue, #0171E3)', 'var(--color-data-categorical-orange, #EB6E00)',
  'var(--color-data-categorical-green, #0B991F)', 'var(--color-data-categorical-purple, #6B1EFD)',
  'var(--color-data-categorical-cyan, #00A3BF)', 'var(--color-data-categorical-pink, #D6249F)',
  'var(--color-data-categorical-teal, #0D9488)', 'var(--color-data-categorical-yellow, #C49B00)',
  'var(--color-data-neutral, #8494A3)',
];

export function PortfolioTiles({C, data, filter, latestDay}) {
  const t = totals(C, p => matchFilter(filter, p));
  const daySub = latestDay ? signed(latestDay.pl) + ' on ' + shortDate(data.asof) + ' · ' : '';
  return (
    <StatGrid>
      <StatCard label="Market value" value={nt(t.mkt)} sub={daySub + 'cost ' + nt(t.cost)} />
      <StatCard label="Unrealized P/L" value={signed(t.unreal)} valueTone={t.unreal} sub={pctStr(t.unrealPct) + ' on open positions'} />
      <StatCard label="Realized P/L" value={signed(t.realized)} valueTone={t.realized} sub="from sells, after fees & tax" />
      <StatCard label="Total return" value={signed(t.total)} valueTone={t.total} sub="unrealized + realized" isEmphasized />
    </StatGrid>
  );
}

function Positions({C, data, filter, solo, names, latestDay, onAdd, onEditPrices, onRefresh, isRefreshing, sync}) {
  const rows = C.positions.filter(p => matchFilter(filter, p.person)).map(p => ({...p, id: p.person + '|' + p.symbol}));
  const dayRow = p => (latestDay ? latestDay.rows.find(r => r.person === p.person && r.symbol === p.symbol) : null);
  const columns = [
    {key: 'symbol', header: 'Code', renderCell: p => <Symbol symbol={p.symbol} name={names[p.symbol]} />},
    !solo && {key: 'person', header: 'Owner', renderCell: p => <Person settings={data.settings} person={p.person} />},
    {key: 'shares', header: 'Shares', align: 'end', renderCell: p => <Text hasTabularNumbers textWrap="nowrap">{fmt(p.shares)}</Text>},
    {key: 'avgCost', header: 'Avg cost', align: 'end', renderCell: p => <Text hasTabularNumbers textWrap="nowrap">{fmt(p.avgCost, 2)}</Text>},
    {key: 'price', header: 'Price', align: 'end', renderCell: p => (
      <Figure main={p.price ? fmt(p.price, 2) : '—'} sub={data.manual[p.symbol] ? 'typed by you' : null} />
    )},
    {key: 'day', header: 'Day', align: 'end', renderCell: p => {
      const r = dayRow(p);
      if (!r) return <Text color="secondary">—</Text>;
      const v = roundPl(r.pl);
      return <Figure value={v} main={signed(v)} sub={r.prev ? pctStr((r.close / r.prev - 1) * 100) : null} />;
    }},
    {key: 'mkt', header: 'Market value', align: 'end', renderCell: p => <Text hasTabularNumbers textWrap="nowrap">{nt(p.mkt)}</Text>},
    {key: 'unreal', header: 'Unrealized P/L', align: 'end', renderCell: p => (
      <Figure value={p.unreal} main={signed(p.unreal)} sub={pctStr(p.cost > 0 ? (p.unreal / p.cost) * 100 : 0)} />
    )},
  ].filter(Boolean);
  return (
    <VStack gap={3}>
      <SectionHeader title="Positions" count={rows.length ? rows.length + ' shown' : ''}>
        {sync.text && <Text type="supporting" color="secondary">{sync.text}</Text>}
        <Button label="Refresh" size="sm" isLoading={isRefreshing} onClick={onRefresh} />
        <Button label="Edit prices" size="sm" onClick={onEditPrices} />
      </SectionHeader>
      <Card padding={0}>
        <Table
          data={rows} columns={columns} idKey="id" density="compact" hasHover
          emptyState={
            <EmptyState
              title="No open positions"
              description="Add your buys and sells below, and open positions show up here automatically."
              actions={<Button label="Add transaction" variant="primary" onClick={onAdd} />}
            />
          }
        />
      </Card>
    </VStack>
  );
}

function Allocation({C, data, filter, solo}) {
  const rows = C.positions.filter(p => matchFilter(filter, p.person) && p.mkt > 0);
  const total = rows.reduce((s, p) => s + p.mkt, 0);
  return (
    <VStack gap={3}>
      <SectionHeader title="Allocation" count={total > 0 ? 'by market value' : ''} />
      <Card>
        {total <= 0 ? (
          <EmptyState title="Nothing to show yet" description="Allocation appears once you hold positions with a price." isCompact />
        ) : (
          <Grid columns={{minWidth: 220, max: 2, repeat: 'fit'}} gap={4} align="center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rows} dataKey="mkt" nameKey="symbol" innerRadius="58%" outerRadius="90%" stroke="none" isAnimationActive={false}>
                  {rows.map((p, i) => <Cell key={p.person + p.symbol} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  formatter={(v, n, item) => [nt(v) + ' · ' + fmt((v / total) * 100, 1) + '%', item.payload.symbol]}
                  contentStyle={{background: 'var(--color-background-popover)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 8px)'}}
                />
              </PieChart>
            </ResponsiveContainer>
            <VStack gap={2}>
              <HStack hAlign="between"><Text color="secondary">Total</Text><Text weight="semibold" hasTabularNumbers>{nt(total)}</Text></HStack>
              <Divider />
              {rows.map((p, i) => (
                <HStack key={p.person + p.symbol} hAlign="between" vAlign="center" gap={2}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={StopIcon} size="xsm" style={{color: SLICE_COLORS[i % SLICE_COLORS.length]}} />
                    <Text weight="semibold">{p.symbol}</Text>
                    {!solo && <Text type="supporting" color="secondary">{pname(data.settings, p.person)}</Text>}
                  </HStack>
                  <Text hasTabularNumbers textWrap="nowrap" color="secondary">{fmt((p.mkt / total) * 100, 1)}%</Text>
                </HStack>
              ))}
            </VStack>
          </Grid>
        )}
      </Card>
    </VStack>
  );
}

function Transactions({C, data, filter, solo, names, onAdd, onEdit, onDelete}) {
  const rows = data.transactions
    .filter(t => matchFilter(filter, t.person))
    .slice()
    .sort((a, b) => (normDate(a.date) < normDate(b.date) ? 1 : normDate(a.date) > normDate(b.date) ? -1 : 0));
  const columns = [
    {key: 'type', header: 'Type', renderCell: t => <Badge variant={t.type === 'sell' ? 'green' : 'red'} label={t.type === 'sell' ? 'Sell' : 'Buy'} />},
    {key: 'date', header: 'Date', renderCell: t => <Text hasTabularNumbers textWrap="nowrap">{slashDate(t.date)}</Text>},
    {key: 'symbol', header: 'Code', renderCell: t => <Symbol symbol={t.symbol} name={names[t.symbol]} />},
    !solo && {key: 'person', header: 'Owner', renderCell: t => <Person settings={data.settings} person={t.person} />},
    {key: 'shares', header: 'Shares', align: 'end', renderCell: t => <Text hasTabularNumbers textWrap="nowrap">{fmt(num(t.shares))}</Text>},
    {key: 'price', header: 'Price', align: 'end', renderCell: t => <Text hasTabularNumbers textWrap="nowrap">{fmt(num(t.price), 2)}</Text>},
    {key: 'amount', header: 'Amount', align: 'end', renderCell: t => {
      const a = num(t.shares) * num(t.price);
      return <Text hasTabularNumbers textWrap="nowrap">{nt(a, a % 1 ? 2 : 0)}</Text>;
    }},
    {key: 'costs', header: 'Fees & tax', align: 'end', renderCell: t => (
      <Text hasTabularNumbers textWrap="nowrap" color={t.costs != null ? undefined : 'secondary'}>
        {(t.costs != null ? '' : '≈') + nt(txCosts(data.settings, t))}
      </Text>
    )},
    {key: 'realized', header: 'Realized P/L', align: 'end', renderCell: t => {
      const r = C.txRealized[t.id];
      return t.type === 'sell' && r != null ? <Amount value={r}>{signed(r)}</Amount> : <Text color="secondary">—</Text>;
    }},
    {key: 'actions', header: '', align: 'end', renderCell: t => (
      <HStack gap={1} hAlign="end">
        <IconButton label="Edit" tooltip="Edit" size="sm" variant="ghost" icon={<Icon icon={PencilSquareIcon} />} onClick={() => onEdit(t)} />
        <IconButton label="Delete" tooltip="Delete" size="sm" variant="ghost" icon={<Icon icon={TrashIcon} />} onClick={() => onDelete(t)} />
      </HStack>
    )},
  ].filter(Boolean);
  return (
    <VStack gap={3}>
      <SectionHeader title="Transactions" count={rows.length ? rows.length + ' shown' : ''}>
        <Button label="Add transaction" variant="primary" size="sm" onClick={onAdd} />
      </SectionHeader>
      <Card padding={0}>
        <Table
          data={rows} columns={columns} idKey="id" density="compact" hasHover
          emptyState={
            <EmptyState
              title="No transactions yet"
              description="Log every buy and sell, like your trading notes."
              actions={<Button label="Add your first transaction" variant="primary" onClick={onAdd} />}
            />
          }
        />
      </Card>
    </VStack>
  );
}

export function PortfolioPage(props) {
  return (
    <VStack gap={8}>
      <Positions {...props} />
      <Allocation {...props} />
      <Transactions {...props} />
    </VStack>
  );
}
