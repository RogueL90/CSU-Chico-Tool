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
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Constants from 'expo-constants';
import MessageBubble from './components/MessageBubble';
import { getCurrentLocation } from '../../maps-api/location';

// ─── Constants ───────────────────────────────────────────────────────────────
// Backend URL resolution:
// 1. EXPO_PUBLIC_BACKEND_URL in .env (required when using tunnel mode)
// 2. The host the app bundle was served from (your Mac's LAN IP) on port 8000
// 3. localhost (works on simulators only)
function resolveBackendUrl() {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host && !host.includes('exp.direct')) {
    return `http://${host}:8000`;
  }
  return 'http://localhost:8000';
}
const BACKEND_URL = resolveBackendUrl();
const GREETING = "I'm Willie, and I'm here to help you find the right campus office or service and point you in the right direction.";
const STARTER_QUESTIONS = ['Add/drop date', 'Advising', 'Dining hall'];

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const ACCESSORY_TRANSITION = {
  duration: 220,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

function animateAccessoryTransition() {
  LayoutAnimation.configureNext(ACCESSORY_TRANSITION);
}

function ScalePressable({ style, children, onPress, onPressIn, onPressOut, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue, spring = false) => {
    const config = { toValue, useNativeDriver: true };
    (spring
      ? Animated.spring(scale, { ...config, speed: 28, bounciness: 4 })
      : Animated.timing(scale, { ...config, duration: 90, easing: Easing.out(Easing.quad) })
    ).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        {...props}
        style={style}
        onPress={onPress}
        onPressIn={(event) => { animate(0.97); onPressIn?.(event); }}
        onPressOut={(event) => { animate(1, true); onPressOut?.(event); }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function TypingIndicator() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = dots.map((dot, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 120),
      Animated.timing(dot, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay((2 - index) * 120 + 180),
    ])));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingAvatar}><Text style={styles.typingPaw}>🐾</Text></View>
      <View style={styles.typingBubble} accessibilityLabel="Willie is thinking">
        {dots.map((dot, index) => (
          <Animated.View
            key={index}
            style={[styles.typingDot, {
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
            }]}
          />
        ))}
      </View>
    </View>
  );
}

function AnimatedChoice({ choice, index, selected, onPress, disabled }) {
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      delay: index * 50,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, index]);

  return (
    <Animated.View style={[styles.choiceWrap, {
      opacity: entrance,
      transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }]}>
      <ScalePressable
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={choice.label}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{choice.label}</Text>
      </ScalePressable>
    </Animated.View>
  );
}

