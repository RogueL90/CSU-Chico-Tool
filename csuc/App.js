import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ChatScreen from './src/chatbot/ChatScreen';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#C8102E" />
      <ChatScreen />
    </GestureHandlerRootView>
  );
}
