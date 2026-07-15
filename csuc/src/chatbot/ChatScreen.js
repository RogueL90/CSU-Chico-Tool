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

// ─── Constants ───────────────────────────────────────────────────────────────
const BACKEND_URL = 'http://localhost:8000';
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
 * Call the Strands backend /ask endpoint.
 */
async function askBackend(query, conversationHistory = []) {
  const response = await fetch(`${BACKEND_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      conversation_history: conversationHistory,
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  return response.json();
}

// ─── ChatScreen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const listRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [persistentPhone, setPersistentPhone] = useState(null);
  const [followUpChoices, setFollowUpChoices] = useState(null);
  const conversationRef = useRef([]);

  const pushMessages = useCallback((newMsgs) => {
    setMessages((prev) => [...prev, ...newMsgs]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Greeting on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, []);

  // ── Process structured backend response ───────────────────────────────────
  const handleBackendResponse = useCallback((data) => {
    // Clear any existing follow-up choices
    setFollowUpChoices(null);

    // Phone → persistent bar
    if (data.phone && data.output_types.includes('phone')) {
      setPersistentPhone({ number: data.phone, label: 'Suggested Contact' });
    }

    // If low confidence → show follow-up choices
    if (data.confidence < 80 && data.follow_up_choices) {
      // Show partial text if available
      if (data.text) {
        pushMessages([{
          id: uid(),
          role: 'bot',
          type: 'text',
          text: data.follow_up_question || data.text,
        }]);
      } else if (data.follow_up_question) {
        pushMessages([{
          id: uid(),
          role: 'bot',
          type: 'text',
          text: data.follow_up_question,
        }]);
      }
      setFollowUpChoices(data.follow_up_choices);
      return;
    }

    // High confidence → render full result
    const resultMsg = {
      id: uid(),
      role: 'bot',
      type: 'result',
      text: null,
      outputs: {
        text: data.text,
        map: data.map,
      },
      outputTypes: data.output_types.filter((t) => t !== 'phone'),
    };
    pushMessages([resultMsg]);
  }, [pushMessages]);

  // ── Send a message to the backend ─────────────────────────────────────────
  const sendQuery = useCallback(async (userText) => {
    const userMsg = { id: uid(), role: 'user', type: 'text', text: userText };
    pushMessages([userMsg]);
    setFollowUpChoices(null);
    setLoading(true);

    // Track conversation for context
    conversationRef.current.push({ role: 'user', text: userText });

    try {
      const data = await askBackend(userText, conversationRef.current);

      // Track bot response in conversation
      if (data.text) {
        conversationRef.current.push({ role: 'bot', text: data.text });
      }

      handleBackendResponse(data);
    } catch (error) {
      console.error('Backend query failed:', error);
      pushMessages([{
        id: uid(),
        role: 'bot',
        type: 'text',
        text: "Sorry, I had trouble connecting. Please try again in a moment.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [pushMessages, handleBackendResponse]);

  // ── Handle bottom-bar send ────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || loading) return;
    Keyboard.dismiss();
    setInputText('');
    sendQuery(text);
  }, [inputText, loading, sendQuery]);

  // ── Handle follow-up chip press ───────────────────────────────────────────
  const handleChip = useCallback((choice) => {
    if (loading) return;
    setFollowUpChoices(null);
    sendQuery(choice.label);
  }, [loading, sendQuery]);

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    _id = 0;
    setPersistentPhone(null);
    setFollowUpChoices(null);
    setInputText('');
    setLoading(false);
    conversationRef.current = [];
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
                    onPress={() => sendQuery(question)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask Willie about ${question}`}
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

        {/* ── Follow-up choice chips (confidence < 80) ── */}
        {followUpChoices && (
          <View style={styles.chipsBar}>
            {followUpChoices.map((choice) => (
              <TouchableOpacity
                key={choice.id}
                style={styles.chip}
                onPress={() => handleChip(choice)}
                activeOpacity={0.78}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
              >
                <Text style={styles.chipText}>{choice.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Input bar — always visible ── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={followUpChoices ? 'Other…' : 'Call Willie for help…'}
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

  // Follow-up choice chips
  chipsBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0DCDD',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: '#FFF0F1',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#F3C6CC',
    alignItems: 'center',
  },
  chipText: { fontSize: 13, color: '#8B0A22', fontWeight: '600', textAlign: 'center' },

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
