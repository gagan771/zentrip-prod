import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../../lib/theme';

type GroceryItem = { item_name: string; quantity: string; original_name?: string };
type GroceryCartButtonProps = {
  groceryList: GroceryItem[];
  onSuccess?: (addedItems: GroceryItem[]) => void | Promise<void>;
  onItemAdded?: (item: GroceryItem) => void;
  autoOpen?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
  style?: any;
};

export function GenericGroceryWebViewButton({
  displayName,
  icon = 'cart-outline',
  homeUrl,
  searchUrl,
  groceryList,
  onOpen,
  onClose,
  onItemAdded,
}: GroceryCartButtonProps & {
  displayName: string;
  icon?: string;
  homeUrl: string;
  searchUrl: (query: string) => string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const names = groceryList.map((item) => item.item_name).filter(Boolean);
  const current = names[index];
  const uri = current ? searchUrl(current) : homeUrl;

  function openModal() {
    onOpen?.();
    setIndex(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    onClose?.();
  }

  function markAdded() {
    const item: GroceryItem | undefined = groceryList[index];
    if (item) onItemAdded?.(item);
    if (index < names.length - 1) setIndex((value) => value + 1);
  }

  return (
    <>
      <Pressable style={styles.chip} onPress={openModal}>
        <Ionicons name={icon as any} size={14} color={colors.sage} />
        <Text style={styles.chipText}>{displayName}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.toolbar}>
            <Pressable onPress={close} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.toolbarTitle}>{displayName}</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Search and add items on {displayName}. Checkout stays on their site.
            </Text>
            {names.length ? (
              <Text style={styles.listText}>
                List: {names.join(', ')}
              </Text>
            ) : null}
          </View>
          {names.length ? (
            <View style={styles.actions}>
              <Pressable style={styles.secondary} onPress={() => setIndex((value) => Math.max(0, value - 1))}>
                <Text style={styles.secondaryText}>Prev</Text>
              </Pressable>
              <Text style={styles.current}>{current || 'Home'}</Text>
              <Pressable style={styles.secondary} onPress={markAdded}>
                <Text style={styles.secondaryText}>Added</Text>
              </Pressable>
            </View>
          ) : null}
          <WebView source={{ uri }} startInLoadingState style={styles.webview} sharedCookiesEnabled thirdPartyCookiesEnabled />
        </View>
      </Modal>
    </>
  );
}

function wrap(
  displayName: string,
  homeUrl: string,
  searchUrl: (query: string) => string,
  icon: string,
) {
  return function WrappedGroceryButton(props: GroceryCartButtonProps) {
    return (
      <GenericGroceryWebViewButton
        {...props}
        displayName={displayName}
        homeUrl={homeUrl}
        searchUrl={searchUrl}
        icon={icon}
      />
    );
  };
}

export const BigBasketCartButton = wrap(
  'BigBasket',
  'https://www.bigbasket.com/',
  (query) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
  'leaf-outline',
);
export const DMartCartButton = wrap(
  'DMart Ready',
  'https://www.dmart.in/',
  (query) => `https://www.dmart.in/search?q=${encodeURIComponent(query)}`,
  'storefront-outline',
);
export const JioMartCartButton = wrap(
  'JioMart',
  'https://www.jiomart.com/',
  (query) => `https://www.jiomart.com/search/${encodeURIComponent(query)}`,
  'bag-handle-outline',
);
export const LiciousCartButton = wrap(
  'Licious',
  'https://www.licious.in/',
  (query) => `https://www.licious.in/search?search=${encodeURIComponent(query)}`,
  'pizza-outline',
);
export const FreshToHomeCartButton = wrap(
  'FreshToHome',
  'https://www.freshtohome.com/',
  (query) => `https://www.freshtohome.com/search?q=${encodeURIComponent(query)}`,
  'restaurant-outline',
);

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
  chipText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
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
    backgroundColor: colors.sageSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  bannerText: { color: colors.sageDark, fontSize: 12, lineHeight: 18 },
  listText: { color: colors.sage, fontSize: 11 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  secondary: {
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  secondaryText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  current: { flex: 1, textAlign: 'center', color: colors.ink, fontWeight: '700' },
  webview: { flex: 1 },
});
