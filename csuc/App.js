import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { askKnowledgeBase } from './aws-bedrock/knowledgeBase';

export default function App() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer('');
    const response = await askKnowledgeBase(query);
    setAnswer(response?.output?.text ?? 'No answer received. Check the console for errors.');
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CSU Chico Knowledge Base</Text>
      <TextInput
        style={styles.input}
        placeholder="Ask a question..."
        value={query}
        onChangeText={setQuery}
      />
      <Button title="Ask" onPress={handleAsk} disabled={loading} />
      {loading && <ActivityIndicator style={styles.spinner} />}
      <ScrollView style={styles.answerBox}>
        <Text>{answer}</Text>
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  spinner: {
    marginTop: 16,
  },
  answerBox: {
    marginTop: 16,
    flex: 1,
  },
});
