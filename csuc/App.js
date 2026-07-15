import { StatusBar } from 'expo-status-bar';
import ChatScreen from './src/chatbot/ChatScreen';

export default function App() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#C8102E" />
      <ChatScreen />
    </>
  );
}
