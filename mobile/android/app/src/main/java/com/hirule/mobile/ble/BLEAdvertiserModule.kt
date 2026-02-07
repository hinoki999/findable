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
import java.util.UUID

class BLEAdvertiserModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "BLEAdvertiserModule"
    }

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothLeAdvertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false
    private var currentServiceUUID: String? = null
    private var pendingPromise: Promise? = null

    // Generate device identifier (simple approach - can be improved)
    private val deviceIdentifier: String by lazy {
        val androidId = android.provider.Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        )
        // Use last 4 chars of Android ID as identifier
        if (androidId != null && androidId.length >= 4) {
            androidId.takeLast(4)
        } else {
            "0000"
        }
    }

    init {
        val bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        bluetoothLeAdvertiser = bluetoothAdapter?.bluetoothLeAdvertiser
    }

    @ReactMethod
    fun startAdvertising(serviceUUID: String, promise: Promise) {
        try {
            // Check permissions
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (reactApplicationContext.checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) 
                    != PackageManager.PERMISSION_GRANTED) {
                    promise.reject("PERMISSION_DENIED", "BLUETOOTH_ADVERTISE permission not granted")
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

            // Configure advertising data - service UUID only, no device name
            val advertiseData = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(parsedUUID))
                .setIncludeDeviceName(false) // Don't include device name in advertising
                .setIncludeTxPowerLevel(false)
                .build()

            // Configure advertising settings for best range
            val advertiseSettings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY) // Best for range
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH) // Maximum power
                .setConnectable(false) // Non-connectable advertising (no GATT)
                .setTimeout(0) // No timeout - advertise continuously
                .build()

            // Start advertising
            bluetoothLeAdvertiser!!.startAdvertising(
                advertiseSettings,
                advertiseData,
                advertiseCallback
            )
        } catch (e: Exception) {
            promise.reject("START_ADVERTISING_ERROR", "Failed to start advertising: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopAdvertising() {
        try {
            if (!isAdvertising) {
                return
            }

            bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
            currentServiceUUID = null
        } catch (e: Exception) {
            // Silently fail on stop
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            isAdvertising = true
            pendingPromise?.resolve(null)
            pendingPromise = null
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
            currentServiceUUID = null
            
            val errorMessage = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "ADVERTISE_FAILED_DATA_TOO_LARGE"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "ADVERTISE_FAILED_TOO_MANY_ADVERTISERS"
                ADVERTISE_FAILED_ALREADY_STARTED -> "ADVERTISE_FAILED_ALREADY_STARTED"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "ADVERTISE_FAILED_FEATURE_UNSUPPORTED"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "ADVERTISE_FAILED_INTERNAL_ERROR"
                else -> "UNKNOWN_ERROR_$errorCode"
            }
            
            pendingPromise?.reject(errorMessage, "BLE advertising failed: $errorMessage")
            pendingPromise = null
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        if (isAdvertising) {
            bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
        }
    }
}
