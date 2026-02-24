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
        private const val DROPLINK_PREFIX = "DL-"
        
        const val ACTION_START_ADVERTISE = "com.hirule.mobile.START_BLE_ADVERTISE"
        const val ACTION_STOP_ADVERTISE = "com.hirule.mobile.STOP_BLE_ADVERTISE"
        const val ACTION_ADVERTISE_STARTED = "com.hirule.mobile.BLE_ADVERTISE_STARTED"
        const val ACTION_ADVERTISE_FAILED = "com.hirule.mobile.BLE_ADVERTISE_FAILED"
        
        const val EXTRA_SERVICE_UUID = "service_uuid"
        const val EXTRA_DEVICE_ID = "device_id"
    }

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothLeAdvertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false
    private var originalBluetoothName: String? = null
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
        when (intent?.action) {
            ACTION_START_ADVERTISE -> {
                startForeground(NOTIFICATION_ID, createNotification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
                val serviceUUID = intent.getStringExtra(EXTRA_SERVICE_UUID)
                val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID)
                if (serviceUUID != null && deviceId != null) {
                    startAdvertising(serviceUUID, deviceId)
                }
            }
            ACTION_STOP_ADVERTISE -> {
                stopAdvertising()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                startForeground(NOTIFICATION_ID, createNotification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
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
            originalBluetoothName = adapter.name
            Log.d(TAG, "Original Bluetooth name: $originalBluetoothName")

            val newName = "$DROPLINK_PREFIX$deviceId"
            val nameSet = adapter.setName(newName)
            Log.d(TAG, "Set Bluetooth name to '$newName': $nameSet")

            currentDeviceId = deviceId
            currentServiceUUID = serviceUUID

            val uuid: UUID = try {
                UUID.fromString(serviceUUID)
            } catch (e: IllegalArgumentException) {
                Log.e(TAG, "Invalid UUID format: $serviceUUID", e)
                restoreOriginalBluetoothName()
                broadcastFailure("Invalid service UUID format")
                return
            }

            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .setTimeout(0)
                .build()

            val advertiseData = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(ParcelUuid(uuid))
                .build()

            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build()

            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    Log.d(TAG, "✅ Advertising started successfully")
                    Log.d(TAG, "Broadcasting as: $newName")
                    Log.d(TAG, "Service UUID: $serviceUUID")
                    
                    isAdvertising = true
                    updateNotification()
                    broadcastSuccess(newName, serviceUUID)
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
                    restoreOriginalBluetoothName()
                    broadcastFailure(errorMessage)
                }
            }

            registerBluetoothStateReceiver()

            Log.d(TAG, "Starting BLE advertising...")
            advertiser.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)

        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception - missing Bluetooth permissions", e)
            restoreOriginalBluetoothName()
            broadcastFailure("Bluetooth permissions not granted")
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error starting advertising", e)
            restoreOriginalBluetoothName()
            broadcastFailure("Failed to start advertising: ${e.message}")
        }
    }

    private fun stopAdvertising() {
        Log.d(TAG, "stopAdvertising called")
        stopAdvertisingInternal()
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
            restoreOriginalBluetoothName()
            unregisterBluetoothStateReceiver()
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
                        isAdvertising = false
                        advertiseCallback = null
                        currentDeviceId = null
                        currentServiceUUID = null
                        originalBluetoothName = null
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

    private fun broadcastSuccess(deviceName: String, serviceUUID: String) {
        val intent = Intent(ACTION_ADVERTISE_STARTED).apply {
            putExtra("deviceName", deviceName)
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

    override fun onDestroy() {
        super.onDestroy()
        stopAdvertisingInternal()
        Log.d(TAG, "BLEAdvertiserService destroyed")
    }
}
