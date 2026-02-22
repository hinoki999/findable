package com.hirule.mobile.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.UUID

class BLEAdvertiserNative(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BLEAdvertiserNative"
        private const val DROPLINK_PREFIX = "DL-"
    }

    private val bluetoothManager: BluetoothManager? by lazy {
        reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    }

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        bluetoothManager?.adapter
    }

    private val bluetoothLeAdvertiser: BluetoothLeAdvertiser? by lazy {
        bluetoothAdapter?.bluetoothLeAdvertiser
    }

    @Volatile
    private var isCurrentlyAdvertising = false

    private var originalBluetoothName: String? = null
    private var currentDeviceId: String? = null
    private var currentServiceUUID: String? = null
    private var advertiseCallback: AdvertiseCallback? = null

    // Bluetooth state change receiver
    private var bluetoothStateReceiver: BroadcastReceiver? = null

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

            val advertiser = bluetoothLeAdvertiser
            if (advertiser == null) {
                Log.e(TAG, "BLE Advertiser is null - device may not support BLE advertising")
                promise.reject("BLE_ERROR", "BLE advertising is not supported on this device")
                return
            }

            if (isCurrentlyAdvertising) {
                Log.d(TAG, "Already advertising, stopping first...")
                stopAdvertisingInternal()
            }

            // Store original Bluetooth name before changing it
            originalBluetoothName = adapter.name
            Log.d(TAG, "Original Bluetooth name: $originalBluetoothName")

            // Set Bluetooth adapter name to "DL-{deviceId}" for broadcasting
            val newName = "$DROPLINK_PREFIX$deviceId"
            val nameSet = adapter.setName(newName)
            Log.d(TAG, "Set Bluetooth name to '$newName': $nameSet")

            // Store current advertising parameters
            currentDeviceId = deviceId
            currentServiceUUID = serviceUUID

            // Parse the service UUID
            val uuid: UUID = try {
                UUID.fromString(serviceUUID)
            } catch (e: IllegalArgumentException) {
                Log.e(TAG, "Invalid UUID format: $serviceUUID", e)
                restoreOriginalBluetoothName()
                promise.reject("BLE_ERROR", "Invalid service UUID format")
                return
            }

            // Build advertise settings
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .setTimeout(0) // Advertise indefinitely
                .build()

            // Build advertise data - include device name
            val advertiseData = AdvertiseData.Builder()
                .setIncludeDeviceName(true)  // CRITICAL: This broadcasts the device name
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(ParcelUuid(uuid))
                .build()

            // Build scan response - also include device name for redundancy
            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)  // Also include in scan response
                .build()

            // Create the callback
            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    Log.d(TAG, "✅ Advertising started successfully")
                    Log.d(TAG, "Broadcasting as: $newName")
                    Log.d(TAG, "Service UUID: $serviceUUID")
                    
                    synchronized(this@BLEAdvertiserNative) {
                        isCurrentlyAdvertising = true
                    }
                    
                    val result = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("serviceUUID", serviceUUID)
                        putString("deviceName", newName)
                    }
                    promise.resolve(result)
                }

                override fun onStartFailure(errorCode: Int) {
                    val errorMessage = when (errorCode) {
                        ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large for advertising packet"
                        ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                        ADVERTISE_FAILED_ALREADY_STARTED -> "Advertising already started"
                        ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                        ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                        else -> "Unknown error: $errorCode"
                    }
                    Log.e(TAG, "❌ Advertising failed: $errorMessage (code: $errorCode)")
                    
                    synchronized(this@BLEAdvertiserNative) {
                        isCurrentlyAdvertising = false
                    }
                    
                    restoreOriginalBluetoothName()
                    promise.reject("BLE_ERROR", errorMessage)
                }
            }

            // Register Bluetooth state receiver to handle Bluetooth being turned off
            registerBluetoothStateReceiver()

            // Start the foreground service for persistent background advertising
            startForegroundService(serviceUUID, deviceId)

            // Start advertising
            Log.d(TAG, "Starting BLE advertising...")
            advertiser.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)

        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception - missing Bluetooth permissions", e)
            restoreOriginalBluetoothName()
            promise.reject("BLE_ERROR", "Bluetooth permissions not granted")
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error starting advertising", e)
            restoreOriginalBluetoothName()
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
        
        try {
            val advertiser = bluetoothLeAdvertiser
            val callback = advertiseCallback
            
            if (advertiser != null && callback != null) {
                advertiser.stopAdvertising(callback)
                Log.d(TAG, "Advertising stopped")
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception stopping advertising", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping advertising", e)
        } finally {
            synchronized(this) {
                isCurrentlyAdvertising = false
            }
            advertiseCallback = null
            currentDeviceId = null
            currentServiceUUID = null
            restoreOriginalBluetoothName()
            unregisterBluetoothStateReceiver()
            stopForegroundServiceInternal()
        }
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

    private fun restoreOriginalBluetoothName() {
        val originalName = originalBluetoothName
        if (originalName != null) {
            try {
                val adapter = bluetoothAdapter
                if (adapter != null && adapter.isEnabled) {
                    val restored = adapter.setName(originalName)
                    Log.d(TAG, "Restored Bluetooth name to '$originalName': $restored")
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "Security exception restoring Bluetooth name", e)
            } catch (e: Exception) {
                Log.e(TAG, "Error restoring Bluetooth name", e)
            }
            originalBluetoothName = null
        }
    }

    private fun registerBluetoothStateReceiver() {
        if (bluetoothStateReceiver != null) return

        bluetoothStateReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    Log.d(TAG, "Bluetooth state changed: $state")
                    
                    if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                        Log.d(TAG, "Bluetooth turning off, stopping advertising")
                        synchronized(this@BLEAdvertiserNative) {
                            isCurrentlyAdvertising = false
                        }
                        advertiseCallback = null
                        currentDeviceId = null
                        currentServiceUUID = null
                        originalBluetoothName = null
                    }
                }
            }
        }

        try {
            val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
            reactApplicationContext.registerReceiver(bluetoothStateReceiver, filter)
            Log.d(TAG, "Bluetooth state receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Error registering Bluetooth state receiver", e)
        }
    }

    private fun unregisterBluetoothStateReceiver() {
        try {
            bluetoothStateReceiver?.let {
                reactApplicationContext.unregisterReceiver(it)
                Log.d(TAG, "Bluetooth state receiver unregistered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering Bluetooth state receiver", e)
        }
        bluetoothStateReceiver = null
    }

    // Cleanup when React Native is destroyed
    override fun invalidate() {
        super.invalidate()
        stopAdvertisingInternal()
    }
}

