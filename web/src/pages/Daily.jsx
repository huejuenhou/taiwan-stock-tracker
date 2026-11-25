import {useMemo} from 'react';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Table} from '@astryxdesign/core/Table';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Banner} from '@astryxdesign/core/Banner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Spinner} from '@astryxdesign/core/Spinner';
import {ChevronLeftIcon, ChevronRightIcon} from '@heroicons/react/24/outline';
import {AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer} from 'recharts';
import {MONTHS, fmt, num, signed, plain, pctStr, roundPl, toneColor, normDate, longDate, shortDate, pad} from '../lib/format.js';
import {matchFilter} from '../lib/calc.js';
import {Amount, Figure, Symbol, Person, StatCard, StatGrid, SectionHeader} from '../ui/parts.jsx';

function ChartTip({active, payload}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <Card padding={3} elevation="med">
      <VStack gap={1}>
        <Text type="supporting" color="secondary">{longDate(p.date)}</Text>
        <HStack gap={2}><Text type="supporting">Total</Text><Amount value={roundPl(p.cum)} type="supporting">{signed(p.cum)}</Amount></HStack>
        <HStack gap={2}><Text type="supporting">That day</Text><Amount value={roundPl(p.pl)} type="supporting">{signed(p.pl)}</Amount></HStack>
      </VStack>
    </Card>
  );
}

