import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { nearbyPeaks, type Peak } from '../../lib/peaks';
import { readCompassHeading } from '../../lib/compass';
import { isGoldenTrianglePlains, tripLooksLikeGoldenTriangle } from '../../lib/trip-prefill';
import { getTrip } from '../../lib/trips';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

export default function PeaksScreen() {
  const router = useRouter();
  const activeTripId = useStore((s) => s.activeTripId);
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Use your location to find nearby preview peaks.');
  const [plainsDetected, setPlainsDetected] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [demNote, setDemNote] = useState<string | null>(null);

  const tripQuery = useQuery({
    queryKey: ['trip', activeTripId],
    queryFn: () => getTrip(activeTripId as string),
    enabled: Boolean(activeTripId),
  });

  const tripIsCorridor = tripLooksLikeGoldenTriangle(tripQuery.data);
  const showSoftGate = tripIsCorridor || plainsDetected;

  async function locate(mode: 'nearby' | 'inView') {
    setLoading(true);
    setMessage('');
    setPlainsDetected(false);
    setMethod(null);
    setDemNote(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location permission is needed for nearby peaks.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      const inPlains = isGoldenTrianglePlains(latitude, longitude);
      setPlainsDetected(inPlains);

      if (inPlains) {
        setPeaks([]);
        setHeading(null);
        setMessage(
          'You’re in the Delhi–Agra–Jaipur corridor. Peak identification is Himalaya-first — there are no catalog peaks near these plains.'
        );
        return;
      }

      let bearing: number | undefined;
      if (mode === 'inView') {
        bearing = await readCompassHeading();
        if (bearing === undefined) {
          throw new Error('Could not read compass heading. Hold the phone still, then try Identify peak in view again.');
        }
        setHeading(Math.round(bearing));
      } else {
        setHeading(null);
      }

      const response = await nearbyPeaks(latitude, longitude, bearing !== undefined ? { bearing, fieldOfView: 50 } : undefined);
      setPeaks(response.results);
      setMethod(response.identificationMethod ?? null);
      setDemNote(response.demNote ?? null);
      if (!response.results.length) {
        setMessage(
          mode === 'inView'
            ? 'No catalog peaks in that compass field of view. Line-of-sight is not verified (no DEM).'
            : 'No preview peaks were found within the lookup radius.'
        );
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not load nearby peaks.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: spacing.xxxl }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>PHASE 5 · LANDSCAPE LENS</Text>
      <Text style={styles.title}>Nearby Peaks</Text>
      <Text style={styles.subtitle}>
        Geometry-first lookup using GPS plus, when you ask, the device compass. Elevation and coordinates come from
        the peak catalog — not an LLM. Terrain occlusion is not applied yet.
      </Text>

      <View style={styles.warning}>
        <Text style={styles.warningTitle}>HIMALAYA-FIRST PREVIEW</Text>
        <Text style={styles.warningText}>
          Peaks is built for hill stations and high ranges. On the Golden Triangle plains it will usually find nothing —
          that’s expected, not a bug.
        </Text>
      </View>

      {showSoftGate ? (
        <View style={styles.softGate}>
          <View style={styles.softGateHeader}>
            <Ionicons name="trail-sign-outline" size={18} color={colors.sage} />
            <Text style={styles.softGateTitle}>
              {tripIsCorridor ? 'Your trip is Golden Triangle' : 'Corridor plains detected'}
            </Text>
          </View>
          <Text style={styles.softGateBody}>
            {tripIsCorridor
              ? `${tripQuery.data?.cities.join(' · ')} is a heritage plains corridor. Try Offline Trail Packs for day hikes, or Explore for Taj / forts / bazaars.`
              : 'You’re near Delhi, Agra, or Jaipur. Peak lookup won’t return Himalayan summits from here.'}
          </Text>
          <View style={styles.ctaRow}>
            <TouchableOpacity style={styles.ctaPrimary} onPress={() => router.push('/trails')} activeOpacity={0.85}>
              <Text style={styles.ctaPrimaryText}>Open Trails preview</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaSecondary} onPress={() => router.push('/(tabs)/explore')} activeOpacity={0.85}>
              <Text style={styles.ctaSecondaryText}>Explore corridor</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <TouchableOpacity style={styles.primary} onPress={() => locate('nearby')} disabled={loading} activeOpacity={0.85}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Find nearby peaks</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => locate('inView')} disabled={loading} activeOpacity={0.85}>
        <Text style={styles.secondaryText}>Identify peak in view</Text>
      </TouchableOpacity>
      {heading !== null ? (
        <Text style={styles.message}>Compass heading {heading}° · FOV 50° · DEM not applied</Text>
      ) : null}
      {method ? <Text style={styles.source}>Method: {method}{demNote ? ` · ${demNote}` : ''}</Text> : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {!loading && peaks.length === 0 && !message.includes('permission') && !plainsDetected && !tripIsCorridor ? (
        <View style={styles.emptyHint}>
          <Text style={styles.emptyHintText}>
            Tip: open this near a hill station (e.g. Mussoorie, Manali approaches). Catalog coverage is still preview-only.
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {peaks.map((peak) => (
          <View key={peak.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{peak.name}</Text>
              <Text style={styles.badge}>{peak.confidence}</Text>
            </View>
            <Text style={styles.meta}>
              {peak.elevationM.toLocaleString()} m · {peak.distanceKm} km · {peak.direction} {peak.bearingDegrees}°
              {peak.angularDifferenceDegrees != null ? ` · ${peak.angularDifferenceDegrees}° off heading` : ''}
            </Text>
            <Text style={styles.cardText}>{peak.description}</Text>
            <Text style={styles.source}>
              {peak.sourceName} · checked {peak.lastVerified}
            </Text>
          </View>
        ))}
      </View>
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
  softGate: {
    backgroundColor: colors.sageSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  softGateHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  softGateTitle: { color: colors.sageDark, fontSize: typography.fontSize.headline, fontWeight: '800', flex: 1 },
  softGateBody: { color: colors.sageDark, fontSize: typography.fontSize.caption, lineHeight: 18 },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  ctaPrimary: {
    backgroundColor: colors.sage,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  ctaPrimaryText: { color: colors.white, fontWeight: '800', fontSize: typography.fontSize.caption },
  ctaSecondary: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaSecondaryText: { color: colors.ink, fontWeight: '700', fontSize: typography.fontSize.caption },
  primary: { backgroundColor: colors.sage, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  primaryText: { color: colors.white, fontWeight: '800' },
  secondary: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  message: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  emptyHint: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyHintText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800', flex: 1 },
  badge: { color: colors.goldDark, fontSize: typography.fontSize.micro, fontWeight: '800', textTransform: 'uppercase' },
  meta: { color: colors.sage, fontSize: typography.fontSize.caption, fontWeight: '800' },
  cardText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  source: { color: colors.inkSubtle, fontSize: typography.fontSize.micro, marginTop: 4 },
});
