import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { getDevices, Device } from '../services/api';

export default function HistoryScreen() {
  const [data, setData] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const items = await getDevices();
        setData(items ?? []);
      } catch (e:any) {
        setErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (err) return <Text style={{ margin: 16, color: 'crimson' }}>{err}</Text>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Saved Devices</Text>
      <FlatList
        data={data}
        keyExtractor={(item, i) => String(item.id ?? i)}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.name}</Text>
            <Text>RSSI: {item.rssi} • Distance: {item.distanceFeet} ft</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No devices yet. Tap Save on Scanner.</Text>}
      />
    </View>
  );
}
