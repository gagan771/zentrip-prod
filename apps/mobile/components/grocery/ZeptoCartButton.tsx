/**
 * ZeptoCartButton
 *
 * Flow (same as Blinkit / BigBasket / JioMart):
 *  1. Modal opens → zeptonow.com loads in WebView
 *  2. User logs in, then taps Start
 *  3. For each item:
 *       a) App navigates to zeptonow.com/search?query=<item_name>
 *       b) User taps the "Add" button manually
 *       c) Add is detected → app moves to next item
 *  4. Skip button lets user skip an item
 *  5. Tapping a pill navigates to that item
 *
 * Cart detection (4 layers, in priority order):
 *  Layer 1 — Fetch/XHR intercept: POST to cart add endpoints
 *  Layer 2 — dataLayer/GTM intercept: add_to_cart events
 *  Layer 3 — localStorage intercept: cart state writes
 *  Layer 4 — DOM MutationObserver: ADD button → quantity stepper transition
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ActivityIndicator,
    Alert, Modal, StyleSheet, ScrollView, Keyboard, Platform, Linking,
    Animated, Image,
} from 'react-native';
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets, SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import Analytics from '../../lib/analytics';
import { saveZeptoSession } from '../../lib/grocery-api';
import { getDeviceLocation, buildGeolocationPolyfill, DeviceCoords } from '../../lib/webview-geolocation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZeptoGroceryItem {
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
    item:   ZeptoGroceryItem;
    status: ItemStatus;
    picked: PickedItemData | null;
}

interface ZeptoCartButtonProps {
    groceryList: ZeptoGroceryItem[];
    onSuccess?: (addedItems: ZeptoGroceryItem[]) => void | Promise<void>;
    onItemAdded?: (item: ZeptoGroceryItem) => void;
    autoOpen?: boolean;
    onClose?: () => void;
    onOpen?: () => void;
    style?: any;
    initialCoords?: DeviceCoords;
}

// ─── Injected JS ──────────────────────────────────────────────────────────────
/*
 * Cart detection strategy for Zepto (multi-layered):
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY: DOM Click Handler with immediate extraction (multiple event types)
 * FALLBACK: Fetch/XHR API interception + Mixpanel + GTM dataLayer + localStorage
 *
 * The DOM extraction uses capture phase on click/mousedown/touchstart to catch
 * events before React's synthetic event system, ensuring reliable data capture.
 */

