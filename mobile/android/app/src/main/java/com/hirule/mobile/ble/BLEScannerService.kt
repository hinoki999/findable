package com.hirule.mobile.ble

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hirule.mobile.MainActivity
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.pow

class BLEScannerService : Service() {

    companion object {
        private const val TAG = "BLEScannerService"
        private const val CHANNEL_ID = "dropshake_ble_scanner"
        private const val NOTIFICATION_ID = 1001
        private const val DROPSHAKE_SERVICE_UUID = "af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d"
        private const val DROPSHAKE_MANUFACTURER_ID = 0xFFFF
        const val PREFS_NAME = "BLEScannerPrefs"
        const val KEY_DEVICES = "detected_devices"
        
        // Intent actions for communication
        const val ACTION_START_SCAN = "com.hirule.mobile.START_BLE_SCAN"
        const val ACTION_STOP_SCAN = "com.hirule.mobile.STOP_BLE_SCAN"
        const val ACTION_DEVICE_FOUND = "com.hirule.mobile.BLE_DEVICE_FOUND"
        const val ACTION_DEVICES_UPDATED = "com.hirule.mobile.BLE_DEVICES_UPDATED"
        
        // Device timeout - remove if not seen for 30 seconds
        private const val DEVICE_TIMEOUT_MS = 30000L
    }

    private var bluetoothLeScanner: BluetoothLeScanner? = null
    private var isScanning = false
    private val detectedDevices = mutableMapOf<String, DetectedDevice>()
    private val handler = Handler(Looper.getMainLooper())
    private var bluetoothStateReceiver: BroadcastReceiver? = null
    // Bluetooth is off: scanning is impossible and the notification says so
    private var bluetoothOff = false
    
