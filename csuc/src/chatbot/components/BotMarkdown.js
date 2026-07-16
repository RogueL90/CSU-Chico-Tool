import React from 'react';
import { Alert, StyleSheet, Text, View, Linking } from 'react-native';

/**
 * Lightweight bot-text renderer using only React Native views and styles.
 * Supports paragraphs, simple headings, bullets, numbered lists, **bold**, and [links](url).
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
        {renderInline(heading[2])}
      </Text>
    );
  }

  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) {
    return (
      <View style={styles.listRow}>
        <Text style={styles.bullet}>•</Text>
        <Text style={[styles.text, styles.listText]}>{renderInline(bullet[1])}</Text>
      </View>
    );
  }

  const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
  if (numbered) {
    return (
      <View style={styles.listRow}>
        <Text style={styles.number}>{numbered[1]}.</Text>
        <Text style={[styles.text, styles.listText]}>{renderInline(numbered[2])}</Text>
      </View>
    );
  }

  if (!line.trim()) return <View style={styles.spacer} />;
  return <Text style={[styles.text, styles.paragraph]}>{renderInline(line)}</Text>;
}

/**
 * Parse inline markdown: **bold** and [link text](url)
 */
function renderInline(value, keyPrefix = 'inline') {
  // Match bold and links, then recursively parse their contents so combinations
  // such as **[Health Center](url)** and [**Health Center**](url) both work.
  const parts = value
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:[^()\s]+|\([^()\s]*\))+\))/g)
    .filter(Boolean);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={key} style={styles.strong}>
          {renderInline(part.slice(2, -2), `${key}-bold`)}
        </Text>
      );
    }

    const linkMatch = part.match(
      /^\[([^\]]+)\]\(((?:[^()\s]+|\([^()\s]*\))+)\)$/
    );
    if (linkMatch) {
      const linkText = linkMatch[1];
      const url = linkMatch[2];
      return (
        <Text
          key={key}
          style={styles.link}
          onPress={() => openLink(url)}
          accessibilityRole="link"
        >
          {renderInline(linkText, `${key}-link`)}
        </Text>
      );
    }

    return <Text key={key}>{part}</Text>;
  });
}

async function openLink(url) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('Unsupported URL');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open link', 'Please try again later.');
  }
}

const styles = StyleSheet.create({
  body: { width: '100%' },
  text: { color: '#2C2022', fontSize: 15, lineHeight: 22 },
  paragraph: { marginBottom: 5 },
  strong: { fontWeight: '700' },
  link: { color: '#C8102E', textDecorationLine: 'underline', fontWeight: '600' },
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
