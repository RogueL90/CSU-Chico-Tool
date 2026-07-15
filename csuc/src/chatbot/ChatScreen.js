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
} from 'react-native';
import MessageBubble from './components/MessageBubble';

// ─── Placeholder data ────────────────────────────────────────────────────────
// Step 1 choices shown after any first input
const STEP1_CHOICES = [
  { id: 'a', label: 'Money, tuition, or financial aid' },
  { id: 'b', label: 'Classes, enrollment, or records' },
];

// The result shown after any step-2 input (hardcoded for testing)
const PLACEHOLDER_RESULT = {
  outputs: {
    text: 'The Financial Aid Office is in Kendall Hall, Room 200. Hours: Mon–Fri 8am–5pm.',
    phone: '5308986451',
    map: { label: 'Kendall Hall – Financial Aid', lat: 39.72848, lng: -121.84726 },
  },
  outputTypes: ['text', 'map'],
};

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

// ─── Flow states ──────────────────────────────────────────────────────────────
// 'idle'    → waiting for first input
// 'step1'   → showing 2 choice chips above input
// 'result'  → showing map + call output
const IDLE   = 'idle';
const STEP1  = 'step1';
const RESULT = 'result';

// ─── ChatScreen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const listRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [flowState, setFlowState] = useState(IDLE);
  const [persistentPhone, setPersistentPhone] = useState(null);

  const pushMessages = useCallback((newMsgs) => {
    setMessages((prev) => [...prev, ...newMsgs]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Greeting on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, []);

  // ── Advance to step 1 (show 2 chips) ─────────────────────────────────────
  const advanceToStep1 = useCallback((userText) => {
    const userMsg = { id: uid(), role: 'user', type: 'text', text: userText };
    const botMsg  = { id: uid(), role: 'bot',  type: 'text', text: 'Can you tell me a bit more?' };
    pushMessages([userMsg, botMsg]);
    setFlowState(STEP1);
  }, [pushMessages]);

  // ── Advance to result (show map + call) ───────────────────────────────────
  const advanceToResult = useCallback((userText) => {
    const userMsg = { id: uid(), role: 'user', type: 'text', text: userText };
    const resultMsg = {
      id: uid(),
      role: 'bot',
      type: 'result',
      text: "Here's what I found:",
      outputs: PLACEHOLDER_RESULT.outputs,
      outputTypes: PLACEHOLDER_RESULT.outputTypes,
    };
    setPersistentPhone({
      number: PLACEHOLDER_RESULT.outputs.phone,
      label: 'Financial Aid Office',
    });
    pushMessages([userMsg, resultMsg]);
    setFlowState(RESULT);
  }, [pushMessages]);

  // ── Handle bottom-bar send ────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    Keyboard.dismiss();
    setInputText('');

    if (flowState === IDLE || flowState === RESULT) {
      advanceToStep1(text);
    } else if (flowState === STEP1) {
      advanceToResult(text);
    }
  }, [inputText, flowState, advanceToStep1, advanceToResult]);

  // ── Handle chip press ────────────────────────────────────────────────────
  const handleChip = useCallback((choice) => {
    if (flowState === STEP1) {
      advanceToResult(choice.label);
    }
  }, [flowState, advanceToResult]);

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    _id = 0;
    setFlowState(IDLE);
    setPersistentPhone(null);
    setInputText('');
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const formattedPhone = persistentPhone?.number.replace(
    /(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'
  );

  // Placeholder text for the input changes based on state
  const inputPlaceholder =
    flowState === STEP1   ? 'Other…' :
    flowState === RESULT  ? 'Ask another question…' :
                            'Type your question…';

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

        {/* ── Step-1 choice chips — sit above input bar ── */}
        {flowState === STEP1 && (
          <View style={styles.chipsBar}>
            {STEP1_CHOICES.map((choice) => (
              <TouchableOpacity
                key={choice.id}
                style={styles.chip}
                onPress={() => handleChip(choice)}
                activeOpacity={0.78}
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
            placeholder={inputPlaceholder}
            placeholderTextColor="#aaa"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Type your question"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
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
  headerSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  restartBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  restartTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Message list
  listContent: { paddingTop: 14, paddingBottom: 10 },

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

  // Choice chips bar (sits between list and input)
  chipsBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E4EAF0',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: '#E8F0F8',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#B8CCE4',
    alignItems: 'center',
  },
  chipText: { fontSize: 14, color: '#003366', fontWeight: '600', textAlign: 'center' },

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
