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
  badge: string;
};

type FeatureSection = {
  title: string;
  items: FeatureItem[];
};

const SUITE_SECTIONS: FeatureSection[] = [
  {
    title: 'Safety',
    items: [
      {
        href: '/(tabs)/guardian',
        label: 'Safety Guardian',
        subtitle: '1-tap emergency dialer for 112, 1363 tourist helpline, and offline protocols.',
        phase: 'PHASE 3',
        icon: 'shield-checkmark-outline',
        accent: colors.error,
        badge: 'ESSENTIAL',
      },
      {
        href: '/risk',
        label: 'Risk Intelligence',
        subtitle: 'Confidence-tagged location patterns with practical recommendations, never city-wide labels.',
        phase: 'PHASE 6',
        icon: 'alert-circle-outline',
        accent: colors.primary,
        badge: 'PREVIEW',
      },
    ],
  },
  {
    title: 'Book & pay',
    items: [
      {
        href: '/services/booking',
        label: 'Book hotels, cabs & flights',
        subtitle: 'Company logos for Uber, Ola, hotels, airlines, IRCTC, and RedBus — tap to open the official site.',
        phase: 'PHASE 2',
        icon: 'ticket-outline',
        accent: colors.primary,
        badge: 'HANDOFF',
      },
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
        href: '/services/grocery',
        label: 'Quick Commerce & Essentials',
        subtitle: '10-minute medicine, bottled water, and snack hand-offs via local platforms.',
        phase: 'PHASE 2',
        icon: 'cart-outline',
        accent: colors.sage,
        badge: 'HANDOFF',
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
    ],
  },
  {
    title: 'Discover',
    items: [
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
        href: '/translation',
        label: 'Travel Translator',
        subtitle: 'Conversation mode with mic, menu camera, phrasebook, and live translation.',
        phase: 'PHASE 3',
        icon: 'language-outline',
        accent: colors.sage,
        badge: 'PHRASEBOOK',
      },
      {
        href: '/trails',
        label: 'Offline Trail Packs',
        subtitle: 'Waypoints, route previews, hazards, and emergency contacts saved for low-connectivity travel.',
        phase: 'PHASE 5',
        icon: 'footsteps-outline',
        accent: colors.goldDark,
        badge: 'PREVIEW',
      },
      {
        href: '/peaks',
        label: 'Nearby Peaks',
        subtitle: 'Geometry-first peak lookup with explicit preview confidence and distance/bearing values.',
        phase: 'PHASE 5',
        icon: 'triangle-outline',
        accent: colors.sage,
        badge: 'PREVIEW',
      },
    ],
  },
  {
    title: 'Social & outdoor',
    items: [
      {
        href: '/buddy',
        label: 'Travel Buddy',
        subtitle: 'Connect with verified fellow travelers exploring the same Golden Triangle corridor.',
        phase: 'PHASE 3',
        icon: 'people-outline',
        accent: colors.primaryMuted,
        badge: 'PREVIEW',
      },
      {
        href: '/community',
        label: 'Destination Community',
        subtitle: 'City channels, local tips, and traveler recommendations for Delhi, Agra, Jaipur.',
        phase: 'PHASE 3',
        icon: 'chatbubbles-outline',
        accent: colors.sage,
        badge: 'DEMO',
      },
      {
        href: '/experts',
        label: 'Ask a Local Expert',
        subtitle: 'Escalate nuanced local questions and disputed content to a human support queue.',
        phase: 'PHASE 5',
        icon: 'person-circle-outline',
        accent: colors.gold,
        badge: 'PREVIEW',
      },
      {
        href: '/explorer',
        label: 'Explorer Missions',
        subtitle: 'Submit careful GPS-tagged observations that enter a review queue before verification.',
        phase: 'PHASE 5',
        icon: 'compass-outline',
        accent: colors.goldDark,
        badge: 'PREVIEW',
      },
    ],
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
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="grid-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>COMPANION SUITE</Text>
          </View>
          <Text style={styles.title}>The rest of the kit</Text>
          <Text style={styles.subtitle}>
            Booking, safety, maps, and local help — Zenny lives in the meadow; everything else is here.
          </Text>
        </View>

        {SUITE_SECTIONS.map((section) => (
          <View key={section.title} style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.featureGrid}>
              {section.items.map((item) => (
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
                    <View style={[styles.statusBadge, { backgroundColor: `${item.accent}18` }]}>
                      <Text style={[styles.statusBadgeText, { color: item.accent }]}>{item.badge}</Text>
                    </View>
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
          </View>
        ))}
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
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  featureGrid: {
    gap: spacing.md,
  },
  featureCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xs,
    ...shadows.md,
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
