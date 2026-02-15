package com.hirule.mobile.ble

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import java.util.UUID

class BLEAdvertiserNative(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "BLEAdvertiserNative"
    }

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothLeAdvertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false
    private var currentServiceUUID: String? = null
    private var pendingPromise: Promise? = null
    
    // Store original Bluetooth name to restore later
    private var originalBluetoothName: String? = null
    
    // Prefix for DropLink device names
    private val DROPLINK_PREFIX = "DL-"

    init {
        val bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        bluetoothLeAdvertiser = bluetoothAdapter?.bluetoothLeAdvertiser
    }

    @ReactMethod
    fun startAdvertising(serviceUUID: String, deviceId: String, promise: Promise) {
        try {
            // Check permissions
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (reactApplicationContext.checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) 
                    != PackageManager.PERMISSION_GRANTED) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_ADVERTISE permission not granted")
                    return
                }
                if (reactApplicationContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) 
                    != PackageManager.PERMISSION_GRANTED) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_CONNECT permission not granted")
                    return
                }
            }

            if (isAdvertising) {
                promise.reject("ALREADY_ADVERTISING", "BLE advertising is already active")
                return
            }

            if (bluetoothAdapter == null || !bluetoothAdapter!!.isEnabled) {
                promise.reject("BLUETOOTH_DISABLED", "Bluetooth is not enabled")
                return
            }

            if (bluetoothLeAdvertiser == null) {
                promise.reject("NOT_SUPPORTED", "BLE advertising is not supported on this device")
                return
            }

            // Parse and validate service UUID
            val parsedUUID = try {
                UUID.fromString(serviceUUID)
            } catch (e: IllegalArgumentException) {
                promise.reject("INVALID_UUID", "Invalid service UUID format: $serviceUUID")
                return
            }

            this.currentServiceUUID = serviceUUID
            this.pendingPromise = promise
            
            // Step 1: Store original Bluetooth name
            originalBluetoothName = bluetoothAdapter!!.name
            android.util.Log.d("BLEAdvertiserNative", "Original Bluetooth name: $originalBluetoothName")
            
            // Step 2: Set new Bluetooth name to "DL-{deviceId}"
            val newBluetoothName = "$DROPLINK_PREFIX$deviceId"
            android.util.Log.d("BLEAdvertiserNative", "Setting Bluetooth name to: $newBluetoothName")
            
            val nameSet = bluetoothAdapter!!.setName(newBluetoothName)
            if (!nameSet) {
                android.util.Log.w("BLEAdvertiserNative", "Warning: Failed to set Bluetooth name, continuing anyway")
            } else {
                android.util.Log.d("BLEAdvertiserNative", "Bluetooth name set successfully")
            }
            
            // Small delay to allow name change to propagate
            Thread.sleep(100)

            // Step 3: Configure advertising data - include device name
            val advertiseData = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(parsedUUID))
                .setIncludeDeviceName(true)  // Include the device name we just set
                .setIncludeTxPowerLevel(false)
                .build()

            // Configure scan response data (optional additional data)
            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)  // Also include in scan response for redundancy
                .build()

            // Configure advertising settings for best range
            val advertiseSettings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY) // Best for discovery
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH) // Maximum power
                .setConnectable(false) // Non-connectable advertising (no GATT)
                .setTimeout(0) // No timeout - advertise continuously
                .build()

            android.util.Log.d("BLEAdvertiserNative", "Starting BLE advertising with UUID: $serviceUUID")
            android.util.Log.d("BLEAdvertiserNative", "Device name being broadcast: $newBluetoothName")

            // Start advertising with scan response
            bluetoothLeAdvertiser!!.startAdvertising(
                advertiseSettings,
                advertiseData,
                scanResponse,
                advertiseCallback
            )
        } catch (e: Exception) {
            // Restore original name on error
            restoreOriginalBluetoothName()
            promise.reject("START_ADVERTISING_ERROR", "Failed to start advertising: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        try {
            if (!isAdvertising) {
                promise.resolve(null)
                return
            }

            android.util.Log.d("BLEAdvertiserNative", "Stopping BLE advertising")
            
            bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
            currentServiceUUID = null
            
            // Restore original Bluetooth name
            restoreOriginalBluetoothName()
            
            promise.resolve(null)
        } catch (e: Exception) {
            // Still try to restore name even on error
            restoreOriginalBluetoothName()
            promise.reject("STOP_ADVERTISING_ERROR", "Failed to stop advertising: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun isAdvertising(promise: Promise) {
        promise.resolve(isAdvertising)
    }
    
    /**
     * Restore the original Bluetooth device name
     * Called when stopping advertising or on error
     */
    private fun restoreOriginalBluetoothName() {
        if (originalBluetoothName != null && bluetoothAdapter != null) {
            try {
                // Check permission for Android 12+
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (reactApplicationContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) 
                        != PackageManager.PERMISSION_GRANTED) {
                        android.util.Log.w("BLEAdvertiserNative", "Cannot restore name: BLUETOOTH_CONNECT permission not granted")
                        return
                    }
                }
                
                android.util.Log.d("BLEAdvertiserNative", "Restoring original Bluetooth name: $originalBluetoothName")
                val restored = bluetoothAdapter!!.setName(originalBluetoothName)
                if (restored) {
                    android.util.Log.d("BLEAdvertiserNative", "Original Bluetooth name restored successfully")
                } else {
                    android.util.Log.w("BLEAdvertiserNative", "Failed to restore original Bluetooth name")
                }
                originalBluetoothName = null
            } catch (e: Exception) {
                android.util.Log.e("BLEAdvertiserNative", "Error restoring Bluetooth name: ${e.message}")
            }
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            isAdvertising = true
            android.util.Log.d("BLEAdvertiserNative", "Advertising started successfully")
            
            // Return success with serviceUUID
            val result = WritableNativeMap()
            result.putBoolean("success", true)
            result.putString("serviceUUID", currentServiceUUID)
            pendingPromise?.resolve(result)
            pendingPromise = null
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
            currentServiceUUID = null
            
            // Restore original name on failure
            restoreOriginalBluetoothName()
            
            val errorMessage = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "ADVERTISE_FAILED_DATA_TOO_LARGE"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "ADVERTISE_FAILED_TOO_MANY_ADVERTISERS"
                ADVERTISE_FAILED_ALREADY_STARTED -> "ADVERTISE_FAILED_ALREADY_STARTED"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "ADVERTISE_FAILED_FEATURE_UNSUPPORTED"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "ADVERTISE_FAILED_INTERNAL_ERROR"
                else -> "UNKNOWN_ERROR_$errorCode"
            }
            
            android.util.Log.e("BLEAdvertiserNative", "Advertising failed: $errorMessage")
            pendingPromise?.reject(errorMessage, "BLE advertising failed: $errorMessage")
            pendingPromise = null
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        if (isAdvertising) {
            try {
                bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
            } catch (e: Exception) {
                android.util.Log.e("BLEAdvertiserNative", "Error stopping advertising on destroy: ${e.message}")
            }
            isAdvertising = false
        }
        // Always try to restore original name on destroy
        restoreOriginalBluetoothName()
    }
}

