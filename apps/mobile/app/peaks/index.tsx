import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nearbyPeaks, type Peak } from '../../lib/peaks';
import { colors, radii, spacing, typography } from '../../lib/theme';

export default function PeaksScreen() {
  const insets = useSafeAreaInsets();
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Use your location to find nearby preview peaks.');

  async function locate() {
    setLoading(true);
    setMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location permission is needed for nearby peaks.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const response = await nearbyPeaks(position.coords.latitude, position.coords.longitude);
      setPeaks(response.results);
      if (!response.results.length) setMessage('No preview peaks were found within the lookup radius.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not load nearby peaks.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }]}>
      <Text style={styles.eyebrow}>PHASE 5 · LANDSCAPE LENS</Text>
      <Text style={styles.title}>Nearby Peaks</Text>
      <Text style={styles.subtitle}>Geometry-first lookup using your location. Elevation, bearing, and distance come from the peak catalog—not an LLM.</Text>
      <View style={styles.warning}><Text style={styles.warningTitle}>PREVIEW DATA</Text><Text style={styles.warningText}>Peak alignment needs a DEM, compass heading, and field validation before it can be treated as identification.</Text></View>
      <TouchableOpacity style={styles.primary} onPress={locate} disabled={loading}>{loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Find nearby peaks</Text>}</TouchableOpacity>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>{peaks.map((peak) => <View key={peak.id} style={styles.card}><View style={styles.cardTop}><Text style={styles.cardTitle}>{peak.name}</Text><Text style={styles.badge}>{peak.confidence}</Text></View><Text style={styles.meta}>{peak.elevationM.toLocaleString()} m · {peak.distanceKm} km · {peak.direction} {peak.bearingDegrees}°</Text><Text style={styles.cardText}>{peak.description}</Text><Text style={styles.source}>{peak.sourceName} · checked {peak.lastVerified}</Text></View>)}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  eyebrow: { color: colors.sage, fontSize: typography.fontSize.micro, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: typography.fontSize.display, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.body, lineHeight: 21 },
  warning: { backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: radii.md },
  warningTitle: { color: colors.warning, fontWeight: '900', fontSize: typography.fontSize.micro, letterSpacing: 1 },
  warningText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18, marginTop: 4 },
  primary: { backgroundColor: colors.sage, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  primaryText: { color: colors.white, fontWeight: '800' },
  message: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  list: { gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800', flex: 1 },
  badge: { color: colors.goldDark, fontSize: typography.fontSize.micro, fontWeight: '800', textTransform: 'uppercase' },
  meta: { color: colors.sage, fontSize: typography.fontSize.caption, fontWeight: '800' },
  cardText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  source: { color: colors.inkSubtle, fontSize: typography.fontSize.micro, marginTop: 4 },
});
