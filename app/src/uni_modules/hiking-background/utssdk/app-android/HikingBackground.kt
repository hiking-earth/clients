package earth.hiking.background
import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import org.json.JSONArray
import org.json.JSONObject

object HikingBackground {
    var changed: (() -> Unit)? = null
    var error: ((String) -> Unit)? = null
    private fun prefs(context: Context) = context.getSharedPreferences("hiking_background", Context.MODE_PRIVATE)
    @Synchronized fun buffer(context: Context): String = prefs(context).getString("buffer", "{\"session\":\"\",\"points\":[]}")!!
    @Synchronized fun start(context: Context, session: String, changed: () -> Unit, error: (String) -> Unit): Boolean {
        if (Build.VERSION.SDK_INT >= 23 && context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            error("后台轨迹需要精确定位权限，请先在系统设置中授权"); return false
        }
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (context is Activity) context.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7352)
            error("请允许持续通知后重新开启后台记录"); return false
        }
        val old = JSONObject(buffer(context))
        if (old.optString("session") != session && (old.optJSONArray("points")?.length() ?: 0) > 0) {
            error("还有未恢复的后台轨迹，请先恢复草稿"); return false
        }
        if (old.optString("session") != session && !prefs(context).edit().putString("buffer", JSONObject().put("session", session).put("points", JSONArray()).toString()).commit()) {
            error("无法创建后台轨迹缓存，记录未启动"); return false
        }
        this.changed = changed; this.error = error
        try {
            val intent = Intent(context, HikingLocationService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
            return true
        } catch (_: Exception) { this.changed = null; this.error = null; error("系统未允许后台定位服务，请保持应用在前台"); return false }
    }
    fun stop(context: Context) { HikingLocationService.instance?.stopUpdates(); context.stopService(Intent(context, HikingLocationService::class.java)); changed = null; error = null }
    @Synchronized fun append(context: Context, location: Location) {
        val data = JSONObject(buffer(context)); val points = data.optJSONArray("points") ?: JSONArray()
        if (points.length() >= 10000) { error?.invoke("后台缓存已满，记录已停止，请返回应用保存轨迹"); stop(context); return }
        val point = JSONObject().put("latitude", location.latitude).put("longitude", location.longitude)
            .put("timestamp", location.time).put("accuracy", location.accuracy.toDouble())
        if (location.hasAltitude()) point.put("altitude", location.altitude)
        if (location.hasSpeed()) point.put("speed", location.speed.toDouble())
        points.put(point); data.put("points", points)
        if (!prefs(context).edit().putString("buffer", data.toString()).commit()) { error?.invoke("后台轨迹缓存失败，记录已停止"); stop(context); return }
        changed?.invoke()
    }
    @Synchronized fun ack(context: Context, timestamp: Number): Boolean {
        if (!timestamp.toDouble().isFinite() || timestamp.toDouble() <= 0) return false
        try {
        val data = JSONObject(buffer(context)); val all = data.optJSONArray("points") ?: JSONArray(); val remaining = JSONArray()
        for (i in 0 until all.length()) { val p = all.optJSONObject(i); if (p == null || !p.optDouble("timestamp").isFinite() || p.optDouble("timestamp") > timestamp.toDouble()) remaining.put(all.get(i)) }
        data.put("points", remaining); return prefs(context).edit().putString("buffer", data.toString()).commit()
        } catch (_: Exception) { return false }
    }
}
class HikingLocationService : Service(), LocationListener {
    companion object { var instance: HikingLocationService? = null }
    private var manager: LocationManager? = null
    private var accepting = false
    override fun onCreate() { super.onCreate(); instance = this }
    fun stopUpdates() { accepting = false; manager?.removeUpdates(this) }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) notificationManager.createNotificationChannel(NotificationChannel("hiking_record", "徒步轨迹记录", NotificationManager.IMPORTANCE_LOW))
            val launch = packageManager.getLaunchIntentForPackage(packageName)
            val notification = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "hiking_record") else Notification.Builder(this))
                .setContentTitle("徒步地球正在记录轨迹").setContentText("返回应用暂停或结束；轨迹保存在本机")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true)
            if (launch != null) notification.setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)))
            if (Build.VERSION.SDK_INT >= 29) startForeground(7351, notification.build(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION) else startForeground(7351, notification.build())
            manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            accepting = true
            manager!!.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000L, 2f, this, Looper.getMainLooper())
        } catch (_: Exception) { HikingBackground.error?.invoke("后台GPS不可用，请检查系统定位权限"); stopSelf() }
        // Never restart recording silently after process termination.
        return START_NOT_STICKY
    }
    override fun onLocationChanged(location: Location) { if (accepting) HikingBackground.append(this, location) }
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) { HikingBackground.error?.invoke("系统GPS已关闭"); stopSelf() }
    @Deprecated("Legacy API") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onDestroy() { stopUpdates(); instance = null; super.onDestroy() }
}
