import Cocoa
import WebKit

final class WebViewHarness: NSObject, NSApplicationDelegate, WKNavigationDelegate {
   private var window: NSWindow!
   private var webView: WKWebView!

   func applicationDidFinishLaunching(_ notification: Notification) {
      let frame = NSRect(x: 80, y: 80, width: 960, height: 720)
      window = NSWindow(
         contentRect: frame,
         styleMask: [ .titled, .closable, .resizable ],
         backing: .buffered,
         defer: false
      )
      window.title = "System WKWebView Test Harness"

      let config = WKWebViewConfiguration()
      config.websiteDataStore = .nonPersistent()
      webView = WKWebView(frame: frame, configuration: config)
      webView.navigationDelegate = self

      window.contentView = webView
      window.makeKeyAndOrderFront(nil)
      window.makeFirstResponder(webView)
      NSApp.activate(ignoringOtherApps: true)

      print("READY")
      fflush(stdout)

      DispatchQueue.global(qos: .userInitiated).async {
         while let line = readLine(strippingNewline: true) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed == "QUIT" {
               DispatchQueue.main.async {
                  NSApp.terminate(nil)
               }
               return
            }
            if let url = URL(string: trimmed) {
               DispatchQueue.main.async {
                  self.window.makeKeyAndOrderFront(nil)
                  self.window.makeFirstResponder(self.webView)
                  NSApp.activate(ignoringOtherApps: true)
                  self.webView.load(URLRequest(url: url))
               }
            }
         }
         DispatchQueue.main.async {
            NSApp.terminate(nil)
         }
      }
   }

   func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      window.title = webView.title ?? "System WKWebView Test Harness"
      window.makeFirstResponder(webView)
      print("LOADED")
      fflush(stdout)
   }

   func webView(
      _ webView: WKWebView,
      didFail navigation: WKNavigation!,
      withError error: Error
   ) {
      print("ERROR:\(error.localizedDescription)")
      fflush(stdout)
   }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = WebViewHarness()
app.delegate = delegate
app.run()
