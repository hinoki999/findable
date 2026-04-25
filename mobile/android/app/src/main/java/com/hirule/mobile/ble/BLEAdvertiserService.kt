package com.hirule.mobile.ble

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
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
import android.os.IBinder
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hirule.mobile.MainActivity
import java.util.UUID

class BLEAdvertiserService : Service() {

    companion object {
        private const val TAG = "BLEAdvertiserService"
        private const val CHANNEL_ID = "droplink_ble_advertiser"
        private const val NOTIFICATION_ID = 1002
        // Manufacturer ID 0xFFFF is reserved for testing/prototyping per Bluetooth SIG
        private const val DROPLINK_MANUFACTURER_ID = 0xFFFF
        
        const val ACTION_START_ADVERTISE = "com.hirule.mobile.START_BLE_ADVERTISE"
        const val ACTION_STOP_ADVERTISE = "com.hirule.mobile.STOP_BLE_ADVERTISE"
        const val ACTION_GHOST_MODE_STOP = "com.hirule.mobile.GHOST_MODE_STOP_BLE_ADVERTISE"
        const val ACTION_ADVERTISE_STARTED = "com.hirule.mobile.BLE_ADVERTISE_STARTED"
        const val ACTION_ADVERTISE_FAILED = "com.hirule.mobile.BLE_ADVERTISE_FAILED"
        
        const val EXTRA_SERVICE_UUID = "service_uuid"
        const val EXTRA_DEVICE_ID = "device_id"
        
        // SharedPreferences for persisting advertising state across app kills
        private const val PREFS_NAME = "BLEAdvertiserPrefs"
        private const val KEY_DEVICE_ID = "deviceId"
        private const val KEY_SERVICE_UUID = "serviceUUID"
        private const val KEY_IS_DISCOVERABLE = "isDiscoverable"
    }

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothLeAdvertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false
    private var currentDeviceId: String? = null
    private var currentServiceUUID: String? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var bluetoothStateReceiver: BroadcastReceiver? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "BLEAdvertiserService created")
        createNotificationChannel()
        initBluetooth()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand received - intent action: ${intent?.action ?: "NULL"}")
        
        // CRITICAL: Call startForeground() IMMEDIATELY and UNCONDITIONALLY
        // Android requires this within 5 seconds of startForegroundService() call
        // Must happen BEFORE any permission checks, BLE init, or other operations
        startForeground(NOTIFICATION_ID, createNotification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        Log.d(TAG, "startForeground called immediately in onStartCommand")
        
        // Handle null intent (service restarted by system after being killed)
        if (intent == null || intent.action == null) {
            Log.d(TAG, "Service restarted with null intent, checking SharedPreferences for saved state")
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isDiscoverable = prefs.getBoolean(KEY_IS_DISCOVERABLE, false)
            val savedDeviceId = prefs.getString(KEY_DEVICE_ID, null)
            val savedServiceUUID = prefs.getString(KEY_SERVICE_UUID, null)
            
            Log.d(TAG, "Saved state - isDiscoverable: $isDiscoverable, deviceId: $savedDeviceId, serviceUUID: $savedServiceUUID")
            
            if (isDiscoverable && savedDeviceId != null && savedServiceUUID != null) {
                Log.d(TAG, "Resuming advertising from saved state")
                startAdvertising(savedServiceUUID, savedDeviceId)
            } else {
                Log.d(TAG, "Not resuming advertising - isDiscoverable is false or missing saved data")
                // Stop the service if we shouldn't be advertising
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            return START_STICKY
        }
        
        when (intent.action) {
            ACTION_START_ADVERTISE -> {
                Log.d(TAG, "Handling ACTION_START_ADVERTISE")
                val serviceUUID = intent.getStringExtra(EXTRA_SERVICE_UUID)
                val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID)
                if (serviceUUID != null && deviceId != null) {
                    startAdvertising(serviceUUID, deviceId)
                }
            }
            ACTION_STOP_ADVERTISE -> {
                Log.d(TAG, "Handling ACTION_STOP_ADVERTISE")
                // Stop advertising but preserve isDiscoverable state (for app kill/cleanup)
                // Service can restart and resume advertising if isDiscoverable is still true
                stopAdvertisingInternal()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_GHOST_MODE_STOP -> {
                Log.d(TAG, "Handling ACTION_GHOST_MODE_STOP")
                // User explicitly enabled ghost mode - set isDiscoverable=false so service doesn't restart
                Log.d(TAG, "Ghost mode enabled by user - setting isDiscoverable=false")
                saveDiscoverableState(false)
                stopAdvertisingInternal()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun initBluetooth() {
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        bluetoothLeAdvertiser = bluetoothAdapter?.bluetoothLeAdvertiser
        Log.d(TAG, "Bluetooth initialized, advertiser available: ${bluetoothLeAdvertiser != null}")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "DropLink Advertiser",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background BLE advertising to make you visible to nearby DropLink users"
                setShowBadge(false)
            }
            
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created")
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DropLink Active")
            .setContentText("Currently broadcasting")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(NOTIFICATION_ID, createNotification())
    }

    private fun startAdvertising(serviceUUID: String, deviceId: String) {
        Log.d(TAG, "startAdvertising called with serviceUUID: $serviceUUID, deviceId: $deviceId")
        Log.d(TAG, "startAdvertising guard check - isAdvertising: $isAdvertising")
        
        if (isAdvertising) {
            Log.d(TAG, "Already advertising, stopping first...")
            stopAdvertisingInternal()
        }

        val adapter = bluetoothAdapter
        if (adapter == null) {
            Log.e(TAG, "Bluetooth adapter is null")
            broadcastFailure("Bluetooth is not available")
            return
        }

        if (!adapter.isEnabled) {
            Log.e(TAG, "Bluetooth is not enabled")
            broadcastFailure("Bluetooth is not enabled")
            return
        }

        val advertiser = bluetoothLeAdvertiser
        if (advertiser == null) {
            Log.e(TAG, "BLE Advertiser is null - device may not support BLE advertising")
            broadcastFailure("BLE advertising is not supported")
            return
        }

        try {
            currentDeviceId = deviceId
            currentServiceUUID = serviceUUID

            val uuid: UUID = try {
                UUID.fromString(serviceUUID)
            } catch (e: IllegalArgumentException) {
                Log.e(TAG, "Invalid UUID format: $serviceUUID", e)
                broadcastFailure("Invalid service UUID format")
                return
            }

            // Convert deviceId to bytes for manufacturer data
            val manufacturerData = deviceId.toByteArray(Charsets.UTF_8)
            Log.d(TAG, "Manufacturer data: $deviceId (${manufacturerData.size} bytes)")

            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .setTimeout(0)
                .build()

            // Advertise with Service UUID and manufacturer data (not device name)
            val advertiseData = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(ParcelUuid(uuid))
                .addManufacturerData(DROPLINK_MANUFACTURER_ID, manufacturerData)
                .build()

            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .build()

            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    Log.d(TAG, "✅ Advertising started successfully")
                    Log.d(TAG, "Broadcasting with manufacturer data: $deviceId")
                    Log.d(TAG, "Service UUID: $serviceUUID")
                    
                    isAdvertising = true
                    updateNotification()
                    broadcastSuccess(deviceId, serviceUUID)
                    
                    // Confirmation write - state was already saved before startAdvertising()
                    // This confirms advertising actually started successfully
                    saveAdvertisingState(deviceId, serviceUUID, true)
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
                    
                    isAdvertising = false
                    broadcastFailure(errorMessage)
                }
            }

            registerBluetoothStateReceiver()

            // Save advertising state BEFORE starting async advertising
            // This ensures SharedPreferences has isDiscoverable=true even if app is killed
            // before onStartSuccess fires. The null intent handler can then resume advertising.
            saveAdvertisingState(deviceId, serviceUUID, true)

            Log.d(TAG, "Starting BLE advertising...")
            advertiser.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)

        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception - missing Bluetooth permissions", e)
            broadcastFailure("Bluetooth permissions not granted")
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error starting advertising", e)
            broadcastFailure("Failed to start advertising: ${e.message}")
        }
    }

    private fun stopAdvertising() {
        Log.d(TAG, "stopAdvertising called")
        stopAdvertisingInternal()
        // Note: Does NOT set isDiscoverable=false - use ACTION_GHOST_MODE_STOP for that
    }

    private fun stopAdvertisingInternal() {
        Log.d(TAG, "stopAdvertisingInternal called, isAdvertising: $isAdvertising")
        
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
            isAdvertising = false
            advertiseCallback = null
            currentDeviceId = null
            currentServiceUUID = null
            unregisterBluetoothStateReceiver()
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
                        isAdvertising = false
                        advertiseCallback = null
                        currentDeviceId = null
                        currentServiceUUID = null
                        updateNotification()
                    }
                }
            }
        }

        try {
            val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(bluetoothStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(bluetoothStateReceiver, filter)
            }
            Log.d(TAG, "Bluetooth state receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Error registering Bluetooth state receiver", e)
        }
    }

    private fun unregisterBluetoothStateReceiver() {
        try {
            bluetoothStateReceiver?.let {
                unregisterReceiver(it)
                Log.d(TAG, "Bluetooth state receiver unregistered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering Bluetooth state receiver", e)
        }
        bluetoothStateReceiver = null
    }

    private fun broadcastSuccess(deviceId: String, serviceUUID: String) {
        val intent = Intent(ACTION_ADVERTISE_STARTED).apply {
            putExtra("deviceId", deviceId)
            putExtra("serviceUUID", serviceUUID)
        }
        sendBroadcast(intent)
    }

    private fun broadcastFailure(errorMessage: String) {
        val intent = Intent(ACTION_ADVERTISE_FAILED).apply {
            putExtra("error", errorMessage)
        }
        sendBroadcast(intent)
    }

    private fun saveAdvertisingState(deviceId: String, serviceUUID: String, isDiscoverable: Boolean) {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString(KEY_DEVICE_ID, deviceId)
                putString(KEY_SERVICE_UUID, serviceUUID)
                putBoolean(KEY_IS_DISCOVERABLE, isDiscoverable)
                apply()
            }
            Log.d(TAG, "Saved advertising state - deviceId: $deviceId, serviceUUID: $serviceUUID, isDiscoverable: $isDiscoverable")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save advertising state", e)
        }
    }

    private fun saveDiscoverableState(isDiscoverable: Boolean) {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean(KEY_IS_DISCOVERABLE, isDiscoverable)
                apply()
            }
            Log.d(TAG, "Saved discoverable state: $isDiscoverable")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save discoverable state", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAdvertisingInternal()
        Log.d(TAG, "BLEAdvertiserService destroyed")
    }
}
