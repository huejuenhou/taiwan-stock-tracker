import {useEffect, useMemo, useState} from 'react';
import {Layout, LayoutContent, LayoutHeader, VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Banner} from '@astryxdesign/core/Banner';
import {Badge} from '@astryxdesign/core/Badge';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {Cog6ToothIcon} from '@heroicons/react/24/outline';
import logo from '../../logo.svg';
import {usePortfolio} from './lib/usePortfolio.js';
import {compute, totals, dailyResults, isSolo, pname, PEOPLE} from './lib/calc.js';
import {signed, toneColor, slashDate, fmt, num} from './lib/format.js';
import {PortfolioTiles, PortfolioPage} from './pages/Portfolio.jsx';
import {DailyPage} from './pages/Daily.jsx';
import {DividendsPage} from './pages/Dividends.jsx';
import {TransactionDialog, ExpectedDialog, PricesDialog, SettingsDialog, ConfirmDialog} from './ui/dialogs.jsx';

const PAGES = [
  {id: 'portfolio', hash: '#', label: 'Portfolio'},
  {id: 'daily', hash: '#daily', label: 'Daily tracker'},
  {id: 'dividends', hash: '#dividends', label: 'Dividend calendar'},
];
const pageFromHash = () => (location.hash === '#daily' ? 'daily' : location.hash === '#dividends' ? 'dividends' : 'portfolio');

function PersonTabs({C, data, filter, setFilter}) {
  const defs = [{k: 'all', label: 'Combined'}, ...PEOPLE.map(k => ({k, label: pname(data.settings, k)}))];
  return (
    <TabList value={filter} onChange={setFilter} hasDivider>
      {defs.map(d => {
        const t = totals(C, p => d.k === 'all' || p === d.k);
        if (d.k === 'joint' && t.mkt === 0 && t.realized === 0) return null;
        return (
          <Tab
            key={d.k} value={d.k} label={d.label}
            endContent={<Text type="supporting" hasTabularNumbers style={{color: toneColor(t.total)}}>{signed(t.total)}</Text>}
          />
        );
      })}
    </TabList>
  );
}

function UpdateBanner({update, onInstall}) {
  if (!update) return null;
  const title =
    update.phase === 'installing' ? 'Updating…'
    : update.phase === 'restarting' ? 'Installed version ' + update.installed + '. Restarting…'
    : update.phase === 'failed' ? "The update didn't install (" + update.error + '). Nothing was changed; try again later.'
    : 'Version ' + update.latest + ' is available (you have ' + update.current + '). Your trades are kept.';
  return (
    <Banner
      status={update.phase === 'failed' ? 'warning' : 'info'} title={title}
      endContent={update.phase === 'offer' || update.phase === 'failed' ? (
        <HStack gap={2}>
          {update.page && <Button label="What's new" size="sm" variant="ghost" href={update.page} target="_blank" rel="noopener" />}
          <Button label="Update now" size="sm" variant="primary" onClick={onInstall} />
        </HStack>
      ) : null}
    />
  );
}

