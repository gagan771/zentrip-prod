import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';
import { checkInIncident, createIncident, getActiveIncident, resolveIncident, shareIncident, type GuardianCategory, type GuardianIncident } from '../../lib/guardian';

const EMERGENCY_ACTIONS = [
  {
    number: '112',
    title: '112 — National Emergency',
    subtitle: 'Police, Ambulance, Fire & Disaster Response across India',
    color: '#D9381E',
    icon: 'warning-outline',
  },
  {
    number: '1363',
    title: '1363 — Tourist Helpline',
    subtitle: 'Ministry of Tourism 24/7 Multilingual Support (12 languages)',
    color: colors.primary,
    icon: 'globe-outline',
  },
  {
    number: '1091',
    title: '1091 — Women Helpline',
    subtitle: 'Dedicated 24/7 Emergency response & local assistance',
    color: '#8E2858',
    icon: 'shield-outline',
  },
];

const SAFETY_TIPS = [
  {
    title: 'Hydration & Food Safety',
    desc: 'Drink packaged sealed mineral water (Kinley/Bisleri/Aquafina) or RO filtered water. Eat hot, freshly cooked food from high-turnover busy spots.',
    icon: 'water-outline',
  },
  {
    title: 'Transit & Local Cabs',
    desc: 'Prefer official prepaid airport/railway taxi booths, Uber, or Ola over unsolicited touts outside stations. Verify vehicle license plate before boarding.',
    icon: 'car-outline',
  },
  {
    title: 'Digital Payments & UPI',
    desc: 'Scan official QR codes (PhonePe/Paytm/GPay). Keep small cash denominations (₹50, ₹100, ₹500) for rural heritage sites.',
    icon: 'wallet-outline',
  },
];
const INCIDENT_CATEGORIES: { id: GuardianCategory; label: string }[] = [
  { id: 'police', label: 'Police' },
  { id: 'medical', label: 'Medical' },
  { id: 'lost', label: 'Lost item' },
  { id: 'scam', label: 'Scam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'trail', label: 'Trail issue' },
];

export default function GuardianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const trustedContact = useStore((state) => state.trustedContact);
  const setTrustedContact = useStore((state) => state.setTrustedContact);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [incident, setIncident] = useState<GuardianIncident | null>(null);
  const [incidentCategory, setIncidentCategory] = useState<GuardianCategory>('other');
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);

  useEffect(() => {
    getActiveIncident().then(setIncident).catch(() => undefined);
  }, []);

  async function runIncidentAction(action: () => Promise<GuardianIncident>) {
    setIncidentBusy(true);
    setIncidentError(null);
    try {
      setIncident(await action());
    } catch (caught) {
      setIncidentError(caught instanceof Error ? caught.message : 'Guardian action failed.');
    } finally {
      setIncidentBusy(false);
    }
  }

  async function startIncident() {
    await runIncidentAction(() => createIncident(incidentCategory));
  }

  async function shareIncidentLocation() {
    if (!incident) return;
    setIncidentBusy(true);
    setIncidentError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission was not granted.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      setIncident(await shareIncident(incident.id, latitude, longitude));
      await Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`);
    } catch (caught) {
      setIncidentError(caught instanceof Error ? caught.message : 'Could not share incident location.');
    } finally {
      setIncidentBusy(false);
    }
  }

  async function shareLocation() {
    try {
      setLocationStatus('Getting your location…');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('Location permission was not granted.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      await Linking.openURL(mapUrl);
      setLocationStatus('Location link opened in browser.');
    } catch {
      setLocationStatus('Could not retrieve current location.');
    }
  }

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
            <Ionicons name="shield-checkmark" size={12} color={colors.error} />
            <Text style={styles.eyebrow}>SAFETY GUARDIAN</Text>
          </View>
          <Text style={styles.title}>Emergency & Helpline</Text>
          <Text style={styles.subtitle}>
            One-touch verified emergency services that never require internet access or AI processing.
          </Text>
        </View>

        {/* Emergency Dialer Cards */}
        <View style={styles.emergencyList}>
          {EMERGENCY_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.number}
              style={[styles.emergencyCard, { borderLeftColor: item.color }]}
              onPress={() => Linking.openURL(`tel:${item.number}`)}
              activeOpacity={0.85}
            >
              <View style={styles.emergencyLeft}>
                <View style={[styles.emergencyIconWrap, { backgroundColor: item.color }]}>
                  <Ionicons name={item.icon as any} size={22} color={colors.white} />
                </View>
                <View style={styles.emergencyCopy}>
                  <Text style={styles.emergencyTitle}>{item.title}</Text>
                  <Text style={styles.emergencySubtitle}>{item.subtitle}</Text>
                </View>
              </View>

              <View style={styles.callPill}>
                <Ionicons name="call" size={14} color={colors.white} />
                <Text style={styles.callPillText}>CALL</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.incidentCard}>
          <View style={styles.contactHeader}>
            <Ionicons name="pulse-outline" size={18} color={colors.error} />
            <Text style={styles.sectionTitle}>Guided incident session</Text>
          </View>
          <Text style={styles.helper}>Create a local stateful safety session. Zenny never decides emergency actions.</Text>
          {!incident ? <>
            <View style={styles.categoryRow}>{INCIDENT_CATEGORIES.map((category) => <TouchableOpacity key={category.id} style={[styles.categoryChip, incidentCategory === category.id && styles.categoryChipActive]} onPress={() => setIncidentCategory(category.id)}><Text style={incidentCategory === category.id ? styles.categoryTextActive : styles.categoryText}>{category.label}</Text></TouchableOpacity>)}</View>
            {incidentCategory === 'scam' ? <TouchableOpacity style={styles.riskLink} onPress={() => router.push('/risk')}><Text style={styles.riskLinkText}>View sourced scam patterns for this corridor</Text></TouchableOpacity> : null}
            <TouchableOpacity style={styles.incidentPrimary} onPress={startIncident} disabled={incidentBusy}><Text style={styles.incidentPrimaryText}>{incidentBusy ? 'Starting…' : 'Start incident session'}</Text></TouchableOpacity>
          </> : <>
            <View style={styles.statusPill}><Text style={styles.statusPillText}>STATUS · {incident.status.replace('_', ' ').toUpperCase()}</Text></View>
            <Text style={styles.helper}>Category: {incident.category}. Progress is explicit and can be resolved at any time.</Text>
            <View style={styles.incidentActions}>
              {incident.status === 'created' ? <TouchableOpacity style={styles.secondaryAction} onPress={() => runIncidentAction(() => checkInIncident(incident.id))} disabled={incidentBusy}><Text style={styles.secondaryActionText}>Check in safe status</Text></TouchableOpacity> : null}
              {incident.status !== 'resolved' ? <TouchableOpacity style={styles.locationBtn} onPress={shareIncidentLocation} disabled={incidentBusy}><Text style={styles.locationBtnText}>Share current location</Text></TouchableOpacity> : null}
              {incident.status !== 'resolved' ? <TouchableOpacity style={styles.resolveBtn} onPress={() => runIncidentAction(() => resolveIncident(incident.id))} disabled={incidentBusy}><Text style={styles.resolveText}>Resolve session</Text></TouchableOpacity> : null}
            </View>
          </>}
          {incidentError ? <Text style={styles.locationStatusText}>{incidentError}</Text> : null}
        </View>

        {/* Trusted Contact Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Ionicons name="person-add-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Trusted Emergency Contact</Text>
          </View>
          <Text style={styles.helper}>
            Save a phone number to call directly during an incident.
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={16} color={colors.inkMuted} style={styles.inputIcon} />
            <TextInput
              accessibilityLabel="Trusted contact phone number"
              style={styles.input}
              value={trustedContact}
              onChangeText={setTrustedContact}
              keyboardType="phone-pad"
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.inkSubtle}
            />
          </View>
          <TouchableOpacity
            style={[styles.secondaryAction, !trustedContact.trim() && styles.disabled]}
            disabled={!trustedContact.trim()}
            onPress={() => Linking.openURL(`tel:${trustedContact.replace(/[^+\d]/g, '')}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="call-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.secondaryActionText}>Call Trusted Contact</Text>
          </TouchableOpacity>
        </View>

        {/* Location Share Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Ionicons name="navigate-outline" size={18} color={colors.sage} />
            <Text style={styles.sectionTitle}>Share GPS Coordinates</Text>
          </View>
          <Text style={styles.helper}>
            Retrieve exact coordinates from phone hardware to share via SMS/WhatsApp.
          </Text>
          <TouchableOpacity style={styles.locationBtn} onPress={shareLocation} activeOpacity={0.85}>
            <Ionicons name="location-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.locationBtnText}>Get & Open Current Location</Text>
          </TouchableOpacity>
          {locationStatus ? <Text style={styles.locationStatusText}>{locationStatus}</Text> : null}
        </View>

        {/* Live Safety Playbook */}
        <View style={styles.sectionHeaderWrap}>
          <Text style={styles.sectionTitle}>Essential India Travel Protocols</Text>
        </View>

        <View style={styles.tipsList}>
          {SAFETY_TIPS.map((tip) => (
            <View key={tip.title} style={styles.tipCard}>
              <View style={styles.tipIconWrap}>
                <Ionicons name={tip.icon as any} size={18} color={colors.primary} />
              </View>
              <View style={styles.tipBody}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipDesc}>{tip.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Grounding Notice */}
        <View style={styles.groundingBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.inkMuted} />
          <Text style={styles.groundingNote}>
            Per Zentrip Safety Standards: Emergency dialing is directly routed to native phone hardware and operates even with zero mobile data connectivity.
          </Text>
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
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginBottom: 4,
  },
  eyebrow: {
    color: colors.error,
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

  emergencyList: {
    gap: spacing.md,
  },
  emergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    ...shadows.md,
  },
  emergencyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    paddingRight: spacing.sm,
  },
  emergencyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyCopy: {
    flex: 1,
    gap: 2,
  },
  emergencyTitle: {
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
    color: colors.ink,
  },
  emergencySubtitle: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
    lineHeight: 15,
  },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  callPillText: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  contactCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.sm,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
    color: colors.ink,
  },
  helper: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.body,
    color: colors.ink,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: 4,
  },
  secondaryActionText: {
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: 4,
  },
  locationBtnText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  locationStatusText: {
    fontSize: typography.fontSize.micro,
    color: colors.sage,
    fontWeight: '600',
    textAlign: 'center',
  },

  incidentCard: {
    backgroundColor: colors.card,
    borderColor: '#E5B6AA',
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryChip: {
    backgroundColor: colors.cardWarm,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  categoryChipActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  categoryText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  incidentPrimary: {
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  incidentPrimaryText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  riskLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  riskLinkText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.errorBg,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusPillText: {
    color: colors.error,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  incidentActions: {
    gap: spacing.sm,
  },
  resolveBtn: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 11,
  },
  resolveText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  sectionHeaderWrap: {
    marginTop: spacing.xs,
  },
  tipsList: {
    gap: spacing.sm,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  tipIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tipBody: {
    flex: 1,
    gap: 3,
  },
  tipTitle: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  tipDesc: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
    lineHeight: 16,
  },

  groundingBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groundingNote: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    lineHeight: 15,
    flex: 1,
  },
});
