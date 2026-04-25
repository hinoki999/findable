package com.hirule.mobile.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
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
                Log.d(TAG, "Already advertising - service will handle restart internally")
                // DO NOT call stopAdvertisingInternal() here!
                // That sends ACTION_STOP_ADVERTISE which calls stopSelf() and destroys the service.
                // The service's own startAdvertising() method handles stopping existing advertising
                // internally WITHOUT destroying the service.
            }

            // Start the foreground service - it handles all BLE advertising
            // If already advertising, the service will stop existing advertising internally
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
        Log.d(TAG, "stopAdvertising called (ghost mode - user explicitly disabled discoverability)")
        try {
            // User explicitly chose ghost mode from JS - use ghost mode stop
            // This sets isDiscoverable=false in SharedPreferences, preventing restart
            stopForegroundServiceGhostMode()
            
            synchronized(this) {
                isCurrentlyAdvertising = false
            }
            
            Log.d(TAG, "✅ Advertising stopped (ghost mode)")
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
            // Use ACTION_STOP_ADVERTISE for cleanup/app kill scenarios
            // This does NOT set isDiscoverable=false, allowing service to restart
            val intent = Intent(reactApplicationContext, BLEAdvertiserService::class.java).apply {
                action = BLEAdvertiserService.ACTION_STOP_ADVERTISE
            }
            reactApplicationContext.startService(intent)
            Log.d(TAG, "✅ Foreground service stop requested (preserves isDiscoverable)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop foreground service", e)
        }
    }

    private fun stopForegroundServiceGhostMode() {
        try {
            // Use ACTION_GHOST_MODE_STOP when user explicitly enables ghost mode
            // This sets isDiscoverable=false in SharedPreferences, preventing restart
            val intent = Intent(reactApplicationContext, BLEAdvertiserService::class.java).apply {
                action = BLEAdvertiserService.ACTION_GHOST_MODE_STOP
            }
            reactApplicationContext.startService(intent)
            Log.d(TAG, "✅ Foreground service ghost mode stop requested (sets isDiscoverable=false)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop foreground service (ghost mode)", e)
        }
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        Log.d(TAG, "requestBatteryOptimizationExemption called")
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (powerManager == null) {
                Log.e(TAG, "PowerManager is null")
                promise.reject("POWER_ERROR", "PowerManager not available")
                return
            }

            val packageName = reactApplicationContext.packageName
            val isExempted = powerManager.isIgnoringBatteryOptimizations(packageName)
            Log.d(TAG, "Battery optimization exemption status: $isExempted")

            if (isExempted) {
                Log.d(TAG, "Already exempted from battery optimization")
                val result = Arguments.createMap().apply {
                    putBoolean("alreadyExempted", true)
                    putBoolean("prompted", false)
                }
                promise.resolve(result)
                return
            }

            // Open system settings to request exemption
            Log.d(TAG, "Opening battery optimization settings for package: $packageName")
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)

            val result = Arguments.createMap().apply {
                putBoolean("alreadyExempted", false)
                putBoolean("prompted", true)
            }
            promise.resolve(result)

        } catch (e: Exception) {
            Log.e(TAG, "Error requesting battery optimization exemption", e)
            promise.reject("BATTERY_ERROR", "Failed to request battery optimization exemption: ${e.message}")
        }
    }

    @ReactMethod
    fun isBatteryOptimizationExempted(promise: Promise) {
        Log.d(TAG, "isBatteryOptimizationExempted called")
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (powerManager == null) {
                promise.resolve(false)
                return
            }

            val packageName = reactApplicationContext.packageName
            val isExempted = powerManager.isIgnoringBatteryOptimizations(packageName)
            Log.d(TAG, "Battery optimization exemption status: $isExempted")
            promise.resolve(isExempted)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking battery optimization status", e)
            promise.resolve(false)
        }
    }

    // Cleanup when React Native is destroyed
    // Do NOT send stop intent - native BLEAdvertiserService handles its own lifecycle
    // with START_STICKY and SharedPreferences. Sending stop here would incorrectly
    // stop the service when the app is killed, preventing restart.
    override fun invalidate() {
        super.invalidate()
        synchronized(this) {
            isCurrentlyAdvertising = false
        }
        Log.d(TAG, "invalidate() called - reset isCurrentlyAdvertising, service continues independently")
    }
}