export default function App() {
  const pf = usePortfolio();
  const {data, hist, names} = pf;
  const [page, setPage] = useState(pageFromHash);
  const [filterRaw, setFilter] = useState('all');
  const [pick, setPick] = useState({month: null, day: null});
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const on = () => { setPage(pageFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { if (page === 'daily' && data.ready) pf.loadHistory(); }, [page, data.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const solo = isSolo(data);
  const filter = solo ? 'all' : filterRaw;
  const C = useMemo(() => compute(data), [data]);
  const days = useMemo(() => (data.ready && hist && hist.missing === 0 ? dailyResults(data, hist, filter) : null), [data, hist, filter]);
  const latestDay = days && data.asof ? days[data.asof] : null;

  const close = () => setDialog(null);
  const openTx = tx => setDialog({kind: 'tx', tx});
  const openExp = exp => setDialog({kind: 'exp', exp});
  const shared = {data, filter, solo, names};
  const subtitle = !data.ready ? 'Loading…'
    : (solo ? pname(data.settings, 'p1') : pname(data.settings, 'p1') + ' + ' + pname(data.settings, 'p2'))
      + ' · ' + C.positions.length + ' open positions · ' + data.transactions.length + (data.transactions.length === 1 ? ' trade' : ' trades');

  return (
    <Layout
      height="auto"
      header={
        <LayoutHeader>
          <TopNav
            heading={<TopNavHeading logo={<img src={logo} alt="" width={28} height={28} />} heading="Taiwan Stock Tracker" headingHref="#" />}
            startContent={PAGES.map(p => <TopNavItem key={p.id} label={p.label} href={p.hash} isSelected={page === p.id} />)}
            endContent={
              <HStack gap={2} vAlign="center">
                <Badge variant="red" label="漲 Gain" />
                <Badge variant="green" label="跌 Loss" />
                <IconButton label="Settings" variant="ghost" icon={<Icon icon={Cog6ToothIcon} />} onClick={() => setDialog({kind: 'settings'})} />
              </HStack>
            }
          />
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" padding={6}>
          <VisuallyHidden as="h1">Taiwan Stock Tracker</VisuallyHidden>
          <VStack gap={6} maxWidth={1240}>
            {data.demo && (
              <Banner status="info" title="Sample data" description="These trades are made up so you can look around. Changes are thrown away the next time you open Try Demo." />
            )}
            <UpdateBanner update={pf.update} onInstall={pf.installUpdate} />
            {pf.warning && <Banner status="warning" title={pf.warning} isDismissable onDismiss={() => pf.setWarning('')} />}

            <VStack gap={1}>
              <Heading level={2} accessibilityLevel={2}>{PAGES.find(p => p.id === page).label}</Heading>
              <Text color="secondary">{subtitle}</Text>
            </VStack>

            {!solo && data.ready && <PersonTabs C={C} data={data} filter={filter} setFilter={setFilter} />}

            {page === 'portfolio' && (
              <VStack gap={8}>
                <PortfolioTiles C={C} data={data} filter={filter} latestDay={latestDay} />
                <PortfolioPage
                  {...shared} C={C} latestDay={latestDay} sync={pf.sync} isRefreshing={pf.isRefreshing}
                  onRefresh={() => pf.refreshPrices(true)}
                  onEditPrices={() => (data.transactions.length ? setDialog({kind: 'prices'}) : openTx(null))}
                  onAdd={() => openTx(null)} onEdit={openTx}
                  onDelete={t => setDialog({
                    kind: 'confirm', title: (t.type === 'sell' ? 'Delete sell' : 'Delete buy') + ' of ' + t.symbol + '?',
                    subtitle: slashDate(t.date) + ' · ' + fmt(num(t.shares)) + ' @ ' + fmt(num(t.price), 2),
                    onConfirm: () => pf.actions.removeTx(t.id),
                  })}
                />
              </VStack>
            )}
            {page === 'daily' && <DailyPage {...shared} hist={hist} days={days || {}} pick={pick} setPick={setPick} />}
            {page === 'dividends' && (
              <DividendsPage
                {...shared} onAdd={() => openExp(null)} onEdit={openExp}
                onDelete={r => setDialog({
                  kind: 'confirm', title: 'Delete expected payment?',
                  subtitle: r.symbol + ' · ' + pname(data.settings, r.person) + ' · ' + slashDate(r.payDate),
                  onConfirm: () => pf.actions.removeExp(r.id),
                })}
              />
            )}

            {pf.foot && <Text type="supporting" color="secondary">{pf.foot}</Text>}
          </VStack>

          {dialog && dialog.kind === 'tx' && <TransactionDialog tx={dialog.tx} {...shared} onSave={pf.actions.saveTx} onClose={close} />}
          {dialog && dialog.kind === 'exp' && <ExpectedDialog exp={dialog.exp} {...shared} onSave={pf.actions.saveExp} onClose={close} />}
          {dialog && dialog.kind === 'prices' && <PricesDialog data={data} onSave={pf.actions.savePrices} onClose={close} />}
          {dialog && dialog.kind === 'settings' && <SettingsDialog data={data} onSave={pf.actions.saveSettings} onClose={close} />}
          {dialog && dialog.kind === 'confirm' && <ConfirmDialog title={dialog.title} subtitle={dialog.subtitle} onConfirm={dialog.onConfirm} onClose={close} />}
        </LayoutContent>
      }
    />
  );
}
