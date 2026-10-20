import Combine
import Foundation
import NimbusSigma
import SwiftUI
import UIKit

/// A link request JavaScript answered with a failure.
struct LinkFailed: Error { let message: String }

/// Link requests waiting for JavaScript. The native session asks for a link;
/// the sheet view sends an event; your `link` function answers through the
/// module's provideLink / failLink.
@MainActor
@objc(RNSigmaLinks)
public final class RNSigmaLinks: NSObject {
    private static var pending: [String: CheckedContinuation<URL, Error>] = [:]

    static func request(_ send: (String) -> Void) async throws -> URL {
        let id = UUID().uuidString
        return try await withCheckedThrowingContinuation { cont in
            pending[id] = cont
            send(id)
            // Answered or not, a request ends after two minutes.
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 120_000_000_000)
                pending.removeValue(forKey: id)?.resume(throwing: LinkFailed(message: "Your link function did not answer."))
            }
        }
    }

    @objc public static func provide(_ id: String, url: String) {
        guard let u = URL(string: url) else { return fail(id, message: "That is not a link.") }
        pending.removeValue(forKey: id)?.resume(returning: u)
    }

    @objc public static func fail(_ id: String, message: String) {
        pending.removeValue(forKey: id)?.resume(throwing: LinkFailed(message: message))
    }
}

/// Hosts one SigmaSheetView and its SigmaSession, and tells JavaScript what
/// happens: link requests, the phase, save state, title and saves.
@MainActor
@objc(RNSigmaSheetHost)
public final class RNSigmaSheetHost: UIView {
    /// Sends an event ("SigmaPhase", …) with its body to JavaScript.
    @objc public var emit: ((String, [String: Any]) -> Void)?

    private var session: SigmaSession?
    private var controller = SigmaGridController()
    private var hosting: UIHostingController<AnyView>?
    private var watching = Set<AnyCancellable>()
    private var linkFailure: String?

    private static var sheets: [String: Weak] = [:]
    private final class Weak { weak var host: RNSigmaSheetHost?; init(_ h: RNSigmaSheetHost) { host = h } }
    private var sheetId: String?

    @objc public static func sheet(_ id: String) -> RNSigmaSheetHost? { sheets[id]?.host }

    private var header = SigmaHeader.standard
    private var hasBack = false

    /// The header's options, read when the sheet opens. A React Native app has
    /// nothing native to go back to, so the arrow shows only with an onBack.
    @objc public func configureHeader(_ visible: Bool, back: Bool, logo: Bool, hasBack: Bool) {
        var h = SigmaHeader(showsBack: back && hasBack, showsLogo: logo) { [weak self] in self?.emit?("SigmaBack", [:]) }
        h.isVisible = visible
        header = h
        self.hasBack = hasBack
    }

