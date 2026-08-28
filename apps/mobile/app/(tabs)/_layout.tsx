import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import { colors, radii, typography } from '../../lib/theme';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;
const TAB_BAR_PAD_BOTTOM = Platform.OS === 'ios' ? 28 : 10;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkSubtle,
        tabBarStyle: {
          backgroundColor: colors.cardSubtle,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT,
          paddingTop: 8,
          paddingBottom: TAB_BAR_PAD_BOTTOM,
          elevation: 12,
          shadowColor: colors.sageDark,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: typography.fontSize.micro,
          fontWeight: '700',
          letterSpacing: 0.3,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          title: 'Trip',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="companion"
        options={{
          title: 'Zenny',
          tabBarActiveTintColor: colors.skyWarm,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
          tabBarStyle: {
            backgroundColor: colors.grassDeep,
            borderTopWidth: 0,
            height: TAB_BAR_HEIGHT,
            paddingTop: 8,
            paddingBottom: TAB_BAR_PAD_BOTTOM,
            elevation: 0,
          },
          tabBarIcon: ({ focused }) => (
            <View style={focused ? styles.companionActiveIcon : styles.companionIcon}>
              <Ionicons
                name={focused ? 'leaf' : 'leaf-outline'}
                size={20}
                color={focused ? colors.grassDeep : colors.skyWarm}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />
      {/* Sub-screens in tabs folder accessible via links/navigation */}
      <Tabs.Screen
        name="compare"
        options={{
          href: null,
          title: 'Compare & Decide',
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          href: null,
          title: 'Heritage Lens',
        }}
      />
      <Tabs.Screen
        name="guardian"
        options={{
          href: null,
          title: 'Guardian Safety',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  companionIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: 'rgba(231, 242, 201, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companionActiveIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.skyWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
