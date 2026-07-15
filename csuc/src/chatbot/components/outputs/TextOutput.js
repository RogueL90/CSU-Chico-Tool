import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Renders a plain text answer from the bot.
 *
 * Props:
 *   text - string
 */
export default function TextOutput({ text }) {
  if (!text) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4EAF0',
    padding: 14,
    marginTop: 6,
  },
  text: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 23,
  },
});
