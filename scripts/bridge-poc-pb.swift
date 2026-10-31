import AppKit
// usage: bridge-poc-pb backup <dir> | restore <dir> | count
let a = CommandLine.arguments
let pb = NSPasteboard.general
switch a.count > 1 ? a[1] : "" {
case "backup":
    let dir = URL(fileURLWithPath: a[2]); try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var meta: [[String]] = []
    for (i, it) in (pb.pasteboardItems ?? []).enumerated() {
        var types: [String] = []
        for t in it.types { if let d = it.data(forType: t) { try! d.write(to: dir.appendingPathComponent("\(i)-\(types.count)")); types.append(t.rawValue) } }
        meta.append(types)
    }
    try! JSONSerialization.data(withJSONObject: meta).write(to: dir.appendingPathComponent("meta.json"))
    print("backup items=\(meta.count)")
case "restore":
    let dir = URL(fileURLWithPath: a[2])
    let meta = try! JSONSerialization.jsonObject(with: Data(contentsOf: dir.appendingPathComponent("meta.json"))) as! [[String]]
    pb.clearContents()
    var items: [NSPasteboardItem] = []
    for (i, types) in meta.enumerated() { let it = NSPasteboardItem(); for (j, t) in types.enumerated() { it.setData(try! Data(contentsOf: dir.appendingPathComponent("\(i)-\(j)")), forType: NSPasteboard.PasteboardType(t)) }; items.append(it) }
    if !items.isEmpty { pb.writeObjects(items) }
    print("restored items=\(items.count)")
case "count":
    let items = pb.pasteboardItems ?? []
    print("items=\(items.count) png=\(items.filter { $0.data(forType: .png) != nil }.count)")
    for (i, it) in items.enumerated() { print("  item\(i) png_bytes=\(it.data(forType: .png)?.count ?? 0)") }
default: exit(2)
}
