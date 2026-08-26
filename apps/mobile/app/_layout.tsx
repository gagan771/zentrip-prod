import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
    <Stack>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="services/grocery/index" options={{ title: 'Services' }} />
        <Stack.Screen name="community/index" options={{ title: 'Community' }} />
        <Stack.Screen name="buddy/index" options={{ title: 'Travel Buddy' }} />
        <Stack.Screen name="trails/index" options={{ title: 'Trails' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
