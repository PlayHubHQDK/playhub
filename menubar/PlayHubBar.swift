// PlayHubBar — lightweight macOS menu bar app for PlayHub.
// Shows top installed games (by playtime) and launches them via the local
// GameHub server. No dock icon (LSUIElement).

import AppKit
import Foundation

let SERVER = "http://127.0.0.1:4173"

// Mini-i18n: English canonical, Danish translation. Lang comes from /api/config.
var LANG = "en"
let DA: [String: String] = [
    "Open PlayHub": "Åbn PlayHub",
    "Fetching games…": "Henter spil…",
    "No installed games found": "Ingen installerede spil fundet",
    "Launch game": "Start spil",
    "Refresh list": "Opdater listen",
    "Quit PlayHubBar": "Slut PlayHubBar",
]
func tr(_ s: String) -> String { LANG == "da" ? (DA[s] ?? s) : s }

struct Game {
    let appid: Int
    let name: String
    let target: String   // "mac" | "crossover"
    let bottle: String?
    let hours: Double
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var games: [Game] = []

    func applicationDidFinishLaunching(_ note: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "🎮"
        statusItem.button?.toolTip = "PlayHub"
        buildMenu(loading: true)
        loadLang()
        refresh()
    }

    func buildMenu(loading: Bool = false) {
        let menu = NSMenu()

        let open = NSMenuItem(title: tr("Open PlayHub"), action: #selector(openHub), keyEquivalent: "g")
        open.target = self
        menu.addItem(open)
        menu.addItem(.separator())

        if loading {
            menu.addItem(NSMenuItem(title: tr("Fetching games…"), action: nil, keyEquivalent: ""))
        } else if games.isEmpty {
            menu.addItem(NSMenuItem(title: tr("No installed games found"), action: nil, keyEquivalent: ""))
        } else {
            let header = NSMenuItem(title: tr("Launch game"), action: nil, keyEquivalent: "")
            header.isEnabled = false
            menu.addItem(header)
            for (i, g) in games.prefix(7).enumerated() {
                let tag = g.target == "crossover" ? " (CrossOver)" : ""
                let item = NSMenuItem(
                    title: "\(g.name)\(tag) — \(String(format: "%.0f", g.hours)) t",
                    action: #selector(launchGame(_:)),
                    keyEquivalent: i < 5 ? String(i + 1) : ""
                )
                item.target = self
                item.tag = i
                menu.addItem(item)
            }
        }

        menu.addItem(.separator())
        let reload = NSMenuItem(title: tr("Refresh list"), action: #selector(reloadGames), keyEquivalent: "r")
        reload.target = self
        menu.addItem(reload)
        let quit = NSMenuItem(title: tr("Quit PlayHubBar"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)

        statusItem.menu = menu
    }

    @objc func openHub() {
        NSWorkspace.shared.open(URL(string: SERVER)!)
    }

    @objc func reloadGames() {
        buildMenu(loading: true)
        loadLang()
        refresh()
    }

    @objc func launchGame(_ sender: NSMenuItem) {
        guard sender.tag < games.count else { return }
        let g = games[sender.tag]
        var req = URLRequest(url: URL(string: "\(SERVER)/api/launch")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["appid": g.appid, "target": g.target]
        if let b = g.bottle { body["bottle"] = b }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }

    func loadLang() {
        guard let url = URL(string: "\(SERVER)/api/config") else { return }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let lang = json["lang"] as? String {
                DispatchQueue.main.async {
                    LANG = lang
                    self.buildMenu(loading: self.games.isEmpty)
                }
            }
        }.resume()
    }

    func refresh() {
        let url = URL(string: "\(SERVER)/api/steam/library")!
        URLSession.shared.dataTask(with: url) { data, _, _ in
            var result: [Game] = []
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let list = json["games"] as? [[String: Any]] {
                for g in list {
                    guard let installedOn = g["installed_on"] as? String,
                          let appid = g["appid"] as? Int,
                          let name = g["name"] as? String else { continue }
                    let hours = (g["playtime_forever_hours"] as? Double) ?? 0
                    result.append(Game(
                        appid: appid,
                        name: name,
                        target: installedOn,
                        bottle: g["bottle"] as? String,
                        hours: hours
                    ))
                }
                result.sort { $0.hours > $1.hours }
            }
            DispatchQueue.main.async {
                self.games = result
                self.buildMenu()
            }
        }.resume()
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
