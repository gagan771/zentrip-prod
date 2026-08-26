import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../../lib/theme';
import { getDeviceLocation, type DeviceCoords } from '../../../lib/webview-geolocation';
import Analytics from '../../../lib/analytics';
import { GROCERY_ADAPTERS, type GroceryItem as GroceryListItem } from '../../../lib/grocery-adapters';

/**
 * Ad-hoc grocery hand-off — the traveler persona from
 * 05-india-services-layer-grocery-integration.md ("I need toothpaste and a
 * USB-C charger"), not a meal-plan-derived list. Items are typed in here and
 * handed to whichever quick-commerce provider the traveler picks; each
 * provider button owns its own WebView search-and-add flow (see
 * ../../../lib/grocery-adapters.ts for the provider registry).
 */

type DraftItem = { id: string; name: string };

export default function GroceryServiceScreen() {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [draft, setDraft] = useState('');
  const [deviceCoords, setDeviceCoords] = useState<DeviceCoords | null>(null);

  useEffect(() => {
    getDeviceLocation({ silent: true }).then(setDeviceCoords).catch(() => {});
  }, []);

  const addItem = () => {
    const name = draft.trim();
    if (!name) return;
    setItems((prev) => [...prev, { id: `${Date.now()}`, name }]);
    setDraft('');
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
        <Text style={styles.title}>What do you need?</Text>
        <Text style={styles.subtitle}>Add items, then open one of the quick-commerce apps below to buy them.</Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. toothpaste, USB-C charger"
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addItem} activeOpacity={0.7}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No items yet — add something above.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.providerStrip}>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary },
  inputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.card,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, paddingTop: 24, textAlign: 'center' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemName: { fontSize: 15, color: colors.textPrimary, flex: 1, marginRight: 8 },
  providerStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
