import { StatusBar } from 'expo-status-bar';
import { Platform, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ChatScreen from './src/chatbot/ChatScreen';

// Web-only global CSS: match iOS text rendering (antialiased, not
// Chrome's heavier subpixel AA) and remove browser chrome the phone
// doesn't have (textarea focus ring + scrollbar).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    textarea { outline: none; scrollbar-width: none; }
    textarea::-webkit-scrollbar { display: none; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const app = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#C8102E" />
      <ChatScreen />
    </GestureHandlerRootView>
  );

  // On web, keep the app a phone-shaped centered column instead of
  // stretching across a desktop browser. Invisible at phone widths
  // (device emulation is narrower than the 480px cap).
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webPage}>
        <View style={styles.webColumn}>{app}</View>
      </View>
    );
  }

  return app;
}

const styles = StyleSheet.create({
  webPage: {
    flex: 1,
    backgroundColor: '#E8DEDA',
    alignItems: 'center',
  },
  webColumn: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
  },
});
