import Foundation
import CoreLocation
public class HikingBackground: NSObject, CLLocationManagerDelegate {
    private static let shared = HikingBackground()
    private let manager = CLLocationManager()
    private var accepting = false
    private var changed: (() -> Void)?
    private var failed: ((String) -> Void)?
    private let key = "hiking_background_buffer"
    override init() { super.init(); manager.delegate = self }
    private func data() -> [String: Any] {
        guard let bytes = UserDefaults.standard.data(forKey: key), let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return ["session": "", "points": []] }
        return value
    }
    private func store(_ value: [String: Any]) -> Bool {
        guard let bytes = try? JSONSerialization.data(withJSONObject: value) else { return false }
        UserDefaults.standard.set(bytes, forKey: key); return true
    }
    public static func start(_ session: String, _ changed: @escaping () -> Void, _ error: @escaping (String) -> Void) -> Bool {
        let selfRef = shared
        guard CLLocationManager.locationServicesEnabled() else { error("系统定位已关闭"); return false }
        let status = CLLocationManager.authorizationStatus()
        guard status == .authorizedAlways else {
            if status == .authorizedWhenInUse || status == .notDetermined { selfRef.manager.requestAlwaysAuthorization() }
            error("请在系统设置中允许始终定位，再重新开始后台记录"); return false
        }
        let old = selfRef.data()
        if (old["session"] as? String) != session {
            if !(old["points"] as? [[String: Any]] ?? []).isEmpty { error("还有未恢复的后台轨迹，请先恢复草稿"); return false }
            guard selfRef.store(["session": session, "points": []]) else { error("无法创建后台轨迹缓存"); return false }
        }
        selfRef.changed = changed; selfRef.failed = error
        selfRef.manager.desiredAccuracy = kCLLocationAccuracyBest
        selfRef.manager.distanceFilter = 2
        selfRef.manager.activityType = .fitness
        selfRef.manager.pausesLocationUpdatesAutomatically = false
        selfRef.manager.allowsBackgroundLocationUpdates = true
        selfRef.manager.showsBackgroundLocationIndicator = true
        selfRef.accepting = true
        selfRef.manager.startUpdatingLocation(); return true
    }
    public static func stop() {
        shared.accepting = false
        shared.manager.stopUpdatingLocation(); shared.manager.allowsBackgroundLocationUpdates = false
        shared.changed = nil; shared.failed = nil
    }
    public static func buffer() -> String {
        guard let bytes = try? JSONSerialization.data(withJSONObject: shared.data()), let text = String(data: bytes, encoding: .utf8) else { return "{}" }
        return text
    }
    public static func ack(_ timestamp: NSNumber) -> Bool {
        guard timestamp.doubleValue.isFinite && timestamp.doubleValue > 0 else { return false }
        var value = shared.data()
        let points = (value["points"] as? [[String: Any]] ?? []).filter { ($0["timestamp"] as? Double ?? 0) > timestamp.doubleValue }
        value["points"] = points; return shared.store(value)
    }
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard accepting else { return }
        var value = data(); var points = value["points"] as? [[String: Any]] ?? []
        for location in locations where location.horizontalAccuracy >= 0 {
            if points.count >= 10000 {
                value["points"] = points
                let saved = store(value)
                let callback = failed
                HikingBackground.stop()
                callback?(saved ? "后台缓存已满，记录已停止，请返回应用保存轨迹" : "后台轨迹缓存失败，记录已停止")
                return
            }
            var point: [String: Any] = ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "timestamp": location.timestamp.timeIntervalSince1970 * 1000, "accuracy": location.horizontalAccuracy]
            if location.verticalAccuracy >= 0 { point["altitude"] = location.altitude }
            if location.speed >= 0 { point["speed"] = location.speed }
            points.append(point)
        }
        value["points"] = points
        guard store(value) else { let callback = failed; HikingBackground.stop(); callback?("后台轨迹缓存失败，记录已停止"); return }
        changed?()
    }
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard accepting else { return }
        if (error as NSError).code == CLError.denied.rawValue { let callback = failed; HikingBackground.stop(); callback?("系统定位权限已撤回") }
    }
}
