import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Keyboard,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MessageBubble from './components/MessageBubble';
import { askKnowledgeBase } from '../../aws-bedrock/knowledgeBase';

// ─── Constants ───────────────────────────────────────────────────────────────
const GREETING = "Hi! I'm the Chico State assistant. What do you need help with today?";

// ─── Helpers ─────────────────────────────────────────────────────────────────
let _id = 0;
const uid = () => String(++_id);

async function dialNumber(phoneNumber) {
  const url = `tel:${phoneNumber}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      const fmt = phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
      Alert.alert('Phone not available', `Please call: ${fmt}`);
    }
  } catch {
    Alert.alert('Error', 'Could not open the dialer.');
  }
}

/**
 * Attempt to extract structured data from the Bedrock response text.
 * The knowledge base may return phone numbers, building names, or coords.
 * For now we return the raw text; as the KB responses become more structured
 * we can parse map/phone data here.
 */
function parseBedrockResponse(response) {
  const text = response?.output?.text || 'Sorry, I could not find an answer.';

  // Try to detect a phone number in the response (10-digit US)
  const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : null;

  // Build the result
  const result = {
    text,
    phone,
    // Map data would come from structured KB metadata in the future
    map: null,
  };

  const outputTypes = ['text'];
  if (phone) outputTypes.push('phone');

  return { outputs: result, outputTypes };
}

// ─── ChatScreen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const listRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [persistentPhone, setPersistentPhone] = useState(null);

  const pushMessages = useCallback((newMsgs) => {
    setMessages((prev) => [...prev, ...newMsgs]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Greeting on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, []);

  // ── Send a message to Bedrock and handle the response ─────────────────────
  const sendToBedrock = useCallback(async (userText) => {
    const userMsg = { id: uid(), role: 'user', type: 'text', text: userText };
    pushMessages([userMsg]);
    setLoading(true);

    try {
      const response = await askKnowledgeBase(userText);
      const { outputs, outputTypes } = parseBedrockResponse(response);

      // Show phone in persistent bar if detected
      if (outputs.phone) {
        setPersistentPhone({ number: outputs.phone, label: 'Suggested Contact' });
      }

      const resultMsg = {
        id: uid(),
        role: 'bot',
        type: 'result',
        text: null, // text goes inside TextOutput via outputs
        outputs,
        outputTypes,
      };
      pushMessages([resultMsg]);
    } catch (error) {
      console.error('Bedrock query failed:', error);
      const errMsg = {
        id: uid(),
        role: 'bot',
        type: 'text',
        text: "Sorry, I had trouble connecting. Please try again in a moment.",
      };
      pushMessages([errMsg]);
    } finally {
      setLoading(false);
    }
  }, [pushMessages]);

  // ── Handle bottom-bar send ────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || loading) return;
    Keyboard.dismiss();
    setInputText('');
    sendToBedrock(text);
  }, [inputText, loading, sendToBedrock]);

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    _id = 0;
    setPersistentPhone(null);
    setInputText('');
    setLoading(false);
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const formattedPhone = persistentPhone?.number.replace(
    /(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Chico State Assistant</Text>
          <Text style={styles.headerSub}>Here to help you navigate campus</Text>
        </View>
        <TouchableOpacity
          style={styles.restartBtn}
          onPress={handleRestart}
          accessibilityRole="button"
          accessibilityLabel="Start over"
        >
          <Text style={styles.restartTxt}>↺  New</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Message list ── */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {/* ── Typing indicator ── */}
        {loading && (
          <View style={styles.typingBar}>
            <ActivityIndicator size="small" color="#003366" />
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        )}

        {/* ── Persistent call bar ── */}
        {persistentPhone && (
          <TouchableOpacity
            style={styles.callBar}
            onPress={() => dialNumber(persistentPhone.number)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`Call ${persistentPhone.label}`}
          >
            <View style={styles.callBarLeft}>
              <Text style={styles.callBarIcon}>📞</Text>
              <View>
                <Text style={styles.callBarLabel}>Call {persistentPhone.label}</Text>
                <Text style={styles.callBarNumber}>{formattedPhone}</Text>
              </View>
            </View>
            <View style={styles.callBarBtn}>
              <Text style={styles.callBarBtnTxt}>Call</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Input bar — always visible ── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your question…"
            placeholderTextColor="#aaa"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!loading}
            accessibilityLabel="Type your question"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendTxt}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAFD' },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#003366',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  restartBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  restartTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Message list
  listContent: { paddingTop: 14, paddingBottom: 10 },

  // Typing indicator
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
  },
  typingText: { fontSize: 13, color: '#666', fontStyle: 'italic' },

  // Persistent call bar
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A5C38',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#14482C',
  },
  callBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  callBarIcon: { fontSize: 20 },
  callBarLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  callBarNumber: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  callBarBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginLeft: 10,
  },
  callBarBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E4EAF0',
    backgroundColor: '#fff',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F0F4F8',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#1a1a1a',
  },
  sendBtn: {
    backgroundColor: '#003366',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#B8CCE4' },
  sendTxt: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
});
