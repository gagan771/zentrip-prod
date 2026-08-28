import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

type FeatureItem = {
  href: Href;
  label: string;
  subtitle: string;
  phase: string;
  icon: string;
  accent: string;
  badge?: string;
};

const SUITE_FEATURES: FeatureItem[] = [
  {
    href: '/(tabs)/compare',
    label: 'Decision Engine',
    subtitle: 'Corridor transport compare plus live IRCTC, RedBus, AbhiBus, Goibibo, and MakeMyTrip booking handoff.',
    phase: 'PHASE 2',
    icon: 'git-compare-outline',
    accent: colors.primary,
    badge: 'LIVE',
  },
  {
    href: '/(tabs)/guide',
    label: 'Heritage Lens',
    subtitle: 'Camera landmark scanner with verified ASI historical archives and audio stories.',
    phase: 'PHASE 2',
    icon: 'camera-outline',
    accent: colors.goldDark,
    badge: 'LIVE',
  },
  {
    href: '/(tabs)/guardian',
    label: 'Safety Guardian',
    subtitle: '1-tap emergency dialer for 112, 1363 tourist helpline, and offline protocols.',
    phase: 'PHASE 3',
    icon: 'shield-checkmark-outline',
    accent: '#D9381E',
    badge: 'ESSENTIAL',
  },
  {
    href: '/translation',
    label: 'Travel Translator',
    subtitle: 'Conversation mode with mic, menu camera, phrasebook, and live translation.',
    phase: 'PHASE 3',
    icon: 'language-outline',
    accent: '#2E6F8E',
    badge: 'LIVE',
  },
  {
    href: '/risk',
    label: 'Risk Intelligence',
    subtitle: 'Confidence-tagged location patterns with practical recommendations, never city-wide labels.',
    phase: 'PHASE 6',
    icon: 'alert-circle-outline',
    accent: '#A34A31',
  },
  {
    href: '/explorer',
    label: 'Explorer Missions',
    subtitle: 'Submit careful GPS-tagged observations that enter a review queue before verification.',
    phase: 'PHASE 5',
    icon: 'compass-outline',
    accent: '#A06D28',
  },
  {
    href: '/experts',
    label: 'Ask a Local Expert',
    subtitle: 'Escalate nuanced local questions and disputed content to a human support queue.',
    phase: 'PHASE 5',
    icon: 'person-circle-outline',
    accent: '#5B4EB3',
  },
  {
    href: '/services/booking',
    label: 'Book live on official sites',
    subtitle: 'IRCTC, RedBus, AbhiBus, Goibibo, MakeMyTrip, Ixigo, Cleartrip, Yatra — WebView handoff like Blinkit/Zepto.',
    phase: 'PHASE 2',
    icon: 'ticket-outline',
    accent: colors.primary,
    badge: 'LIVE',
  },
  {
    href: '/services/grocery',
    label: 'Quick Commerce & Essentials',
    subtitle: '10-minute medicine, bottled water, and snack hand-offs via local platforms.',
    phase: 'PHASE 2',
    icon: 'cart-outline',
    accent: colors.sage,
    badge: 'INTEGRATED',
  },
  {
    href: '/payments',
    label: 'Payment Assistance',
    subtitle: 'UPI and foreign-traveler PPI explainers with sourced claims. No wallet, no custody.',
    phase: 'PHASE 2',
    icon: 'wallet-outline',
    accent: colors.goldDark,
    badge: 'EXPLAINER',
  },
  {
    href: '/community',
    label: 'Destination Community',
    subtitle: 'City channels, local tips, and traveler recommendations for Delhi, Agra, Jaipur.',
    phase: 'PHASE 3',
    icon: 'chatbubbles-outline',
    accent: '#5B4EB3',
  },
  {
    href: '/buddy',
    label: 'Travel Buddy',
    subtitle: 'Connect with verified fellow travelers exploring the same Golden Triangle corridor.',
    phase: 'PHASE 3',
    icon: 'people-outline',
    accent: '#B04B76',
  },
  {
    href: '/trails',
    label: 'Offline Trail Packs',
    subtitle: 'Waypoints, route previews, hazards, and emergency contacts saved for low-connectivity travel.',
    phase: 'PHASE 5',
    icon: 'footsteps-outline',
    accent: '#A06D28',
  },
  {
    href: '/peaks',
    label: 'Nearby Peaks',
    subtitle: 'Geometry-first peak lookup with explicit preview confidence and distance/bearing values.',
    phase: 'PHASE 5',
    icon: 'triangle-outline',
    accent: colors.sage,
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="grid-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>COMPANION SUITE</Text>
          </View>
          <Text style={styles.title}>All Tools & Features</Text>
          <Text style={styles.subtitle}>
            Specialized modules built to ensure your journey through India is effortless, safe, and rich in context.
          </Text>
        </View>

        {/* Feature Cards Grid */}
        <View style={styles.featureGrid}>
          {SUITE_FEATURES.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.featureCard}
              onPress={() => router.push(item.href)}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: `${item.accent}15` }]}>
                  <Ionicons name={item.icon as any} size={22} color={item.accent} />
                </View>

                {item.badge ? (
                  <View style={[styles.statusBadge, { backgroundColor: `${item.accent}18` }]}>
                    <Text style={[styles.statusBadgeText, { color: item.accent }]}>{item.badge}</Text>
                  </View>
                ) : (
                  <Text style={styles.phaseLabel}>{item.phase}</Text>
                )}
              </View>

              <Text style={styles.cardTitle}>{item.label}</Text>
              <Text style={styles.cardSub}>{item.subtitle}</Text>

              <View style={styles.cardFooter}>
                <Text style={[styles.openAction, { color: item.accent }]}>Open Module</Text>
                <Ionicons name="arrow-forward" size={14} color={item.accent} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'flex-start',
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginBottom: 4,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    maxWidth: 320,
  },

  featureGrid: {
    gap: spacing.md,
  },
  featureCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  phaseLabel: {
    fontSize: 9,
    color: colors.inkSubtle,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  cardSub: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
  },
  openAction: {
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
});