    /// Starts the sheet once React Native has set the id.
    @objc public func start(_ id: String) {
        if sheetId != id {
            if let old = sheetId { Self.sheets[old] = nil }
            sheetId = id
            Self.sheets[id] = Weak(self)
        }
        guard session == nil else { return }
        let s = SigmaSession { [weak self] in
            do {
                let url = try await RNSigmaLinks.request { id in self?.emit?("SigmaLinkRequest", ["requestId": id]) }
                self?.linkFailure = nil
                return url
            } catch let e as LinkFailed {
                self?.linkFailure = e.message
                throw SigmaError.network(e.message)
            }
        }
        session = s
        let host = UIHostingController(rootView: AnyView(SigmaSheetView(session: s, controller: controller, header: header)))
        host.view.backgroundColor = .systemBackground
        hosting = host
        host.view.frame = bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(host.view)
        attachToParent()
        watch(s)
        s.start()
    }

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        attachToParent()
    }

    /// The editor presents its panels as sheets, so it must be a child of the screen's view controller.
    private func attachToParent() {
        guard let host = hosting, host.parent == nil, window != nil else { return }
        var r: UIResponder? = self
        while let next = r?.next { if let vc = next as? UIViewController { vc.addChild(host); host.didMove(toParent: vc); return }; r = next }
    }

    private func watch(_ s: SigmaSession) {
        s.$phase.removeDuplicates().sink { [weak self] p in
            guard let self else { return }
            switch p {
            case .loading: emit?("SigmaPhase", ["phase": "loading"])
            case .ready:
                var body: [String: Any] = ["phase": "ready"]
                if let d = s.document {
                    body["document"] = ["id": d.id, "title": d.title, "filename": d.filename, "format": d.format.rawValue, "mode": d.mode.rawValue, "test": d.test]
                }
                emit?("SigmaPhase", body)
            case let .failed(e):
                emit?("SigmaPhase", ["phase": "failed", "error": Self.errorBody(e, linkFailure: linkFailure)])
            }
        }.store(in: &watching)
        s.$saveState.removeDuplicates().sink { [weak self] st in
            switch st {
            case .saved: self?.emit?("SigmaSaveState", ["state": "saved"])
            case .unsaved: self?.emit?("SigmaSaveState", ["state": "unsaved"])
            case .saving: self?.emit?("SigmaSaveState", ["state": "saving"])
            case let .failed(e): self?.emit?("SigmaSaveState", ["state": "failed", "error": Self.errorBody(e, linkFailure: nil)])
            }
        }.store(in: &watching)
        // The title is empty until the sheet opens; only a real one is news.
        s.$title.removeDuplicates().sink { [weak self] t in
            if !t.isEmpty || s.phase == .ready { self?.emit?("SigmaTitle", ["title": t]) }
        }.store(in: &watching)
        s.$lastSaved.compactMap { $0 }.sink { [weak self] at in self?.emit?("SigmaSaved", ["at": at.timeIntervalSince1970 * 1000]) }.store(in: &watching)
    }

    /// Saves what was typed last, then lets the session go.
    @objc public func dispose() {
        if let id = sheetId, Self.sheets[id]?.host === self { Self.sheets[id] = nil }
        watching = []
        hosting?.willMove(toParent: nil)
        hosting?.view.removeFromSuperview()
        hosting?.removeFromParent()
        hosting = nil
        guard let s = session else { return }
        session = nil
        Task { try? await s.save() }
    }

    // MARK: Commands from JavaScript

    public typealias Resolve = (Any?) -> Void
    public typealias Reject = (String, String, NSDictionary?) -> Void

    @objc public func save(_ resolve: @escaping Resolve, reject: @escaping Reject) {
        run(resolve, reject) { s in try await s.save(); return nil }
    }

    @objc public func export(_ format: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        run(resolve, reject) { s in
            let f = try await s.export(format.flatMap(SigmaFormat.init(rawValue:)))
            return ["base64": f.data.base64EncodedString(), "filename": f.filename, "format": f.format.rawValue, "mimeType": f.format.mimeType]
        }
    }

    @objc public func undo(_ resolve: @escaping Resolve, reject: @escaping Reject) { controller.undo(); resolve(nil) }
    @objc public func redo(_ resolve: @escaping Resolve, reject: @escaping Reject) { controller.redo(); resolve(nil) }

    @objc public func reload(_ resolve: @escaping Resolve, reject: @escaping Reject) {
        run(resolve, reject) { s in s.reload(); return nil }
    }

    @objc public func rename(_ title: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        run(resolve, reject) { s in s.title = title; return nil }
    }

    private func run(_ resolve: @escaping Resolve, _ reject: @escaping Reject, _ body: @escaping (SigmaSession) async throws -> Any?) {
        guard let s = session else { return reject("not_ready", "The sheet is still opening.", nil) }
        Task {
            do { resolve(try await body(s)) } catch let e as SigmaError {
                let b = Self.errorBody(e, linkFailure: nil)
                reject(b["code"] as? String ?? "server", b["message"] as? String ?? "", b["status"].map { ["status": $0] } as NSDictionary?)
            } catch {
                reject("server", error.localizedDescription, nil)
            }
        }
    }

    static func errorBody(_ e: SigmaError, linkFailure: String?) -> [String: Any] {
        let message = e.errorDescription ?? ""
        switch e {
        case .unauthorized: return ["code": "unauthorized", "message": message]
        case .quotaExceeded: return ["code": "quota_exceeded", "message": message]
        case .notFound: return ["code": "not_found", "message": message]
        case .linkExpired: return ["code": "link_expired", "message": message]
        case .linkInvalid: return ["code": "link_invalid", "message": message]
        case .editor: return ["code": "editor", "message": message]
        case .notReady: return ["code": "not_ready", "message": message]
        case .engine: return ["code": "engine", "message": message]
        case let .server(status, _): return ["code": "server", "message": message, "status": status]
        case let .network(m): return ["code": linkFailure != nil && m == linkFailure ? "link_failed" : "network", "message": message]
        }
    }
}
