import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRiskPatterns } from '../../lib/risk';

const CITIES = ['Delhi', 'Agra', 'Jaipur'];

export default function RiskScreen() {
  const insets = useSafeAreaInsets();
  const [city, setCity] = useState('Delhi');
  const query = useQuery({ queryKey: ['risk-patterns', city], queryFn: () => getRiskPatterns(city) });
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
    <Text style={styles.eyebrow}>GUARDIAN / RISK INTELLIGENCE</Text>
    <Text style={styles.title}>Specific patterns, practical actions.</Text>
    <Text style={styles.subtitle}>These are location-based patterns, not labels for an entire city or accusations against a named business.</Text>
    <View style={styles.cityRow}>{CITIES.map((item) => <TouchableOpacity key={item} style={[styles.cityChip, city === item && styles.cityActive]} onPress={() => setCity(item)}><Text style={city === item ? styles.cityActiveText : styles.cityText}>{item}</Text></TouchableOpacity>)}</View>
    {query.isError ? <Text style={styles.error}>Could not load risk patterns.</Text> : null}
    {query.data?.results.map((risk) => <View key={risk.id} style={styles.card}><View style={styles.cardTop}><Text style={styles.category}>{risk.category.replace('_', ' ')}</Text><Text style={styles.confidence}>{risk.confidence} · verified {risk.lastVerified}</Text></View><Text style={styles.location}>{risk.locationLabel}</Text><Text style={styles.pattern}>{risk.pattern}</Text><Text style={styles.action}>Recommended: {risk.recommendation}</Text><Text style={styles.source}>Source: {risk.sourceName}</Text></View>)}
    {!query.isFetching && query.data && query.data.results.length === 0 ? <Text style={styles.empty}>No published patterns for this city.</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FBFAF6' }, content: { padding: 20, paddingBottom: 48, gap: 14 }, eyebrow: { color: '#8C3C29', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, title: { color: '#1C2128', fontSize: 27, fontWeight: '800' }, subtitle: { color: '#687078', fontSize: 13, lineHeight: 19 }, cityRow: { flexDirection: 'row', gap: 8 }, cityChip: { borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 }, cityActive: { backgroundColor: '#1C2128', borderColor: '#1C2128' }, cityText: { color: '#515963', fontSize: 12 }, cityActiveText: { color: '#fff', fontSize: 12, fontWeight: '700' }, card: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, category: { color: '#8C3C29', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, confidence: { color: '#687078', fontSize: 10 }, location: { color: '#1C2128', fontSize: 16, fontWeight: '800' }, pattern: { color: '#515963', fontSize: 13, lineHeight: 19 }, action: { color: '#54705B', fontSize: 13, lineHeight: 19, fontWeight: '700' }, source: { color: '#8A8F92', fontSize: 10 }, error: { color: '#8C3C29' }, empty: { color: '#687078', paddingVertical: 20 } });
