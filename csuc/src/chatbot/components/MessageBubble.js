import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TextOutput from './outputs/TextOutput';
import MapOutput from './outputs/MapOutput';

/**
 * Renders a single chat message.
 *
 * message shape:
 * {
 *   id:          string
 *   role:        'bot' | 'user'
 *   type:        'text' | 'result'
 *   text?:       string
 *   outputs?:    { text, map }
 *   outputTypes?: string[]
 * }
 *
 * Note: phone output lives in the persistent call bar in ChatScreen.
 * Choice chips live in the chips bar in ChatScreen.
 * Neither belongs inside a message bubble.
 */
export default function MessageBubble({ message }) {
  // ── User bubble ───────────────────────────────────────────────────────────
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  // ── Bot message ───────────────────────────────────────────────────────────
  return (
    <View style={styles.botRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>🐾</Text>
      </View>
      <View style={styles.botContent}>
        {!!message.text && (
          <View style={styles.botBubble}>
            <Text style={styles.botText}>{message.text}</Text>
          </View>
        )}
        {message.type === 'result' && message.outputs && message.outputTypes && (
          <View style={styles.outputsContainer}>
            {message.outputTypes.includes('text') && message.outputs.text && (
              <TextOutput text={message.outputs.text} />
            )}
            {message.outputTypes.includes('map') && message.outputs.map && (
              <MapOutput map={message.outputs.map} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 5,
    paddingHorizontal: 16,
  },
  userBubble: {
    backgroundColor: '#C8102E',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 15,
    maxWidth: '78%',
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },

  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 5,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0DDDE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 3,
    flexShrink: 0,
  },
  avatarEmoji: { fontSize: 17 },
  botContent: { flex: 1 },
  botBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0DDDE',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  botText: { color: '#2C2022', fontSize: 15, lineHeight: 22 },
  outputsContainer: { marginTop: 4 },
});
