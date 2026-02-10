import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Button } from 'react-native';

export default function CrashLogScreen() {
  const [logs, setLogs] = useState('Loading...');

  useEffect(() => {
    setLogs('Crash logging disabled on HomeScreen.');
  }, []);

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: 'white' }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
        Crash Logs:
      </Text>
      <Text style={{ fontSize: 12, marginBottom: 20 }}>
        {logs}
      </Text>
    </ScrollView>
  );
}


