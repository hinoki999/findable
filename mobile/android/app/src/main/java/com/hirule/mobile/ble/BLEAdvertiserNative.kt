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
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.util.UUID

class BLEAdvertiserNative(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BLEAdvertiserNative"
        private const val DROPLINK_PREFIX = "DL-"
    }

    private val bluetoothManager: BluetoothManager? = 
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter
    private var bleAdvertiser: BluetoothLeAdvertiser? = null
    
    @Volatile private var isAdvertising = false
    @Volatile private var pendingPromise: Promise? = null
    @Volatile private var currentServiceUUID: String? = null
    @Volatile private var originalBluetoothName: String? = null
    
    private val bluetoothStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    synchronized(this@BLEAdvertiserNative) {
                        if (isAdvertising) {
                            Log.d(TAG, "Bluetooth turning off, stopping advertising")
                            stopAdvertisingInternal()
                        }
                    }
                }
            }
        }
    }
    
    init {
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        try {
            reactContext.registerReceiver(bluetoothStateReceiver, filter)
            Log.d(TAG, "Bluetooth state receiver registered")
        } catch (e: Exception) {
            Log.w(TAG, "Could not register receiver: ${e.message}")
        }
    }

    override fun getName(): String = "BLEAdvertiserNative"

    @ReactMethod
    fun startAdvertising(serviceUUID: String, deviceId: String, promise: Promise) {
        Log.d(TAG, "========== startAdvertising CALLED ==========")
        Log.d(TAG, "serviceUUID: $serviceUUID")
        Log.d(TAG, "deviceId: $deviceId")
        
        synchronized(this) {
            if (pendingPromise != null) {
                Log.w(TAG, "Operation already in progress")
                promise.reject("ALREADY_STARTING", "Operation already in progress")
                return
            }
            
            if (isAdvertising) {
                Log.w(TAG, "Already advertising")
                promise.reject("ALREADY_ADVERTISING", "Already advertising")
                return
            }
            
            if (deviceId.isEmpty() || deviceId.length > 8) {
                Log.e(TAG, "Invalid deviceId length: ${deviceId.length}")
                promise.reject("INVALID_DEVICE_ID", "Device ID must be 1-8 characters")
                return
            }
            
            if (bluetoothAdapter == null) {
                Log.e(TAG, "Bluetooth adapter is null")
                promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth not available")
                return
            }
            
            if (!bluetoothAdapter.isEnabled) {
                Log.e(TAG, "Bluetooth is disabled")
                promise.reject("BLUETOOTH_OFF", "Bluetooth is off")
                return
            }
            
            // Permission checks for Android 12+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (reactApplicationContext.checkSelfPermission(
                    android.Manifest.permission.BLUETOOTH_ADVERTISE
                ) != PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "BLUETOOTH_ADVERTISE permission not granted")
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_ADVERTISE required")
                    return
                }
                if (reactApplicationContext.checkSelfPermission(
                    android.Manifest.permission.BLUETOOTH_CONNECT
                ) != PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "BLUETOOTH_CONNECT permission not granted")
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_CONNECT required")
                    return
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (reactApplicationContext.checkSelfPermission(
                    android.Manifest.permission.ACCESS_FINE_LOCATION
                ) != PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "ACCESS_FINE_LOCATION permission not granted")
                    promise.reject("PERMISSION_DENIED", "ACCESS_FINE_LOCATION required")
                    return
                }
            }
            
            bleAdvertiser = bluetoothAdapter.bluetoothLeAdvertiser
            if (bleAdvertiser == null) {
                Log.e(TAG, "BLE advertiser is null - device doesn't support BLE advertising")
                promise.reject("BLE_NOT_SUPPORTED", "BLE advertising not supported")
                return
            }
            
            val uuid: UUID
            try {
                uuid = UUID.fromString(serviceUUID)
                Log.d(TAG, "Parsed UUID: $uuid")
            } catch (e: IllegalArgumentException) {
                Log.e(TAG, "Invalid UUID format: ${e.message}")
                promise.reject("INVALID_UUID", "Invalid UUID: ${e.message}")
                return
            }
            
            // CRITICAL: Store original name and set new name BEFORE advertising
            try {
                originalBluetoothName = bluetoothAdapter.name
                val newName = "$DROPLINK_PREFIX$deviceId"
                Log.d(TAG, "Changing Bluetooth name from '$originalBluetoothName' to '$newName'")
                bluetoothAdapter.setName(newName)
                // Brief delay for name to propagate to the advertising subsystem
                Thread.sleep(150)
                Log.d(TAG, "Bluetooth name set successfully")
            } catch (e: SecurityException) {
                Log.e(TAG, "SecurityException setting name: ${e.message}")
                promise.reject("PERMISSION_DENIED", "Cannot set name: ${e.message}")
                return
            } catch (e: Exception) {
                Log.w(TAG, "Warning: Failed to set name: ${e.message}")
                // Continue anyway - name setting is not strictly required
            }
            
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .setTimeout(0) // Advertise indefinitely
                .build()
            
            // Include device name in advertise data
            val advertiseData = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(uuid))
                .setIncludeDeviceName(true)  // Include the name we just set
                .setIncludeTxPowerLevel(false)
                .build()
            
            // Also include device name in scan response for redundancy
            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build()
            
            this.currentServiceUUID = serviceUUID
            this.pendingPromise = promise
            
            try {
                Log.d(TAG, "Calling startAdvertising on BluetoothLeAdvertiser...")
                bleAdvertiser?.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)
            } catch (e: Exception) {
                Log.e(TAG, "Exception starting advertising: ${e.message}")
                synchronized(this) {
                    this.pendingPromise = null
                    this.currentServiceUUID = null
                    restoreOriginalBluetoothName()
                }
                promise.reject("START_FAILED", "Failed: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        Log.d(TAG, "========== stopAdvertising CALLED ==========")
        synchronized(this) {
            if (!isAdvertising) {
                Log.w(TAG, "Not currently advertising")
                promise.reject("NOT_ADVERTISING", "Not advertising")
                return
            }
            stopAdvertisingInternal()
            Log.d(TAG, "Advertising stopped successfully")
            promise.resolve(null)
        }
    }
    
    @ReactMethod
    fun isAdvertising(promise: Promise) {
        synchronized(this) {
            Log.d(TAG, "isAdvertising called, returning: $isAdvertising")
            promise.resolve(isAdvertising)
        }
    }
    
    private fun restoreOriginalBluetoothName() {
        try {
            originalBluetoothName?.let { name ->
                Log.d(TAG, "Restoring original Bluetooth name: $name")
                bluetoothAdapter?.setName(name)
            }
            originalBluetoothName = null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to restore original name: ${e.message}")
        }
    }
    
    private fun stopAdvertisingInternal() {
        Log.d(TAG, "stopAdvertisingInternal called")
        try {
            bleAdvertiser?.stopAdvertising(advertiseCallback)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping advertising: ${e.message}")
        } finally {
            isAdvertising = false
            currentServiceUUID = null
            restoreOriginalBluetoothName()
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "========== ADVERTISING STARTED SUCCESSFULLY ==========")
            Log.d(TAG, "Settings in effect: $settingsInEffect")
            synchronized(this@BLEAdvertiserNative) {
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
            val errorMessage = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Not supported"
                else -> "Unknown error: $errorCode"
            }
            Log.e(TAG, "========== ADVERTISING FAILED ==========")
            Log.e(TAG, "Error code: $errorCode, message: $errorMessage")
            
            synchronized(this@BLEAdvertiserNative) {
                isAdvertising = false
                val promise = pendingPromise
                pendingPromise = null
                currentServiceUUID = null
                restoreOriginalBluetoothName()
                promise?.reject("ADVERTISE_FAILED", errorMessage)
            }
        }
    }
    
    override fun onCatalystInstanceDestroy() {
        Log.d(TAG, "onCatalystInstanceDestroy called")
        super.onCatalystInstanceDestroy()
        synchronized(this) {
            if (isAdvertising) {
                stopAdvertisingInternal()
            }
        }
        try {
            reactApplicationContext.unregisterReceiver(bluetoothStateReceiver)
            Log.d(TAG, "Bluetooth state receiver unregistered")
        } catch (e: Exception) {
            Log.w(TAG, "Receiver was not registered: ${e.message}")
        }
    }
}

