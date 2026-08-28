import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../lib/theme';
import { useStore } from '../store/useStore';

const queryClient = new QueryClient();

/**
 * Auth gate via Stack.Protected instead of an imperative router.replace() in an
 * effect: expo-router's navigationRef can report `state` changes (which
 * useRootNavigationState surfaces) a tick before navigationRef.isReady() is
 * actually true, so gating a manual replace() on that state is still racy.
 * Protected guards route visibility declaratively and sidesteps the race
 * entirely — see README.md "Routing".
 */
function RootNavigator() {
  const user = useStore((s) => s.user);
  const [hasHydrated, setHasHydrated] = useState(useStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHasHydrated(true));
    if (useStore.persist.hasHydrated()) setHasHydrated(true);
    return unsub;
  }, []);

  if (!hasHydrated) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.primary,
          headerTitleStyle: {
            color: colors.ink,
            fontWeight: '700',
            fontSize: 17,
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="services/grocery/index"
            options={{ title: 'Quick Groceries & Essentials', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="services/booking/index"
            options={{ title: 'Book trains, buses, flights, stays', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="payments/index"
            options={{ title: 'Payment Assistance', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="community/index"
            options={{ title: 'Destination Community', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="buddy/index"
            options={{ title: 'Travel Buddy Match', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="translation/index"
            options={{ title: 'Travel Translator', headerBackTitle: 'Back' }}
          />
          <Stack.Screen name="risk/index" options={{ title: 'Risk Intelligence', headerBackTitle: 'Back' }} />
          <Stack.Screen name="explorer/index" options={{ title: 'Explorer Missions', headerBackTitle: 'Back' }} />
          <Stack.Screen name="experts/index" options={{ title: 'Ask a Local Expert', headerBackTitle: 'Back' }} />
          <Stack.Screen
            name="trails/index"
            options={{ title: 'Offline Trail Packs', headerBackTitle: 'Back' }}
          />
          <Stack.Screen name="peaks/index" options={{ title: 'Nearby Peaks', headerBackTitle: 'Back' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
