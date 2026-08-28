import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createExpertCase, getAvailableExperts, getExpertCases } from '../../lib/experts';

export default function ExpertsScreen() {
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const [city, setCity] = useState('Jaipur');
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('local_advice');
  const cases = useQuery({ queryKey: ['expert-cases'], queryFn: getExpertCases });
  const experts = useQuery({ queryKey: ['available-experts', city], queryFn: () => getAvailableExperts(city) });
  const mutation = useMutation({ mutationFn: () => createExpertCase({ city, category, question }), onSuccess: () => { setQuestion(''); client.invalidateQueries({ queryKey: ['expert-cases'] }); } });
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
    <Text style={styles.eyebrow}>PHASE 5 / LOCAL EXPERTS</Text><Text style={styles.title}>Ask a human when judgment matters.</Text><Text style={styles.subtitle}>Experts support local context and disputed content. They are not emergency responders—use Guardian for emergencies.</Text>
    <View style={styles.panel}><Text style={styles.label}>What do you need help with?</Text><View style={styles.chips}>{['local_advice', 'community_report', 'content_dispute', 'non_emergency_safety'].map((item) => <TouchableOpacity key={item} style={[styles.chip, category === item && styles.chipActive]} onPress={() => setCategory(item)}><Text style={category === item ? styles.chipActiveText : styles.chipText}>{item.replace('_', ' ')}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" /><TextInput style={[styles.input, styles.multiline]} value={question} onChangeText={setQuestion} multiline placeholder="Describe the question with context…" /><TouchableOpacity style={styles.primary} onPress={() => mutation.mutate()} disabled={mutation.isPending || question.trim().length < 10}><Text style={styles.primaryText}>{mutation.isPending ? 'Sending…' : 'Ask local expert'}</Text></TouchableOpacity></View>
    <Text style={styles.sectionTitle}>Available corridor experts</Text>
    {experts.data?.map((item) => (
      <View key={item.id} style={styles.card}>
        <Text style={styles.question}>{item.displayName} · {item.city}</Text>
        <Text style={styles.note}>{item.specialties.join(' · ')} · rating {item.rating}</Text>
      </View>
    ))}
    <Text style={styles.sectionTitle}>Your cases</Text>{cases.data?.map((item) => <View key={item.id} style={styles.card}><View style={styles.cardTop}><Text style={styles.status}>{item.status}</Text><Text style={styles.city}>{item.city}</Text></View><Text style={styles.question}>{item.question}</Text>{item.response ? <Text style={styles.response}>Local Expert: {item.response}</Text> : <Text style={styles.note}>Waiting for an available expert.</Text>}</View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FBFAF6' }, content: { padding: 20, paddingBottom: 48, gap: 14 }, eyebrow: { color: '#8C3C29', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, title: { color: '#1C2128', fontSize: 27, fontWeight: '800' }, subtitle: { color: '#687078', fontSize: 13, lineHeight: 19 }, panel: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 }, label: { color: '#1C2128', fontSize: 13, fontWeight: '800' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderColor: '#E5E1D7', borderRadius: 15, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, chipActive: { backgroundColor: '#1C2128', borderColor: '#1C2128' }, chipText: { color: '#515963', fontSize: 10 }, chipActiveText: { color: '#fff', fontSize: 10, fontWeight: '700' }, input: { backgroundColor: '#FBFAF6', borderColor: '#E5E1D7', borderRadius: 10, borderWidth: 1, color: '#1C2128', padding: 12 }, multiline: { minHeight: 88, textAlignVertical: 'top' }, primary: { alignItems: 'center', backgroundColor: '#1C2128', borderRadius: 11, paddingVertical: 13 }, primaryText: { color: '#fff', fontWeight: '800' }, sectionTitle: { color: '#1C2128', fontSize: 17, fontWeight: '800' }, card: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, status: { color: '#8C3C29', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, city: { color: '#687078', fontSize: 11 }, question: { color: '#1C2128', fontSize: 14, lineHeight: 20 }, response: { color: '#54705B', fontSize: 13, lineHeight: 19 }, note: { color: '#687078', fontSize: 11 } });