const INJECTED_JS = `
(function () {
  try {
  if (window.__zpReady) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'injected_ready' })); } catch(e) {}
    return;
  }
  window.__zpReady = true;

  if (!window.__zpCache) window.__zpCache = {};

  var rn = function(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch(e) {}
  };

  // ── Product cache ─────────────────────────────────────────────────────────
  function walkAndCache(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 8) return;
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) walkAndCache(obj[i], depth+1); return; }
    var pid = obj.product_id || obj.productId || obj.id || obj.sku || obj.item_id;
    if (pid && (obj.name || obj.product_name || obj.title || obj.display_name)) {
      window.__zpCache[String(pid)] = {
        name:     obj.name || obj.product_name || obj.title || obj.display_name || null,
        weight:   obj.unit || obj.weight || obj.pack_size || obj.quantity_unit  || null,
        price:    obj.price != null ? obj.price : (obj.discounted_price != null ? obj.discounted_price : null),
        mrp:      obj.mrp  != null ? obj.mrp : null,
        image:    obj.image || obj.image_url || obj.product_image || null,
        category: obj.category || obj.category_name || obj.l1_category || null,
      };
    }
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) walkAndCache(obj[keys[k]], depth+1);
  }

  // ── Debounce: prevent duplicate cart_confirmed for same add ──────────────
  var _lastConfirmedAt = 0;
  var _lastConfirmedId = null;

  function sendCartConfirmed(data) {
    var now = Date.now();
    var id = data.picked_id || 'unknown';

    // NEVER send if all critical fields are null (no meaningful data)
    if (!data.picked_name && !data.picked_price && !data.picked_id) {
      // Completely empty event - DOM extraction will handle it
      return;
    }

    // Prevent duplicates within 1.5s for same product
    if (now - _lastConfirmedAt < 1500 && id === _lastConfirmedId) return;

    _lastConfirmedAt = now;
    _lastConfirmedId = id;
    rn(data);
  }

  function safeConfirm(productId, info) {
    // Check cache for product details
    var cached = productId ? (window.__zpCache[String(productId)] || null) : null;

    // Only send if we have MEANINGFUL data (name or price), not just quantity
    var hasData = (cached && (cached.name || cached.price)) || (info && (info.name || info.price));
    if (!hasData) {
      // No meaningful data from API layers - skip this confirmation
      // DOM extraction will handle it
      return;
    }

    sendCartConfirmed({
      type:            'cart_confirmed',
      picked_name:     (cached && cached.name)     || (info && info.name)     || null,
      picked_weight:   (cached && cached.weight)   || (info && info.weight)   || null,
      picked_category: (cached && cached.category) || null,
      picked_mrp:      (cached && cached.mrp != null ? String(cached.mrp) : null),
      picked_image:    (cached && cached.image)    || (info && info.image)    || null,
      picked_quantity: info && info.quantity != null ? String(info.quantity) : '1',
      picked_price:    info && info.price != null ? String(info.price) : (cached && cached.price != null ? String(cached.price) : null),
      picked_id:       productId != null ? String(productId) : null,
      picked_currency: 'INR',
    });
  }

  // ── LAYER 1: Fetch intercept (cart URLs only — no DOM fallback) ───────────
  var _origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    var url     = (typeof input === 'string' ? input : (input && input.url)) || '';
    var method  = ((init && init.method) || 'GET').toUpperCase();
    var rawBody = (init && typeof init.body === 'string') ? init.body : '';

    var response = await _origFetch(input, init);

    var isCartMutation = (method === 'POST' || method === 'PUT' || method === 'PATCH') && response.ok && (
      url.indexOf('/cart') !== -1 ||
      url.indexOf('add-to-cart') !== -1 ||
      url.indexOf('addtocart')   !== -1
    );
    if (!isCartMutation) return response;

    response.clone().json().then(function(data) {
      walkAndCache(data, 0);
      var reqPid = null, reqQty = null;
      try {
        var reqObj = JSON.parse(rawBody);
        var prods  = reqObj.items || reqObj.products || (Array.isArray(reqObj) ? reqObj : []);
        if (Array.isArray(prods) && prods.length > 0) {
          reqPid = prods[0].product_id || prods[0].product_variant_id || prods[0].variant_id || prods[0].id || prods[0].sku || null;
          reqQty = prods[0].quantity   || prods[0].qty               || null;
        } else {
          reqPid = reqObj.product_id || reqObj.product_variant_id || reqObj.variant_id || reqObj.id || reqObj.sku || null;
          reqQty = reqObj.quantity   || reqObj.qty               || null;
        }
      } catch(e) {}
      // Only confirm if we found a product ID — viewing/syncing cart has no product in the body
      if (reqPid) safeConfirm(reqPid, { quantity: reqQty, price: null, currency: 'INR' });
    }).catch(function() {});

    return response;
  };

  // ── LAYER 2: XHR intercept (cart URLs only) ────────────────────────────────
  var _origXHROpen = XMLHttpRequest.prototype.open;
  var _origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._zpMethod = method ? method.toUpperCase() : 'GET';
    this._zpUrl    = url ? String(url) : '';
    return _origXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    var url        = this._zpUrl    || '';
    var method     = this._zpMethod || 'GET';
    var rawBody    = (body && typeof body === 'string') ? body : '';
    var isCartMutation = (method === 'POST' || method === 'PUT' || method === 'PATCH') && (
      url.indexOf('/cart') !== -1 || url.indexOf('add-to-cart') !== -1 || url.indexOf('addtocart') !== -1
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
            var prods  = reqObj.items || reqObj.products || [];
            if (Array.isArray(prods) && prods.length > 0) {
              reqPid = prods[0].product_id || prods[0].product_variant_id || prods[0].variant_id || prods[0].id || prods[0].sku || null;
              reqQty = prods[0].quantity   || prods[0].qty                || null;
            }
          } catch(e2) {}
          // Only confirm if we found a product ID — viewing/syncing cart has no product in the body
          if (reqPid) safeConfirm(reqPid, { quantity: reqQty, price: null, currency: 'INR' });
        } catch(e) {}
        if (origOnLoad) origOnLoad.call(self, e);
      };
    }

    return _origXHRSend.apply(this, arguments);
  };

  // ── LAYER 3: Mixpanel intercept (Zepto uses mixpanel.track 'added_to_cart') ─
  function interceptMixpanel() {
    if (!window.mixpanel || window.mixpanel.__zpIntercepted) return;
    if (!window.mixpanel.track || typeof window.mixpanel.track !== 'function') return;
    var _origTrack = window.mixpanel.track.bind(window.mixpanel);
    window.mixpanel.track = function(eventName, props, options, callback) {
      try {
        if (eventName === 'added_to_cart' || eventName === 'add_to_cart' || eventName === 'addtocart') {
          var pid   = (props && (props.product_variant_id || props.product_id)) || null;
          var price = (props && props.value != null) ? props.value : null;
          var name  = (props && props.product_name) || null;
          var cat   = (props && props.primary_category_name) || null;
          if (pid) {
            window.__zpCache[String(pid)] = {
              name: name, weight: null, price: price,
              mrp: (props && props.mrp != null) ? props.mrp / 100 : null,
              image: null, category: cat,
            };
          }
          safeConfirm(pid, { quantity: null, price: price, currency: 'INR' });
        }
      } catch(e) {}
      return _origTrack(eventName, props, options, callback);
    };
    window.mixpanel.__zpIntercepted = true;
  }

  // Intercept immediately if already loaded, or poll until it loads
  if (window.mixpanel) { interceptMixpanel(); }
  else {
    var _mpTimer = setInterval(function() {
      if (window.mixpanel && !window.mixpanel.__zpIntercepted) { interceptMixpanel(); clearInterval(_mpTimer); }
    }, 100);
    setTimeout(function() { clearInterval(_mpTimer); }, 30000);
  }

  // ── LAYER 4: GTM dataLayer fallback ───────────────────────────────────────
  function interceptDataLayer() {
    if (!window.dataLayer || window.dataLayer.__zpIntercepted) return;
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
              String(item.item_id || item.id || item.product_id || ''),
              { quantity: item.quantity || item.qty || null, price: item.price || null, currency: 'INR' }
            );
          }
        }
      } catch(e) {}
      return _origPush(obj);
    };
    window.dataLayer.__zpIntercepted = true;
  }

  if (window.dataLayer) { interceptDataLayer(); }
  else {
    var _dlTimer = setInterval(function() {
      if (window.dataLayer && !window.dataLayer.__zpIntercepted) { interceptDataLayer(); clearInterval(_dlTimer); }
    }, 200);
    setTimeout(function() { clearInterval(_dlTimer); }, 30000);
  }

  // ── LAYER 4: localStorage (cart key writes) ────────────────────────────────
  var _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (key.indexOf('cart') !== -1 || key.indexOf('Cart') !== -1) {
      try {
        var data  = JSON.parse(value);
        var items = (data && (data.items || (data.cart && data.cart.items))) || [];
        if (Array.isArray(items) && items.length > 0) {
          var last = items[items.length - 1];
          safeConfirm(last.product_id || last.id || last.sku || null,
            { quantity: last.quantity || last.qty, price: null, currency: 'INR' });
        }
      } catch(e) {}
    }
    return _origSetItem.apply(this, arguments);
  };

  // ── DOM Product Extraction (same as Blinkit) ──────────────────────────────
  function extractProductFromDOM(node) {
    var card = node;
    for (var up = 0; up < 15 && card; up++) {
      var fullText = card.innerText || '';
      var hasPrice = fullText.indexOf('\\u20B9') !== -1 || fullText.indexOf('Rs') !== -1 || /\\d+\\s*(?:g|kg|ml|l|L)\\b/.test(fullText);
      var hasReasonableLength = fullText.length > 20 && fullText.length < 3000;
      if (hasReasonableLength && (hasPrice || fullText.split('\\n').length > 3)) break;
      if (!card.parentElement) break;
      card = card.parentElement;
    }
    if (!card) return null;

    var info = { name: null, weight: null, price: null, mrp: null, image: null };
    var fullText = card.innerText || '';

    // Extract product name
    var nameEl = card.querySelector('h1, h2, h3, h4, h5, h6, [class*="name" i], [class*="title" i], [class*="product" i]');
    if (nameEl) {
      var nameTxt = nameEl.innerText.trim();
      if (nameTxt.length > 2 && nameTxt.toLowerCase().indexOf('add') !== 0 && nameTxt.toLowerCase().indexOf('cart') === -1) {
        info.name = nameTxt.substring(0, 120);
      }
    }
    if (!info.name) {
      var lines = fullText.split(/\\n/).filter(function(l) {
        var t = l.trim();
        // Exclude weight/size patterns: "200g", "0.5 kg", "200-350g", "2 Units", "500 ml Pouch", etc.
        var isWeightPattern = /^[\\d\\.\\-]+\\s*(g|kg|ml|l|L|unit|units|piece|pieces)/i.test(t) ||
                              /^\\d+[\\-\\/]\\d+\\s*(g|kg|ml|l|L)/i.test(t);
        return t.length > 3 && t.length < 120 &&
          t.toLowerCase().indexOf('add') !== 0 &&
          t.indexOf('\\u20B9') === -1 && t.indexOf('Rs') === -1 &&
          t.toLowerCase() !== 'cart' && !isWeightPattern &&
          t.toLowerCase() !== 'out of stock' && t.toLowerCase() !== 'notify me' &&
          t.toLowerCase() !== 'best seller';
      });
      if (lines.length > 0) info.name = lines[0].trim();
    }

    // Extract price and MRP
    var priceRegex = /(?:\\u20B9|Rs\\.?)\\s*(\\d+(?:[.,]\\d+)?)/g;
    var priceMatches = [];
    var m;
    while ((m = priceRegex.exec(fullText)) !== null) priceMatches.push(m[1].replace(',', ''));
    if (priceMatches.length >= 1) info.price = priceMatches[0];
    if (priceMatches.length >= 2) info.mrp = priceMatches[priceMatches.length - 1];

    // Extract weight
    var weightMatch = fullText.match(/(\\d+(?:\\.\\d+)?\\s*(?:g|gm|gms|kg|kgs|ml|l|ltr|litre|piece|pieces|pc|pcs|pack|unit|units)s?)(?:\\b|$)/i);
    if (weightMatch) info.weight = weightMatch[1].trim();

    // Extract image
    var img = card.querySelector('img');
    if (img && img.src) info.image = img.src;

    return info;
  }

  function isAddButton(el) {
    if (!el) return false;
    var text = (el.innerText || el.textContent || '').trim().toLowerCase();
    var ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    if (text === 'add' || text === 'add to cart' || text === 'add to bag' || text === '+' ||
        ariaLabel.indexOf('add') !== -1) return true;
    var cls = (el.className || '') + ' ' + (el.getAttribute('data-testid') || '');
    if (cls.toLowerCase().indexOf('add-to-cart') !== -1 || cls.toLowerCase().indexOf('addtocart') !== -1 ||
        cls.toLowerCase().indexOf('add-btn') !== -1 || cls.toLowerCase().indexOf('add_btn') !== -1) return true;
    return false;
  }

  function findAddButtonInAncestors(el) {
    var node = el;
    for (var i = 0; i < 5 && node; i++) {
      if (isAddButton(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Simple click listener — extract immediately on click
  // Uses capture phase + multiple event types (click/mousedown/touchstart) for reliability
  function handleClick(e) {
    // Debug: log every click
    rn({ type: 'debug_zepto_click', target: e.target.tagName, text: (e.target.textContent || '').substring(0, 30) });

    var addBtn = findAddButtonInAncestors(e.target);
    if (!addBtn) {
      rn({ type: 'debug_zepto_no_button' });
      return;
    }

    rn({ type: 'debug_zepto_found_button', btnText: (addBtn.textContent || '').substring(0, 50) });

    // Extract immediately before React updates DOM
    var domInfo = extractProductFromDOM(addBtn);

    // Debug: show extraction result
    rn({
      type: 'debug_zepto_extract',
      hasInfo: !!domInfo,
      name: domInfo && domInfo.name,
      price: domInfo && domInfo.price,
      weight: domInfo && domInfo.weight
    });

    if (domInfo && (domInfo.name || domInfo.price)) {
      var tempId = 'dom_' + Date.now();
      window.__zpCache[tempId] = {
        name: domInfo.name,
        weight: domInfo.weight,
        price: domInfo.price,
        mrp: domInfo.mrp,
        image: domInfo.image,
        category: null,
      };
      sendCartConfirmed({
        type:            'cart_confirmed',
        picked_name:     domInfo.name,
        picked_weight:   domInfo.weight,
        picked_category: null,
        picked_mrp:      domInfo.mrp,
        picked_image:    domInfo.image,
        picked_quantity: '1',
        picked_price:    domInfo.price,
        picked_id:       tempId,
        picked_currency: 'INR',
      });
    } else {
      rn({ type: 'debug_zepto_no_data', reason: !domInfo ? 'null_info' : 'no_name_price' });
    }
  }

  // Try multiple event types to ensure we catch it
  document.addEventListener('click', handleClick, true);
  document.addEventListener('mousedown', handleClick, true);
  document.addEventListener('touchstart', handleClick, true);

  // Also try at the bubble phase as a fallback
  document.addEventListener('click', handleClick, false);

  // Debug: confirm listeners are registered
  rn({ type: 'debug_zepto_listeners_ready', timestamp: Date.now() });

  window.__zpStartCartWatch = function() { /* DOM listener is always active */ };
  window.__zpStopCartWatch  = function() { /* keep listener active */ };

  // ── Search navigation ──────────────────────────────────────────────────────
  window.__zpRunCommand = function(jsonStr) {
    var cmd;
    try { cmd = JSON.parse(jsonStr); } catch(e) { return; }
    if (cmd.action === 'search') {
      window.__zpReady = false;
      window.location.href = 'https://www.zepto.com/search?query=' + encodeURIComponent(cmd.query);
    }
  };

  rn({ type: 'injected_ready' });
  } catch(err) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'script_error',
        error: err.message || String(err),
        stack: err.stack || ''
      }));
    } catch(e2) {}
  }
})();
true;
`;

