import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { searchKnowledge } from '../../lib/knowledge';

type ExploreItem = {
  city: string;
  category: 'Landmarks' | 'Food' | 'Culture' | 'Nature' | 'Sacred';
  title: string;
  subtitle: string;
  description: string;
  fact: string;
  timing: string;
  color: string;
  tagColor: string;
  mark: string;
  icon: string;
};

const ITEMS: ExploreItem[] = [
  {
    city: 'Agra',
    category: 'Landmarks',
    title: 'Taj Mahal',
    subtitle: 'Mausoleum of White Makrana Marble',
    description: 'Perfect bilateral symmetry along the Yamuna river at first morning light.',
    fact: 'Verified Grounding · Archaeological Survey of India',
    timing: 'Best at Sunrise (05:45 AM)',
    color: colors.primarySoft,
    tagColor: colors.primary,
    mark: '01',
    icon: 'sparkles',
  },
  {
    city: 'Delhi',
    category: 'Landmarks',
    title: 'Red Fort & Lahori Gate',
    subtitle: 'Seat of Mughal Emperors',
    description: 'Massive red sandstone ramparts, Diwan-i-Khas, and centuries of Indian history.',
    fact: 'Verified Grounding · UNESCO World Heritage',
    timing: 'Ideal 09:00 AM - 11:30 AM',
    color: colors.goldSoft,
    tagColor: colors.goldDark,
    mark: '02',
    icon: 'shield-outline',
  },
  {
    city: 'Jaipur',
    category: 'Culture',
    title: 'Amber Palace & Sheesh Mahal',
    subtitle: 'Hilltop Rajput Fort & Mirror Halls',
    description: 'Four courtyards overlooking Maota Lake with thousands of mirrored convex inlays.',
    fact: 'Verified Grounding · Rajasthan Tourism Dept',
    timing: 'Best 08:30 AM before tourist buses',
    color: colors.sageSoft,
    tagColor: colors.sage,
    mark: '03',
    icon: 'library-outline',
  },
  {
    city: 'Delhi',
    category: 'Food',
    title: 'Old Delhi Khari Baoli & Paranthe',
    subtitle: 'Asia’s Largest Spice Market & Food Lanes',
    description: 'A slow sensory morning of aromatic cardamom, steaming stuffed parathas, and jalebi.',
    fact: 'Curated Trail · Zenny Local Food Engine',
    timing: 'Best 10:00 AM - 01:00 PM',
    color: colors.sandLight,
    tagColor: colors.primary,
    mark: '04',
    icon: 'restaurant-outline',
  },
  {
    city: 'Jaipur',
    category: 'Culture',
    title: 'Hawa Mahal (Palace of Winds)',
    subtitle: '953 Pink Sandstone Jharokhas',
    description: 'Honeycomb facade designed for royal women to observe street festivals unnoticed.',
    fact: 'Verified Grounding · UNESCO World Heritage',
    timing: 'Golden hour at 04:30 PM',
    color: colors.primarySoft,
    tagColor: colors.primary,
    mark: '05',
    icon: 'grid-outline',
  },
  {
    city: 'Agra',
    category: 'Landmarks',
    title: 'Agra Fort & Jahangiri Mahal',
    subtitle: 'Red Sandstone Citadel of Akbar',
    description: 'Grand palaces and the private chamber where Shah Jahan spent his final years viewing the Taj.',
    fact: 'Verified Grounding · ASI National Monument',
    timing: 'Late afternoon 03:00 PM',
    color: colors.goldSoft,
    tagColor: colors.goldDark,
    mark: '06',
    icon: 'business-outline',
  },
];

const CATEGORIES = [
  { id: 'All', label: 'All Places', icon: 'apps-outline' },
  { id: 'Landmarks', label: 'Monuments', icon: 'business-outline' },
  { id: 'Food', label: 'Food Trails', icon: 'restaurant-outline' },
  { id: 'Culture', label: 'Heritage & Arts', icon: 'sparkles-outline' },
] as const;

