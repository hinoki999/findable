package com.droplink.ble

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
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import java.util.UUID

class BLEAdvertiserModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    private val bluetoothManager: BluetoothManager? = 
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter
    private var bleAdvertiser: BluetoothLeAdvertiser? = null
    
    // Thread-safe state management
    @Volatile
    private var isAdvertising = false
    
    @Volatile
    private var pendingPromise: Promise? = null
    
    @Volatile
    private var currentServiceUUID: String? = null
    
    // Bluetooth state monitoring
    private val bluetoothStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    synchronized(this@BLEAdvertiserModule) {
                        if (isAdvertising) {
                            stopAdvertisingInternal()
                        }
                    }
                }
            }
        }
    }
    
    init {
        // Register Bluetooth state monitor
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        try {
            reactContext.registerReceiver(bluetoothStateReceiver, filter)
        } catch (e: Exception) {
            // Context may not be ready, receiver will be registered on first use
        }
    }

    override fun getName(): String = "BLEAdvertiserNative"

    @ReactMethod
    fun startAdvertising(serviceUUID: String, deviceId: String, promise: Promise) {
        synchronized(this) {
            // Check for existing pending operation
            if (pendingPromise != null) {
                promise.reject("ALREADY_STARTING", "Advertising start operation already in progress")
                return
            }
            
            // Check if already advertising
            if (isAdvertising) {
                promise.reject("ALREADY_ADVERTISING", "Already advertising")
                return
            }
            
            // Validate deviceId
            if (deviceId.isEmpty() || deviceId.length > 8) {
                promise.reject("INVALID_DEVICE_ID", "Device ID must be 1-8 characters")
                return
            }
            
            // Check Bluetooth availability
            if (bluetoothAdapter == null) {
                promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not available on this device")
                return
            }
            
            if (!bluetoothAdapter.isEnabled) {
                promise.reject("BLUETOOTH_OFF", "Bluetooth is turned off")
                return
            }
            
            // CRITICAL: Comprehensive permission checks for all Android versions
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // Android 12+
                // Check BLUETOOTH_ADVERTISE permission
                if (reactApplicationContext.checkSelfPermission(
                    android.Manifest.permission.BLUETOOTH_ADVERTISE
                ) != PackageManager.PERMISSION_GRANTED) {
                    promise.reject(
                        "PERMISSION_DENIED",
                        "BLUETOOTH_ADVERTISE permission required for Android 12+"
                    )
                    return
                }
                
                // Check BLUETOOTH_CONNECT for setName()
                if (reactApplicationContext.checkSelfPermission(
                    android.Manifest.permission.BLUETOOTH_CONNECT
                ) != PackageManager.PERMISSION_GRANTED) {
                    promise.reject(
                        "PERMISSION_DENIED",
                        "BLUETOOTH_CONNECT permission required for Android 12+"
                    )
                    return
                }
                
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) { // Android 6-11
                // Check ACCESS_FINE_LOCATION permission (required for BLE on older Android)
                if (reactApplicationContext.checkSelfPermission(
                    android.Manifest.permission.ACCESS_FINE_LOCATION
                ) != PackageManager.PERMISSION_GRANTED) {
                    promise.reject(
                        "PERMISSION_DENIED",
                        "ACCESS_FINE_LOCATION permission required for Android 6-11"
                    )
                    return
                }
            }
            // No permissions needed for Android 5 and below, but they're rare in 2025
            
            // Get advertiser
            bleAdvertiser = bluetoothAdapter.bluetoothLeAdvertiser
            if (bleAdvertiser == null) {
                promise.reject("BLE_ADVERTISING_NOT_SUPPORTED", "BLE advertising not supported")
                return
            }
            
            // Validate and parse UUID
            val uuid: UUID
            try {
                uuid = UUID.fromString(serviceUUID)
            } catch (e: IllegalArgumentException) {
                promise.reject("INVALID_UUID", "Invalid service UUID format: ${e.message}")
                return
            }
            
            // Set local name with safe null handling
            val localName = "DL-$deviceId"
            try {
                // Safe call operator to prevent NullPointerException
                bluetoothAdapter?.setName(localName)
            } catch (e: SecurityException) {
                promise.reject("PERMISSION_DENIED", "Cannot set Bluetooth name: ${e.message}")
                return
            } catch (e: Exception) {
                // Log but continue - name setting is not critical
                android.util.Log.w("BLEAdvertiser", "Failed to set name: ${e.message}")
            }
            
            // Configure advertising settings
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .setTimeout(0) // Advertise indefinitely
                .build()
            
            // Configure advertising data with Service UUID
            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .addServiceUuid(ParcelUuid(uuid))
                .build()
            
            // Set pending state
            this.currentServiceUUID = serviceUUID
            this.pendingPromise = promise
            
            // Start advertising
            try {
                bleAdvertiser?.startAdvertising(settings, data, advertiseCallback)
            } catch (e: SecurityException) {
                synchronized(this) {
                    this.pendingPromise = null
                    this.currentServiceUUID = null
                }
                promise.reject("PERMISSION_DENIED", "Failed to start advertising: ${e.message}")
            } catch (e: Exception) {
                synchronized(this) {
                    this.pendingPromise = null
                    this.currentServiceUUID = null
                }
                promise.reject("START_FAILED", "Failed to start advertising: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        synchronized(this) {
            if (!isAdvertising) {
                promise.reject("NOT_ADVERTISING", "Not currently advertising")
                return
            }
            
            stopAdvertisingInternal()
            promise.resolve(null)
        }
    }
    
    @ReactMethod
    fun isAdvertising(promise: Promise) {
        synchronized(this) {
            promise.resolve(isAdvertising)
        }
    }
    
    // Internal stop method (called from receiver and public method)
    private fun stopAdvertisingInternal() {
        try {
            bleAdvertiser?.stopAdvertising(advertiseCallback)
        } catch (e: Exception) {
            android.util.Log.e("BLEAdvertiser", "Error stopping advertising: ${e.message}")
        } finally {
            isAdvertising = false
            currentServiceUUID = null
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            synchronized(this@BLEAdvertiserModule) {
                isAdvertising = true
                val promise = pendingPromise
                pendingPromise = null
                
                val result: WritableMap = Arguments.createMap()
                result.putBoolean("success", true)
                result.putString("serviceUUID", currentServiceUUID)
                promise?.resolve(result)
            }
        }

        override fun onStartFailure(errorCode: Int) {
            synchronized(this@BLEAdvertiserModule) {
                isAdvertising = false
                val promise = pendingPromise
                pendingPromise = null
                currentServiceUUID = null
                
                val errorMessage = when (errorCode) {
                    ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                    ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                    ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                    ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                    ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature not supported"
                    else -> "Unknown error: $errorCode"
                }
                
                promise?.reject("ADVERTISE_FAILED", errorMessage)
            }
        }
    }
    
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        synchronized(this) {
            if (isAdvertising) {
                stopAdvertisingInternal()
            }
        }
        try {
            reactApplicationContext.unregisterReceiver(bluetoothStateReceiver)
        } catch (e: Exception) {
            // Receiver may not be registered
        }
    }
}
