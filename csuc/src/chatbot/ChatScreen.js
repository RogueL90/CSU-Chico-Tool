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
const GREETING = "I'm Willie, and I'm here to help you find the right campus office or service and point you in the right direction.";
const STARTER_QUESTIONS = ['Add/drop date', 'Advising', 'Dining hours'];

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
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandPaw}>🐾</Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>CHICO STATE</Text>
            <Text style={styles.headerTitle}>Call Willie</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.restartBtn}
            onPress={handleRestart}
            accessibilityRole="button"
            accessibilityLabel="Start over"
          >
            <Text style={styles.restartTxt}>↺</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          A campus chatbot for quick answers, student services, and Wildcat life.
        </Text>
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
          ListHeaderComponent={(
            <View style={styles.welcomeCard}>
              <View style={styles.cardHeadingRow}>
                <Text style={styles.cardTitle}>Your Helper Willie</Text>
              </View>
              <Text style={styles.cardBody}>
                Try a starter question or type your own. Willie is ready to help you find your way around Chico State.
              </Text>
              <View style={styles.starterRow}>
                {STARTER_QUESTIONS.map((question) => (
                  <TouchableOpacity
                    key={question}
                    style={styles.starterChip}
                    onPress={() => sendToBedrock(question)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`Call Willie about ${question}`}
                  >
                    <Text style={styles.starterChipText}>{question}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {/* ── Typing indicator ── */}
        {loading && (
          <View style={styles.typingBar}>
            <ActivityIndicator size="small" color="#C8102E" />
            <Text style={styles.typingText}>Willie is thinking…</Text>
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
            placeholder="Call Willie for help…"
            placeholderTextColor="#8D7C7F"
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
            <Text style={styles.sendTxt}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF7F3' },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    backgroundColor: '#C8102E',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  brandPaw: { fontSize: 23 },
  eyebrow: { color: '#FFE6E6', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  headerTitle: { color: '#fff', fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { width: '100%', color: '#fff', fontSize: 14, lineHeight: 20, marginTop: 14, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  restartBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restartTxt: { color: '#fff', fontSize: 19, fontWeight: '700' },

  // Message list
  listContent: { paddingTop: 18, paddingBottom: 10 },
  welcomeCard: { marginHorizontal: 16, marginBottom: 16, padding: 17, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1D7D8' },
  cardHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { color: '#7A0019', fontSize: 18, fontWeight: '800', flex: 1 },
  cardBody: { color: '#65575A', fontSize: 13, lineHeight: 19, marginTop: 8 },
  starterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  starterChip: { backgroundColor: '#FFF0F1', borderWidth: 1, borderColor: '#F3C6CC', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  starterChipText: { color: '#8B0A22', fontSize: 12, fontWeight: '700' },

  // Typing indicator
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
  },
  typingText: { fontSize: 13, color: '#725E62', fontStyle: 'italic' },

  // Persistent call bar
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#7A0019',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#5B0013',
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
    borderTopColor: '#F0DCDD',
    backgroundColor: '#FFF9F6',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8D8D8',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#2C2022',
  },
  sendBtn: {
    backgroundColor: '#C8102E',
    minWidth: 58,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D9AEB5' },
  sendTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
