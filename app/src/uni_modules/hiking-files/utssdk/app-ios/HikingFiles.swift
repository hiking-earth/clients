import Foundation
import UIKit
public class HikingFiles: NSObject, UIDocumentPickerDelegate {
    private static let shared = HikingFiles()
    private var success: ((String) -> Void)?
    private var cancel: (() -> Void)?
    private var exportSuccess: (() -> Void)?
    private var exportURL: URL?
    private var failed: ((String) -> Void)?
    private func topPresenter() -> UIViewController? {
        let window: UIWindow?
        if #available(iOS 13.0, *) {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let activeScenes = scenes.filter { $0.activationState == .foregroundActive }
            let inactiveScenes = scenes.filter { $0.activationState == .foregroundInactive }
            window = (activeScenes + inactiveScenes).flatMap { $0.windows }.first { $0.isKeyWindow }
        } else {
            window = UIApplication.shared.keyWindow
        }
        guard var controller = window?.rootViewController else { return nil }
        while let presented = controller.presentedViewController { controller = presented }
        return controller
    }
    public static func choose(_ success: @escaping (String) -> Void, _ cancel: @escaping () -> Void, _ failed: @escaping (String) -> Void) {
        guard shared.success == nil && shared.exportSuccess == nil else { failed("请先完成当前文件选择"); return }
        guard let controller = shared.topPresenter() else { failed("当前页面不能选择文件"); return }
        shared.success = success; shared.cancel = cancel; shared.failed = failed
        let picker = UIDocumentPickerViewController(documentTypes: ["public.item"], in: .import)
        picker.delegate = shared; picker.allowsMultipleSelection = false
        controller.present(picker, animated: true)
    }
    public static func save(_ name: String, _ text: String, _ mimeType: String, _ success: @escaping () -> Void, _ cancel: @escaping () -> Void, _ failed: @escaping (String) -> Void) {
        guard shared.success == nil && shared.exportSuccess == nil else { failed("请先完成当前文件选择"); return }
        guard let bytes = text.data(using: .utf8), bytes.count <= 25 * 1024 * 1024 else { failed("文件超过25 MB"); return }
        let safe = name.components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)).joined().prefix(80)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent(safe.isEmpty ? "徒步轨迹.gpx" : String(safe))
            try bytes.write(to: url, options: .atomic)
            guard let presenter = shared.topPresenter() else { try? FileManager.default.removeItem(at: directory); failed("当前页面不能保存文件"); return }
            shared.exportURL = directory; shared.exportSuccess = success; shared.cancel = cancel; shared.failed = failed
            let picker = UIDocumentPickerViewController(urls: [url], in: .exportToService)
            picker.delegate = shared; presenter.present(picker, animated: true)
        } catch { try? FileManager.default.removeItem(at: directory); failed("无法创建导出文件") }
    }
    private func clear() {
        if let directory = exportURL { try? FileManager.default.removeItem(at: directory) }
        success = nil; cancel = nil; failed = nil; exportSuccess = nil; exportURL = nil
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { cancel?(); clear() }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        defer { clear() }
        if let completed = exportSuccess { completed(); return }
        guard let url = urls.first else { failed?("没有选中文件"); return }
        let scoped = url.startAccessingSecurityScopedResource(); defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let handle = try FileHandle(forReadingFrom: url); defer { handle.closeFile() }
            let bytes = handle.readData(ofLength: 5 * 1024 * 1024 + 1)
            guard bytes.count <= 5 * 1024 * 1024 else { failed?("文件超过5 MB"); return }
            guard let text = String(data: bytes, encoding: .utf8) else { failed?("文件需要UTF-8编码"); return }
            success?(text)
        } catch { failed?("文件读取失败，请重新选择") }
    }
}
