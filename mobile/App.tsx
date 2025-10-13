import React, { useState, useEffect } from 'react';
import { View, Pressable, Text } from 'react-native';
import ScannerScreen from './src/screens/ScannerScreen';
import HistoryScreen from './src/screens/HistoryScreen';

export default function App() {
  const [tab, setTab] = useState<'scanner'|'history'>('scanner');

  useEffect(() => { console.log('APP_BOOT_MARKER', Date.now()); }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* stub banner so we can visually confirm render */}
      <View style={{ backgroundColor: '#FFF3CD', padding: 8 }}>
        <Text style={{ color: '#7A5C00' }}>Stub mode: Backend disabled (saves in-memory)</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'scanner' ? <ScannerScreen /> : <HistoryScreen />}
      </View>

      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#eee' }}>
        <Pressable onPress={() => setTab('scanner')} style={{ flex:1, padding:14, alignItems:'center', backgroundColor: tab==='scanner' ? '#e6f0ff' : 'white' }}>
          <Text style={{ fontWeight: tab==='scanner' ? '700' : '500' }}>Scanner</Text>
        </Pressable>
        <Pressable onPress={() => setTab('history')} style={{ flex:1, padding:14, alignItems:'center', backgroundColor: tab==='history' ? '#e6f0ff' : 'white' }}>
          <Text style={{ fontWeight: tab==='history' ? '700' : '500' }}>History</Text>
        </Pressable>
      </View>
    </View>
  );
}
