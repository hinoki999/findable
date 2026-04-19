package com.hirule.mobile.ble

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray

class BLEScannerModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        private const val TAG = "BLEScannerModule"
        private const val EVENT_DEVICE_FOUND = "BLEBackgroundDeviceFound"
        private const val EVENT_DEVICES_UPDATED = "BLEBackgroundDevicesUpdated"
    }

    private var deviceFoundReceiver: BroadcastReceiver? = null
    private var devicesUpdatedReceiver: BroadcastReceiver? = null
    private var listenerCount = 0

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "BLEScannerModule"

    @ReactMethod
    fun startBackgroundScan(promise: Promise) {
        Log.d(TAG, "startBackgroundScan called")
        try {
            val intent = Intent(reactApplicationContext, BLEScannerService::class.java).apply {
                action = BLEScannerService.ACTION_START_SCAN
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            
            registerReceivers()
            Log.d(TAG, "✅ Background scan service started")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start background scan", e)
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopBackgroundScan(promise: Promise) {
        Log.d(TAG, "stopBackgroundScan called")
        try {
            val intent = Intent(reactApplicationContext, BLEScannerService::class.java).apply {
                action = BLEScannerService.ACTION_STOP_SCAN
            }
            reactApplicationContext.startService(intent)
            unregisterReceivers()
            Log.d(TAG, "✅ Background scan service stopped")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop background scan", e)
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        // Simple check - if we can get devices, service is likely running
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                BLEScannerService.PREFS_NAME, 
                Context.MODE_PRIVATE
            )
            val hasData = prefs.contains(BLEScannerService.KEY_DEVICES)
            promise.resolve(hasData)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getDetectedDevices(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                BLEScannerService.PREFS_NAME, 
                Context.MODE_PRIVATE
            )
            val devicesJson = prefs.getString(BLEScannerService.KEY_DEVICES, "[]")
            val jsonArray = JSONArray(devicesJson)
            
            val devicesArray = Arguments.createArray()
            for (i in 0 until jsonArray.length()) {
                val json = jsonArray.getJSONObject(i)
                val device = Arguments.createMap().apply {
                    putString("id", json.getString("id"))
                    putString("deviceId", json.optString("deviceId", ""))
                    putString("name", json.getString("name"))
                    putInt("rssi", json.getInt("rssi"))
                    putDouble("distanceFeet", json.getDouble("distanceFeet"))
                    putDouble("lastSeen", json.getDouble("lastSeen"))
                }
                devicesArray.pushMap(device)
            }
            
            Log.d(TAG, "getDetectedDevices: returning ${jsonArray.length()} devices")
            promise.resolve(devicesArray)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get detected devices", e)
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearDetectedDevices(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                BLEScannerService.PREFS_NAME, 
                Context.MODE_PRIVATE
            )
            prefs.edit().remove(BLEScannerService.KEY_DEVICES).apply()
            Log.d(TAG, "Cleared detected devices")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear devices", e)
            promise.reject("BLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
        if (listenerCount == 1) {
            registerReceivers()
        }
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount -= count
        if (listenerCount <= 0) {
            listenerCount = 0
            // Don't unregister - we want to keep receiving events
        }
    }

    private fun registerReceivers() {
        if (deviceFoundReceiver != null) return

        Log.d(TAG, "Registering broadcast receivers")

        // Device found receiver
        deviceFoundReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == BLEScannerService.ACTION_DEVICE_FOUND) {
                    val params = Arguments.createMap().apply {
                        putString("id", intent.getStringExtra("id"))
                        putString("deviceId", intent.getStringExtra("deviceId"))
                        putString("name", intent.getStringExtra("name"))
                        putInt("rssi", intent.getIntExtra("rssi", 0))
                        putDouble("distanceFeet", intent.getFloatExtra("distanceFeet", 0f).toDouble())
                    }
                    
                    sendEvent(EVENT_DEVICE_FOUND, params)
                }
            }
        }

        // Devices updated receiver (when stale devices are removed)
        devicesUpdatedReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == BLEScannerService.ACTION_DEVICES_UPDATED) {
                    sendEvent(EVENT_DEVICES_UPDATED, Arguments.createMap())
                }
            }
        }

        try {
            val deviceFilter = IntentFilter(BLEScannerService.ACTION_DEVICE_FOUND)
            val updateFilter = IntentFilter(BLEScannerService.ACTION_DEVICES_UPDATED)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactApplicationContext.registerReceiver(deviceFoundReceiver, deviceFilter, Context.RECEIVER_NOT_EXPORTED)
                reactApplicationContext.registerReceiver(devicesUpdatedReceiver, updateFilter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactApplicationContext.registerReceiver(deviceFoundReceiver, deviceFilter)
                reactApplicationContext.registerReceiver(devicesUpdatedReceiver, updateFilter)
            }
            Log.d(TAG, "Broadcast receivers registered")
        } catch (e: Exception) {
            Log.e(TAG, "Error registering receivers", e)
        }
    }

    private fun unregisterReceivers() {
        try {
            deviceFoundReceiver?.let {
                reactApplicationContext.unregisterReceiver(it)
            }
            devicesUpdatedReceiver?.let {
                reactApplicationContext.unregisterReceiver(it)
            }
            Log.d(TAG, "Broadcast receivers unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering receivers", e)
        }
        deviceFoundReceiver = null
        devicesUpdatedReceiver = null
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending event $eventName", e)
        }
    }

    // Lifecycle events
    override fun onHostResume() {
        Log.d(TAG, "onHostResume - registering receivers")
        registerReceivers()
    }

    override fun onHostPause() {
        Log.d(TAG, "onHostPause - keeping receivers registered for background updates")
        // Keep receivers registered to receive updates while app is backgrounded
    }

    override fun onHostDestroy() {
        Log.d(TAG, "onHostDestroy - unregistering receivers")
        unregisterReceivers()
    }

    override fun invalidate() {
        super.invalidate()
        unregisterReceivers()
    }
}
