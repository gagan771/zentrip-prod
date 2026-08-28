import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getOfflineTrailPack, saveOfflineTrailPack } from '../../lib/offline-trails';
import { getTrail, getTrailPackage, listTrails, type TrailDetail, type TrailPackage, type TrailSummary } from '../../lib/trails';
import { colors, radii, spacing, typography } from '../../lib/theme';

function formatPoint(point?: number[]) {
  if (!point || point.length < 2) return '—';
  return `${point[1].toFixed(4)}°, ${point[0].toFixed(4)}°`;
}

function RoutePreview({ trail }: { trail: TrailDetail }) {
  const points = trail.routeGeojson.coordinates;
  const start = points[0];
  const end = points[points.length - 1];
  const strip = points.length > 24 ? points.filter((_, index) => index % Math.ceil(points.length / 24) === 0) : points;
  return (
    <View style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <Text style={styles.sectionTitle}>Route preview</Text>
        <Text style={styles.previewLabel}>{points.length} track points</Text>
      </View>
      <View style={styles.coordRow}>
        <View style={styles.coordBlock}>
          <Text style={styles.coordLabel}>START</Text>
          <Text style={styles.coordValue}>{formatPoint(start)}</Text>
        </View>
        <View style={styles.coordBlock}>
          <Text style={styles.coordLabel}>END</Text>
          <Text style={styles.coordValue}>{formatPoint(end)}</Text>
        </View>
      </View>
      <View style={styles.routeStrip}>
        {strip.map((_, index) => (
          <View
            key={`${index}`}
            style={[styles.routeSegment, index === 0 && styles.routeStart, index === strip.length - 1 && styles.routeEnd]}
          />
        ))}
      </View>
      <Text style={styles.routeNote}>
        Illustrative geometry only. Native maps need a development build; this pack still lists waypoints, hazards, and emergency numbers.
      </Text>
    </View>
  );
}

