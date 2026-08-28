import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Analytics from '../../../lib/analytics';
import { GROCERY_ADAPTERS, type GroceryItem as GroceryListItem } from '../../../lib/grocery-adapters';
import { colors, radii, shadows, spacing, typography } from '../../../lib/theme';
import { getDeviceLocation, type DeviceCoords } from '../../../lib/webview-geolocation';

type DraftItem = { id: string; name: string };

const ESSENTIAL_PRESETS = [
  'Packaged mineral water',
  'Odomos mosquito spray',
  'Electral ORS sachets',
  'Universal plug adapter',
  'Sanitizing hand wipes',
  'First aid bandages',
  'Sunscreen SPF 50',
];

export default function GroceryServiceScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ items?: string | string[] }>();
  const [items, setItems] = useState<DraftItem[]>(() => {
    const raw = Array.isArray(params.items) ? params.items[0] : params.items;
    if (!raw) return [];
    return raw
      .split('|')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ id: `${Date.now()}-${name}`, name }));
  });
  const [draft, setDraft] = useState('');
  const [deviceCoords, setDeviceCoords] = useState<DeviceCoords | null>(null);

  useEffect(() => {
    getDeviceLocation({ silent: true }).then(setDeviceCoords).catch(() => {});
  }, []);

  const addItem = (customName?: string) => {
    const name = (customName || draft).trim();
    if (!name) return;
    setItems((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, name }]);
    if (!customName) setDraft('');
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const markBought = (name: string) => {
    setItems((prev) => prev.filter((item) => item.name !== name));
  };

  const groceryList: GroceryListItem[] = items.map((item) => ({
    item_name: item.name,
    quantity: '',
    original_name: item.name,
  }));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          Add what you need, then open Blinkit, Zepto, Instamart, or Flipkart Minutes to finish checkout on their site.
        </Text>
        <View style={styles.coverageTip}>
          <Ionicons name="information-circle-outline" size={14} color={colors.sage} />
          <Text style={styles.coverageTipText}>
            Quick commerce is strongest in Delhi–NCR. In Agra and Jaipur, check each app for coverage before relying on
            10-minute delivery.
          </Text>
        </View>
      </View>

      {/* Input Bar */}
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <Ionicons name="search-outline" size={16} color={colors.inkMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add item (e.g. toothpaste, charger...)"
            placeholderTextColor={colors.inkSubtle}
            onSubmitEditing={() => addItem()}
            returnKeyType="done"
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => addItem()} activeOpacity={0.8}>
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Preset Travel Essentials Horizontal Chips */}
      <View style={styles.presetSection}>
        <Text style={styles.presetTitle}>POPULAR TRAVEL ESSENTIALS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {ESSENTIAL_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={styles.presetChip}
              onPress={() => addItem(preset)}
              activeOpacity={0.8}
            >
              <Text style={styles.presetText}>+ {preset}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Items List */}
      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={36} color={colors.inkSubtle} />
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptySubtitle}>
              Tap any popular essential above or type items to generate your shopping list.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemBullet} />
            <Text style={styles.itemName}>{item.name}</Text>
            <TouchableOpacity
              onPress={() => removeItem(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Provider Handoff Strip */}
      <View style={[styles.providerStrip, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.providerStripHeader}>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
          <Text style={styles.providerStripTitle}>
            {items.length === 0 ? 'ADD ITEMS, THEN OPEN A PLATFORM' : `OPEN A PLATFORM · ${items.length} ITEM${items.length === 1 ? '' : 'S'}`}
          </Text>
        </View>
        <View style={styles.adapterButtonsRow}>
          {GROCERY_ADAPTERS.map(({ key, Component }) => (
            <Component
              key={key}
              initialCoords={deviceCoords ?? undefined}
              groceryList={groceryList}
              onItemAdded={(added) => markBought(added.item_name)}
              onOpen={() => Analytics.grocery.platformOpened(key)}
              onClose={() => Analytics.grocery.exported(key)}
            />
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.caption,
    color: colors.inkMuted,
    lineHeight: 18,
  },
  coverageTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.sageSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  coverageTipText: {
    flex: 1,
    fontSize: typography.fontSize.micro,
    color: colors.sageDark,
    lineHeight: 15,
    fontWeight: '600',
  },

  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  inputWrapper: {
    flex: 1,
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
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.body,
    color: colors.ink,
    height: '100%',
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },

  presetSection: {
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    gap: 6,
  },
  presetTitle: {
    color: colors.inkSubtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  presetRow: {
    gap: spacing.xs,
  },
  presetChip: {
    backgroundColor: colors.cardWarm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },

  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    textAlign: 'center',
    maxWidth: 260,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
    ...shadows.sm,
  },
  itemBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  itemName: {
    fontSize: typography.fontSize.body,
    color: colors.ink,
    fontWeight: '600',
    flex: 1,
  },

  providerStrip: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
    ...shadows.lg,
  },
  providerStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  providerStripTitle: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  adapterButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});