const CITIES = ['All Cities', 'Delhi', 'Agra', 'Jaipur'] as const;

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCity, setSelectedCity] = useState<string>('All Cities');
  const [search, setSearch] = useState('');
  const knowledgeQuery = useQuery({
    queryKey: ['explore-knowledge', search, selectedCity],
    queryFn: () =>
      searchKnowledge(
        search.trim() || 'monument',
        selectedCity === 'All Cities' ? undefined : selectedCity,
      ),
  });

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ITEMS.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesCity = selectedCity === 'All Cities' || item.city.toLowerCase() === selectedCity.toLowerCase();
      const matchesSearch =
        !query ||
        `${item.title} ${item.city} ${item.subtitle} ${item.description}`.toLowerCase().includes(query);
      return matchesCategory && matchesCity && matchesSearch;
    });
  }, [selectedCategory, selectedCity, search]);

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
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>CURATED KNOWLEDGE BASE</Text>
          </View>
          <Text style={styles.title}>Explore India</Text>
          <Text style={styles.subtitle}>
            Mindful discoveries, grounded heritage facts, and moments worth slowing down for.
          </Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.inkMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search monuments, spices, forts..."
            placeholderTextColor={colors.inkSubtle}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* City Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityRow}>
          {CITIES.map((city) => {
            const active = selectedCity === city;
            return (
              <TouchableOpacity
                key={city}
                style={[styles.cityChip, active && styles.cityChipActive]}
                onPress={() => setSelectedCity(city)}
                activeOpacity={0.8}
              >
                <Text style={active ? styles.cityTextActive : styles.cityText}>{city}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={active ? colors.white : colors.inkMuted}
                  style={{ marginRight: 6 }}
                />
                <Text style={active ? styles.categoryTextActive : styles.categoryText}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sourced Knowledge Base</Text>
          <Text style={styles.sectionMeta}>{knowledgeQuery.data?.results.length ?? 0} cited places</Text>
        </View>
        <View style={styles.cardsList}>
          {knowledgeQuery.data?.results.map((item) => (
            <TouchableOpacity
              key={item.claimId}
              style={styles.placeCard}
              onPress={() => router.push('/(tabs)/guide')}
              activeOpacity={0.85}
            >
              <Text style={styles.placeTitle}>{item.entityName}</Text>
              <Text style={styles.placeSubtitle}>{item.city} · {item.entityType}</Text>
              <Text style={styles.placeDescription}>{item.claim}</Text>
              <Text style={styles.placeFact}>
                {item.citation.sourceName} · {item.citation.confidence}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Results Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>The Golden Triangle Corridor</Text>
          <Text style={styles.sectionMeta}>{filteredItems.length} curated stops</Text>
        </View>

        {/* Place Cards */}
        <View style={styles.cardsList}>
          {filteredItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.placeCard}
              onPress={() => router.push('/(tabs)/guide')}
              activeOpacity={0.88}
            >
              {/* Left Color Pillar */}
              <View style={[styles.placePillar, { backgroundColor: item.color }]}>
                <Text style={[styles.pillarNumber, { color: item.tagColor }]}>{item.mark}</Text>
                <View style={styles.pillarCityBadge}>
                  <Text style={[styles.pillarCityText, { color: item.tagColor }]}>
                    {item.city.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Right Content */}
              <View style={styles.placeBody}>
                <View style={styles.placeTopline}>
                  <View style={[styles.categoryPill, { backgroundColor: colors.sandLight }]}>
                    <Text style={styles.categoryPillText}>{item.category.toUpperCase()}</Text>
                  </View>
                  <View style={styles.timingBadge}>
                    <Ionicons name="time-outline" size={11} color={colors.inkMuted} />
                    <Text style={styles.timingText}>{item.timing}</Text>
                  </View>
                </View>

                <Text style={styles.placeTitle}>{item.title}</Text>
                <Text style={styles.placeSubtitle}>{item.subtitle}</Text>
                <Text style={styles.placeDescription}>{item.description}</Text>

                <View style={styles.placeFooter}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.sage} />
                  <Text style={styles.placeFact}>{item.fact}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {!filteredItems.length ? (
          <View style={styles.noResults}>
            <Ionicons name="search-outline" size={32} color={colors.inkSubtle} />
            <Text style={styles.noResultsTitle}>No places found</Text>
            <Text style={styles.noResultsSubtitle}>Try searching for another keyword or change your filters.</Text>
          </View>
        ) : null}

        {/* Planner CTA Banner */}
        <View style={styles.plannerCard}>
          <View style={styles.plannerBadge}>
            <Ionicons name="sparkles" size={12} color="#E8D2AA" />
            <Text style={styles.plannerEyebrow}>BESPOKE PLANNING</Text>
          </View>
          <Text style={styles.plannerTitle}>Build an itinerary around these places</Text>
          <Text style={styles.plannerBody}>
            Choose your pace, select dates, and let Zenny weave these grounded landmarks into your days.
          </Text>
          <TouchableOpacity
            style={styles.plannerButton}
            onPress={() => router.push('/(tabs)/trip')}
            activeOpacity={0.85}
          >
            <Text style={styles.plannerButtonText}>Open Trip Planner</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.ink} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
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

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 48,
    ...shadows.sm,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.body,
    color: colors.ink,
    height: '100%',
  },

  cityRow: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  cityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cityChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  cityText: {
    fontSize: typography.fontSize.caption,
    color: colors.inkMuted,
    fontWeight: '600',
  },
  cityTextActive: {
    fontSize: typography.fontSize.caption,
    color: colors.white,
    fontWeight: '700',
  },

  categoryRow: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: typography.fontSize.caption,
    color: colors.ink,
    fontWeight: '600',
  },
  categoryTextActive: {
    fontSize: typography.fontSize.caption,
    color: colors.white,
    fontWeight: '700',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  sectionMeta: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.caption,
  },

  cardsList: {
    gap: spacing.md,
  },
  placeCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  placePillar: {
    width: 76,
    padding: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillarNumber: {
    fontSize: typography.fontSize.title1,
    fontWeight: '800',
  },
  pillarCityBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  pillarCityText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  placeBody: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  placeTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  categoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  categoryPillText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  timingText: {
    color: colors.inkMuted,
    fontSize: 10,
  },
  placeTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  placeSubtitle: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  placeDescription: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
    marginTop: 2,
  },
  placeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
  },
  placeFact: {
    color: colors.sage,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },

  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  noResultsTitle: {
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
    color: colors.ink,
  },
  noResultsSubtitle: {
    fontSize: typography.fontSize.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },

  plannerCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.xs,
    ...shadows.lg,
  },
  plannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  plannerEyebrow: {
    color: '#E8D2AA',
    fontSize: typography.fontSize.micro,
    letterSpacing: 1.4,
    fontWeight: '800',
  },
  plannerTitle: {
    color: colors.white,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
    marginTop: 4,
  },
  plannerBody: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  plannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8D2AA',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  plannerButtonText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: typography.fontSize.body,
  },
});

