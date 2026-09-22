import AppKit
import Foundation

// Firefox Native Messaging host for Koppy. It receives only framed PNG bytes
// from the companion extension and writes them as independent macOS pasteboard
// items. It has no HTTP listener, URL fetcher, cookie access or clipboard-read
// path. Firefox restricts which extension may launch it in the host manifest.
private let maxItems = 10
private let maxBytes = 150 * 1024 * 1024
private let maxChunkBytes = 256 * 1024
private let pngMagic = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

private enum HostError: LocalizedError {
    case invalid(String)
    case tooLarge

    var errorDescription: String? {
        switch self {
        case .invalid(let message): return message
        case .tooLarge: return "görsel batch boyutu sınırı aşıyor"
        }
    }
}

private struct Batch {
    let id: String
    let count: Int
    var images: [Data]
    var totalBytes: Int
}

private func writeExact(_ data: Data, to handle: FileHandle) {
    handle.write(data)
}

private func send(_ object: [String: Any]) {
    guard let json = try? JSONSerialization.data(withJSONObject: object), json.count <= 1024 * 1024 else { return }
    var length = UInt32(json.count).littleEndian
    let header = withUnsafeBytes(of: &length) { Data($0) }
    writeExact(header, to: .standardOutput)
    writeExact(json, to: .standardOutput)
}

private func readExact(_ count: Int) -> Data? {
    var output = Data()
    while output.count < count {
        let piece = FileHandle.standardInput.readData(ofLength: count - output.count)
        if piece.isEmpty { return nil }
        output.append(piece)
    }
    return output
}

private func readMessage() -> [String: Any]? {
    guard let header = readExact(4) else { return nil }
    // Data storage is not guaranteed to be UInt32-aligned.
    let length = header.enumerated().reduce(UInt32(0)) { value, pair in
        value | (UInt32(pair.element) << UInt32(pair.offset * 8))
    }
    guard length > 1, length <= 1024 * 1024, let body = readExact(Int(length)),
          let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
    return object
}

private func validID(_ value: Any?) -> String? {
    guard let id = value as? String,
          id.range(of: "^[a-f0-9]{24,64}$", options: .regularExpression) != nil else { return nil }
    return id
}

private func write(_ images: [Data], to board: NSPasteboard) throws {
    guard images.count >= 2, images.count <= maxItems else { throw HostError.invalid("görsel sayısı geçersiz") }
    let items: [NSPasteboardItem] = try images.map { png in
        guard png.starts(with: pngMagic), let image = NSImage(data: png), image.size.width > 0, image.size.height > 0 else {
            throw HostError.invalid("PNG doğrulanamadı")
        }
        let item = NSPasteboardItem()
        item.setData(png, forType: .png)
        if let tiff = image.tiffRepresentation { item.setData(tiff, forType: .tiff) }
        return item
    }
    board.clearContents()
    guard board.writeObjects(items) else { throw HostError.invalid("macOS panosu yazılamadı") }
}

private func selfTest() -> Int32 {
    guard let red = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 2, pixelsHigh: 2, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bitmapFormat: .alphaFirst, bytesPerRow: 0, bitsPerPixel: 0)?.representation(using: .png, properties: [:]) else { return 1 }
    let board = NSPasteboard(name: NSPasteboard.Name("KoppyNativeHostSelfTest"))
    do {
        try write([red, red], to: board)
        guard board.pasteboardItems?.count == 2, board.pasteboardItems?.allSatisfy({ $0.data(forType: .png) != nil }) == true else { return 1 }
        print("Koppy Native Host self-test OK: 2 bağımsız PNG öğesi")
        return 0
    } catch { return 1 }
}

private func run() {
    var batch: Batch?
    while let message = readMessage() {
        guard let action = message["action"] as? String else { send(["ok": false, "error": "geçersiz istek"]); continue }
        do {
            switch action {
            case "begin":
                guard batch == nil, let id = validID(message["id"]), let count = message["count"] as? Int,
                      count >= 2, count <= maxItems else { throw HostError.invalid("batch başlatılamadı") }
                batch = Batch(id: id, count: count, images: Array(repeating: Data(), count: count), totalBytes: 0)
            case "chunk":
                guard var current = batch, validID(message["id"]) == current.id,
                      let index = message["index"] as? Int, index >= 0, index < current.count,
                      let encoded = message["data"] as? String, let chunk = Data(base64Encoded: encoded),
                      !chunk.isEmpty, chunk.count <= maxChunkBytes else { throw HostError.invalid("batch parçası geçersiz") }
                current.totalBytes += chunk.count
                guard current.totalBytes <= maxBytes else { throw HostError.tooLarge }
                current.images[index].append(chunk)
                batch = current
            case "end":
                guard let current = batch, validID(message["id"]) == current.id,
                      current.images.allSatisfy({ !$0.isEmpty }) else { throw HostError.invalid("batch tamamlanmadı") }
                try write(current.images, to: .general)
                send(["ok": true, "id": current.id, "count": current.count])
                batch = nil
            case "cancel":
                batch = nil
            default:
                throw HostError.invalid("bilinmeyen istek")
            }
        } catch {
            send(["ok": false, "id": (message["id"] as? String) ?? "", "error": error.localizedDescription])
            batch = nil
        }
    }
}

if CommandLine.arguments.contains("--self-test") { exit(selfTest()) }
run()
