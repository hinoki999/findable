import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DeviceList } from "../components/DeviceList";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Scanner">;

const MOCK = [
  { name: "Keys Beacon",  distanceFeet: 12.3, rssi: -62 },
  { name: "Wallet Tag",   distanceFeet: 32.8, rssi: -78 },
  { name: "Dog Collar",   distanceFeet:  8.9, rssi: -55 },
];

export default function ScannerScreen({ navigation }: Props) {
  const first = MOCK[0];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Devices</Text>
        <Text style={styles.subtitle}>Scanning (mock)</Text>
      </View>

      <View style={styles.body}>
        <DeviceList devices={MOCK} />
        <Pressable
          onPress={() =>
            navigation.navigate("DeviceDetail", {
              name: first.name,
              rssi: first.rssi,
              distanceFeet: first.distanceFeet,
            })
          }
          style={styles.button}
        >
          <Text style={styles.buttonText}>Open first device</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F7F8" },
  header: { padding: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 4, color: "#666" },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  button: {
    marginTop: 8,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
