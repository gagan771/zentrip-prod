import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { monumentTicketsForCity, type MonumentTicketLink } from '../../lib/monument-tickets';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

type MonumentTicketsStripProps = {
  city?: string;
};

function modeLabel(mode: MonumentTicketLink['mode']): string {
  if (mode === 'online') return 'Book online';
  if (mode === 'no-entry-ticket') return 'Usually free entry';
  return 'Official information';
}

function modeColor(mode: MonumentTicketLink['mode']): string {
  if (mode === 'online') return colors.primary;
  if (mode === 'no-entry-ticket') return colors.success;
  return colors.inkMuted;
}

export function MonumentTicketsStrip({ city }: MonumentTicketsStripProps) {
  const entries = monumentTicketsForCity(city);

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="ticket-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Monument tickets</Text>
          <Text style={styles.subtitle}>
            Official booking and visitor links for {city?.trim() || 'India'}
          </Text>
        </View>
      </View>

      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          onPress={() => void Linking.openURL(entry.url)}
          accessibilityRole="link"
          accessibilityLabel={`Open ${entry.provider} for ${entry.monuments.join(', ')}`}
        >
          <View style={styles.itemCopy}>
            <View style={styles.cityRow}>
              <Text style={styles.city}>{entry.city}</Text>
              <Text style={[styles.mode, { color: modeColor(entry.mode) }]}>{modeLabel(entry.mode)}</Text>
            </View>
            <Text style={styles.monuments}>{entry.monuments.join(' · ')}</Text>
            <Text style={styles.provider}>{entry.provider}</Text>
            <Text style={styles.note}>{entry.note}</Text>
          </View>
          <Ionicons name="open-outline" size={17} color={colors.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 17 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.sandSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  itemPressed: { opacity: 0.72 },
  itemCopy: { flex: 1, gap: 3 },
  cityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  city: { color: colors.ink, fontSize: 14, fontWeight: '800', flex: 1 },
  mode: { fontSize: typography.fontSize.micro, fontWeight: '800' },
  monuments: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  provider: { color: colors.primary, fontSize: typography.fontSize.micro, fontWeight: '700' },
  note: { color: colors.inkMuted, fontSize: typography.fontSize.micro, lineHeight: 15 },
});
