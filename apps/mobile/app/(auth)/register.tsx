import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guestUser, registerWithEmail, signInWithGoogle } from '../../lib/auth';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useStore((s) => s.setUser);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError(null);
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const user = await registerWithEmail(email.trim(), password, name.trim());
      setUser(user);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      setUser(user);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  function handleGuestContinue() {
    setUser(guestUser());
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.badgeRow}>
            <Text style={styles.brandKicker}>✦ ZENTRIP ✦</Text>
          </View>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Begin your mindful exploration with personal memories and voice companionship.
          </Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Full Name</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={colors.inkMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Aarav Sharma"
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          </View>

          <Text style={styles.inputLabel}>Email address</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={18} color={colors.inkMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="aarav@example.com"
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.inkMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.inkSubtle}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={colors.inkMuted}
              />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-google" size={18} color={colors.ink} style={{ marginRight: 8 }} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={handleGuestContinue}
            disabled={loading}
            activeOpacity={0.8}
          >
            <View style={styles.guestContent}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.guestNote}>
            Explore & offline knowledge are open to everyone. Saved trips & voice companion require an account.
          </Text>
        </View>

        {/* Footer Link */}
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Log in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    flexGrow: 1,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  badgeRow: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    marginBottom: spacing.sm,
  },
  brandKicker: {
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2.2,
  },
  title: {
    fontSize: typography.fontSize.hero,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: typography.lineHeight.body,
    maxWidth: 310,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  inputLabel: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.xs,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.headline,
    color: colors.ink,
    height: '100%',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    fontWeight: '500',
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.fontSize.headline,
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: typography.fontSize.micro,
    color: colors.inkSubtle,
    marginHorizontal: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radii.md,
    height: 48,
  },
  googleButtonText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: typography.fontSize.body,
  },
  guestButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  guestContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: typography.fontSize.body,
  },
  guestNote: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    textAlign: 'center',
    lineHeight: typography.lineHeight.micro,
    marginTop: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
  },
  footerLink: {
    color: colors.primary,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },
});