function ReturnChart({days, dates, month, onPick}) {
  const points = useMemo(() => {
    let run = 0;
    return dates.map((d, i) => { run += days[d].pl; return {i, date: d, pl: days[d].pl, cum: run}; });
  }, [days, dates]);
  const total = points.length ? points[points.length - 1].cum : 0;
  const inMonth = points.filter(p => p.date.slice(0, 7) === month);
  const monthTicks = points.filter((p, i) => !i || p.date.slice(0, 7) !== points[i - 1].date.slice(0, 7)).map(p => p.i);
  const axis = {fontSize: 12, fill: 'var(--color-text-secondary)'};
  return (
    <VStack gap={3}>
      <SectionHeader title="Total return over time">
        <Amount value={roundPl(total)} weight="semibold">{signed(total)}</Amount>
      </SectionHeader>
      <Card>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={points}
            margin={{top: 8, right: 8, left: 8, bottom: 0}}
            onClick={e => { const i = e && e.activeTooltipIndex; if (i != null && points[i]) onPick(points[i].date); }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            {inMonth.length > 0 && (
              <ReferenceArea x1={inMonth[0].i - 0.5} x2={inMonth[inMonth.length - 1].i + 0.5} fill="var(--color-background-muted)" fillOpacity={1} ifOverflow="hidden" />
            )}
            <ReferenceLine y={0} stroke="var(--color-text-secondary)" />
            <XAxis
              dataKey="i" type="number" domain={[0, Math.max(points.length - 1, 1)]} ticks={monthTicks}
              tickFormatter={i => (points[i] ? MONTHS[+points[i].date.slice(5, 7) - 1] : '')}
              tick={axis} axisLine={false} tickLine={false}
            />
            <YAxis tickFormatter={v => plain(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<ChartTip />} cursor={{stroke: 'var(--color-text-secondary)'}} />
            <Area
              type="linear" dataKey="cum" stroke="var(--color-text-accent)" strokeWidth={2}
              fill="var(--color-text-accent)" fillOpacity={0.1} isAnimationActive={false}
              activeDot={{r: 5, stroke: 'var(--color-background-card)', strokeWidth: 2}}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </VStack>
  );
}

function DayGrid({days, month, selected, onPick}) {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  let started = false;
  for (let n = 1; n <= count; n++) {
    const wd = new Date(Date.UTC(y, m - 1, n)).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (!started) { for (let b = 1; b < wd; b++) cells.push(<VStack key={'blank' + b} />); started = true; }
    const date = y + '-' + pad(m) + '-' + pad(n), day = days[date];
    if (!day) {
      cells.push(
        <Card key={date} variant="transparent" padding={2} height={64}>
          <Text type="supporting" color="disabled">{n}</Text>
        </Card>,
      );
      continue;
    }
    const v = roundPl(day.pl);
    cells.push(
      <SelectableCard
        key={date} label={longDate(date) + ', ' + signed(v)}
        isSelected={date === selected} onChange={() => onPick(date)}
        variant={v > 0 ? 'red' : v < 0 ? 'green' : 'gray'} padding={2} height={64}>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">{n}</Text>
          <Text type="supporting" weight="semibold" hasTabularNumbers style={{color: toneColor(v)}}>{plain(v)}</Text>
        </VStack>
      </SelectableCard>,
    );
  }
  return (
    <VStack gap={2}>
      <Grid columns={5} gap={2}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(w => <Text key={w} type="supporting" color="secondary" justify="center">{w}</Text>)}
      </Grid>
      <Grid columns={5} gap={2}>{cells}</Grid>
    </VStack>
  );
}

function DayDetail({day, data, hist, filter, solo, names}) {
  const rows = day.rows.slice().sort((a, b) => b.pl - a.pl).map(r => ({...r, id: r.person + '|' + r.symbol}));
  const ups = rows.filter(r => roundPl(r.pl) > 0).length, downs = rows.filter(r => roundPl(r.pl) < 0).length;
  const live = day.date === data.asof && !rows.some(r => { const c = hist.closes[r.symbol]; return c && c[day.date] != null; });
  const exes = data.expected.filter(x => normDate(x.exDate) === day.date && matchFilter(filter, x.person) && rows.some(r => r.symbol === x.symbol && r.person === x.person));
  const seen = {}, lines = [];
  exes.forEach(x => { if (!seen[x.symbol]) { seen[x.symbol] = 1; lines.push(x.symbol + ' (NT$' + fmt(num(x.perUnit), 2) + ' per share)'); } });
  const columns = [
    {key: 'symbol', header: 'Code', renderCell: r => {
      const notes = [];
      if (r.boughtQ) notes.push('Bought ' + fmt(r.boughtQ) + ' @ ' + fmt(r.boughtAvg, 2));
      if (r.soldQ) notes.push('Sold ' + fmt(r.soldQ) + ' @ ' + fmt(r.soldAvg, 2));
      if (r.costs) notes.push('fees NT$' + fmt(r.costs));
      return (
        <Symbol symbol={r.symbol} name={names[r.symbol]}>
          {filter === 'all' && !solo && <HStack><Person settings={data.settings} person={r.person} /></HStack>}
          {notes.length > 0 && <Text type="supporting" color="secondary">{notes.join(' · ')}</Text>}
        </Symbol>
      );
    }},
    {key: 'shares', header: 'Shares', align: 'end', renderCell: r => <Text hasTabularNumbers textWrap="nowrap">{fmt(r.shares)}</Text>},
    {key: 'close', header: 'Close', align: 'end', renderCell: r => <Text hasTabularNumbers textWrap="nowrap">{fmt(r.close, 2)}</Text>},
    {key: 'change', header: 'Change', align: 'end', renderCell: r => {
      if (!r.prev) return <Text color="secondary">—</Text>;
      const c = r.close - r.prev;
      return <Amount value={c} weight="normal">{pctStr((c / r.prev) * 100)}</Amount>;
    }},
    {key: 'pl', header: 'Gain / loss', align: 'end', renderCell: r => { const v = roundPl(r.pl); return <Amount value={v}>{signed(v)}</Amount>; }},
  ];
  return (
    <VStack gap={3}>
      <SectionHeader title={longDate(day.date)} count={ups + ' up · ' + downs + ' down' + (live ? ' · so far today' : '')}>
        <Amount value={roundPl(day.pl)} weight="semibold">{signed(day.pl)}</Amount>
      </SectionHeader>
      <Card padding={0}>
        <Table data={rows} columns={columns} idKey="id" density="compact" />
      </Card>
      {lines.length > 0 && (
        <Text type="supporting" color="secondary">
          Ex-dividend today: {lines.join(', ')}. Part of the price drop is the payout, which is on the Dividend calendar page.
        </Text>
      )}
    </VStack>
  );
}

export function DailyPage({data, hist, days, filter, solo, names, pick, setPick}) {
  if (!data.ready || !hist) {
    return <EmptyState title="Loading…" icon={<Spinner size="lg" />} />;
  }
  if (hist.missing > 0) {
    const have = hist.total - hist.missing - hist.failed;
    return (
      <Card>
        <VStack gap={3}>
          <Text weight="semibold">Getting past daily prices from the exchange</Text>
          <Text color="secondary">{have} of {hist.total} months so far. This slow download only happens once.</Text>
          <ProgressBar label="Months downloaded" value={have} max={hist.total || 1} />
        </VStack>
      </Card>
    );
  }
  const dates = Object.keys(days).sort();
  if (!dates.length) {
    return <EmptyState title="Nothing to show yet" description="Daily results appear once there's a trade for this person." />;
  }
  const months = {};
  dates.forEach(d => { const m = d.slice(0, 7); (months[m] = months[m] || {pl: 0, days: []}); months[m].pl += days[d].pl; months[m].days.push(d); });
  const monthKeys = Object.keys(months).sort();
  const month = months[pick.month] ? pick.month : monthKeys[monthKeys.length - 1];
  const cur = months[month];
  const day = cur.days.includes(pick.day) ? pick.day : cur.days[cur.days.length - 1];
  const [yy, mm] = month.split('-');
  const monthName = MONTHS[+mm - 1] + ' ' + yy;
  let best = null, worst = null, ups = 0, downs = 0;
  cur.days.forEach(d => {
    const v = roundPl(days[d].pl);
    if (v > 0) ups++; else if (v < 0) downs++;
    if (!best || v > days[best].pl) best = d;
    if (!worst || v < days[worst].pl) worst = d;
  });
  const mi = monthKeys.indexOf(month);
  const lastYear = monthKeys[monthKeys.length - 1].slice(0, 4);
  const pickDay = d => setPick({month: d.slice(0, 7), day: d});
  const pickMonth = m => setPick({month: m, day: null});

  return (
    <VStack gap={8}>
      <StatGrid>
        <StatCard label={monthName} value={signed(cur.pl)} valueTone={roundPl(cur.pl)} sub={cur.days.length + ' trading days'} />
        <StatCard label="Best day" value={signed(days[best].pl)} valueTone={roundPl(days[best].pl)} sub={shortDate(best)} />
        <StatCard label="Worst day" value={signed(days[worst].pl)} valueTone={roundPl(days[worst].pl)} sub={shortDate(worst)} />
        <StatCard label="Days up / down" value={ups + ' / ' + downs} sub="gains / losses" />
      </StatGrid>

      {dates.length > 1 && <ReturnChart days={days} dates={dates} month={month} onPick={pickDay} />}

      <VStack gap={3}>
        <SectionHeader title={monthName} count="pick a day for details">
          <IconButton label="Previous month" size="sm" icon={<Icon icon={ChevronLeftIcon} />} isDisabled={mi <= 0} onClick={() => pickMonth(monthKeys[mi - 1])} />
          <IconButton label="Next month" size="sm" icon={<Icon icon={ChevronRightIcon} />} isDisabled={mi >= monthKeys.length - 1} onClick={() => pickMonth(monthKeys[mi + 1])} />
        </SectionHeader>
        {hist.failed > 0 && (
          <Banner status="warning" title={"The exchange didn't send " + hist.failed + ' month(s) of prices, so some days may be off.'} description="The app will try again in a few minutes." />
        )}
        <TabList value={month} onChange={pickMonth} size="sm">
          {monthKeys.map(m => {
            const v = roundPl(months[m].pl);
            const [y, mo] = m.split('-');
            return (
              <Tab
                key={m} value={m} label={MONTHS[+mo - 1] + (y !== lastYear ? ' ' + y : '')}
                endContent={<Text type="supporting" hasTabularNumbers style={{color: toneColor(v)}}>{plain(v)}</Text>}
              />
            );
          })}
        </TabList>
        <Card>
          <DayGrid days={days} month={month} selected={day} onPick={pickDay} />
        </Card>
      </VStack>

      <DayDetail day={days[day]} data={data} hist={hist} filter={filter} solo={solo} names={names} />
    </VStack>
  );
}
