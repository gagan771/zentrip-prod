import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

type ExploreItem = {
  city: string;
  category: 'Landmarks' | 'Food' | 'Culture';
  title: string;
  description: string;
  fact: string;
  color: string;
  mark: string;
};

const ITEMS: ExploreItem[] = [
  {
    city: 'Delhi',
    category: 'Landmarks',
    title: 'Red Fort',
    description: 'A sandstone gateway into Mughal Delhi.',
    fact: 'Grounded in Zentrip Knowledge Base',
    color: '#E8D9CB',
    mark: '01',
  },
  {
    city: 'Agra',
    category: 'Landmarks',
    title: 'Taj Mahal',
    description: 'Marble, symmetry, and the Yamuna at first light.',
    fact: 'Grounded in Zentrip Knowledge Base',
    color: '#DDE5E4',
    mark: '02',
  },
  {
    city: 'Jaipur',
    category: 'Culture',
    title: 'Amber Fort',
    description: 'A hilltop palace of courtyards and mirrored halls.',
    fact: 'Grounded in Zentrip Knowledge Base',
    color: '#E9DFC4',
    mark: '03',
  },
  {
    city: 'Delhi',
    category: 'Food',
    title: 'Old Delhi after dark',
    description: 'A slow evening of lanes, spice, and shared plates.',
    fact: 'Ask Companion for a personal route',
    color: '#DDE7D7',
    mark: '04',
  },
];

const CATEGORIES = ['All', 'Landmarks', 'Food', 'Culture'] as const;

export default function ExploreScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ITEMS.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category;
      const matchesSearch = !query || `${item.title} ${item.city} ${item.description}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>DISCOVER WITH CONTEXT</Text>
      <Text style={styles.title}>Explore India</Text>
      <Text style={styles.subtitle}>Places worth slowing down for, with facts you can trust.</Text>

      <TextInput
        style={styles.search}
        placeholder="Search Delhi, food, forts..."
        placeholderTextColor="#8A8F86"
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.categoryChip, category === item && styles.categoryChipActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={category === item ? styles.categoryTextActive : styles.categoryText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>The Golden Triangle</Text>
        <Text style={styles.sectionMeta}>{filteredItems.length} ideas</Text>
      </View>

      {filteredItems.map((item) => (
        <TouchableOpacity key={item.title} style={styles.placeCard} onPress={() => router.push('/(tabs)/guide')}>
          <View style={[styles.placeMark, { backgroundColor: item.color }]}>
            <Text style={styles.placeMarkText}>{item.mark}</Text>
            <Text style={styles.placeCity}>{item.city.toUpperCase()}</Text>
          </View>
          <View style={styles.placeBody}>
            <View style={styles.placeTopline}>
              <Text style={styles.placeCategory}>{item.category}</Text>
              <Text style={styles.arrow}>↗</Text>
            </View>
            <Text style={styles.placeTitle}>{item.title}</Text>
            <Text style={styles.placeDescription}>{item.description}</Text>
            <Text style={styles.placeFact}>{item.fact}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {!filteredItems.length ? <Text style={styles.noResults}>No places match that search yet.</Text> : null}

      <View style={styles.plannerCard}>
        <Text style={styles.plannerEyebrow}>NOT SURE WHERE TO START?</Text>
        <Text style={styles.plannerTitle}>Let Zentrip build a route around you.</Text>
        <Text style={styles.plannerBody}>Choose your cities, dates, and pace. The plan stays grounded in real places.</Text>
        <TouchableOpacity style={styles.plannerButton} onPress={() => router.push('/(tabs)/trip')}>
          <Text style={styles.plannerButtonText}>Plan a trip</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFAF6' },
  content: { padding: 20, paddingBottom: 42, gap: 13 },
  eyebrow: { color: '#8C3C29', fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 4 },
  title: { color: '#1C2128', fontSize: 30, lineHeight: 35, fontWeight: '700', marginTop: 6 },
  subtitle: { color: '#687078', fontSize: 14, lineHeight: 20, maxWidth: 340 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9E7E0', borderRadius: 12, padding: 13, color: '#1C2128', marginTop: 6 },
  categoryRow: { gap: 8, paddingVertical: 2 },
  categoryChip: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  categoryChipActive: { backgroundColor: '#1C2128', borderColor: '#1C2128' },
  categoryText: { color: '#687078', fontSize: 13 },
  categoryTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  sectionTitle: { color: '#1C2128', fontSize: 18, fontWeight: '700' },
  sectionMeta: { color: '#8A8F86', fontSize: 12 },
  placeCard: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9E7E0', borderRadius: 16, overflow: 'hidden', minHeight: 145 },
  placeMark: { width: 96, padding: 12, justifyContent: 'space-between' },
  placeMarkText: { color: '#1C2128', fontSize: 28, fontWeight: '700' },
  placeCity: { color: '#687078', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  placeBody: { flex: 1, padding: 14, gap: 5 },
  placeTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  placeCategory: { color: '#8C3C29', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  arrow: { color: '#687078', fontSize: 18, lineHeight: 14 },
  placeTitle: { color: '#1C2128', fontSize: 18, fontWeight: '700' },
  placeDescription: { color: '#687078', fontSize: 12, lineHeight: 17 },
  placeFact: { color: '#54705B', fontSize: 10, marginTop: 'auto' },
  noResults: { color: '#687078', paddingVertical: 25, textAlign: 'center' },
  plannerCard: { backgroundColor: '#1C2128', borderRadius: 18, padding: 18, marginTop: 5 },
  plannerEyebrow: { color: '#BFC8C0', fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  plannerTitle: { color: '#fff', fontSize: 21, lineHeight: 26, fontWeight: '700', marginTop: 10 },
  plannerBody: { color: '#D4D8D4', fontSize: 13, lineHeight: 19, marginTop: 7 },
  plannerButton: { backgroundColor: '#E7D4A3', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 15 },
  plannerButtonText: { color: '#1C2128', fontWeight: '700', fontSize: 14 },
});
