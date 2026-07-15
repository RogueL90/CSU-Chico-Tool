import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Keyboard,
} from 'react-native';

/**
 * Renders 2 choice chip buttons + an "Other…" option that expands
 * into a free-text input.
 *
 * Props:
 *   choices  - array of { label, nextId, boostIntentIds }
 *   onSelect - fn({ type: 'choice', choice } | { type: 'other', text })
 *   disabled - bool, locks chips after a selection is made
 */
export default function ChoiceChips({ choices, onSelect, disabled = false }) {
  const [otherVisible, setOtherVisible] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [selected, setSelected] = useState(null);

  const handleChip = (choice, index) => {
    if (disabled || selected !== null) return;
    setSelected(index);
    onSelect({ type: 'choice', choice });
  };

  const handleOtherSubmit = () => {
    if (!otherText.trim() || disabled) return;
    Keyboard.dismiss();
    setSelected('other');
    onSelect({ type: 'other', text: otherText.trim() });
    setOtherText('');
    setOtherVisible(false);
  };

  return (
    <View style={styles.container}>
      {choices.map((choice, i) => {
        const isSelected = selected === i;
        return (
          <TouchableOpacity
            key={i}
            style={[
              styles.chip,
              isSelected && styles.chipSelected,
              disabled && selected !== i && styles.chipDimmed,
            ]}
            onPress={() => handleChip(choice, i)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
              ]}
            >
              {choice.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Other option */}
      {selected === null && !disabled && (
        <>
          {!otherVisible ? (
            <TouchableOpacity
              style={[styles.chip, styles.otherChip]}
              onPress={() => setOtherVisible(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Other — type your own answer"
            >
              <Text style={[styles.chipText, styles.otherChipText]}>
                Other…
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.otherRow}>
              <TextInput
                style={styles.otherInput}
                placeholder="Type your question…"
                placeholderTextColor="#aaa"
                value={otherText}
                onChangeText={setOtherText}
                onSubmitEditing={handleOtherSubmit}
                returnKeyType="send"
                autoFocus
                accessibilityLabel="Type your own answer"
              />
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={handleOtherSubmit}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Text style={styles.sendTxt}>↑</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {selected === 'other' && (
        <View style={[styles.chip, styles.chipSelected]}>
          <Text style={styles.chipTextSelected}>{otherText || 'Other'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    gap: 8,
  },
  chip: {
    backgroundColor: '#E8F0F8',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#B8CCE4',
    alignSelf: 'flex-start',
  },
  chipSelected: {
    backgroundColor: '#003366',
    borderColor: '#003366',
  },
  chipDimmed: {
    opacity: 0.35,
  },
  chipText: {
    fontSize: 14,
    color: '#003366',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
  },
  otherChip: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ccc',
  },
  otherChipText: {
    color: '#666',
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#B8CCE4',
    paddingHorizontal: 14,
    paddingVertical: 2,
    alignSelf: 'stretch',
  },
  otherInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    paddingVertical: 8,
  },
  sendBtn: {
    backgroundColor: '#003366',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  sendTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
