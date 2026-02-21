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
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hirule.mobile.MainActivity
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.pow

class BLEScannerService : Service() {

    companion object {
        private const val TAG = "BLEScannerService"
        private const val CHANNEL_ID = "droplink_ble_scanner"
        private const val NOTIFICATION_ID = 1001
        private const val DROPLINK_PREFIX = "DL-"
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
    
    data class DetectedDevice(
        val id: String,
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
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: ${intent?.action}")
        
        when (intent?.action) {
            ACTION_START_SCAN -> startScanning()
            ACTION_STOP_SCAN -> {
                stopScanning()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }
        
        // Show foreground notification
        startForeground(NOTIFICATION_ID, createNotification())
        
        return START_STICKY // Restart if killed
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun initBluetooth() {
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothLeScanner = bluetoothManager?.adapter?.bluetoothLeScanner
        Log.d(TAG, "Bluetooth initialized, scanner available: ${bluetoothLeScanner != null}")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "DropLink Scanner",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background BLE scanning for nearby DropLink users"
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
        val contentText = if (deviceCount > 0) {
            "$deviceCount DropLink user${if (deviceCount > 1) "s" else ""} nearby"
        } else {
            "Scanning for nearby users..."
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DropLink Active")
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

        val scanner = bluetoothLeScanner
        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner is null")
            return
        }

        try {
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setReportDelay(0)
                .build()

            // No filters - scan all, filter by name in callback
            scanner.startScan(null, settings, scanCallback)
            isScanning = true
            Log.d(TAG, "✅ Background scanning started")
            
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
                val deviceName = result.device.name ?: return
                
                // Only process DropLink devices
                if (!deviceName.startsWith(DROPLINK_PREFIX)) return
                
                val deviceId = result.device.address
                val rssi = result.rssi
                val distanceFeet = calculateDistanceFeet(rssi)
                
                Log.d(TAG, "Found DropLink device: $deviceName, RSSI: $rssi, Distance: ${String.format("%.1f", distanceFeet)}ft")
                
                // Update or add device
                val device = DetectedDevice(
                    id = deviceId,
                    name = deviceName,
                    rssi = rssi,
                    distanceFeet = distanceFeet,
                    lastSeen = System.currentTimeMillis()
                )
                
                val isNewDevice = !detectedDevices.containsKey(deviceId)
                detectedDevices[deviceId] = device
                
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

    override fun onDestroy() {
        super.onDestroy()
        stopScanning()
        handler.removeCallbacksAndMessages(null)
        Log.d(TAG, "BLEScannerService destroyed")
    }
}