export default function TrailsScreen() {
  const insets = useSafeAreaInsets();
  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [selected, setSelected] = useState<TrailDetail | null>(null);
  const [emergencyNumbers, setEmergencyNumbers] = useState<TrailPackage['emergencyNumbers']>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrails()
      .then(setTrails)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load trail catalog.'))
      .finally(() => setLoading(false));
  }, []);

  async function openTrail(trail: TrailSummary) {
    setBusy(true);
    setError(null);
    try {
      const offline = await getOfflineTrailPack(trail.slug);
      if (offline) {
        setSelected(offline.pack.trail);
        setCachedAt(offline.cachedAt);
      } else {
        setSelected(await getTrail(trail.slug));
        setCachedAt(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open trail.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadPackage() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const pack = await getTrailPackage(selected.slug);
      const saved = await saveOfflineTrailPack(pack);
      setSelected(pack.trail);
      setEmergencyNumbers(pack.emergencyNumbers);
      setCachedAt(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save offline package.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }]}>
      <Text style={styles.eyebrow}>PHASE 5 · TRAILS</Text>
      <Text style={styles.title}>Offline Trail Packs</Text>
      <Text style={styles.subtitle}>Route manifests, waypoints, emergency contacts, and confidence labels for low-connectivity travel.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {selected ? (
        <View style={styles.panel}>
          <TouchableOpacity onPress={() => setSelected(null)}><Text style={styles.back}>‹ All trails</Text></TouchableOpacity>
          <Text style={styles.detailTitle}>{selected.name}</Text>
          <Text style={styles.meta}>{selected.region} · {selected.difficulty} · {selected.distanceKm} km · +{selected.elevationGainM} m</Text>
          <View style={styles.warning}><Text style={styles.warningTitle}>{selected.navigationReady ? 'VERIFIED ROUTE' : 'PREVIEW — NOT FOR NAVIGATION'}</Text><Text style={styles.warningText}>{selected.navigationReady ? 'Check current closures and weather before departure.' : 'This route is illustrative and must be checked with official/local sources and a qualified guide.'}</Text></View>
          <RoutePreview trail={selected} />
          <Text style={styles.sectionTitle}>Waypoints</Text>
          {selected.waypoints.map((waypoint) => <View key={waypoint.id} style={styles.row}><Text style={styles.rowTitle}>{waypoint.name} · {waypoint.kind}</Text><Text style={styles.rowText}>{waypoint.description}{waypoint.elevationM ? ` · ${waypoint.elevationM} m` : ''}</Text></View>)}
          <Text style={styles.sectionTitle}>Hazards</Text>
          {selected.hazards.length ? selected.hazards.map((hazard) => <View key={hazard.id} style={styles.hazard}><Text style={styles.rowTitle}>{hazard.category} · {hazard.confidence}</Text><Text style={styles.rowText}>{hazard.description}</Text></View>) : <Text style={styles.rowText}>No current hazards are supplied. This is not evidence that the route is clear.</Text>}
          {emergencyNumbers.length ? (
            <View>
              <Text style={styles.sectionTitle}>Emergency numbers in this pack</Text>
              {emergencyNumbers.map((item) => (
                <Text key={item.number} style={styles.rowText}>{item.label}: {item.number} · {item.source}</Text>
              ))}
            </View>
          ) : null}
          <TouchableOpacity style={styles.primary} onPress={downloadPackage} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{cachedAt ? 'Refresh offline package' : 'Download offline package'}</Text>}
          </TouchableOpacity>
          {cachedAt ? <Text style={styles.cached}>Saved on this device · {new Date(cachedAt).toLocaleString()}</Text> : null}
        </View>
      ) : (
        <View style={styles.list}>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          {!loading && !trails.length ? <Text style={styles.rowText}>No published or preview trails are available yet.</Text> : null}
          {trails.map((trail) => <TouchableOpacity key={trail.id} style={styles.card} onPress={() => openTrail(trail)} disabled={busy}>
            <View style={styles.cardTop}><Text style={styles.cardTitle}>{trail.name}</Text><Text style={styles.badge}>{trail.verificationStatus}</Text></View>
            <Text style={styles.meta}>{trail.region} · {trail.distanceKm} km · {trail.difficulty}</Text>
            <Text style={styles.cardText}>{trail.summary}</Text>
            <Text style={styles.open}>Open package →</Text>
          </TouchableOpacity>)}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  eyebrow: { color: colors.goldDark, fontSize: typography.fontSize.micro, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: typography.fontSize.display, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.body, lineHeight: 21 },
  error: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radii.md },
  list: { gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800', flex: 1 },
  cardText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  badge: { color: colors.goldDark, fontSize: typography.fontSize.micro, fontWeight: '800', textTransform: 'uppercase' },
  meta: { color: colors.inkSubtle, fontSize: typography.fontSize.caption, textTransform: 'capitalize' },
  open: { color: colors.primary, fontSize: typography.fontSize.caption, fontWeight: '800', marginTop: spacing.xs },
  panel: { backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  back: { color: colors.primary, fontWeight: '800' },
  detailTitle: { color: colors.ink, fontSize: typography.fontSize.title1, fontWeight: '800' },
  warning: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: spacing.md },
  warningTitle: { color: colors.warning, fontSize: typography.fontSize.micro, fontWeight: '900', letterSpacing: 1 },
  warningText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18, marginTop: 4 },
  routeCard: { backgroundColor: colors.cardWarm, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  coordRow: { flexDirection: 'row', gap: spacing.sm },
  coordBlock: { flex: 1, backgroundColor: colors.card, borderRadius: radii.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  coordLabel: { color: colors.inkSubtle, fontSize: typography.fontSize.micro, fontWeight: '800', letterSpacing: 1 },
  coordValue: { color: colors.ink, fontSize: typography.fontSize.caption, fontWeight: '700', marginTop: 4 },
  routeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800', marginTop: spacing.sm },
  previewLabel: { color: colors.inkSubtle, fontSize: typography.fontSize.micro },
  routeStrip: { flexDirection: 'row', height: 18, alignItems: 'center', gap: 3 },
  routeSegment: { flex: 1, height: 4, backgroundColor: colors.gold, borderRadius: 4 },
  routeStart: { height: 12, backgroundColor: colors.sage },
  routeEnd: { height: 12, backgroundColor: colors.primary },
  routeNote: { color: colors.inkMuted, fontSize: typography.fontSize.micro, lineHeight: 15 },
  row: { borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: typography.fontSize.caption, fontWeight: '800', textTransform: 'capitalize' },
  rowText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  hazard: { backgroundColor: colors.errorBg, padding: spacing.sm, borderRadius: radii.sm, gap: 3 },
  primary: { backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  primaryText: { color: colors.white, fontWeight: '800' },
  cached: { color: colors.sage, fontSize: typography.fontSize.micro, textAlign: 'center' },
});
