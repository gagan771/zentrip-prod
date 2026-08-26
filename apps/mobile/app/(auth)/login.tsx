import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { guestUser, loginWithEmail, signInWithGoogle } from '../../lib/auth';
import { useStore } from '../../store/useStore';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin() {
    setError(null);
    setLoading(true);
    try {
      const user = await loginWithEmail(email.trim(), password);
      setUser(user);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
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
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.primaryButton} onPress={handleEmailLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Log in</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.guestButton} onPress={handleGuestContinue} disabled={loading}>
        <Text style={styles.guestButtonText}>Continue as guest</Text>
      </TouchableOpacity>
      <Text style={styles.guestNote}>Explore works offline. Saving trips and Companion chat need an account.</Text>

      <Link href="/(auth)/register" style={styles.link}>
        <Text>Don't have an account? Create one</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
  },
  error: { color: '#8C3C29', fontSize: 13 },
  primaryButton: {
    backgroundColor: '#1C2128',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  googleButton: {
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleButtonText: { fontWeight: '600', fontSize: 16 },
  guestButton: { alignItems: 'center', paddingVertical: 10 },
  guestButtonText: { color: '#8C3C29', fontWeight: '600', fontSize: 14 },
  guestNote: { color: '#8A8F86', fontSize: 11, textAlign: 'center', marginTop: -5 },
  link: { marginTop: 16, alignSelf: 'center' },
});