    data class DetectedDevice(
        val id: String,           // MAC address
        val deviceId: String,     // User's UUID prefix from manufacturer data
        val name: String,
        val rssi: Int,
        val distanceFeet: Float,
        var lastSeen: Long
    )

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "BLEScannerService created")
        createNotificationChannel()
        initBluetooth()
        // Scanning stops when Bluetooth is turned off; this restarts it when it's back on
        registerBluetoothStateReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SCAN -> {
                startForegroundCompat()
                startScanning()
            }
            ACTION_STOP_SCAN -> {
                stopScanning()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                // System restart via START_STICKY (null intent) - resume scanning
                Log.d(TAG, "Service restarted by system (START_STICKY), resuming scanning")
                startForegroundCompat()
                startScanning()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // The three-argument startForeground (with a service type) exists only on API 29+;
    // calling it on Android 7-9 (minSdk is 24) crashes the service
    private fun startForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, createNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(NOTIFICATION_ID, createNotification())
        }
    }

    private fun initBluetooth() {
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothOff = bluetoothManager?.adapter?.isEnabled == false
        // Null while Bluetooth is off, so this runs again when it turns back on
        bluetoothLeScanner = bluetoothManager?.adapter?.bluetoothLeScanner
        Log.d(TAG, "Bluetooth initialized, scanner available: ${bluetoothLeScanner != null}")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "DropShake Scanner",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background BLE scanning for nearby DropShake users"
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

        val deviceCount = detectedDevices.size
        val contentText = if (bluetoothOff) {
            "Bluetooth is off. Turn it on to find nearby users."
        } else if (deviceCount > 0) {
            "$deviceCount DropShake user${if (deviceCount > 1) "s" else ""} nearby"
        } else {
            "Scanning for nearby users..."
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DropShake Active")
            .setContentText(contentText)
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

    private fun startScanning() {
        if (isScanning) {
            Log.d(TAG, "Already scanning")
            return
        }

        if (bluetoothLeScanner == null) {
            initBluetooth()
        }
        val scanner = bluetoothLeScanner
        if (scanner == null) {
            // Bluetooth off (or no BLE): the state receiver retries when it turns on
            Log.e(TAG, "BluetoothLeScanner is null")
            updateNotification()
            return
        }

        try {
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setReportDelay(0)
                .build()

            // Filter by DropShake Service UUID
            val serviceUuid = ParcelUuid(UUID.fromString(DROPSHAKE_SERVICE_UUID))
            val filter = ScanFilter.Builder()
                .setServiceUuid(serviceUuid)
                .build()
            val filters = listOf(filter)

            scanner.startScan(filters, settings, scanCallback)
            isScanning = true
            Log.d(TAG, "✅ Background scanning started with Service UUID filter")
            
            // Start cleanup timer
            startDeviceCleanupTimer()
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing BLE permissions", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start scanning", e)
        }
    }

    private fun stopScanning() {
        if (!isScanning) return

        try {
            bluetoothLeScanner?.stopScan(scanCallback)
            isScanning = false
            handler.removeCallbacksAndMessages(null)
            Log.d(TAG, "Background scanning stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping scan", e)
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            try {
                // Extract deviceId from manufacturer data (0xFFFF)
                val manufacturerData = result.scanRecord?.getManufacturerSpecificData(DROPSHAKE_MANUFACTURER_ID)
                if (manufacturerData == null) {
                    Log.d(TAG, "No manufacturer data for device: ${result.device.address}")
                    return
                }
                
                val deviceId = try {
                    String(manufacturerData, Charsets.UTF_8).trim()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decode manufacturer data", e)
                    return
                }
                
                if (deviceId.isEmpty()) {
                    Log.d(TAG, "Empty deviceId from manufacturer data")
                    return
                }
                
                val macAddress = result.device.address
                val deviceName = result.device.name ?: "DropShake-$deviceId"
                val rssi = result.rssi
                val distanceFeet = calculateDistanceFeet(rssi)
                
                Log.d(TAG, "Found DropShake device: deviceId=$deviceId, MAC=$macAddress, RSSI: $rssi, Distance: ${String.format("%.1f", distanceFeet)}ft")
                
                // Update or add device (keyed by MAC address)
                val device = DetectedDevice(
                    id = macAddress,
                    deviceId = deviceId,
                    name = deviceName,
                    rssi = rssi,
                    distanceFeet = distanceFeet,
                    lastSeen = System.currentTimeMillis()
                )
                
                val isNewDevice = !detectedDevices.containsKey(macAddress)
                detectedDevices[macAddress] = device
                
                // Persist to SharedPreferences
                persistDevices()
                
                // Broadcast to React Native (if app is running)
                broadcastDeviceFound(device)
                
                // Update notification if device count changed
                if (isNewDevice) {
                    updateNotification()
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "Security exception in scan callback", e)
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "Scan failed with error: $errorCode")
            isScanning = false
        }
    }

    private fun calculateDistanceFeet(rssi: Int): Float {
        val measuredPower = -59
        val distanceMeters = 10.0.pow((measuredPower - rssi) / (10.0 * 2.0))
        return (distanceMeters * 3.28084).toFloat()
    }

    private fun persistDevices() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val jsonArray = JSONArray()
            
            detectedDevices.values.forEach { device ->
                val json = JSONObject().apply {
                    put("id", device.id)
                    put("deviceId", device.deviceId)
                    put("name", device.name)
                    put("rssi", device.rssi)
                    put("distanceFeet", device.distanceFeet.toDouble())
                    put("lastSeen", device.lastSeen)
                }
                jsonArray.put(json)
            }
            
            prefs.edit().putString(KEY_DEVICES, jsonArray.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error persisting devices", e)
        }
    }

    private fun broadcastDeviceFound(device: DetectedDevice) {
        // Send intent that can be received by BLEScannerModule
        val intent = Intent(ACTION_DEVICE_FOUND).apply {
            putExtra("id", device.id)
            putExtra("deviceId", device.deviceId)
            putExtra("name", device.name)
            putExtra("rssi", device.rssi)
            putExtra("distanceFeet", device.distanceFeet)
        }
        sendBroadcast(intent)
    }

    private fun startDeviceCleanupTimer() {
        handler.postDelayed(object : Runnable {
            override fun run() {
                cleanupStaleDevices()
                if (isScanning) {
                    handler.postDelayed(this, 5000) // Run every 5 seconds
                }
            }
        }, 5000)
    }

    private fun cleanupStaleDevices() {
        val now = System.currentTimeMillis()
        val staleDevices = detectedDevices.filter { 
            now - it.value.lastSeen > DEVICE_TIMEOUT_MS 
        }
        
        if (staleDevices.isNotEmpty()) {
            staleDevices.keys.forEach { key ->
                detectedDevices.remove(key)
                Log.d(TAG, "Removed stale device: $key")
            }
            persistDevices()
            updateNotification()
            
            // Broadcast that devices were updated
            sendBroadcast(Intent(ACTION_DEVICES_UPDATED))
        }
    }

    private fun registerBluetoothStateReceiver() {
        if (bluetoothStateReceiver != null) return
        bluetoothStateReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != BluetoothAdapter.ACTION_STATE_CHANGED) return
                val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    // The system has already stopped the scan; forget it so a restart isn't
                    // refused as "Already scanning"
                    Log.d(TAG, "Bluetooth turning off, scan stopped")
                    isScanning = false
                    handler.removeCallbacksAndMessages(null)
                    bluetoothLeScanner = null
                    bluetoothOff = true
                    updateNotification()
                } else if (state == BluetoothAdapter.STATE_ON) {
                    Log.d(TAG, "Bluetooth on, restarting scan")
                    initBluetooth()
                    startScanning()
                    updateNotification()
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
        } catch (e: Exception) {
            Log.e(TAG, "Error registering Bluetooth state receiver", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopScanning()
        try {
            bluetoothStateReceiver?.let { unregisterReceiver(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering Bluetooth state receiver", e)
        }
        bluetoothStateReceiver = null
        handler.removeCallbacksAndMessages(null)
        Log.d(TAG, "BLEScannerService destroyed")
    }
}
