/**
 * SwiggyInstamartCartButton
 *
 * Flow (same as DMart / Flipkart):
 *  1. Modal opens → swiggy.com/instamart loads
 *  2. User logs in, then taps Start
 *  3. For each item:
 *       a) App navigates to swiggy.com/instamart/search?custom_back=true&query=<item>
 *       b) User taps the "Add" button manually
 *       c) Add is detected → app moves to next item
 *  4. Skip button lets user skip an item
 *  5. Tapping a pill navigates to that item
 *
 * Cart detection (5 layers):
 *  Layer 1 — Fetch intercept: POST/PUT/PATCH to Swiggy cart API endpoints
 *  Layer 2 — XHR intercept: same URL patterns
 *  Layer 3 — GTM dataLayer: add_to_cart / addtocart events
 *  Layer 4 — Mixpanel intercept: Swiggy's primary analytics SDK
 *  Layer 5 — localStorage: cart key writes
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ActivityIndicator, Image,
    Alert, Modal, StyleSheet, ScrollView, Keyboard, Platform, Animated, Linking,
} from 'react-native';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets, SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import Analytics from '../../lib/analytics';
import { saveSwiggyInstamartSession } from '../../lib/grocery-api';
import { getDeviceLocation, buildGeolocationPolyfill, DeviceCoords } from '../../lib/webview-geolocation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SwiggyInstamartGroceryItem {
    item_name: string;
    quantity: string;
    original_name?: string;
}

type ItemStatus = 'pending' | 'searching' | 'waiting' | 'added' | 'skipped';

interface PickedItemData {
    picked_name:     string | null;
    picked_weight:   string | null;
    picked_category: string | null;
    picked_mrp:      string | null;
    picked_image:    string | null;
    picked_quantity: string | null;
    picked_price:    string | null;
    picked_id:       string | null;
    picked_currency: string | null;
}

interface ItemResult {
    item:   SwiggyInstamartGroceryItem;
    status: ItemStatus;
    picked: PickedItemData | null;
}

interface SwiggyInstamartCartButtonProps {
    groceryList: SwiggyInstamartGroceryItem[];
    onSuccess?: (addedItems: SwiggyInstamartGroceryItem[]) => void | Promise<void>;
    onItemAdded?: (item: SwiggyInstamartGroceryItem) => void;
    autoOpen?: boolean;
    onClose?: () => void;
    onOpen?: () => void;
    style?: any;
    initialCoords?: DeviceCoords;
}

// ─── Injected JS ──────────────────────────────────────────────────────────────

const INJECTED_JS = `
(function () {
  if (window.__siReady) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'injected_ready' })); } catch(e) {}
    return;
  }
  window.__siReady = true;

  if (!window.__siCache) window.__siCache = {};

  var rn = function(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch(e) {}
  };

  // ── Product cache ─────────────────────────────────────────────────────────
  function walkAndCache(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 8) return;
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) walkAndCache(obj[i], depth+1); return; }
    var pid = obj.product_id || obj.productId || obj.id || obj.item_id || obj.variantId || obj.variant_id || obj.catalogId || obj.catalog_id;
    if (pid && (obj.name || obj.product_name || obj.display_name || obj.displayName || obj.title)) {
      window.__siCache[String(pid)] = {
        name:     obj.name || obj.product_name || obj.display_name || obj.displayName || obj.title || null,
        weight:   obj.unit || obj.weight || obj.pack_size || obj.quantity_unit || obj.unit_quantity || null,
        price:    obj.price != null ? obj.price : (obj.discounted_price != null ? obj.discounted_price : (obj.offer_price != null ? obj.offer_price : null)),
        mrp:      obj.mrp != null ? obj.mrp : (obj.total_price != null ? obj.total_price : null),
        image:    obj.image || obj.image_url || obj.imageUrl || obj.thumbnail || null,
        category: obj.category || obj.category_name || obj.categoryName || obj.super_category || null,
      };
    }
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) walkAndCache(obj[keys[k]], depth+1);
  }

  // ── Debounce ──────────────────────────────────────────────────────────────
  var _lastConfirmedAt = 0;

  function safeConfirm(productId, info) {
    var now = Date.now();
    if (now - _lastConfirmedAt < 1500) return;
    _lastConfirmedAt = now;
    var cached = productId ? (window.__siCache[String(productId)] || null) : null;
    rn({
      type:            'cart_confirmed',
      picked_name:     (cached && cached.name)     || null,
      picked_weight:   (cached && cached.weight)   || null,
      picked_category: (cached && cached.category) || null,
      picked_mrp:      (cached && cached.mrp != null ? String(cached.mrp) : null),
      picked_image:    (cached && cached.image)    || null,
      picked_quantity: info && info.quantity != null ? String(info.quantity) : null,
      picked_price:    info && info.price != null ? String(info.price) : (cached && cached.price != null ? String(cached.price) : null),
      picked_id:       productId != null ? String(productId) : null,
      picked_currency: 'INR',
    });
  }

  // ── LAYER 1: Fetch intercept ──────────────────────────────────────────────
  var _origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    var url     = (typeof input === 'string' ? input : (input && input.url)) || '';
    var method  = ((init && init.method) || 'GET').toUpperCase();
    var rawBody = (init && typeof init.body === 'string') ? init.body : '';

    var response = await _origFetch(input, init);

    var isCartMutation = (method === 'POST' || method === 'PUT' || method === 'PATCH') && response.ok && (
      url.indexOf('/cart')         !== -1 ||
      url.indexOf('add-to-cart')   !== -1 ||
      url.indexOf('addtocart')     !== -1 ||
      url.indexOf('add_to_cart')   !== -1 ||
      url.indexOf('v4.1/cart')     !== -1 ||
      url.indexOf('instamart/cart') !== -1
    );
    if (!isCartMutation) return response;

    response.clone().json().then(function(data) {
      walkAndCache(data, 0);
      var reqPid = null, reqQty = null;
      try {
        var reqObj = JSON.parse(rawBody);
        var prods  = reqObj.items || reqObj.products || reqObj.cartItems || (Array.isArray(reqObj) ? reqObj : []);
        if (Array.isArray(prods) && prods.length > 0) {
          reqPid = prods[0].product_id || prods[0].productId || prods[0].id || prods[0].catalog_id || null;
          reqQty = prods[0].quantity   || prods[0].qty                                               || null;
        } else {
          reqPid = reqObj.product_id || reqObj.productId || reqObj.id || reqObj.catalog_id || null;
          reqQty = reqObj.quantity   || reqObj.qty                                          || null;
        }
      } catch(e) {}
      safeConfirm(reqPid, { quantity: reqQty, price: null, currency: 'INR' });
    }).catch(function() {});

    return response;
  };

  // ── LAYER 2: XHR intercept ────────────────────────────────────────────────
  var _origXHROpen = XMLHttpRequest.prototype.open;
  var _origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._siMethod = method ? method.toUpperCase() : 'GET';
    this._siUrl    = url ? String(url) : '';
    return _origXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    var url    = this._siUrl    || '';
    var method = this._siMethod || 'GET';
    var rawBody = (body && typeof body === 'string') ? body : '';
    var isCartMutation = (method === 'POST' || method === 'PUT' || method === 'PATCH') && (
      url.indexOf('/cart')          !== -1 ||
      url.indexOf('add-to-cart')    !== -1 ||
      url.indexOf('addtocart')      !== -1 ||
      url.indexOf('instamart/cart') !== -1
    );

    if (isCartMutation) {
      var self = this;
      var origOnLoad = this.onload;
      this.onload = function(e) {
        try {
          var data = JSON.parse(self.responseText);
          walkAndCache(data, 0);
          var reqPid = null, reqQty = null;
          try {
            var reqObj = JSON.parse(rawBody);
            var prods  = reqObj.items || reqObj.products || reqObj.cartItems || [];
            if (Array.isArray(prods) && prods.length > 0) {
              reqPid = prods[0].product_id || prods[0].productId || prods[0].id || prods[0].catalog_id || null;
              reqQty = prods[0].quantity   || prods[0].qty                                               || null;
            } else {
              reqPid = reqObj.product_id || reqObj.productId || reqObj.id || reqObj.catalog_id || null;
              reqQty = reqObj.quantity   || reqObj.qty                                          || null;
            }
          } catch(e2) {}
          safeConfirm(reqPid, { quantity: reqQty, price: null, currency: 'INR' });
        } catch(e) {}
        if (origOnLoad) origOnLoad.call(self, e);
      };
    }

    return _origXHRSend.apply(this, arguments);
  };

  // ── LAYER 3: GTM dataLayer ────────────────────────────────────────────────
  function interceptDataLayer() {
    if (!window.dataLayer || window.dataLayer.__siIntercepted) return;
    var _origPush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = function(obj) {
      try {
        var evt = (obj && (obj.event || obj.event_name || '')).toLowerCase().replace(/[^a-z]/g, '_');
        if (evt === 'add_to_cart' || evt === 'addtocart' || evt === 'add_item' || evt === 'added_to_cart') {
          var ec    = obj.ecommerce || {};
          var items = ec.items || (ec.add && ec.add.products) || [];
          if (Array.isArray(items) && items.length > 0) {
            var item = items[0];
            safeConfirm(
              String(item.item_id || item.id || item.product_id || item.catalog_id || ''),
              { quantity: item.quantity || item.qty || null, price: item.price || null, currency: 'INR' }
            );
          }
        }
      } catch(e) {}
      return _origPush(obj);
    };
    window.dataLayer.__siIntercepted = true;
  }

  if (window.dataLayer) { interceptDataLayer(); }
  else {
    var _dlTimer = setInterval(function() {
      if (window.dataLayer && !window.dataLayer.__siIntercepted) { interceptDataLayer(); clearInterval(_dlTimer); }
    }, 200);
    setTimeout(function() { clearInterval(_dlTimer); }, 30000);
  }

  // ── LAYER 4: Mixpanel intercept (Swiggy's analytics SDK) ─────────────────
  function interceptMixpanel() {
    if (!window.mixpanel || window.mixpanel.__siIntercepted) return;
    var mp = window.mixpanel;
    if (typeof mp.track !== 'function') return;
    var _origTrack = mp.track.bind(mp);
    mp.track = function(eventName, props) {
      try {
        var evt = (eventName || '').toLowerCase().replace(/[\s-]/g, '_');
        if (evt === 'add_to_cart' || evt === 'added_to_cart' || evt === 'addtocart' ||
            evt.indexOf('add_to_cart') !== -1) {
          var pid   = (props && (props.product_id || props.productId || props.catalog_id || props.id)) || null;
          var price = (props && (props.price || props.selling_price || props.offer_price)) || null;
          if (pid) {
            window.__siCache[String(pid)] = {
              name:     (props && (props.product_name || props.name || props.display_name)) || null,
              weight:   (props && (props.pack_size    || props.unit || props.unit_quantity)) || null,
              price:    price,
              mrp:      (props && (props.mrp || props.total_price)) || null,
              image:    null,
              category: (props && (props.category || props.category_name || props.super_category)) || null,
            };
          }
          safeConfirm(pid, { quantity: props && props.quantity, price: price, currency: 'INR' });
        }
      } catch(e) {}
      return _origTrack(eventName, props);
    };
    mp.__siIntercepted = true;
  }

  if (window.mixpanel) { interceptMixpanel(); }
  else {
    var _mpTimer = setInterval(function() {
      if (window.mixpanel && !window.mixpanel.__siIntercepted) { interceptMixpanel(); clearInterval(_mpTimer); }
    }, 150);
    setTimeout(function() { clearInterval(_mpTimer); }, 30000);
  }

  // ── LAYER 5: localStorage cart writes ─────────────────────────────────────
  var _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (key.indexOf('cart') !== -1 || key.indexOf('Cart') !== -1 || key.indexOf('CART') !== -1) {
      try {
        var data  = JSON.parse(value);
        var items = (data && (data.items || data.cartItems || (data.cart && data.cart.items))) || [];
        if (Array.isArray(items) && items.length > 0) {
          var last = items[items.length - 1];
          safeConfirm(
            last.product_id || last.productId || last.catalog_id || last.id || null,
            { quantity: last.quantity || last.qty, price: null, currency: 'INR' }
          );
        }
      } catch(e) {}
    }
    return _origSetItem.apply(this, arguments);
  };

  // ── No-ops kept for API compatibility ────────────────────────────────────
  window.__siStartCartWatch = function() { _lastConfirmedAt = 0; };
  window.__siStopCartWatch  = function() {};

  // ── Search: navigate directly to Instamart search URL ────────────────────
  window.__siRunCommand = function(jsonStr) {
    var cmd;
    try { cmd = JSON.parse(jsonStr); } catch(e) { return; }
    if (cmd.action === 'search') {
      window.__siReady = false;
      window.location.href = 'https://www.swiggy.com/instamart/search?custom_back=true&query=' + encodeURIComponent(cmd.query);
    }
  };

  rn({ type: 'injected_ready' });
})();
true;
`;

// ─── Component ────────────────────────────────────────────────────────────────

const SI_BASE_URL  = 'https://www.swiggy.com/instamart';
const SI_CART_URL  = 'https://www.swiggy.com/instamart/cart';
const SI_ORANGE    = '#FC8019';
const PILL_WIDTH   = 120 + 6;

export function SwiggyInstamartCartButton({
    groceryList, onSuccess, onItemAdded, autoOpen, onClose, onOpen, style, initialCoords,
}: SwiggyInstamartCartButtonProps) {

    const insets = useSafeAreaInsets();
    const [showModal, setShowModal]             = useState(false);
    const [webviewKey, setWebviewKey]           = useState(0);
    const [phase, setPhase]                     = useState<'browse' | 'processing'>('browse');
    const [results, setResults]                 = useState<ItemResult[]>([]);
    const [currentIdx, setCurrentIdx]           = useState(0);
    const [needsResume, setNeedsResume]         = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const webViewRef        = useRef<WebView>(null);
    const deviceCoordsRef   = useRef<DeviceCoords | null>(initialCoords ?? null);
    const pillsScrollRef    = useRef<ScrollView>(null);
    const resultsRef        = useRef<ItemResult[]>([]);
    const isProcessing      = useRef(false);
    const modalOpenTimeRef  = useRef<number>(0);
    const cartResolver      = useRef<((added: boolean) => void) | null>(null);
    const pendingPickedRef  = useRef<PickedItemData | null>(null);
    const jsReadyRef        = useRef(false);
    const jsReadyWaiters    = useRef<Array<() => void>>([]);
    const generationRef     = useRef(0);
    const currentIdxRef     = useRef(0);
    const groceryListRef    = useRef(groceryList);
    const lastSearchUrlRef  = useRef<string | null>(null);
    const needsResumeRef    = useRef(false);

    useEffect(() => { groceryListRef.current = groceryList; }, [groceryList]);

    useEffect(() => {
        if (autoOpen && groceryList.length > 0) {
            setPhase('browse'); setResults([]);
            isProcessing.current = false; jsReadyRef.current = false;
            jsReadyWaiters.current = []; generationRef.current = 0;
            setShowModal(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen]);

    useEffect(() => {
        if (phase === 'processing' && pillsScrollRef.current) {
            pillsScrollRef.current.scrollTo({ x: Math.max(0, currentIdx * PILL_WIDTH - PILL_WIDTH), animated: true });
        }
    }, [currentIdx, phase]);

    useEffect(() => {
        const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const s = Keyboard.addListener(show, () => setKeyboardVisible(true));
        const h = Keyboard.addListener(hide, () => setKeyboardVisible(false));
        return () => { s.remove(); h.remove(); };
    }, []);

    const send = useCallback((cmd: { action: string; query?: string }) => {
        webViewRef.current?.injectJavaScript(
            `window.ReactNativeWebView.postMessage(JSON.stringify({type:'current_url',url:window.location.href})); true;`
        );
        if (cmd.action === 'search' && cmd.query) {
            const encoded = encodeURIComponent(cmd.query);
            webViewRef.current?.injectJavaScript(
                `window.location.href = 'https://www.swiggy.com/instamart/search?custom_back=true&query=${encoded}'; true;`
            );
        }
    }, []);

    const updateResult = useCallback((idx: number, status: ItemStatus) => {
        resultsRef.current = resultsRef.current.map((r, i) => i === idx ? { ...r, status } : r);
        setResults([...resultsRef.current]);
    }, []);

    const handleWebViewLoadEnd = useCallback(() => {
        webViewRef.current?.injectJavaScript(INJECTED_JS);
        // DOM dump + ADD button click detection (same approach as Zepto)
        webViewRef.current?.injectJavaScript(`(function() {
            if (window.__siDomObserverActive) return;
            window.__siDomObserverActive = true;

            // Dump button-like elements for debugging
            setTimeout(function() {
                try {
                    var els = document.querySelectorAll('button, [role="button"]');
                    var out = [];
                    for (var i = 0; i < Math.min(els.length, 30); i++) {
                        var el = els[i];
                        var t = (el.textContent || '').trim().substring(0, 40);
                        if (!t) continue;
                        out.push(el.tagName + '|' + t + '|cls:' + (el.className || '').toString().substring(0, 60));
                    }
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dom_dump', items: out }));
                } catch(e) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dom_dump', error: e.message }));
                }
            }, 3000);

            // Patch ADD buttons and watch for new ones via MutationObserver
            function patchBtns() {
                var btns = document.querySelectorAll('button, [role="button"]');
                for (var i = 0; i < btns.length; i++) {
                    var b = btns[i];
                    if (b.__siP) continue;
                    var txt = (b.textContent || '').trim();
                    if (/^ADD$/i.test(txt) || /^add\\s*to\\s*cart$/i.test(txt)) {
                        b.__siP = true;
                        b.addEventListener('click', function() {
                            var self = this;
                            setTimeout(function() {
                                try {
                                    var t = (self.textContent || '').trim();
                                    if (!/^ADD$/i.test(t)) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'cart_confirmed',
                                            picked_name: null, picked_weight: null,
                                            picked_category: null, picked_mrp: null,
                                            picked_image: null, picked_quantity: /^\\d+$/.test(t) ? t : '1',
                                            picked_price: null, picked_id: null,
                                            picked_currency: 'INR'
                                        }));
                                    }
                                } catch(e) {}
                            }, 800);
                        }, true);
                    }
                }
            }

            patchBtns();
            new MutationObserver(function() { patchBtns(); })
                .observe(document.body, { childList: true, subtree: true });
        })(); true;`);
        if (insets.bottom > 0) {
            webViewRef.current?.injectJavaScript(`
(function() {
  var el = document.getElementById('__si_safe_area_style');
  if (el) return;
  var s = document.createElement('style');
  s.id = '__si_safe_area_style';
  s.textContent = 'body { padding-bottom: ${insets.bottom}px !important; }';
  document.head.appendChild(s);
})(); true;`);
        }
        if (deviceCoordsRef.current) {
            webViewRef.current?.injectJavaScript(buildGeolocationPolyfill(deviceCoordsRef.current));
        } else {
            getDeviceLocation({ silent: true }).then(coords => {
                if (coords) {
                    deviceCoordsRef.current = coords;
                    webViewRef.current?.injectJavaScript(buildGeolocationPolyfill(coords));
                }
            });
        }
    }, [insets.bottom]);

    const handleNavigationChange = useCallback((navState: { url?: string }) => {
        if (__DEV__) console.log('[Instamart] navChange:', navState.url, 'processing:', isProcessing.current);
        if (!isProcessing.current) return;
        const url = navState.url || '';
        const status = resultsRef.current[currentIdxRef.current]?.status;
        if (__DEV__) console.log('[Instamart] navChange status:', status, 'idx:', currentIdxRef.current);

        if (status === 'searching') {
            if (url) lastSearchUrlRef.current = url;
            return;
        }

        if (status !== 'waiting' || !cartResolver.current) return;
        const lastUrl = lastSearchUrlRef.current;
        if (lastUrl && url !== lastUrl) {
            const getPath = (u: string) => { const m = u.match(/^https?:\/\/[^/?#]+(\/[^?#]*)/); return m ? m[1] : '/'; };
            if (getPath(lastUrl) === getPath(url)) {
                lastSearchUrlRef.current = url;
                return;
            }
            lastSearchUrlRef.current = null;
            needsResumeRef.current = true;
            setNeedsResume(true);
            webViewRef.current?.injectJavaScript(`window.__siStopCartWatch && window.__siStopCartWatch(); true;`);
        }
    }, []);

    const onMessage = useCallback((e: WebViewMessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }

        if (msg.type === 'dom_dump') {
            if (__DEV__) {
                if (msg.error) { console.log('[Instamart] DOM DUMP ERROR:', msg.error); return; }
                console.log('[Instamart] DOM DUMP:', (msg.items || []).length, 'elements');
                (msg.items || []).forEach((item: string) => console.log('[Instamart] EL:', item));
            }
            return;
        }
        if (__DEV__) console.log('[Instamart] onMessage:', msg.type);
        switch (msg.type) {
            case 'current_url':
                lastSearchUrlRef.current = msg.url || null;
                break;

            case 'injected_ready':
                jsReadyRef.current = true;
                jsReadyWaiters.current.forEach(fn => fn());
                jsReadyWaiters.current = [];
                if (isProcessing.current) {
                    const idx = currentIdxRef.current;
                    const status = resultsRef.current[idx]?.status;
                    if (status === 'waiting' && cartResolver.current) {
                        setNeedsResume(true);
                    }
                }
                break;

            case 'cart_confirmed': {
                console.log('[SwiggyInstamart] cart_confirmed payload:', JSON.stringify(msg));
                if (needsResumeRef.current) return;
                needsResumeRef.current = false;
                setNeedsResume(false);
                const picked: PickedItemData = {
                    picked_name:     msg.picked_name     ?? null,
                    picked_weight:   msg.picked_weight   ?? null,
                    picked_category: msg.picked_category ?? null,
                    picked_mrp:      msg.picked_mrp      ?? null,
                    picked_image:    msg.picked_image    ?? null,
                    picked_quantity: msg.picked_quantity ?? null,
                    picked_price:    msg.picked_price    ?? null,
                    picked_id:       msg.picked_id       ?? null,
                    picked_currency: msg.picked_currency ?? 'INR',
                };
                const idx = resultsRef.current.findIndex(r => r.status === 'waiting' || r.status === 'searching');
                if (idx !== -1) {
                    resultsRef.current = resultsRef.current.map((r, i) => i === idx ? { ...r, picked } : r);
                    setResults([...resultsRef.current]);
                }
                if (cartResolver.current) {
                    cartResolver.current(true); cartResolver.current = null;
                } else {
                    pendingPickedRef.current = picked;
                }
                break;
            }
        }
    }, []);

    const processItem = useCallback(async (idx: number, gen: number) => {
        if (gen !== generationRef.current) return;
        const list = resultsRef.current;

        if (idx >= list.length) {
            isProcessing.current = false;
            const addedResults = list.filter(r => r.status === 'added');
            if (addedResults.length > 0) {
                saveSwiggyInstamartSession(addedResults.map(r => ({
                    searched_for:    r.item.item_name,
                    quantity_needed: r.item.quantity      ?? null,
                    picked_name:     r.picked?.picked_name     ?? null,
                    picked_weight:   r.picked?.picked_weight   ?? null,
                    picked_quantity: r.picked?.picked_quantity ?? null,
                    picked_price:    r.picked?.picked_price    ?? null,
                    picked_id:       r.picked?.picked_id       ?? null,
                    picked_category: (r.picked as any)?.picked_category ?? null,
                    picked_mrp:      (r.picked as any)?.picked_mrp      ?? null,
                    picked_image:    (r.picked as any)?.picked_image    ?? null,
                    picked_currency: (r.picked as any)?.picked_currency ?? null,
                }))).catch(() => {});
            }
            const added = addedResults.map(r => r.item);
            if (onSuccess && added.length > 0) await onSuccess(added);
            setPhase('browse');
            webViewRef.current?.injectJavaScript(`window.location.href = '${SI_CART_URL}'; true;`);
            return;
        }

        const item = list[idx].item;
        setCurrentIdx(idx); currentIdxRef.current = idx;
        pendingPickedRef.current = null;
        lastSearchUrlRef.current = null;
        updateResult(idx, 'searching');
        send({ action: 'search', query: item.item_name.replace(/\s*\(.*?\)/g, '').trim() });

        await new Promise(r => setTimeout(r, 2000));
        if (gen !== generationRef.current) return;

        updateResult(idx, 'waiting');
        webViewRef.current?.injectJavaScript(`window.__siStartCartWatch && window.__siStartCartWatch(); true;`);

        if (pendingPickedRef.current) {
            webViewRef.current?.injectJavaScript(`window.__siStopCartWatch && window.__siStopCartWatch(); true;`);
            const pending = pendingPickedRef.current; pendingPickedRef.current = null;
            resultsRef.current = resultsRef.current.map((r, i) => i === idx ? { ...r, picked: pending } : r);
            setResults([...resultsRef.current]);
            updateResult(idx, 'added'); onItemAdded?.(item);
            await new Promise(r => setTimeout(r, 400));
            if (gen !== generationRef.current) return;
            processItem(idx + 1, gen); return;
        }

        const wasAdded = await new Promise<boolean>((resolve) => { cartResolver.current = resolve; });
        webViewRef.current?.injectJavaScript(`window.__siStopCartWatch && window.__siStopCartWatch(); true;`);
        if (gen !== generationRef.current) return;

        if (wasAdded) { updateResult(idx, 'added'); onItemAdded?.(item); }
        await new Promise(r => setTimeout(r, 400));
        if (gen !== generationRef.current) return;
        processItem(idx + 1, gen);
    }, [send, updateResult, onSuccess, onItemAdded]);

    const handleSkip = useCallback(() => {
        if (!cartResolver.current) return;
        updateResult(currentIdxRef.current, 'skipped');
        const resolve = cartResolver.current; cartResolver.current = null; resolve(false);
    }, [updateResult]);

    const handleResume = useCallback(() => {
        needsResumeRef.current = false;
        setNeedsResume(false); lastSearchUrlRef.current = null;
        const idx = currentIdxRef.current, gen = ++generationRef.current;
        if (cartResolver.current) cartResolver.current = null;
        resultsRef.current = resultsRef.current.map((r, i) =>
            i === idx ? { ...r, status: 'pending' as ItemStatus, picked: null } : r
        );
        setResults([...resultsRef.current]);
        processItem(idx, gen);
    }, [processItem]);

    const handleJumpToItem = useCallback((targetIdx: number) => {
        if (!isProcessing.current || targetIdx === currentIdxRef.current) return;
        const gen = ++generationRef.current;
        if (cartResolver.current) cartResolver.current = null;
        resultsRef.current = resultsRef.current.map((r, i) =>
            i === targetIdx ? { ...r, status: 'pending' as ItemStatus, picked: null } : r
        );
        setResults([...resultsRef.current]);
        setCurrentIdx(targetIdx); currentIdxRef.current = targetIdx;
        processItem(targetIdx, gen);
    }, [processItem]);

    const handleStart = useCallback(() => {
        if (groceryList.length === 0) return;
        const initial: ItemResult[] = groceryList.map(item => ({ item, status: 'pending', picked: null }));
        resultsRef.current = initial; isProcessing.current = true;
        generationRef.current++; setResults(initial);
        setCurrentIdx(0); currentIdxRef.current = 0; setPhase('processing');
        const gen = generationRef.current;
        const go = () => processItem(0, gen);
        jsReadyRef.current ? go() : jsReadyWaiters.current.push(go);
    }, [groceryList, processItem]);

    const handleOpenModal = async () => {
        if (groceryList.length === 0) { Alert.alert('No items', 'Grocery list is empty'); return; }
        setPhase('browse'); setResults([]);
        needsResumeRef.current = false; setNeedsResume(false);
        isProcessing.current = false; jsReadyRef.current = false;
        jsReadyWaiters.current = []; generationRef.current = 0;
        setWebviewKey(k => k + 1);
        modalOpenTimeRef.current = Date.now();
        setShowModal(true);
        const coords = await getDeviceLocation({ silent: true });
        deviceCoordsRef.current = coords ?? initialCoords ?? null;
    };

    const handleClose = () => {
        if (modalOpenTimeRef.current > 0) {
            const duration = Math.round((Date.now() - modalOpenTimeRef.current) / 1000);
            const added = resultsRef.current.filter(r => r.status === 'added').length;
            const skipped = resultsRef.current.filter(r => r.status === 'skipped').length;
            Analytics.grocery.platformTimeSpent('swiggy_instamart', duration, added, skipped);
            modalOpenTimeRef.current = 0;
        }
        // Save session on close — user may close before all items finish
        const addedResults = resultsRef.current.filter(r => r.status === 'added');
        if (addedResults.length > 0) {
            console.log('[SwiggyInstamart] handleClose — saving', addedResults.length, 'items');
            saveSwiggyInstamartSession(addedResults.map(r => ({
                searched_for:    r.item.item_name,
                quantity_needed: r.item.quantity      ?? null,
                picked_name:     r.picked?.picked_name     ?? null,
                picked_weight:   r.picked?.picked_weight   ?? null,
                picked_quantity: r.picked?.picked_quantity ?? null,
                picked_price:    r.picked?.picked_price    ?? null,
                picked_id:       r.picked?.picked_id       ?? null,
                picked_category: (r.picked as any)?.picked_category ?? null,
                picked_mrp:      (r.picked as any)?.picked_mrp      ?? null,
                picked_image:    (r.picked as any)?.picked_image    ?? null,
                picked_currency: (r.picked as any)?.picked_currency ?? null,
            }))).catch((err) => console.warn('[SwiggyInstamart] session save failed:', err));
        }
        cartResolver.current = null; pendingPickedRef.current = null;
        isProcessing.current = false; generationRef.current++;
        setShowModal(false); onClose?.();
    };

    const currentItem = results[currentIdx]?.item ?? groceryList[currentIdx];

    // ── Pulse animation ───────────────────────────────────────────────────────
    const pulseAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
                Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);
    const animatedBorder = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.border, colors.primary],
    });

    return (
        <>
            {!autoOpen && (
                <AnimatedTouchable
                    style={[styles.shopButton, { borderColor: animatedBorder }, style]}
                    onPress={handleOpenModal}
                    activeOpacity={0.7}
                    disabled={groceryList.length === 0}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                    <View pointerEvents="none" style={styles.shopButtonInner}>
                        <Image source={require('../../assets/grocery/swiggy-instamart.png')} style={styles.shopLogo} />
                        <View>
                            <Text style={styles.shopBrand}>Swiggy</Text>
                            <Text style={styles.shopCta}>Instamart</Text>
                        </View>
                    </View>
                </AnimatedTouchable>
            )}

            <Modal visible={showModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
              <SafeAreaProvider>
                <SafeAreaView style={styles.container} edges={['top']}>

                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>
                                {phase === 'browse' ? 'Swiggy Instamart'
                               : `Item ${currentIdx + 1} of ${results.length || groceryList.length}`}
                            </Text>
                            {phase === 'browse' && !keyboardVisible && (
                                <Text style={styles.headerSub}>Login if needed, then tap Start</Text>
                            )}
                        </View>
                        {phase === 'browse' && (
                            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.7}>
                                <Ionicons name="play" size={16} color="#fff" style={{ marginRight: 6 }} />
                                <Text style={styles.startBtnText}>START ({groceryList.length})</Text>
                            </TouchableOpacity>
                        )}
                        {phase === 'processing' && needsResume && (
                            <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.7}>
                                <Ionicons name="play" size={16} color="#fff" style={{ marginRight: 6 }} />
                                <Text style={styles.resumeBtnText}>CONTINUE</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {phase === 'processing' && !needsResume && currentItem && (
                        <View style={styles.currentItemBar}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.currentItemLabel}>Now adding:</Text>
                                <Text style={styles.currentItemName}>{currentItem.item_name}</Text>
                                <Text style={styles.currentItemQty}>{currentItem.quantity}</Text>
                            </View>
                            <View style={styles.currentItemRight}>
                                {results[currentIdx]?.status === 'waiting' ? (
                                    <>
                                        <Text style={styles.tapHint}>Tap Add below ↓</Text>
                                        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
                                            <Ionicons name="play-skip-forward" size={16} color="#fff" style={{ marginRight: 4 }} />
                                            <Text style={styles.skipBtnText}>SKIP</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <ActivityIndicator size="small" color={SI_ORANGE} />
                                )}
                            </View>
                        </View>
                    )}

                    {phase === 'processing' && !keyboardVisible && results.length > 0 && (
                        <ScrollView ref={pillsScrollRef} horizontal showsHorizontalScrollIndicator={false}
                            style={styles.pillsRow} contentContainerStyle={styles.pillsContent}
                            keyboardShouldPersistTaps="handled">
                            {results.map((r, i) => (
                                <TouchableOpacity key={i} onPress={() => handleJumpToItem(i)} activeOpacity={0.7}
                                    style={[styles.pill, i === currentIdx && styles.pillActive,
                                        r.status === 'added' && styles.pillAdded,
                                        r.status === 'skipped' && styles.pillSkipped]}>
                                    <View style={styles.pillInner} pointerEvents="none">
                                        <View style={styles.pillIconWrap}>
                                            {r.status === 'added'   && <Ionicons name="checkmark-circle" size={12} color="#16A34A" />}
                                            {r.status === 'skipped' && <Ionicons name="remove-circle"    size={12} color={colors.slate400} />}
                                            {i === currentIdx && r.status !== 'added' && r.status !== 'skipped' && (
                                                <View style={styles.pillActiveDot} />
                                            )}
                                        </View>
                                        <Text style={[styles.pillText, i === currentIdx && styles.pillTextActive,
                                            r.status === 'added' && styles.pillTextAdded,
                                            r.status === 'skipped' && styles.pillTextSkipped]}
                                            numberOfLines={1}>{r.item.item_name}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    <View style={[styles.webViewWrap,
                        { marginBottom: -insets.bottom, paddingBottom: insets.bottom }]}>
                        <WebView key={webviewKey} ref={webViewRef} source={{ uri: SI_BASE_URL }}
                            injectedJavaScript={INJECTED_JS}
                            onMessage={onMessage} onLoadEnd={handleWebViewLoadEnd}
                            onNavigationStateChange={handleNavigationChange}
                            javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled
                            sharedCookiesEnabled geolocationEnabled
                            setSupportMultipleWindows={false}
                            originWhitelist={['*']}
                            style={{ flex: 1 }}
                            userAgent={Platform.OS === 'ios'
                                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
                                : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
                            }
                            onShouldStartLoadWithRequest={(request) => {
                                const { url } = request;
                                if (__DEV__) console.log('[Instamart] shouldLoad:', url);
                                if (url.startsWith('http://') || url.startsWith('https://')) return true;
                                if (url.startsWith('intent://')) {
                                    const schemeMatch = url.match(/[#;]scheme=([^;#]+)/);
                                    if (schemeMatch) {
                                        const scheme = schemeMatch[1];
                                        const path = url.replace('intent://', '').split('#Intent')[0];
                                        Linking.openURL(`${scheme}://${path}`).catch(() => {});
                                    }
                                    return false;
                                }
                                Linking.openURL(url).catch(() => {});
                                return false;
                            }}
                            onError={(e) => Alert.alert('WebView Error', e.nativeEvent.description)}
                        />
                    </View>

                </SafeAreaView>
              </SafeAreaProvider>
            </Modal>
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    shopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: colors.card,
        borderWidth: 1.5,
    },
    shopButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    shopLogo:  { width: 24, height: 24, borderRadius: 5 },
    shopBrand: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, lineHeight: 15 },
    shopCta:   { fontSize: 10, color: colors.primary, fontWeight: '500', lineHeight: 13 },
    container: { flex: 1, backgroundColor: colors.background },
    header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    headerSub:   { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    closeBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
    startBtn:  { backgroundColor: SI_ORANGE, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginRight: 8 },
    startBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    currentItemBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    currentItemLabel: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    currentItemName:  { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
    currentItemQty:   { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    currentItemRight: { alignItems: 'flex-end', gap: 6 },
    tapHint:   { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
    resumeBtn: { backgroundColor: SI_ORANGE, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginRight: 8 },
    resumeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    skipBtn:   { backgroundColor: SI_ORANGE, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
    skipBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 1 },
    pillsRow:     { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
    pillsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center' },
    pill:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.border, maxWidth: 120 },
    pillActive:   { backgroundColor: SI_ORANGE + '22', borderWidth: 1.5, borderColor: SI_ORANGE },
    pillAdded:    { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC' },
    pillSkipped:  { opacity: 0.5 },
    pillInner:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pillIconWrap: { width: 14, alignItems: 'center' },
    pillActiveDot:{ width: 6, height: 6, borderRadius: 3, backgroundColor: SI_ORANGE },
    pillText:     { fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
    pillTextActive:  { color: SI_ORANGE, fontWeight: '600' },
    pillTextAdded:   { color: '#15803D' },
    pillTextSkipped: { color: colors.slate400 },
    webViewWrap:   { flex: 1 },
});
