import { apiRequest } from './api-client';

/**
 * Session-save calls for the ported grocery cart-button components
 * (see 05-india-services-layer-grocery-integration.md). Mirrors
 * kmkb-mobile-app's utils/api.ts saveXSession functions.
 *
 * The backend persists these hand-off snapshots so a provider flow can be
 * resumed/audited without storing provider credentials or payment details.
 */
export interface GroceryCartItem {
  searched_for: string;
  quantity_needed: string | null;
  picked_name: string | null;
  picked_weight: string | null;
  picked_quantity: string | null;
  picked_price: string | null;
  picked_id: string | null;
  picked_category: string | null;
  picked_mrp: string | null;
  picked_image: string | null;
  picked_currency: string | null;
}

function saveSession(provider: string, items: GroceryCartItem[]): Promise<void> {
  console.log(`[SessionSave] ${provider} — items:`, items.length, JSON.stringify(items));
  return apiRequest<void>(`/v1/grocery/${provider}/sessions`, {
    method: 'POST',
    body: { items },
  });
}

export const saveBlinkitSession = (items: GroceryCartItem[]) => saveSession('blinkit', items);
export const saveFlipkartSession = (items: GroceryCartItem[]) => saveSession('flipkart', items);
export const saveZeptoSession = (items: GroceryCartItem[]) => saveSession('zepto', items);
export const saveSwiggyInstamartSession = (items: GroceryCartItem[]) => saveSession('swiggy-instamart', items);
