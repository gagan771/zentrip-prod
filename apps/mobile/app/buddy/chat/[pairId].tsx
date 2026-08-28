import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
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

import { listBuddyMessages, sendBuddyMessage } from '../../../lib/social';
import { colors, radii, spacing, typography } from '../../../lib/theme';

export default function BuddyChatScreen() {
  const { pairId } = useLocalSearchParams<{ pairId: string }>();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const threadQuery = useQuery({
    queryKey: ['buddyMessages', pairId],
    queryFn: () => listBuddyMessages(pairId as string),
    enabled: Boolean(pairId),
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: () => sendBuddyMessage(pairId as string, draft.trim()),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['buddyMessages', pairId] });
    },
  });

  const messages = threadQuery.data?.messages ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>MUTUAL CONSENT</Text>
        <Text style={styles.title}>{threadQuery.data?.displayName ?? 'Chat'}</Text>
        <Text style={styles.subtitle}>
          {threadQuery.data?.groupName ?? 'Unlocked after both of you agreed. First name only.'}
        </Text>

        {threadQuery.isLoading ? <ActivityIndicator color={colors.sage} /> : null}
        {threadQuery.isError ? (
          <Text style={styles.error}>Chat is not available yet. Mutual consent is required.</Text>
        ) : null}

        {messages.length === 0 && threadQuery.isSuccess ? (
          <Text style={styles.empty}>No messages yet. Keep it practical — meeting points, timing, pace.</Text>
        ) : null}

        {messages.map((message) => (
          <View key={message.id} style={message.sender === 'you' ? styles.bubbleYou : styles.bubbleThem}>
            <Text style={message.sender === 'you' ? styles.bubbleYouText : styles.bubbleThemText}>{message.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={colors.inkSubtle}
          style={styles.input}
          editable={!sendMutation.isPending}
        />
        <TouchableOpacity
          style={[styles.send, (!draft.trim() || sendMutation.isPending) && styles.sendDisabled]}
          onPress={() => sendMutation.mutate()}
          disabled={!draft.trim() || sendMutation.isPending}
          activeOpacity={0.85}
        >
          {sendMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  eyebrow: { color: colors.sage, fontSize: typography.fontSize.micro, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: typography.fontSize.title2, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18, marginBottom: spacing.sm },
  error: { color: colors.error, fontSize: typography.fontSize.caption },
  empty: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  bubbleYou: {
    alignSelf: 'flex-end',
    backgroundColor: colors.sage,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '82%',
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '82%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleYouText: { color: colors.white, fontSize: typography.fontSize.body },
  bubbleThemText: { color: colors.ink, fontSize: typography.fontSize.body },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: colors.backgroundWarm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    color: colors.ink,
  },
  send: {
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    minWidth: 72,
    alignItems: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: colors.white, fontWeight: '800' },
});
