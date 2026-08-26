import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Root client-state store. Named to match kmkb-mobile-app's store/useStore.ts so that
 * app's grocery slice can be folded in here directly during Phase 2 absorption, instead
 * of running two separate stores (see 05-india-services-layer-grocery-integration.md).
 *
 * What does NOT belong here: anything the backend owns as source of truth (trip data,
 * itinerary, bookings — those are TanStack Query server state) or tokens (those live in
 * expo-secure-store via lib/api-client.ts). This store is for session-only / device-local
 * state, per the three-tier memory model in 01-zentrip-companion.md §3.
 */

export type CompanionMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

export type ZentripUser = {
  id: string;
  email?: string;
  name: string;
  language: string;
  country?: string | null;
} | null;

export type TravelerPreferences = {
  pace: 'relaxed' | 'balanced' | 'packed';
  budget: 'backpacker' | 'comfort' | 'luxury' | 'mixed';
  interests: string[];
};

type ZentripState = {
  // -- auth / profile (display only — tokens live in SecureStore) --
  user: ZentripUser;
  setUser: (user: ZentripUser) => void;
  logout: () => void;

  // -- companion session memory (ephemeral, per 01-zentrip-companion.md §3) --
  companionMessages: CompanionMessage[];
  addCompanionMessage: (message: CompanionMessage) => void;
  clearCompanionSession: () => void;

  // -- active trip pointer (the trip data itself is server state via TanStack Query) --
  activeTripId: string | null;
  setActiveTripId: (tripId: string | null) => void;

  // -- local profile preferences used to personalize the home/explore surfaces --
  travelerPreferences: TravelerPreferences;
  setTravelerPreferences: (preferences: Partial<TravelerPreferences>) => void;
};

export const useStore = create<ZentripState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, activeTripId: null, companionMessages: [] }),

      companionMessages: [],
      addCompanionMessage: (message) =>
        set((state) => ({ companionMessages: [...state.companionMessages, message] })),
      clearCompanionSession: () => set({ companionMessages: [] }),

      activeTripId: null,
      setActiveTripId: (tripId) => set({ activeTripId: tripId }),

      travelerPreferences: {
        pace: 'balanced',
        budget: 'backpacker',
        interests: ['Culture', 'Food'],
      },
      setTravelerPreferences: (preferences) =>
        set((state) => ({ travelerPreferences: { ...state.travelerPreferences, ...preferences } })),
    }),
    {
      name: 'zentrip-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Companion session memory is deliberately excluded from persistence —
      // it should not survive an app restart per the "session memory" tier definition.
      partialize: (state) => ({
        user: state.user,
        activeTripId: state.activeTripId,
        travelerPreferences: state.travelerPreferences,
      }),
    }
  )
);
