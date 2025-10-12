import React from "react";
import { RouteProp, useRoute } from "@react-navigation/native";
import { StyleSheet, Text, View } from "react-native";
import type { RootStackParamList } from "../navigation/AppNavigator";

type DetailRoute = RouteProp<RootStackParamList, "DeviceDetail">;

export default function DeviceDetail() {
  const route = useRoute<DetailRoute>();
  const { name, rssi, distanceFeet } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.item}>RSSI: {rssi} dBm</Text>
      <Text style={styles.item}>Approx. distance: {distanceFeet.toFixed(1)} ft</Text>
      <Text style={styles.hint}>Placeholder — real data will come from the BLE service later.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8, backgroundColor: "#FFF" },
  title: { fontSize: 22, fontWeight: "700" },
  item: { fontSize: 16 },
  hint: { marginTop: 12, color: "#666" },
});
