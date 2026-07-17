import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PhoneOutput from '../PhoneOutput';

/**
 * Place details inside the map bottom sheet (revealed on swipe up):
 * short summary, opening hours (tap to expand the week), and a call
 * button — the same PhoneOutput used for phone numbers in chat.
 *
 * Props:
 *   info  - { summary, phone, openNow, todayHours, weekdayHours } | null
 *   label - place name, used for the call button label
 */
export default function PlaceInfo({ info, label }) {
  const [showWeek, setShowWeek] = useState(false);
  if (!info) return null;

  const { summary, phone, openNow, todayHours, weekdayHours } = info;
  if (!summary && !phone && !todayHours) return null;

  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <View style={styles.container}>
      {!!summary && (
        <>
          <Text style={styles.heading}>About</Text>
          <Text style={styles.summary} numberOfLines={3}>
            {summary}
          </Text>
        </>
      )}

      {!!todayHours && (
        <>
          <Text style={styles.heading}>Hours</Text>
          <TouchableOpacity
            onPress={() => setShowWeek((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Toggle weekly hours"
          >
            <View style={styles.hoursRow}>
              {openNow != null && (
                <View
                  style={[styles.pill, openNow ? styles.pillOpen : styles.pillClosed]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      openNow ? styles.pillTextOpen : styles.pillTextClosed,
                    ]}
                  >
                    {openNow ? 'Open now' : 'Closed'}
                  </Text>
                </View>
              )}
              <Text style={styles.todayHours} numberOfLines={1}>
                {todayHours}
              </Text>
              <Text style={styles.chevron}>{showWeek ? '▾' : '▸'}</Text>
            </View>
            {showWeek &&
              weekdayHours?.map((line, i) => (
                <Text
                  key={i}
                  style={[styles.weekLine, i === todayIdx && styles.weekLineToday]}
                >
                  {line}
                </Text>
              ))}
          </TouchableOpacity>
        </>
      )}

      {!!phone && <PhoneOutput phoneNumber={phone} label={label} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 14,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F4',
  },
  heading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8A8A8E',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  summary: {
    fontSize: 14,
    color: '#2C2022',
    lineHeight: 20,
    marginBottom: 12,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillOpen: {
    backgroundColor: '#E6F6EB',
  },
  pillClosed: {
    backgroundColor: '#F2F2F4',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextOpen: {
    color: '#1E8E3E',
  },
  pillTextClosed: {
    color: '#8A8A8E',
  },
  todayHours: {
    flex: 1,
    fontSize: 14,
    color: '#2C2022',
  },
  chevron: {
    fontSize: 13,
    color: '#8A8A8E',
  },
  weekLine: {
    fontSize: 13,
    color: '#5A5A5E',
    lineHeight: 22,
  },
  weekLineToday: {
    fontWeight: '700',
    color: '#2C2022',
  },
});