// ─── Component ────────────────────────────────────────────────────────────────

const ZEPTO_URL    = 'https://www.zepto.com';
const ZEPTO_PURPLE = '#8B1CC8';
const PILL_WIDTH   = 120 + 6;

export function ZeptoCartButton({
    groceryList, onSuccess, onItemAdded, autoOpen, onClose, onOpen, style, initialCoords,
}: ZeptoCartButtonProps) {

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
                `window.location.href = '${ZEPTO_URL}/search?query=${encoded}'; true;`
            );
        }
    }, []);

    const updateResult = useCallback((idx: number, status: ItemStatus) => {
        resultsRef.current = resultsRef.current.map((r, i) => i === idx ? { ...r, status } : r);
        setResults([...resultsRef.current]);
    }, []);

    const handleWebViewLoadEnd = useCallback(() => {
        webViewRef.current?.injectJavaScript(INJECTED_JS);
        // DOM extraction with multiple event listeners is now handled inside INJECTED_JS
        // No need for additional button patching here
        if (deviceCoordsRef.current) {
            webViewRef.current?.injectJavaScript(buildGeolocationPolyfill(deviceCoordsRef.current));
        } else {
            // Retry — user may have enabled Location Services since modal opened
            getDeviceLocation({ silent: true }).then(coords => {
                if (coords) {
                    deviceCoordsRef.current = coords;
                    webViewRef.current?.injectJavaScript(buildGeolocationPolyfill(coords));
                }
            });
        }
    }, []);

    const handleNavigationChange = useCallback((navState: { url?: string }) => {
        if (__DEV__) console.log('[Zepto] navChange:', navState.url, 'processing:', isProcessing.current);
        if (!isProcessing.current) return;
        const url = navState.url || '';
        const status = resultsRef.current[currentIdxRef.current]?.status;
        if (__DEV__) console.log('[Zepto] navChange status:', status, 'idx:', currentIdxRef.current);

        // During 'searching' phase keep lastSearchUrlRef updated to the final
        // redirect destination so it's never stale when 'waiting' begins.
        if (status === 'searching') {
            if (url) lastSearchUrlRef.current = url;
            return;
        }

        if (status !== 'waiting' || !cartResolver.current) return;
        const lastUrl = lastSearchUrlRef.current;
        if (lastUrl && url !== lastUrl) {
            // Zepto appends query params (ymal_idx, cart=open) to the search URL
            // without actually navigating away. Only trigger needsResume if the
            // base path changed (e.g. user navigated to login or a product page).
            try {
                const lastPath = new URL(lastUrl).pathname;
                const newPath  = new URL(url).pathname;
                if (lastPath === newPath) {
                    if (__DEV__) console.log('[Zepto] Same path, ignoring query param change:', url);
                    lastSearchUrlRef.current = url;
                    return;
                }
            } catch {}
            if (__DEV__) console.log('[Zepto] URL changed during waiting, triggering needsResume. last:', lastUrl, 'new:', url);
            lastSearchUrlRef.current = null;
            needsResumeRef.current = true;
            setNeedsResume(true);
            webViewRef.current?.injectJavaScript(`window.__zpStopCartWatch && window.__zpStopCartWatch(); true;`);
        }
    }, []);

    const onMessage = useCallback((e: WebViewMessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }

        if (msg.type === 'dom_dump') {
            if (__DEV__) {
                if (msg.error) { console.log('[Zepto] DOM DUMP ERROR:', msg.error); return; }
                console.log('[Zepto] DOM DUMP:', (msg.items || []).length, 'elements');
                (msg.items || []).forEach((item: string) => console.log('[Zepto] EL:', item));
            }
            return;
        }

        if (msg.type === 'script_error') {
            console.error('[Zepto] ❌ INJECTED_JS ERROR:', msg.error);
            if (msg.stack) console.error('[Zepto] Stack:', msg.stack);
            return;
        }

        if (__DEV__) {
            if (msg.type === 'debug_zepto_listeners_ready') {
                console.log('[Zepto] ✅ DOM extraction script loaded at:', new Date(msg.timestamp).toISOString());
                return;
            }
            if (msg.type === 'debug_zepto_click') {
                console.log('[Zepto] Click:', msg.target, msg.text);
                return;
            }
            if (msg.type === 'debug_zepto_no_button') {
                console.log('[Zepto] ⚠️ Click but no ADD button found');
                return;
            }
            if (msg.type === 'debug_zepto_found_button') {
                console.log('[Zepto] ✅ ADD button found:', msg.btnText);
                return;
            }
            if (msg.type === 'debug_zepto_extract') {
                console.log('[Zepto] DOM extract result:', JSON.stringify(msg));
                return;
            }
            if (msg.type === 'debug_zepto_no_data') {
                console.log('[Zepto] ⚠️ Extraction failed:', msg.reason);
                return;
            }
        }

        if (__DEV__) console.log('[Zepto] onMessage:', msg.type, msg.type === 'current_url' ? msg.url : '');
        switch (msg.type) {
            case 'current_url':
                lastSearchUrlRef.current = msg.url || null;
                break;

            case 'injected_ready':
                jsReadyRef.current = true;
                jsReadyWaiters.current.forEach(fn => fn());
                jsReadyWaiters.current = [];
                // Note: don't set needsResume here — handleNavigationChange
                // already detects real page-away navigations via pathname check.
                // Setting needsResume on injected_ready causes false CONTINUE
                // prompts when Zepto's YMAL section triggers onLoadEnd.
                break;

            case 'cart_confirmed': {
                console.log('[Zepto] cart_confirmed payload:', JSON.stringify(msg));
                const currentStatus = resultsRef.current[currentIdxRef.current]?.status;
                // During 'searching' phase (4s page-load delay), user may tap ADD
                // before status transitions to 'waiting'. Save the pick data so
                // processItem can consume it via pendingPickedRef when it advances.
                if (currentStatus === 'searching') {
                    pendingPickedRef.current = {
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
                    return;
                }
                if (currentStatus !== 'waiting') return;
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
            if (__DEV__) console.log('[Zepto] All items done, navigating to cart:', `${ZEPTO_URL}/cart`);
            isProcessing.current = false;
            const addedResults = list.filter(r => r.status === 'added');
            if (addedResults.length > 0) {
                saveZeptoSession(addedResults.map(r => ({
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
            webViewRef.current?.injectJavaScript(`window.location.href = '${ZEPTO_URL}/cart'; true;`);
            return;
        }

        const item = list[idx].item;
        setCurrentIdx(idx); currentIdxRef.current = idx;
        pendingPickedRef.current = null;
        lastSearchUrlRef.current = null; // clear stale URL before navigating
        updateResult(idx, 'searching');
        send({ action: 'search', query: item.item_name.replace(/\s*\(.*?\)/g, '').trim() });

        await new Promise(r => setTimeout(r, 4000));
        if (gen !== generationRef.current) return;

        updateResult(idx, 'waiting');
        webViewRef.current?.injectJavaScript(`window.__zpStartCartWatch && window.__zpStartCartWatch(); true;`);

        if (pendingPickedRef.current) {
            webViewRef.current?.injectJavaScript(`window.__zpStopCartWatch && window.__zpStopCartWatch(); true;`);
            const pending = pendingPickedRef.current; pendingPickedRef.current = null;
            resultsRef.current = resultsRef.current.map((r, i) => i === idx ? { ...r, picked: pending } : r);
            setResults([...resultsRef.current]);
            updateResult(idx, 'added'); onItemAdded?.(item);
            await new Promise(r => setTimeout(r, 400));
            if (gen !== generationRef.current) return;
            processItem(idx + 1, gen); return;
        }

        const wasAdded = await new Promise<boolean>((resolve) => { cartResolver.current = resolve; });
        webViewRef.current?.injectJavaScript(`window.__zpStopCartWatch && window.__zpStopCartWatch(); true;`);
        if (gen !== generationRef.current) return;

        if (wasAdded) { updateResult(idx, 'added'); onItemAdded?.(item); }
        await new Promise(r => setTimeout(r, 400));
        if (gen !== generationRef.current) return;
        processItem(idx + 1, gen);
    }, [send, updateResult, onSuccess, onItemAdded]);

    const handleDone = useCallback(() => {
        if (!cartResolver.current) return;
        updateResult(currentIdxRef.current, 'added');
        const resolve = cartResolver.current; cartResolver.current = null; resolve(true);
    }, [updateResult]);

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
        onOpen?.();
        setShowModal(true);
        const coords = await getDeviceLocation({ silent: true });
        deviceCoordsRef.current = coords ?? initialCoords ?? null;
    };

    const handleClose = () => {
        if (modalOpenTimeRef.current > 0) {
            const duration = Math.round((Date.now() - modalOpenTimeRef.current) / 1000);
            const added = resultsRef.current.filter(r => r.status === 'added').length;
            const skipped = resultsRef.current.filter(r => r.status === 'skipped').length;
            Analytics.grocery.platformTimeSpent('zepto', duration, added, skipped);
            modalOpenTimeRef.current = 0;
        }
        // Save session on close — user may close before all items finish
        const addedResults = resultsRef.current.filter(r => r.status === 'added');
        if (addedResults.length > 0) {
            console.log('[Zepto] handleClose — saving', addedResults.length, 'items');
            saveZeptoSession(addedResults.map(r => ({
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
            }))).catch((err) => console.warn('[Zepto] session save failed:', err));
        }
        cartResolver.current = null; pendingPickedRef.current = null;
        isProcessing.current = false; generationRef.current++;
        setShowModal(false); onClose?.();
    };

    const currentItem  = results[currentIdx]?.item ?? groceryList[currentIdx];

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
                        <Image source={require('../../assets/grocery/zepto.png')} style={styles.shopLogo} />
                        <View>
                            <Text style={styles.shopBrand}>Zepto</Text>
                            <Text style={styles.shopCta}>Shop now</Text>
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
                                {phase === 'browse' ? 'Zepto'
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

                    {/* Current item banner */}
                    {phase === 'processing' && !needsResume && currentItem && (
                        <View style={styles.currentItemBar}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.currentItemName} numberOfLines={1}>{currentItem.item_name} · {currentItem.quantity}</Text>
                            </View>
                            {results[currentIdx]?.status === 'waiting' ? (
                                <View style={styles.actionButtons}>
                                    <TouchableOpacity style={styles.doneBtn} onPress={handleDone}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                                        <Ionicons name="checkmark" size={14} color="#fff" />
                                        <Text style={styles.doneBtnText}>DONE</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                                        <Text style={styles.skipBtnText}>SKIP</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <ActivityIndicator size="small" color={ZEPTO_PURPLE} />
                            )}
                        </View>
                    )}

                    {phase === 'processing' && results.length > 0 && (
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
                        <WebView key={webviewKey} ref={webViewRef} source={{ uri: ZEPTO_URL }}
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
                                if (__DEV__) console.log('[Zepto] shouldLoad:', url);
                                if (url.startsWith('http://') || url.startsWith('https://')) {
                                    return true;
                                }
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
    shopButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1.5 },
    shopButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    shopLogo:  { width: 24, height: 24, borderRadius: 5 },
    shopBrand: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, lineHeight: 15 },
    shopCta:   { fontSize: 10, color: colors.primary, fontWeight: '500', lineHeight: 13 },
    container: { flex: 1, backgroundColor: colors.background },
    header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    headerSub:   { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    closeBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
    startBtn:  { backgroundColor: ZEPTO_PURPLE, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginRight: 8 },
    startBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    currentItemBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    currentItemName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    actionButtons: { flexDirection: 'row', gap: 6 },
    doneBtn: { backgroundColor: '#16A34A', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4 },
    doneBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    resumeBtn: { backgroundColor: ZEPTO_PURPLE, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginRight: 8 },
    resumeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    skipBtn: { backgroundColor: colors.slate400, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
    skipBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    pillsRow:     { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
    pillsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center' },
    pill:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.border, maxWidth: 120 },
    pillActive:   { backgroundColor: ZEPTO_PURPLE + '22', borderWidth: 1.5, borderColor: ZEPTO_PURPLE },
    pillAdded:    { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC' },
    pillSkipped:  { opacity: 0.5 },
    pillInner:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pillIconWrap: { width: 14, alignItems: 'center' },
    pillActiveDot:{ width: 6, height: 6, borderRadius: 3, backgroundColor: ZEPTO_PURPLE },
    pillText:     { fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
    pillTextActive:  { color: ZEPTO_PURPLE, fontWeight: '600' },
    pillTextAdded:   { color: '#15803D' },
    pillTextSkipped: { color: colors.slate400 },
    webViewWrap:   { flex: 1 },
});
