// Small shared pieces: amounts in Taiwan colors, symbols with their names,
// owner labels and headline stat cards.
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {Grid} from '@astryxdesign/core/Grid';
import {toneColor} from '../lib/format.js';
import {pname} from '../lib/calc.js';

// Red for a gain, green for a loss (the Taiwan convention).
export function Amount({value, children, type = 'body', weight = 'medium', size}) {
  return (
    <Text type={type} weight={weight} size={size} hasTabularNumbers textWrap="nowrap" style={{color: toneColor(value)}}>
      {children}
    </Text>
  );
}

// A number with a smaller line under it, aligned for table cells.
export function Figure({main, sub, value}) {
  const color = value == null ? undefined : toneColor(value);
  return (
    <VStack gap={0} vAlign="end">
      <Text hasTabularNumbers textWrap="nowrap" style={color ? {color} : undefined}>{main}</Text>
      {sub != null && (
        <Text type="supporting" hasTabularNumbers color={color ? undefined : 'secondary'} style={color ? {color} : undefined}>
          {sub}
        </Text>
      )}
    </VStack>
  );
}

export function Symbol({symbol, name, children}) {
  return (
    <VStack gap={0}>
      <Text weight="semibold" hasTabularNumbers textWrap="nowrap">{symbol}</Text>
      {name && <Text type="supporting" color="secondary">{name}</Text>}
      {children}
    </VStack>
  );
}

const PERSON_BADGE = {p1: 'blue', p2: 'purple', joint: 'orange'};
export function Person({settings, person}) {
  return <Badge variant={PERSON_BADGE[person] || 'neutral'} label={pname(settings, person)} />;
}

export function StatCard({label, value, valueTone, sub, isEmphasized}) {
  return (
    <Card>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">{label}</Text>
        <Heading level={isEmphasized ? 2 : 3} accessibilityLevel={3}>
          <Text type="inherit" hasTabularNumbers style={valueTone == null ? undefined : {color: toneColor(valueTone)}}>
            {value}
          </Text>
        </Heading>
        {sub && <Text type="supporting" color="secondary">{sub}</Text>}
      </VStack>
    </Card>
  );
}

export function StatGrid({children}) {
  return <Grid columns={{minWidth: 200, max: 4, repeat: 'fit'}} gap={4}>{children}</Grid>;
}

export function SectionHeader({title, count, children}) {
  return (
    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
      <HStack gap={2} vAlign="center">
        <Heading level={3} accessibilityLevel={2}>{title}</Heading>
        {count ? <Text type="supporting" color="secondary">{count}</Text> : null}
      </HStack>
      {children && <HStack gap={2} vAlign="center">{children}</HStack>}
    </HStack>
  );
}
