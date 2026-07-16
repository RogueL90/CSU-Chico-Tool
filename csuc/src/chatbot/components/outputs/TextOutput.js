import React from 'react';
import { View, StyleSheet } from 'react-native';
import BotMarkdown from '../BotMarkdown';

/**
 * Renders a markdown-formatted text answer from the bot.
 *
 * Props:
 *   text - markdown string
 */
export default function TextOutput({ text }) {
  if (!text) return null;
  return (
    <View style={styles.container}>
      <BotMarkdown text={text} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0DDDE',
    padding: 14,
    marginTop: 6,
  },
  text: {
    fontSize: 15,
    color: '#2C2022',
    lineHeight: 23,
  },
});
