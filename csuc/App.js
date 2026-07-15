import { StatusBar } from 'expo-status-bar';
import ChatScreen from './src/chatbot/ChatScreen';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <ChatScreen />
    </>
  );
}