function FloatingCallCard({ phone, onCall }) {
  const [displayedPhone, setDisplayedPhone] = useState(phone);
  const [buttonPressed, setButtonPressed] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.spring(entrance, {
      toValue: 1,
      speed: 20,
      bounciness: 3,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    if (phone?.number === displayedPhone?.number) return;

    if (!displayedPhone && phone) {
      setDisplayedPhone(phone);
      entrance.setValue(0);
      requestAnimationFrame(animateIn);
      return;
    }

    Animated.timing(entrance, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setDisplayedPhone(phone);
      if (phone) requestAnimationFrame(animateIn);
    });
  }, [phone, displayedPhone, entrance, animateIn]);

  if (!displayedPhone) return null;

  const formattedPhone = displayedPhone.number.replace(
    /(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'
  );

  return (
    <Animated.View style={[styles.callCardWrap, {
      opacity: entrance,
      transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    }]}>
      <ScalePressable
        style={styles.callBar}
        onPress={() => onCall(displayedPhone.number)}
        onPressIn={() => setButtonPressed(true)}
        onPressOut={() => setButtonPressed(false)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Call ${displayedPhone.label}`}
      >
        <View style={styles.callBarLeft}>
          <View>
            <Text style={styles.callBarLabel}>Call {displayedPhone.label}</Text>
            <Text style={styles.callBarNumber}>{formattedPhone}</Text>
          </View>
        </View>
        <View style={[styles.callBarBtn, buttonPressed && styles.callBarBtnPressed]}>
          <Text style={styles.callBarBtnTxt}>Call</Text>
        </View>
      </ScalePressable>
    </Animated.View>
  );
}

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
async function askBackend(query, conversationHistory = [], userLocation = null) {
  const response = await fetch(`${BACKEND_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      conversation_history: conversationHistory,
      user_location: userLocation,
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
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const welcomeAnim = useRef(new Animated.Value(1)).current;
  const sendEnabledAnim = useRef(new Animated.Value(0)).current;
  const restartAnim = useRef(new Animated.Value(0)).current;
  const composerHeight = useRef(new Animated.Value(40)).current;
  const conversationRef = useRef([]);
  const locationRef = useRef(null);

  const pushMessages = useCallback((newMsgs) => {
    setMessages((prev) => [...prev, ...newMsgs]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Greeting on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, []);

  useEffect(() => {
    Animated.spring(sendEnabledAnim, {
      toValue: inputText.trim() && !loading ? 1 : 0,
      speed: 26,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  }, [inputText, loading, sendEnabledAnim]);

  const dismissWelcome = useCallback(() => {
    if (!showWelcome) return;
    Animated.parallel([
      Animated.timing(welcomeAnim, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setShowWelcome(false);
      // Removing a large FlatList header changes the scroll offset. Correct it
      // after React commits the removal so the first user message remains in
      // view above Willie's typing indicator.
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      });
    });
  }, [showWelcome, welcomeAnim]);

  // ── Request location permission early and warm the GPS fix ────────────────
  useEffect(() => {
    getCurrentLocation().then((loc) => {
      locationRef.current = loc;
    });
  }, []);

  // ── Process structured backend response ───────────────────────────────────
  const handleBackendResponse = useCallback((data) => {
    animateAccessoryTransition();

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
    dismissWelcome();
    const userMsg = { id: uid(), role: 'user', type: 'text', text: userText };
    pushMessages([userMsg]);
    if (followUpChoices) animateAccessoryTransition();
    setFollowUpChoices(null);
    setLoading(true);

    // Track conversation for context
    conversationRef.current.push({ role: 'user', text: userText });

    try {
      // Refresh location (fast: last-known fix) so proximity questions work
      const location = await getCurrentLocation();
      if (location) locationRef.current = location;

      const data = await askBackend(userText, conversationRef.current, locationRef.current);

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
  }, [pushMessages, handleBackendResponse, followUpChoices, dismissWelcome]);

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
    setSelectedChoiceId(choice.id);
    setTimeout(() => {
      animateAccessoryTransition();
      setFollowUpChoices(null);
      setSelectedChoiceId(null);
      sendQuery(choice.label);
    }, 130);
  }, [loading, sendQuery]);

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    restartAnim.setValue(0);
    Animated.timing(restartAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    _id = 0;
    animateAccessoryTransition();
    setPersistentPhone(null);
    setFollowUpChoices(null);
    setInputText('');
    setLoading(false);
    composerHeight.setValue(40);
    setShowWelcome(true);
    welcomeAnim.setValue(1);
    conversationRef.current = [];
    setMessages([{ id: uid(), role: 'bot', type: 'text', text: GREETING }]);
  }, [welcomeAnim, restartAnim, composerHeight]);

  const handleComposerSizeChange = useCallback((event) => {
    const nextHeight = Math.min(96, Math.max(40, event.nativeEvent.contentSize.height + 2));
    Animated.timing(composerHeight, {
      toValue: nextHeight,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [composerHeight]);

  // ── Render ────────────────────────────────────────────────────────────────
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
        <Animated.View style={{
          transform: [{ rotate: restartAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '300deg'] }) }],
        }}>
          <TouchableOpacity
            style={styles.restartBtn}
            onPress={handleRestart}
            accessibilityRole="button"
            accessibilityLabel="Start over"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.restartTxt}>↺</Text>
          </TouchableOpacity>
        </Animated.View>
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
          ListHeaderComponent={showWelcome ? (
            <Animated.View style={[styles.welcomeCard, {
              opacity: welcomeAnim,
              transform: [
                { scale: welcomeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                { translateY: welcomeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
              ],
            }]}>
              <View style={styles.cardHeadingRow}>
                <Text style={styles.cardTitle}>Your Helper Willie</Text>
              </View>
              <Text style={styles.cardBody}>
                Try a starter question or type your own. Willie is ready to help you find your way around Chico State.
              </Text>
              <View style={styles.starterRow}>
                {STARTER_QUESTIONS.map((question) => (
                  <ScalePressable
                    key={question}
                    style={styles.starterChip}
                    onPress={() => sendQuery(question)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask Willie about ${question}`}
                  >
                    <Text style={styles.starterChipText}>{question}</Text>
                  </ScalePressable>
                ))}
              </View>
            </Animated.View>
          ) : null}
          ListFooterComponent={loading ? <TypingIndicator /> : null}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {/* ── Persistent call bar ── */}
        <FloatingCallCard phone={persistentPhone} onCall={dialNumber} />

        {/* ── Follow-up choice chips (confidence < 80) ── */}
        {followUpChoices && (
          <View style={styles.chipsBar}>
            {followUpChoices.map((choice) => (
              <AnimatedChoice
                key={choice.id}
                choice={choice}
                index={followUpChoices.indexOf(choice)}
                selected={selectedChoiceId === choice.id}
                onPress={() => handleChip(choice)}
                disabled={loading}
              />
            ))}
          </View>
        )}

        {/* ── Input bar — always visible ── */}
        <View style={styles.inputBar}>
          <Animated.View style={[styles.inputWrap, { height: composerHeight }]}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            onContentSizeChange={handleComposerSizeChange}
            placeholder={followUpChoices ? 'Other…' : 'Call Willie for help…'}
            placeholderTextColor="#8D7C7F"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline
            submitBehavior="submit"
            textAlignVertical="center"
            editable={!loading}
            accessibilityLabel="Type your question"
          />
          </Animated.View>
          <ScalePressable
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Animated.Text style={[styles.sendTxt, {
                opacity: sendEnabledAnim,
                transform: [{ scale: sendEnabledAnim.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }],
              }]}>↑</Animated.Text>
            )}
          </ScalePressable>
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
    backgroundColor: '#C8102E',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  brandPaw: { fontSize: 21 },
  eyebrow: { color: '#FFE6E6', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  restartBtn: {
    padding: 4,
  },
  restartTxt: { color: '#fff', fontSize: 21, fontWeight: '600' },

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
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  typingAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0DDDE', alignItems: 'center', justifyContent: 'center' },
  typingPaw: { fontSize: 14 },
  typingBubble: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0DDDE', borderRadius: 17, borderBottomLeftRadius: 5 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C8102E' },

  // Floating persistent call card
  callCardWrap: { marginHorizontal: 12, marginBottom: 4, shadowColor: '#4A0010', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#C8102E',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#A90D27',
  },
  callBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  callBarLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  callBarNumber: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 1 },
  callBarBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginLeft: 10,
  },
  callBarBtnPressed: { backgroundColor: '#FFE5E9' },
  callBarBtnTxt: { color: '#C8102E', fontSize: 13, fontWeight: '800' },

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
  choiceWrap: { flex: 1 },
  chip: {
    width: '100%',
    backgroundColor: '#FFF0F1',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#F3C6CC',
    alignItems: 'center',
  },
  chipText: { fontSize: 13, color: '#8B0A22', fontWeight: '600', textAlign: 'center' },
  chipSelected: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  chipTextSelected: { color: '#fff' },

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
  inputWrap: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8D8D8',
    borderRadius: 22,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
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
  sendTxt: { color: '#fff', fontSize: 24, lineHeight: 26, fontWeight: '700' },
});
