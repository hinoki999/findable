import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ScannerScreen from "../screens/ScannerScreen";
import DeviceDetail from "../screens/DeviceDetail";

export type RootStackParamList = {
  Scanner: undefined;
  DeviceDetail: { name: string; rssi: number; distanceFeet: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Scanner"
            component={ScannerScreen}
            options={{ title: "Findable" }}
          />
          <Stack.Screen
            name="DeviceDetail"
            component={DeviceDetail}
            options={{ title: "Device Detail" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
