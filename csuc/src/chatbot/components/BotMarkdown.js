import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Lightweight bot-text renderer using only React Native views and styles.
 * Supports paragraphs, simple headings, bullets, numbered lists, and **bold**.
 */
export default function BotMarkdown({ text }) {
  if (!text) return null;

  return (
    <View style={styles.body}>
      {String(text).split('\n').map((line, index) => (
        <StyledLine key={`${index}-${line}`} line={line} />
      ))}
    </View>
  );
}

function StyledLine({ line }) {
  const heading = line.match(/^(#{1,4})\s+(.+)$/);
  if (heading) {
    return (
      <Text style={[styles.text, styles.heading, styles[`heading${heading[1].length}`]]}>
        {renderBold(heading[2])}
      </Text>
    );
  }

  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) {
    return (
      <View style={styles.listRow}>
        <Text style={styles.bullet}>•</Text>
        <Text style={[styles.text, styles.listText]}>{renderBold(bullet[1])}</Text>
      </View>
    );
  }

  const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
  if (numbered) {
    return (
      <View style={styles.listRow}>
        <Text style={styles.number}>{numbered[1]}.</Text>
        <Text style={[styles.text, styles.listText]}>{renderBold(numbered[2])}</Text>
      </View>
    );
  }

  if (!line.trim()) return <View style={styles.spacer} />;
  return <Text style={[styles.text, styles.paragraph]}>{renderBold(line)}</Text>;
}

function renderBold(value) {
  return value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const isBold = part.startsWith('**') && part.endsWith('**');
    return (
      <Text key={`${index}-${part}`} style={isBold ? styles.strong : undefined}>
        {isBold ? part.slice(2, -2) : part}
      </Text>
    );
  });
}

const styles = StyleSheet.create({
  body: { width: '100%' },
  text: { color: '#2C2022', fontSize: 15, lineHeight: 22 },
  paragraph: { marginBottom: 5 },
  strong: { fontWeight: '700' },
  spacer: { height: 6 },
  heading: { color: '#1A1A1A', fontWeight: '800', marginBottom: 6 },
  heading1: { fontSize: 18 },
  heading2: { fontSize: 17 },
  heading3: { fontSize: 16 },
  heading4: { fontSize: 15 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  bullet: { color: '#C8102E', fontSize: 17, lineHeight: 22, marginRight: 8 },
  number: { color: '#C8102E', fontSize: 15, fontWeight: '700', lineHeight: 22, marginRight: 7 },
  listText: { flex: 1 },
});
