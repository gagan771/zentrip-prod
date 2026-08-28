import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOOKING_BRAND_BY_KEY, brandLogoUri, type BookingHandoff } from '../../lib/booking-catalog';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

export type { BookingHandoff };

/**
 * Ask Android/iOS WebView autofill to offer an incoming one-time code.
 * Provider pages are third-party and use different markup, so this observes
 * dynamically-created inputs instead of relying on one provider selector.
 * It never reads SMS messages or submits the provider form.
 */
const OTP_AUTOFILL_SCRIPT = `
(function () {
  var otpWords = /otp|one[\\s-]*time|verification|verify|security[\\s-]*code|confirmation[\\s-]*code|passcode/i;
  var excludedWords = /cvv|cvc|card|expiry|expiration|routing|account[\\s-]*number/i;

  function markOtpInputs() {
    var inputs = document.querySelectorAll('input');
    inputs.forEach(function (input) {
      var hint = [
        input.name,
        input.id,
        input.placeholder,
        input.getAttribute('aria-label'),
        input.getAttribute('autocomplete'),
        input.getAttribute('type')
      ].filter(Boolean).join(' ');
      var maxLength = Number(input.maxLength || 0);
      var numeric = input.inputMode === 'numeric' || input.type === 'tel' || input.type === 'number';
      var likelyOtp = otpWords.test(hint) ||
        (numeric && maxLength >= 4 && maxLength <= 8 && !excludedWords.test(hint));

      if (!likelyOtp || excludedWords.test(hint)) return;
      input.setAttribute('autocomplete', 'one-time-code');
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('pattern', '[0-9]*');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('spellcheck', 'false');
    });
  }

  markOtpInputs();
  if (window.__zentripOtpObserver) window.__zentripOtpObserver.disconnect();
  window.__zentripOtpObserver = new MutationObserver(markOtpInputs);
  window.__zentripOtpObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
true;
`;

function ProviderMark({ handoffKey, size = 40 }: { handoffKey: string; size?: number }) {
  const brand = BOOKING_BRAND_BY_KEY[handoffKey];
  const [failed, setFailed] = useState(false);
  const initials = brand?.initials ?? handoffKey.slice(0, 2).toUpperCase();
  const color = brand?.color ?? colors.primary;
  const textColor = color === '#F5C518' ? colors.ink : colors.white;

  if (!failed && brand?.domain) {
    return (
      <View style={[styles.logoFrame, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Image
          source={{ uri: brandLogoUri(brand.domain) }}
          style={{ width: size * 0.62, height: size * 0.62 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.logoFrame,
        { width: size, height: size, borderRadius: size * 0.28, backgroundColor: color, borderWidth: 0 },
      ]}
    >
      <Text style={[styles.initials, { color: textColor, fontSize: size > 36 ? 14 : 12 }]}>
        {initials}
      </Text>
    </View>
  );
}

export function BookingHandoffButton({
  handoff,
  compact = false,
  onOpen,
}: {
  handoff: BookingHandoff;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const brand = BOOKING_BRAND_BY_KEY[handoff.key];
  const label = compact ? brand?.shortName ?? handoff.displayName : brand?.shortName ?? handoff.displayName;

  function openModal() {
    onOpen?.();
    setOpen(true);
  }

  return (
    <>
      <Pressable style={styles.tile} onPress={openModal}>
        <ProviderMark handoffKey={handoff.key} size={52} />
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.toolbar}>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
            <View style={styles.toolbarBrand}>
              <ProviderMark handoffKey={handoff.key} size={28} />
              <Text style={styles.toolbarTitle} numberOfLines={1}>
                {handoff.displayName}
              </Text>
            </View>
            <Pressable onPress={() => Linking.openURL(handoff.url)} hitSlop={12}>
              <Ionicons name="open-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {handoff.note || 'Complete booking on the official site. Zentrip never takes payment.'}
            </Text>
          </View>
          <WebView
            source={{ uri: handoff.url }}
            startInLoadingState
            setSupportMultipleWindows={false}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScriptBeforeContentLoaded={OTP_AUTOFILL_SCRIPT}
            injectedJavaScript={OTP_AUTOFILL_SCRIPT}
            style={styles.webview}
          />
        </View>
      </Modal>
    </>
  );
}

export function HandoffStrip({
  title,
  subtitle,
  icon,
  handoffs,
  category,
  categories,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  handoffs: BookingHandoff[];
  category?: string;
  categories?: string[];
  onOpen?: (key: string) => void;
}) {
  const wanted = categories ?? (category ? [category] : null);
  const items = wanted ? handoffs.filter((item) => wanted.includes(item.category)) : handoffs;
  if (!items.length) return null;
  return (
    <View style={styles.strip}>
      <View style={styles.stripHeader}>
        {icon ? (
          <View style={styles.stripIcon}>
            <Ionicons name={icon as any} size={16} color={colors.primary} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.stripTitle}>{title}</Text>
          {subtitle ? <Text style={styles.stripSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.grid}>
        {items.map((item) => (
          <BookingHandoffButton key={item.key} handoff={item} onOpen={() => onOpen?.(item.key)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 76,
    alignItems: 'center',
    gap: 8,
  },
  tileLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  logoFrame: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  initials: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  modal: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 10,
  },
  toolbarBrand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', flex: 1 },
  banner: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: { color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  webview: { flex: 1 },
  strip: {
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.sm,
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stripIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  stripSubtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    marginTop: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
});
