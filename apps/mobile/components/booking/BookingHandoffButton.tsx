import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from '../../lib/theme';

export type BookingHandoff = {
  key: string;
  displayName: string;
  category: string;
  url: string;
  live?: boolean;
  note?: string;
};

const CATEGORY_ICON: Record<string, string> = {
  train: 'train-outline',
  bus: 'bus-outline',
  flight: 'airplane-outline',
  stay: 'bed-outline',
  cab: 'car-outline',
};

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
  const icon = CATEGORY_ICON[handoff.category] ?? 'open-outline';

  function openModal() {
    onOpen?.();
    setOpen(true);
  }

  return (
    <>
      <Pressable style={[styles.chip, compact && styles.chipCompact]} onPress={openModal}>
        <Ionicons name={icon as any} size={14} color={colors.primary} />
        <Text style={styles.chipText}>{handoff.displayName}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.toolbar}>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.toolbarTitle}>{handoff.displayName}</Text>
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
            style={styles.webview}
          />
        </View>
      </Modal>
    </>
  );
}

export function HandoffStrip({
  title,
  handoffs,
  category,
  onOpen,
}: {
  title: string;
  handoffs: BookingHandoff[];
  category?: string;
  onOpen?: (key: string) => void;
}) {
  const items = category ? handoffs.filter((item) => item.category === category) : handoffs;
  if (!items.length) return null;
  return (
    <View style={styles.strip}>
      <Text style={styles.stripTitle}>{title}</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <BookingHandoffButton key={item.key} handoff={item} onOpen={() => onOpen?.(item.key)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  modal: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toolbarTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  banner: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: { color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  webview: { flex: 1 },
  strip: { gap: 8 },
  stripTitle: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
