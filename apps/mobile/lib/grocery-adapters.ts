/**
 * Grocery provider adapter registry.
 *
 * Why this isn't shaped like the REST ServiceProviderAdapter interface
 * (`search()` / `getDetails()` / `getDeepLink()`) described in
 * 03-compare-decision-engine.md and referenced by
 * D:\A16Z\zentrip-feature-specs\05-india-services-layer-grocery-integration.md
 * §3: these four grocery providers (Blinkit, Flipkart Minutes, Zepto, Swiggy
 * Instamart) are not REST-backed catalogs we can query out-of-band. Each one
 * is a WebView automation flow — a human logs into the real e-commerce site
 * inside an embedded browser, taps "Add" on products themselves, and the app
 * only observes cart-add events via injected JS (fetch/XHR interception, GTM
 * dataLayer, or DOM click extraction). There is no server-side "search" that
 * returns structured results independent of rendering that UI, so faking an
 * async `search()`/`getDetails()` that doesn't actually do anything real would
 * be dishonest scaffolding — worse than no interface at all.
 *
 * The equivalent integration point for a UI-driven provider is: "which
 * component renders this provider's flow, given a shared item shape and a
 * shared callback contract." That's what `GroceryProviderAdapter` captures.
 * A caller (this screen today, the Companion later) just needs to iterate
 * `GROCERY_ADAPTERS` and mount `Component` — it doesn't need to know Blinkit's
 * injected JS differs from Zepto's.
 */

import type { ComponentType } from 'react';
import type { ImageSourcePropType } from 'react-native';

import type { DeviceCoords } from './webview-geolocation';
import {
  BigBasketCartButton,
  DMartCartButton,
  FreshToHomeCartButton,
  JioMartCartButton,
  LiciousCartButton,
} from '../components/grocery/GenericGroceryWebViewButton';
import { BlinkitCartButton } from '../components/grocery/BlinkitCartButton';
import { FlipkartCartButton } from '../components/grocery/FlipkartCartButton';
import { ZeptoCartButton } from '../components/grocery/ZeptoCartButton';
import { SwiggyInstamartCartButton } from '../components/grocery/SwiggyInstamartCartButton';

/** Single source of truth for the item shape all four providers accept. */
export interface GroceryItem {
  item_name: string;
  quantity: string;
  original_name?: string;
}

/** Prop shape shared by all four *CartButton components. */
export interface GroceryCartButtonProps {
  groceryList: GroceryItem[];
  onSuccess?: (addedItems: GroceryItem[]) => void | Promise<void>;
  onItemAdded?: (item: GroceryItem) => void;
  autoOpen?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
  style?: any;
  initialCoords?: DeviceCoords;
}

export type GroceryProviderKey =
  | 'blinkit'
  | 'flipkart'
  | 'zepto'
  | 'swiggy_instamart'
  | 'bigbasket'
  | 'dmart'
  | 'jiomart'
  | 'licious'
  | 'freshtohome';

/**
 * The adapter interface for this domain: not "fetch results," but "which
 * component owns this provider's WebView flow, and how is it labeled/badged."
 */
export interface GroceryProviderAdapter {
  key: GroceryProviderKey;
  displayName: string;
  Component: ComponentType<GroceryCartButtonProps>;
  logo?: ImageSourcePropType;
  icon?: string;
}

export const GROCERY_ADAPTERS: GroceryProviderAdapter[] = [
  {
    key: 'blinkit',
    displayName: 'Blinkit',
    Component: BlinkitCartButton,
    logo: require('../assets/grocery/blinkit.jpeg'),
  },
  {
    key: 'flipkart',
    displayName: 'Flipkart Minutes',
    Component: FlipkartCartButton,
    logo: require('../assets/grocery/flipkart.png'),
  },
  {
    key: 'zepto',
    displayName: 'Zepto',
    Component: ZeptoCartButton,
    logo: require('../assets/grocery/zepto.png'),
  },
  {
    key: 'swiggy_instamart',
    displayName: 'Swiggy Instamart',
    Component: SwiggyInstamartCartButton,
    logo: require('../assets/grocery/swiggy-instamart.png'),
  },
  { key: 'bigbasket', displayName: 'BigBasket', Component: BigBasketCartButton },
  { key: 'dmart', displayName: 'DMart Ready', Component: DMartCartButton },
  { key: 'jiomart', displayName: 'JioMart', Component: JioMartCartButton },
  { key: 'licious', displayName: 'Licious', Component: LiciousCartButton },
  { key: 'freshtohome', displayName: 'FreshToHome', Component: FreshToHomeCartButton },
];
