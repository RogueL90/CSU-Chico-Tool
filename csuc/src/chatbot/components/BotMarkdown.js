import React from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

/**
 * Shared markdown renderer for bot messages — bold, bullet lists, links,
 * inline code — styled to match the chat theme. Links open via Linking
 * (the library's default).
 *
 * Props:
 *   text - markdown string
 */
export default function BotMarkdown({ text }) {
  if (!text) return null;
  return <Markdown style={mdStyles}>{text}</Markdown>;
}

const mdStyles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#2C2022',
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  strong: {
    fontWeight: '700',
  },
  link: {
    color: '#C8102E',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    marginBottom: 4,
    flexDirection: 'row',
  },
  bullet_list_icon: {
    color: '#C8102E',
    marginRight: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  ordered_list_icon: {
    color: '#C8102E',
    marginRight: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  code_inline: {
    backgroundColor: '#F6F6F6',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: 'Courier',
    fontSize: 14,
  },
  code_block: {
    backgroundColor: '#F6F6F6',
    borderRadius: 8,
    borderWidth: 0,
    padding: 10,
    fontFamily: 'Courier',
    fontSize: 13,
    marginBottom: 8,
  },
  fence: {
    backgroundColor: '#F6F6F6',
    borderRadius: 8,
    borderWidth: 0,
    padding: 10,
    fontFamily: 'Courier',
    fontSize: 13,
    marginBottom: 8,
  },
  blockquote: {
    backgroundColor: '#FFF7F3',
    borderLeftWidth: 3,
    borderLeftColor: '#C8102E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  // Headings scaled for chat bubbles so a stray "#" doesn't blow up the layout
  heading1: { fontSize: 18, fontWeight: '800', marginBottom: 6, color: '#1a1a1a' },
  heading2: { fontSize: 17, fontWeight: '700', marginBottom: 6, color: '#1a1a1a' },
  heading3: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#1a1a1a' },
  heading4: { fontSize: 15, fontWeight: '700', marginBottom: 4, color: '#1a1a1a' },
  hr: {
    backgroundColor: '#F0DDDE',
    height: 1,
    marginVertical: 8,
  },
});
