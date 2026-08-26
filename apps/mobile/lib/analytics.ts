/**
 * Minimal analytics stub for the ported grocery cart-button components
 * (see 05-india-services-layer-grocery-integration.md). Zentrip has no
 * analytics SDK wired yet — these just log so call sites don't need special
 * casing. Swap the bodies for real event calls once one is chosen.
 */

export type GroceryProvider = 'blinkit' | 'flipkart' | 'zepto' | 'swiggy_instamart';

const Analytics = {
  grocery: {
    platformOpened: (platform: GroceryProvider) => {
      console.log('[Analytics] grocery.platformOpened', platform);
    },
    exported: (platform: GroceryProvider, itemsCount?: number, uncheckedCount?: number) => {
      console.log('[Analytics] grocery.exported', platform, itemsCount, uncheckedCount);
    },
    platformTimeSpent: (
      platform: GroceryProvider,
      durationSeconds: number,
      itemsAdded: number,
      itemsSkipped: number,
    ) => {
      console.log('[Analytics] grocery.platformTimeSpent', platform, durationSeconds, itemsAdded, itemsSkipped);
    },
  },
};

export default Analytics;
