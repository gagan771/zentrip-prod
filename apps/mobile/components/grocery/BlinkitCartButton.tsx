/**
 * BlinkitCartButton
 *
 * Flow (same as MilkbasketCartButton):
 *  1. Modal opens → blinkit.com loads in WebView
 *  2. User logs in if needed, then taps Start
 *  3. For each item:
 *       a) App navigates to blinkit.com/s/?q=<item_name> (direct URL search)
 *       b) User sees results and taps the "Add" button manually
 *       c) Cart add is detected → app moves to next item
 *  4. Skip button lets user skip an item
 *  5. Tapping a pill navigates back/forward to that item
 *
 * Cart detection:
 *  DOM Click Handler: When user taps ADD button, we walk up the DOM tree to find
 *  the product card container and extract product name, weight, price, MRP, and image
 *  from the card's text content and HTML structure. This is sent as cart_confirmed.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Modal,
    StyleSheet,
    ScrollView,
    Keyboard,
    Linking,
    Platform,
    Animated,
} from 'react-native';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets, SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import { saveBlinkitSession } from '../../lib/grocery-api';
import Analytics from '../../lib/analytics';
import { getDeviceLocation, buildGeolocationPolyfill, DeviceCoords } from '../../lib/webview-geolocation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlinkitGroceryItem {
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
    item:   BlinkitGroceryItem;
    status: ItemStatus;
    picked: PickedItemData | null;
}

interface BlinkitCartButtonProps {
    groceryList: BlinkitGroceryItem[];
    onSuccess?: (addedItems: BlinkitGroceryItem[]) => void | Promise<void>;
    onItemAdded?: (item: BlinkitGroceryItem) => void;
    autoOpen?: boolean;
    onClose?: () => void;
    onOpen?: () => void;
    style?: any;
    initialCoords?: DeviceCoords;
}

// ─── Injected JS ──────────────────────────────────────────────────────────────

const INJECTED_JS = `
(function () {
  // ── Hide WebView fingerprint ───────────────────────────────────────────────
  // Blinkit's payment page checks window.ReactNativeWebView to detect WebViews
  // and hides UPI options when found. We stash the real bridge under a private
  // key and shadow the original with undefined so page scripts cannot see it.
  if (!window.__blBridge) {
    window.__blBridge = window.ReactNativeWebView;
    try {
      Object.defineProperty(window, 'ReactNativeWebView', {
        get: function() { return undefined; },
        configurable: true,
        enumerable: false,
      });
    } catch(e) {}
  }

  // Re-injection guard — safe to run multiple times per session
  if (window.__blReady) {
    try { window.__blBridge.postMessage(JSON.stringify({ type: 'injected_ready' })); } catch(e) {}
    return;
  }
  window.__blReady = true;

  // Product cache: stores DOM-extracted product info
  // Format: { id → { name, weight, price, mrp, image } }
  if (!window.__blCache) window.__blCache = {};

  const rn = (msg) => {
    try { window.__blBridge.postMessage(JSON.stringify(msg)); } catch(e) {}
  };

  // ── API Interception Disabled ──────────────────────────────────────────────
  // Layers 1-3 (Fetch, fbq, DOM observer) are disabled because Blinkit uses
  // server-side rendering and doesn't expose product data via interceptable APIs.
  // We rely solely on DOM extraction (Layer 4) which captures product info when
  // the user clicks ADD.

  // ── DOM Product Extraction (DMart-style) ──────────────────────────────────
  // Extract product info from a product card DOM node when user taps ADD
  function extractProductFromDOM(node) {
    // Walk up to find the product card container
    var card = node;
    var levels = [];
    for (var up = 0; up < 15 && card; up++) {
      var tag = card.tagName || '?';
      var cls = (card.className || '').substring(0, 80);
      var txt = (card.innerText || '').substring(0, 120).replace(/\\n/g, ' | ');
      levels.push(up + ':' + tag + '.' + cls + ' => ' + txt);
      // Stop at a container that has meaningful content (product card)
      var fullText = card.innerText || '';
      // Look for rupee symbol OR price pattern (₹ or numbers followed by g/kg/ml/l)
      var hasPrice = fullText.indexOf('\\u20B9') !== -1 || fullText.indexOf('Rs') !== -1 || /\\d+\\s*(?:g|kg|ml|l|L)\\b/.test(fullText);
      var hasReasonableLength = fullText.length > 20 && fullText.length < 3000;
      if (hasReasonableLength && (hasPrice || fullText.split('\\n').length > 3)) {
        // Found a likely product card
        break;
      }
      if (!card.parentElement) break;
      card = card.parentElement;
    }
    rn({ type: 'debug_dom_levels', levels: levels, finalCardText: (card.innerText || '').substring(0, 400) });
    if (!card) return null;

    var info = { name: null, weight: null, price: null, mrp: null, image: null };
    var fullText = card.innerText || '';

    // Extract product name — h-tags, or meaningful text lines
    var nameEl = card.querySelector('h1, h2, h3, h4, h5, h6, [class*="name" i], [class*="title" i], [class*="product" i]');
    if (nameEl) {
      var nameTxt = nameEl.innerText.trim();
      if (nameTxt.length > 2 && nameTxt.toLowerCase().indexOf('add') !== 0 && nameTxt.toLowerCase().indexOf('cart') === -1) {
        info.name = nameTxt.substring(0, 120);
      }
    }
    if (!info.name) {
      // Fallback: first meaningful text line
      var lines = fullText.split(/\\n/).filter(function(l) {
        var t = l.trim();
        return t.length > 3 && t.length < 120 &&
          t.toLowerCase().indexOf('add') !== 0 &&
          t.indexOf('\\u20B9') === -1 && t.indexOf('Rs') === -1 &&
          t.toLowerCase() !== 'cart' && !/^\\d+\\s*(g|kg|ml|l|unit)$/i.test(t) &&
          t.toLowerCase() !== 'out of stock' && t.toLowerCase() !== 'notify me';
      });
      if (lines.length > 0) info.name = lines[0].trim();
    }

    // Price extraction — look for ₹ or Rs followed by numbers
    var priceRegex = /(?:\\u20B9|Rs\\.?)\\s*(\\d+(?:[.,]\\d+)?)/g;
    var priceMatches = [];
    var m;
    while ((m = priceRegex.exec(fullText)) !== null) priceMatches.push(m[1].replace(',', ''));
    if (priceMatches.length >= 1) info.price = priceMatches[0];
    if (priceMatches.length >= 2) info.mrp = priceMatches[priceMatches.length - 1];

    // Weight — "500 g", "1 kg", "1 L", etc.
    var weightMatch = fullText.match(/(\\d+(?:\\.\\d+)?\\s*(?:g|gm|gms|kg|kgs|ml|l|ltr|litre|piece|pieces|pc|pcs|pack|unit|units)s?)(?:\\b|$)/i);
    if (weightMatch) info.weight = weightMatch[1].trim();

    // Image — any img in the card
    var img = card.querySelector('img');
    if (img && img.src) info.image = img.src;

    rn({ type: 'debug_dom_extract', info: info, cardText: fullText.substring(0, 300) });
    return info;
  }

  // Check if element is an ADD button
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

  // Global click listener — detect ADD button taps and extract product info
  document.addEventListener('click', function(e) {
    var addBtn = findAddButtonInAncestors(e.target);
    if (!addBtn) return;

    // CRITICAL: Extract immediately while button still has parent context!
    // After click, React replaces button with stepper, losing parent references
    var domInfo = extractProductFromDOM(addBtn);
    rn({ type: 'debug_add_click', immediate: true, buttonText: (addBtn.innerText || '').trim(), extracted: domInfo });

    if (domInfo && (domInfo.name || domInfo.price)) {
      // Success! Cache and send
      var tempId = 'dom_' + Date.now();
      window.__blCache[tempId] = {
        name: domInfo.name,
        weight: domInfo.weight,
        price: domInfo.price,
        mrp: domInfo.mrp,
        image: domInfo.image,
        category: null,
      };
      rn({
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
      // Immediate extraction failed - log it
      rn({ type: 'debug_extraction_failed', reason: 'no_product_data', buttonText: (addBtn.innerText || '').trim() });
    }
  }, true);

  // ── Dump search results DOM for debugging ────────────────────────────────
  window.__blDumpSearchResults = function() {
    // Find all ADD buttons and dump their product card structure
    var buttons = document.querySelectorAll('button');
    var addButtons = [];
    for (var b = 0; b < buttons.length; b++) {
      var txt = (buttons[b].innerText || '').trim().toLowerCase();
      if (txt === 'add' || txt === 'add to cart' || txt.indexOf('add to') === 0) {
        addButtons.push(buttons[b]);
      }
    }
    rn({ type: 'debug_search_dom', addButtonCount: addButtons.length });
    // Dump first 2 product cards
    for (var a = 0; a < Math.min(2, addButtons.length); a++) {
      extractProductFromDOM(addButtons[a]);
    }
  };

  // ── LAYER 4: DOM Click Handler — Primary Detection Method ─────────────────
  // This is now the sole detection method. When user taps ADD, we extract
  // product details from the DOM and send cart_confirmed immediately.

  // ── Dismiss app-download popups ──────────────────────────────────────────
  // Blinkit shows two overlays on mobile web:
  //  1) Top banner "Get The App For Better Experience" with an X button
  //  2) Bottom sheet with "Continue on web" link
  // We click whichever dismiss target is present, then watch for new ones.
  function dismissAppPopups() {
    // Bottom sheet: click "Continue on web"
    var allLinks = document.querySelectorAll('a, button, [role="button"], span, div');
    for (var i = 0; i < allLinks.length; i++) {
      var txt = (allLinks[i].textContent || '').trim();
      if (txt === 'Continue on web') {
        allLinks[i].click();
        break;
      }
    }
    // Top banner: click the X / close button inside the app-download strip
    var allBtns = document.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < allBtns.length; j++) {
      var el = allBtns[j];
      var label = ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '').trim();
      if (label === '×' || label === 'x' || label === 'X' || label === '✕' || label === '✖') {
        // Only click if it looks like an app-promo close (not a nav close)
        var parent = el.parentElement;
        var parentHtml = parent ? (parent.innerHTML || '') : '';
        if (parentHtml.indexOf('App') !== -1 || parentHtml.indexOf('app') !== -1 ||
            parentHtml.indexOf('blinkit') !== -1 || parentHtml.indexOf('Use App') !== -1) {
          el.click();
          break;
        }
      }
    }
  }

  dismissAppPopups();

  var _popupObserver = new MutationObserver(function() {
    dismissAppPopups();
  });
  _popupObserver.observe(document.documentElement, { childList: true, subtree: true });
  // Stop watching after 15 s — popup either gone or irrelevant
  setTimeout(function() { _popupObserver.disconnect(); }, 15000);

  // ── Search: navigate directly to Blinkit search URL ──────────────────────
  // Blinkit's search page is /s/?q=<query>. Navigating there is more reliable
  // than finding and typing into the search input on any arbitrary page.
  window.__blRunCommand = function(jsonStr) {
    var cmd;
    try { cmd = JSON.parse(jsonStr); } catch(e) { return; }

    if (cmd.action === 'search') {
      // Clear re-injection guard so the next page gets fully set up
      window.__blReady = false;
      window.location.href = 'https://blinkit.com/s/?q=' + encodeURIComponent(cmd.query);
    }
  };

  rn({ type: 'injected_ready', url: window.location.href });
})();
true;
`;

// ─── Component ────────────────────────────────────────────────────────────────

const BLINKIT_URL = 'https://blinkit.com';
const PILL_WIDTH  = 120 + 6;

export function BlinkitCartButton({
    groceryList, onSuccess, onItemAdded, autoOpen, onClose, onOpen, style, initialCoords,
}: BlinkitCartButtonProps) {

    const insets = useSafeAreaInsets();
    const [showModal, setShowModal]     = useState(false);
    const [phase, setPhase]             = useState<'browse' | 'processing'>('browse');
    const [results, setResults]         = useState<ItemResult[]>([]);
    const [currentIdx, setCurrentIdx]   = useState(0);
    const [needsResume, setNeedsResume] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const webViewRef      = useRef<WebView>(null);
    const deviceCoordsRef = useRef<DeviceCoords | null>(initialCoords ?? null);
    const pillsScrollRef  = useRef<ScrollView>(null);
    const resultsRef      = useRef<ItemResult[]>([]);
    const isProcessing    = useRef(false);
    const modalOpenTimeRef = useRef<number>(0);
    const phaseRef          = useRef<'browse' | 'processing'>('browse');
    const cartResolver    = useRef<((added: boolean) => void) | null>(null);
    const pendingPickedRef = useRef<PickedItemData | null>(null);
    const jsReadyRef      = useRef(false);
    const jsReadyWaiters  = useRef<Array<() => void>>([]);
    const generationRef   = useRef(0);
    const currentIdxRef   = useRef(0);
    const groceryListRef  = useRef(groceryList);
    // Track URL where search was triggered to detect unexpected navigation (login redirect)
    const lastSearchUrlRef = useRef<string | null>(null);

    useEffect(() => { groceryListRef.current = groceryList; }, [groceryList]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);

    // ── Auto-open ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (autoOpen && groceryList.length > 0) {
            setPhase('browse');
            setResults([]);
            isProcessing.current  = false;
            jsReadyRef.current    = false;
            jsReadyWaiters.current = [];
            generationRef.current = 0;
            setShowModal(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen]);

    // ── Auto-scroll pills ──────────────────────────────────────────────────
    useEffect(() => {
        if (phase === 'processing' && pillsScrollRef.current) {
            const x = Math.max(0, currentIdx * PILL_WIDTH - PILL_WIDTH);
            pillsScrollRef.current.scrollTo({ x, animated: true });
        }
    }, [currentIdx, phase]);

    // ── Track keyboard ─────────────────────────────────────────────────────
    useEffect(() => {
        const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const s = Keyboard.addListener(show, () => setKeyboardVisible(true));
        const h = Keyboard.addListener(hide, () => setKeyboardVisible(false));
        return () => { s.remove(); h.remove(); };
    }, []);

    // ── send() — navigate directly via window.location.href ────────────────
    // Direct navigation is more reliable than __blRunCommand during page
    // transitions (e.g. when jumping to a previous item via pill tap while
    // the WebView is still loading, __blRunCommand wouldn't exist yet).
    const send = useCallback((cmd: { action: string; query?: string }) => {
        // Capture the URL before navigating away, so we can detect unexpected redirects later
        webViewRef.current?.injectJavaScript(
            `window.__blBridge && window.__blBridge.postMessage(JSON.stringify({type:'current_url',url:window.location.href})); true;`
        );
        if (cmd.action === 'search' && cmd.query) {
            const encoded = encodeURIComponent(cmd.query);
            webViewRef.current?.injectJavaScript(
                `window.location.href = '${BLINKIT_URL}/s/?q=${encoded}'; true;`
            );
        }
    }, []);

    const updateResult = useCallback((idx: number, status: ItemStatus) => {
        resultsRef.current = resultsRef.current.map((r, i) =>
            i === idx ? { ...r, status } : r
        );
        setResults([...resultsRef.current]);
    }, []);

    // ── Re-inject on every page load ───────────────────────────────────────
    const handleWebViewLoadEnd = useCallback(() => {
        webViewRef.current?.injectJavaScript(INJECTED_JS);
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

    // ── Detect login redirect during 'waiting' ─────────────────────────────
    const handleNavigationChange = useCallback((navState: { url?: string }) => {
        if (__DEV__) console.log('[Blinkit] navChange:', navState.url, 'processing:', isProcessing.current);
        if (!isProcessing.current) return;
        const status = resultsRef.current[currentIdxRef.current]?.status;
        if (__DEV__) console.log('[Blinkit] navChange status:', status, 'idx:', currentIdxRef.current);
        if (status !== 'waiting' || !cartResolver.current) return;
        const url = navState.url || '';
        // Only interrupt for actual login/auth redirects — Blinkit's own SPA
        // navigations (cart drawer, filters, etc.) should never block auto-advance.
        const isLoginRedirect =
            url.includes('/login') ||
            url.includes('/signin') ||
            url.includes('/auth') ||
            url === 'https://blinkit.com/' ||
            url === 'https://blinkit.com';
        if (isLoginRedirect) {
            lastSearchUrlRef.current = null;
            setNeedsResume(true);
        }
    }, []);

    // ── Message handler ────────────────────────────────────────────────────
    const onMessage = useCallback((e: WebViewMessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (__DEV__) console.log('[Blinkit] onMessage:', msg.type);

        switch (msg.type) {

            case 'debug_dom_extract':
                if (__DEV__) console.log('[Blinkit] DOM extract:', JSON.stringify(msg.info), 'text:', msg.cardText?.substring(0, 150));
                break;

            case 'debug_add_click':
                if (__DEV__) console.log('[Blinkit] ADD click detected!', msg.immediate ? '(immediate)' : '', 'button:', msg.buttonText, 'extracted:', JSON.stringify(msg.extracted));
                break;

            case 'debug_extraction_failed':
                if (__DEV__) console.log('[Blinkit] ❌ Extraction failed. Reason:', msg.reason || 'unknown', 'Button:', msg.buttonText);
                break;

            case 'debug_dom_levels':
                if (__DEV__) {
                    console.log('[Blinkit] DOM levels:', msg.levels?.join(' → '));
                    if (msg.finalCardText) console.log('[Blinkit] Final card text:', msg.finalCardText);
                }
                break;

            case 'debug_search_dom':
                if (__DEV__) console.log('[Blinkit] Search results: found', msg.addButtonCount, 'ADD buttons');
                break;

            case 'current_url':
                lastSearchUrlRef.current = msg.url || null;
                break;

            case 'injected_ready':
                jsReadyRef.current = true;
                // Update to the actual URL of the page that just loaded, so
                // handleNavigationChange can accurately detect login redirects.
                if (msg.url) lastSearchUrlRef.current = msg.url;
                jsReadyWaiters.current.forEach(fn => fn());
                jsReadyWaiters.current = [];
                // DOM click handler is always active, no need to start/stop watchers
                break;

            case 'cart_confirmed': {
                console.log('[Blinkit] cart_confirmed payload:', JSON.stringify(msg));
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
                const idx = resultsRef.current.findIndex(
                    r => r.status === 'waiting' || r.status === 'searching'
                );
                if (idx !== -1) {
                    resultsRef.current = resultsRef.current.map((r, i) =>
                        i === idx ? { ...r, picked } : r
                    );
                    setResults([...resultsRef.current]);
                }
                if (cartResolver.current) {
                    // Normal path: promise is waiting
                    cartResolver.current(true);
                    cartResolver.current = null;
                } else {
                    // Early path: user tapped Add before the 2 s delay finished.
                    // Store it — processItem will consume it after the delay.
                    pendingPickedRef.current = picked;
                }
                break;
            }
        }
    }, []);

    // ── Processing loop ────────────────────────────────────────────────────
    const processItem = useCallback(async (idx: number, gen: number) => {
        if (gen !== generationRef.current) return;

        // Use frozen snapshot (built at Start) — never drifts even if parent filters the list
        const list = resultsRef.current;

        if (idx >= list.length) {
            if (__DEV__) console.log('[Blinkit] All items done');
            isProcessing.current = false;
            const addedResults = list.filter(r => r.status === 'added');
            console.log('[Blinkit] All items done — added:', addedResults.length, 'skipped:', list.filter(r => r.status === 'skipped').length);
            addedResults.forEach((r, i) => {
                console.log(`[Blinkit] item[${i}] searched: "${r.item.item_name}" picked:`, JSON.stringify(r.picked));
            });
            if (addedResults.length > 0) {
                saveBlinkitSession(addedResults.map(r => ({
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
            webViewRef.current?.injectJavaScript(`window.location.href = 'https://blinkit.com/cart'; true;`);
            return;
        }

        const item = list[idx].item;
        setCurrentIdx(idx);
        currentIdxRef.current = idx;
        pendingPickedRef.current = null;   // clear any stale early-add from previous item
        updateResult(idx, 'searching');

        // Navigate to Blinkit search URL — __blRunCommand will do window.location.href
        send({ action: 'search', query: item.item_name.replace(/\s*\(.*?\)/g, '').trim() });

        // Wait for the search results page to load.
        // The DOM click handler will fire cart_confirmed when user taps ADD.
        await new Promise(r => setTimeout(r, 2000));
        if (gen !== generationRef.current) return;

        updateResult(idx, 'waiting');

        // Dump search results for debugging
        webViewRef.current?.injectJavaScript(
            `window.__blDumpSearchResults && window.__blDumpSearchResults(); true;`
        );

        // If user tapped Add during the 2 s load window, consume the pending pick now.
        if (pendingPickedRef.current) {
            const pending = pendingPickedRef.current;
            pendingPickedRef.current = null;
            resultsRef.current = resultsRef.current.map((r, i) =>
                i === idx ? { ...r, picked: pending } : r
            );
            setResults([...resultsRef.current]);
            updateResult(idx, 'added');
            onItemAdded?.(item);
            await new Promise(r => setTimeout(r, 400));
            if (gen !== generationRef.current) return;
            processItem(idx + 1, gen);
            return;
        }

        // Wait for the user to tap Add (resolved by cart_confirmed) or Skip
        const wasAdded = await new Promise<boolean>((resolve) => {
            cartResolver.current = resolve;
        });

        if (gen !== generationRef.current) return;

        if (wasAdded) {
            updateResult(idx, 'added');
            onItemAdded?.(item);
        }

        await new Promise(r => setTimeout(r, 400));
        if (gen !== generationRef.current) return;

        processItem(idx + 1, gen);
    }, [send, updateResult, onSuccess, onItemAdded]);

    const handleDone = useCallback(() => {
        if (!cartResolver.current) return;
        const idx = currentIdxRef.current;
        const hasPicked = !!resultsRef.current[idx]?.picked;
        console.log('[Blinkit] handleDone tapped for idx:', idx, 'hasPicked:', hasPicked, 'picked:', JSON.stringify(resultsRef.current[idx]?.picked));
        updateResult(currentIdxRef.current, 'added');
        const resolve = cartResolver.current; cartResolver.current = null; resolve(true);
    }, [updateResult]);

    // ── Skip ───────────────────────────────────────────────────────────────
    const handleSkip = useCallback(() => {
        if (!cartResolver.current) return;
        updateResult(currentIdxRef.current, 'skipped');
        const resolve = cartResolver.current;
        cartResolver.current = null;
        resolve(false);
    }, [updateResult]);

    // ── Resume after login redirect ────────────────────────────────────────
    const handleResume = useCallback(() => {
        setNeedsResume(false);
        lastSearchUrlRef.current = null;
        const idx = currentIdxRef.current;
        const gen = ++generationRef.current;
        if (cartResolver.current) {
            cartResolver.current = null;
        }
        resultsRef.current = resultsRef.current.map((r, i) =>
            i === idx ? { ...r, status: 'pending' as ItemStatus, picked: null } : r
        );
        setResults([...resultsRef.current]);
        processItem(idx, gen);
    }, [processItem]);

    // ── Jump to any item via pill tap ──────────────────────────────────────
    const handleJumpToItem = useCallback((targetIdx: number) => {
        if (!isProcessing.current) return;
        if (targetIdx === currentIdxRef.current) return;

        const gen = ++generationRef.current;
        if (cartResolver.current) {
            cartResolver.current = null;
        }
        resultsRef.current = resultsRef.current.map((r, i) =>
            i === targetIdx ? { ...r, status: 'pending' as ItemStatus, picked: null } : r
        );
        setResults([...resultsRef.current]);
        setCurrentIdx(targetIdx);
        currentIdxRef.current = targetIdx;

        processItem(targetIdx, gen);
    }, [processItem]);

    // ── Start ──────────────────────────────────────────────────────────────
    const handleStart = useCallback(() => {
        if (groceryList.length === 0) return;
        const initial: ItemResult[] = groceryList.map(item => ({
            item, status: 'pending', picked: null,
        }));
        resultsRef.current    = initial;
        isProcessing.current  = true;
        generationRef.current++;
        setResults(initial);
        setCurrentIdx(0);
        currentIdxRef.current = 0;
        setPhase('processing');

        const gen = generationRef.current;
        const startWhenReady = () => processItem(0, gen);
        if (jsReadyRef.current) {
            startWhenReady();
        } else {
            jsReadyWaiters.current.push(startWhenReady);
        }
    }, [groceryList, processItem]);

    const handleOpenModal = async () => {
        if (groceryList.length === 0) {
            Alert.alert('No items', 'Grocery list is empty');
            return;
        }
        setPhase('browse');
        setResults([]);
        setNeedsResume(false);
        isProcessing.current   = false;
        jsReadyRef.current     = false;
        jsReadyWaiters.current = [];
        generationRef.current  = 0;
        modalOpenTimeRef.current = Date.now();
        onOpen?.();
        setShowModal(true);
        // Get location AFTER opening modal so the "Location Services Off"
        // alert appears on top of the modal, not behind it.
        const coords = await getDeviceLocation({ silent: true });
        deviceCoordsRef.current = coords ?? initialCoords ?? null;
    };

    const handleClose = () => {
        if (modalOpenTimeRef.current > 0) {
            const duration = Math.round((Date.now() - modalOpenTimeRef.current) / 1000);
            const added = resultsRef.current.filter(r => r.status === 'added').length;
            const skipped = resultsRef.current.filter(r => r.status === 'skipped').length;
            Analytics.grocery.platformTimeSpent('blinkit', duration, added, skipped);
            modalOpenTimeRef.current = 0;
        }
        // Save session on close — user may close before all items finish
        const addedResults = resultsRef.current.filter(r => r.status === 'added');
        if (addedResults.length > 0) {
            console.log('[Blinkit] handleClose — saving', addedResults.length, 'items');
            addedResults.forEach((r, i) => {
                console.log(`[Blinkit] close item[${i}] searched: "${r.item.item_name}" picked:`, JSON.stringify(r.picked));
            });
            saveBlinkitSession(addedResults.map(r => ({
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
            }))).catch((err) => console.warn('[Blinkit] session save failed:', err));
        }
        cartResolver.current      = null;
        pendingPickedRef.current  = null;
        isProcessing.current      = false;
        generationRef.current++;
        setShowModal(false);
        onClose?.();
    };

    const currentItem  = results[currentIdx]?.item ?? groceryList[currentIdx];

    // ── Pulse animation for shop button ─────────────────────────────────
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (showModal) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.55, duration: 1500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulseAnim, showModal]);

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <>
            {!autoOpen && (
                <AnimatedTouchable
                    style={[styles.shopButton, { borderColor: colors.primary, opacity: pulseAnim }, style]}
                    onPress={handleOpenModal}
                    activeOpacity={0.7}
                    disabled={groceryList.length === 0}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                    <View pointerEvents="none" style={styles.shopButtonInner}>
                        <Image source={require('../../assets/grocery/blinkit.jpeg')} style={styles.shopLogo} />
                        <View>
                            <Text style={styles.shopBrand}>Blinkit</Text>
                            <Text style={styles.shopCta}>Shop now</Text>
                        </View>
                    </View>
                </AnimatedTouchable>
            )}

            <Modal
                visible={showModal}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={handleClose}
            >
              <SafeAreaProvider>
                <SafeAreaView style={styles.container} edges={['top']}>

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>
                                {phase === 'processing'
                                    ? `Item ${currentIdx + 1} of ${results.length || groceryList.length}`
                                    : 'Blinkit'}
                            </Text>
                            {phase === 'browse' && !keyboardVisible && (
                                <Text style={styles.headerSub}>Login if needed, then tap Start</Text>
                            )}
                        </View>
                        {phase === 'browse' && (
                            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.7}>
                                <Ionicons name="play" size={16} color="#000" style={{ marginRight: 6 }} />
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

                    {/* Current item banner — hidden when keyboard is open or needsResume */}
                    {phase === 'processing' && !needsResume && !keyboardVisible && currentItem && (
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
                                <ActivityIndicator size="small" color={BLINKIT_YELLOW} />
                            )}
                        </View>
                    )}

                    {/* Progress pills */}
                    {phase === 'processing' && !keyboardVisible && results.length > 0 && (
                        <ScrollView
                            ref={pillsScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.pillsRow}
                            contentContainerStyle={styles.pillsContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {results.map((r, i) => (
                                <TouchableOpacity
                                    key={i}
                                    onPress={() => handleJumpToItem(i)}
                                    activeOpacity={0.7}
                                    style={[
                                        styles.pill,
                                        i === currentIdx && styles.pillActive,
                                        r.status === 'added'   && styles.pillAdded,
                                        r.status === 'skipped' && styles.pillSkipped,
                                    ]}
                                >
                                    <View style={styles.pillInner} pointerEvents="none">
                                        <View style={styles.pillIconWrap}>
                                            {r.status === 'added'   && <Ionicons name="checkmark-circle" size={12} color="#16A34A" />}
                                            {r.status === 'skipped' && <Ionicons name="remove-circle"    size={12} color={colors.slate400} />}
                                            {i === currentIdx && r.status !== 'added' && r.status !== 'skipped' && (
                                                <View style={styles.pillActiveDot} />
                                            )}
                                        </View>
                                        <Text style={[
                                            styles.pillText,
                                            i === currentIdx && styles.pillTextActive,
                                            r.status === 'added'   && styles.pillTextAdded,
                                            r.status === 'skipped' && styles.pillTextSkipped,
                                        ]} numberOfLines={1}>
                                            {r.item.item_name}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {/* WebView */}
                    <View style={[
                        styles.webViewWrap,
                        { marginBottom: -insets.bottom, paddingBottom: insets.bottom },
                    ]}>
                        <WebView
                            ref={webViewRef}
                            source={{ uri: BLINKIT_URL }}
                            injectedJavaScript={INJECTED_JS}
                            onMessage={onMessage}
                            onLoadEnd={handleWebViewLoadEnd}
                            onNavigationStateChange={handleNavigationChange}
                            javaScriptEnabled
                            domStorageEnabled
                            thirdPartyCookiesEnabled
                            sharedCookiesEnabled
                            geolocationEnabled={true}
                            setSupportMultipleWindows={false}
                            originWhitelist={['*']}
                            style={{ flex: 1 }}
                            userAgent={Platform.OS === 'ios'
                                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
                                : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
                            }
                            onError={(e) => Alert.alert('WebView Error', e.nativeEvent.description)}
                            onShouldStartLoadWithRequest={(request) => {
                                const { url } = request;
                                if (__DEV__) console.log('[Blinkit] shouldLoad:', url);
                                if (url.startsWith('http://') || url.startsWith('https://')) {
                                    return true;
                                }
                                // Parse Android intent:// URLs to extract the actual scheme URL
                                // e.g. intent://pay?pa=x&pn=y#Intent;scheme=upi;end → upi://pay?pa=x&pn=y
                                if (url.startsWith('intent://')) {
                                    const schemeMatch = url.match(/[#;]scheme=([^;#]+)/);
                                    if (schemeMatch) {
                                        const scheme = schemeMatch[1];
                                        const path = url.replace('intent://', '').split('#Intent')[0];
                                        Linking.openURL(`${scheme}://${path}`).catch(() => {});
                                    }
                                    return false;
                                }
                                // Handle direct deep links (upi://, phonepe://, gpay://, paytm://, etc.)
                                Linking.openURL(url).catch(() => {});
                                return false;
                            }}
                        />
                    </View>

                </SafeAreaView>
              </SafeAreaProvider>
            </Modal>
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BLINKIT_YELLOW = '#F8C200';

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
    shopButtonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    shopLogo: { width: 24, height: 24, borderRadius: 5 },
    shopBrand: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, lineHeight: 15 },
    shopCta: { fontSize: 10, color: colors.primary, fontWeight: '500', lineHeight: 13 },

    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.card,
    },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    headerSub:   { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    closeBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: colors.background,
        justifyContent: 'center', alignItems: 'center',
    },
    startBtn: {
        backgroundColor: BLINKIT_YELLOW, flexDirection: 'row', alignItems: 'center',
        paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginRight: 8,
    },
    startBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },

    currentItemBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    currentItemName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    actionButtons: { flexDirection: 'row', gap: 6 },
    doneBtn: { backgroundColor: '#16A34A', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4 },
    doneBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    resumeBtn: {
        backgroundColor: '#16A34A', flexDirection: 'row', alignItems: 'center',
        paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginRight: 8,
    },
    resumeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    skipBtn: { backgroundColor: colors.slate400, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
    skipBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    pillsRow:     { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
    pillsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center' },
    pill: {
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
        backgroundColor: colors.border, maxWidth: 120,
    },
    pillActive:   { backgroundColor: BLINKIT_YELLOW + '33', borderWidth: 1.5, borderColor: BLINKIT_YELLOW },
    pillAdded:    { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC' },
    pillSkipped:  { backgroundColor: colors.border, opacity: 0.6 },
    pillInner:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pillIconWrap: { width: 14, alignItems: 'center' },
    pillActiveDot:{ width: 6, height: 6, borderRadius: 3, backgroundColor: BLINKIT_YELLOW },
    pillText:        { fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
    pillTextActive:  { color: '#7A6000', fontWeight: '700' },
    pillTextAdded:   { color: '#16A34A', fontWeight: '600' },
    pillTextSkipped: { color: colors.slate400 },

    webViewWrap:   { flex: 1 },
});
