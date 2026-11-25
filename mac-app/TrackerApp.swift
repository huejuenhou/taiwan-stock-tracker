// Taiwan Stock Tracker: the Mac app window.
//
// It starts the tracker (taiwan_etf_tracker.py) in the background, shows its
// page in a window of its own, and stops it again on Quit. If the tracker is
// already running (for example from Start Tracker), it just shows the page
// and leaves it running. install.sh compiles this file on each Mac.

import Cocoa
import WebKit

// The tracker's folder is recorded in Info.plist when the app is made.
let trackerDir = (Bundle.main.object(forInfoDictionaryKey: "TrackerFolder") as? String)
    ?? NSHomeDirectory() + "/Applications/Taiwan Stock Tracker"
let trackerURL = URL(string: "http://localhost:8787/")!
let checkURL = URL(string: "http://127.0.0.1:8787/api/update")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var server: Process?
    var startedAt = Date()

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")   // no white flash in dark mode

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Taiwan Stock Tracker"
        window.minSize = NSSize(width: 420, height: 520)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("TrackerWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        showMessage("Starting…", detail: "")
        isTrackerRunning { running in
            if running { self.webView.load(URLRequest(url: trackerURL)) } else { self.startServer() }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ note: Notification) {
        // Stop only a tracker this app started; Ctrl+C lets it finish saving.
        if let s = server, s.isRunning { s.interrupt(); s.waitUntilExit() }
    }

    // MARK: tracker process

    func isTrackerRunning(_ done: @escaping (Bool) -> Void) {
        var req = URLRequest(url: checkURL)
        req.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: req) { data, _, _ in
            let ok = data.flatMap { String(data: $0, encoding: .utf8) }?.contains("\"current\"") ?? false
            DispatchQueue.main.async { done(ok) }
        }.resume()
    }

    func startServer() {
        let script = trackerDir + "/taiwan_etf_tracker.py"
        guard FileManager.default.fileExists(atPath: script) else {
            showMessage("Can't find the tracker's folder",
                        detail: "It was at \(trackerDir). If you moved it, open Install App in the folder's new place, or paste the install line from the project page into Terminal.")
            return
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        p.arguments = [script]
        p.currentDirectoryURL = URL(fileURLWithPath: trackerDir)
        var env = ProcessInfo.processInfo.environment
        env["ETF_NO_BROWSER"] = "1"
        env["PYTHONUNBUFFERED"] = "1"   // so tracker.log is written as things happen
        p.environment = env
        let logPath = trackerDir + "/tracker.log"
        FileManager.default.createFile(atPath: logPath, contents: nil)
        if let log = FileHandle(forWritingAtPath: logPath) {
            p.standardOutput = log
            p.standardError = log
        }
        do { try p.run() } catch {
            showMessage("The tracker couldn't start", detail: error.localizedDescription)
            return
        }
        server = p
        startedAt = Date()
        waitForServer()
    }

    func waitForServer() {
        isTrackerRunning { running in
            if running {
                self.webView.load(URLRequest(url: trackerURL))
            } else if let s = self.server, !s.isRunning {
                let log = (try? String(contentsOfFile: trackerDir + "/tracker.log", encoding: .utf8)) ?? ""
                self.showMessage("The tracker stopped while starting",
                                 detail: String(log.suffix(600)))
            } else if Date().timeIntervalSince(self.startedAt) > 30 {
                self.showMessage("The tracker is taking too long to start",
                                 detail: "Quit and open Taiwan Stock Tracker again.")
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.waitForServer() }
            }
        }
    }

    func showMessage(_ title: String, detail: String) {
        func esc(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        }
        let html = """
        <html><head><meta name="color-scheme" content="light dark"><style>
        body{font:15px -apple-system,sans-serif;display:grid;place-items:center;height:90vh;margin:0;text-align:center}
        .seal{width:64px;height:64px;border-radius:12px;background:#c8322b;color:#f4ece0;display:grid;place-items:center;
        font:600 36px "PingFang TC",sans-serif;margin:0 auto 18px;box-shadow:inset 0 0 0 4px #c8322b,inset 0 0 0 6px #f4ece0}
        pre{white-space:pre-wrap;text-align:left;max-width:640px;opacity:.7;font-size:12px}
        </style></head><body><div><div class="seal">台</div><h3>\(esc(title))</h3><pre>\(esc(detail))</pre></div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: web view

    // Links to other sites (like "What's new") open in the normal browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, let host = url.host,
           host != "localhost", host != "127.0.0.1", url.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith config: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // The tracker restarts itself after an update; reload once it's back.
    func webView(_ webView: WKWebView, didFail nav: WKNavigation!, withError error: Error) { retryLoad() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) { retryLoad() }
    func retryLoad() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.webView.load(URLRequest(url: trackerURL)) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message
        a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    @objc func reload(_ sender: Any?) { webView.load(URLRequest(url: trackerURL)) }

    // MARK: menus (Edit is needed for copy and paste in the page's fields)

    func buildMenu() {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem(); let menu = NSMenu(title: title)
            items.forEach { menu.addItem($0) }
            item.submenu = menu; main.addItem(item)
        }
        func mi(_ t: String, _ a: Selector?, _ k: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.keyEquivalentModifierMask = mods; return i
        }
        add("Taiwan Stock Tracker", [
            mi("About Taiwan Stock Tracker", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""),
            .separator(),
            mi("Hide Taiwan Stock Tracker", #selector(NSApplication.hide(_:)), "h"),
            .separator(),
            mi("Quit Taiwan Stock Tracker", #selector(NSApplication.terminate(_:)), "q")])
        add("Edit", [
            mi("Undo", Selector(("undo:")), "z"), mi("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            mi("Cut", #selector(NSText.cut(_:)), "x"), mi("Copy", #selector(NSText.copy(_:)), "c"),
            mi("Paste", #selector(NSText.paste(_:)), "v"), mi("Select All", #selector(NSText.selectAll(_:)), "a")])
        add("View", [mi("Reload", #selector(reload(_:)), "r")])
        add("Window", [
            mi("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            mi("Close", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
