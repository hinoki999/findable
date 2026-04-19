package com.hirule.mobile.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BLEAdvertiserNative(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BLEAdvertiserNative"
    }

    private val bluetoothManager: BluetoothManager? by lazy {
        reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    }

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        bluetoothManager?.adapter
    }

    @Volatile
    private var isCurrentlyAdvertising = false

    override fun getName(): String = "BLEAdvertiserNative"

    @ReactMethod
    fun startAdvertising(serviceUUID: String, deviceId: String, promise: Promise) {
        Log.d(TAG, "startAdvertising called with serviceUUID: $serviceUUID, deviceId: $deviceId")

        try {
            val adapter = bluetoothAdapter
            if (adapter == null) {
                Log.e(TAG, "Bluetooth adapter is null")
                promise.reject("BLE_ERROR", "Bluetooth is not available on this device")
                return
            }

            if (!adapter.isEnabled) {
                Log.e(TAG, "Bluetooth is not enabled")
                promise.reject("BLE_ERROR", "Bluetooth is not enabled")
                return
            }

            if (isCurrentlyAdvertising) {
                Log.d(TAG, "Already advertising, stopping first...")
                stopAdvertisingInternal()
            }

            // Start the foreground service - it handles all BLE advertising
            startForegroundService(serviceUUID, deviceId)

            synchronized(this) {
                isCurrentlyAdvertising = true
            }

            Log.d(TAG, "✅ Advertising setup complete")
            Log.d(TAG, "Broadcasting with deviceId: $deviceId")
            Log.d(TAG, "Service UUID: $serviceUUID")

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("serviceUUID", serviceUUID)
                putString("deviceId", deviceId)
            }
            promise.resolve(result)

        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception - missing Bluetooth permissions", e)
            promise.reject("BLE_ERROR", "Bluetooth permissions not granted")
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error starting advertising", e)
            promise.reject("BLE_ERROR", "Failed to start advertising: ${e.message}")
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        Log.d(TAG, "stopAdvertising called")
        try {
            stopAdvertisingInternal()
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping advertising", e)
            promise.reject("BLE_ERROR", "Failed to stop advertising: ${e.message}")
        }
    }

    @ReactMethod
    fun isAdvertising(promise: Promise) {
        promise.resolve(isCurrentlyAdvertising)
    }

    private fun stopAdvertisingInternal() {
        Log.d(TAG, "stopAdvertisingInternal called, isCurrentlyAdvertising: $isCurrentlyAdvertising")
        
        // Stop the foreground service - it handles stopping BLE advertising
        stopForegroundServiceInternal()
        
        synchronized(this) {
            isCurrentlyAdvertising = false
        }
        
        Log.d(TAG, "✅ Advertising stopped")
    }

    private fun startForegroundService(serviceUUID: String, deviceId: String) {
        try {
            val intent = Intent(reactApplicationContext, BLEAdvertiserService::class.java).apply {
                action = BLEAdvertiserService.ACTION_START_ADVERTISE
                putExtra(BLEAdvertiserService.EXTRA_SERVICE_UUID, serviceUUID)
                putExtra(BLEAdvertiserService.EXTRA_DEVICE_ID, deviceId)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            Log.d(TAG, "✅ Foreground service started for advertising")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service", e)
        }
    }

    private fun stopForegroundServiceInternal() {
        try {
            val intent = Intent(reactApplicationContext, BLEAdvertiserService::class.java).apply {
                action = BLEAdvertiserService.ACTION_STOP_ADVERTISE
            }
            reactApplicationContext.startService(intent)
            Log.d(TAG, "✅ Foreground service stop requested")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop foreground service", e)
        }
    }

    // Cleanup when React Native is destroyed
    override fun invalidate() {
        super.invalidate()
        stopAdvertisingInternal()
    }
}
