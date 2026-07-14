import AppKit
import Darwin
import Foundation
import Security

// Koppy Bridge is intentionally a small, loopback-only process. It accepts
// framed PNGs from the Tampermonkey sandbox and writes independent pasteboard
// items. It does not inspect browser traffic, cookies, URLs, or clipboard data.
private let port: UInt16 = 47651
private let maxItems = 10
private let maxBytes = 150 * 1024 * 1024
private let headerLimit = 16 * 1024
private let frameContentType = "application/vnd.koppy.images+binary"
private let diagnosticsContentType = "application/vnd.koppy.diagnostics+json"
private let clientHeader = "tampermonkey-v1"
private let bridgeVersion = "0.5.6"
private var bridgeRequestCount = 0
private var lastBridgePath = "none"
private var lastBridgeStatus = 0
private var lastBridgeEventAt = "never"

private struct Request {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data
}

private enum BridgeError: Error, LocalizedError {
    case badRequest(String)
    case unauthorized
    case tooLarge
    case invalidImage(String)

    var errorDescription: String? {
        switch self {
        case .badRequest(let message): return message
        case .unauthorized: return "yetkilendirme reddedildi"
        case .tooLarge: return "istek boyutu sınırı aşıyor"
        case .invalidImage(let message): return message
        }
    }
}

private func applicationDirectory() throws -> URL {
    let url = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Koppy Bridge", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: url.path)
    return url
}

// Diagnostics are local, bounded and redacted. In particular, this file never
// contains image bytes, raw URLs, HTTP headers, pairing tokens or clipboard
// data. It exists so a later Koppy repair can distinguish “browser never
// reached Bridge” from “Bridge received but rejected/wrote the request”.
private func recordDiagnostic(_ event: String, fields: [String: Any] = [:]) {
    guard let directory = try? applicationDirectory() else { return }
    let file = directory.appendingPathComponent("diagnostics.ndjson", isDirectory: false)
    var payload = fields
    let timestamp = ISO8601DateFormatter().string(from: Date())
    payload["event"] = event
    payload["at"] = timestamp
    guard let line = try? JSONSerialization.data(withJSONObject: payload, options: []), line.count < 2048 else { return }
    lastBridgeEventAt = timestamp
    if let values = try? FileManager.default.attributesOfItem(atPath: file.path),
       let size = values[.size] as? NSNumber, size.intValue >= 128 * 1024 {
        try? FileManager.default.removeItem(at: file)
    }
    if !FileManager.default.fileExists(atPath: file.path) {
        FileManager.default.createFile(atPath: file.path, contents: nil, attributes: [.posixPermissions: 0o600])
    }
    guard let handle = FileHandle(forWritingAtPath: file.path) else { return }
    defer { try? handle.close() }
    handle.seekToEndOfFile()
    handle.write(line)
    handle.write(Data("\n".utf8))
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
}

private func recentDiagnostics() -> [[String: Any]] {
    guard let directory = try? applicationDirectory(),
          let content = try? String(contentsOf: directory.appendingPathComponent("diagnostics.ndjson"), encoding: .utf8) else { return [] }
    return content.split(separator: "\n").suffix(32).compactMap { line in
        guard let data = String(line).data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return object
    }
}

private func recordBrowserDiagnostics(_ body: Data) throws -> Int {
    guard body.count <= 32 * 1024,
          let payload = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
          let recent = payload["recent"] as? [[String: Any]] else {
        throw BridgeError.badRequest("tanı gövdesi geçersiz")
    }
    let allowedText = Set(["outcome", "transport", "route", "candidateSource", "candidateKind", "mime", "errorCode", "errorKind"])
    let allowedNumber = Set(["status", "durationMs", "imageCount", "totalBytes", "attempt", "width", "height"])
    var accepted = 0
    for entry in recent.suffix(20) {
        guard let name = entry["event"] as? String,
              name.range(of: "^[A-Za-z0-9_-]{1,60}$", options: .regularExpression) != nil else { continue }
        var fields: [String: Any] = ["source": "browser"]
        for (key, value) in entry {
            if allowedText.contains(key), let text = value as? String,
               text.count <= 80, !text.contains("://"), !text.lowercased().contains("token") {
                fields[key] = text
            } else if allowedNumber.contains(key), let number = value as? NSNumber {
                fields[key] = number
            }
        }
        recordDiagnostic("browser_" + name, fields: fields)
        accepted += 1
    }
    return accepted
}

private func requestResult(_ request: Request, status: Int, imageCount: Int? = nil) {
    lastBridgeStatus = status
    var fields: [String: Any] = ["route": request.path, "method": request.method, "status": status]
    if let imageCount { fields["imageCount"] = imageCount }
    recordDiagnostic(status >= 200 && status < 300 ? "bridge_request_ok" : "bridge_request_failed", fields: fields)
}

private func loadOrCreateToken() throws -> String {
    let tokenURL = try applicationDirectory().appendingPathComponent("token", isDirectory: false)
    if let existing = try? String(contentsOf: tokenURL, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines), existing.count >= 32 {
        return existing
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
        throw BridgeError.badRequest("rastgele anahtar üretilemedi")
    }
    let token = Data(bytes).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    try Data(token.utf8).write(to: tokenURL, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tokenURL.path)
    return token
}

private func constantTimeEqual(_ left: String, _ right: String) -> Bool {
    let a = Array(left.utf8)
    let b = Array(right.utf8)
    var difference = a.count ^ b.count
    let width = max(a.count, b.count)
    for index in 0..<width {
        difference |= Int((index < a.count ? a[index] : 0) ^ (index < b.count ? b[index] : 0))
    }
    return difference == 0
}

private func json(_ object: [String: Any]) -> Data {
    (try? JSONSerialization.data(withJSONObject: object, options: [])) ?? Data("{\"ok\":false}".utf8)
}

private func response(_ fd: Int32, status: Int, payload: [String: Any]) {
    let body = json(payload)
    let reason: String
    switch status {
    case 200: reason = "OK"
    case 400: reason = "Bad Request"
    case 401: reason = "Unauthorized"
    case 404: reason = "Not Found"
    case 405: reason = "Method Not Allowed"
    case 413: reason = "Payload Too Large"
    case 415: reason = "Unsupported Media Type"
    default: reason = "Internal Server Error"
    }
    let head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
    let bytes = Data(head.utf8) + body
    bytes.withUnsafeBytes { pointer in
        var written = 0
        while written < pointer.count {
            let result = Darwin.send(fd, pointer.baseAddress!.advanced(by: written), pointer.count - written, 0)
            if result <= 0 { break }
            written += result
        }
    }
}

private func receiveMore(_ fd: Int32, into data: inout Data) -> Bool {
    var buffer = [UInt8](repeating: 0, count: 8192)
    let capacity = buffer.count
    let received = buffer.withUnsafeMutableBytes { Darwin.recv(fd, $0.baseAddress, capacity, 0) }
    if received <= 0 { return false }
    data.append(buffer, count: received)
    return true
}

private func readRequest(_ fd: Int32) throws -> Request {
    var data = Data()
    let delimiter = Data("\r\n\r\n".utf8)
    while data.range(of: delimiter) == nil {
        guard data.count < headerLimit, receiveMore(fd, into: &data) else {
            throw BridgeError.badRequest("HTTP başlığı okunamadı")
        }
    }
    guard let range = data.range(of: delimiter), let head = String(data: data[..<range.lowerBound], encoding: .utf8) else {
        throw BridgeError.badRequest("HTTP başlığı geçersiz")
    }
    let lines = head.components(separatedBy: "\r\n")
    guard let first = lines.first else { throw BridgeError.badRequest("HTTP isteği boş") }
    let requestLine = first.split(separator: " ", maxSplits: 2).map(String.init)
    guard requestLine.count == 3 else { throw BridgeError.badRequest("HTTP istek satırı geçersiz") }
    var headers = [String: String]()
    for line in lines.dropFirst() {
        guard let split = line.firstIndex(of: ":") else { throw BridgeError.badRequest("HTTP başlığı geçersiz") }
        headers[String(line[..<split]).lowercased()] = String(line[line.index(after: split)...]).trimmingCharacters(in: .whitespaces)
    }
    let length = Int(headers["content-length"] ?? "0") ?? -1
    guard length >= 0 else { throw BridgeError.badRequest("Content-Length geçersiz") }
    guard length <= maxBytes + (maxItems * 4) else { throw BridgeError.tooLarge }
    let bodyStart = range.upperBound
    while data.count - bodyStart < length {
        guard receiveMore(fd, into: &data) else { throw BridgeError.badRequest("HTTP gövdesi eksik") }
        if data.count - bodyStart > length { throw BridgeError.badRequest("HTTP gövdesi fazla") }
    }
    guard data.count - bodyStart == length else { throw BridgeError.badRequest("HTTP gövdesi geçersiz") }
    return Request(method: requestLine[0], path: requestLine[1], headers: headers, body: data[bodyStart...])
}

private func parseImages(_ body: Data) throws -> [Data] {
    guard !body.isEmpty else { throw BridgeError.badRequest("görsel gövdesi boş") }
    var images = [Data]()
    var offset = 0
    while offset < body.count {
        guard images.count < maxItems, offset + 4 <= body.count else { throw BridgeError.badRequest("görsel çerçevesi geçersiz") }
        let length = body[offset..<offset + 4].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        offset += 4
        guard length > 0, Int(length) <= maxBytes, offset + Int(length) <= body.count else { throw BridgeError.badRequest("görsel boyutu geçersiz") }
        let png = Data(body[offset..<offset + Int(length)])
        offset += Int(length)
        let magic = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        guard png.starts(with: magic), let image = NSImage(data: png), image.size.width > 0, image.size.height > 0 else {
            throw BridgeError.invalidImage("PNG doğrulanamadı")
        }
        images.append(png)
    }
    guard images.count >= 2 else { throw BridgeError.badRequest("en az iki görsel gerekir") }
    return images
}

private func write(_ images: [Data], to board: NSPasteboard) throws {
    let items: [NSPasteboardItem] = try images.map { png in
        guard let image = NSImage(data: png) else { throw BridgeError.invalidImage("PNG doğrulanamadı") }
        let item = NSPasteboardItem()
        item.setData(png, forType: .png)
        if let tiff = image.tiffRepresentation { item.setData(tiff, forType: .tiff) }
        return item
    }
    board.clearContents()
    guard board.writeObjects(items) else { throw BridgeError.badRequest("macOS panosu yazılamadı") }
}

private func writeToClipboard(_ images: [Data]) throws {
    try write(images, to: NSPasteboard.general)
}

private func handle(_ fd: Int32, token: String) {
    var activeRequest: Request?
    do {
        let request = try readRequest(fd)
        activeRequest = request
        if request.method == "GET", request.path == "/v1/health" {
            recordDiagnostic("bridge_health", fields: ["route": "health", "status": 200])
            response(fd, status: 200, payload: [
                "ok": true,
                "version": bridgeVersion,
                "bridgeRequestCount": bridgeRequestCount,
                "lastBridgePath": lastBridgePath,
                "lastBridgeStatus": lastBridgeStatus,
                "lastBridgeEventAt": lastBridgeEventAt,
            ])
            return
        }
        bridgeRequestCount += 1
        lastBridgePath = request.path
        if request.method == "GET", request.path == "/v1/token" {
            guard request.headers["x-koppy-client"] == clientHeader else { throw BridgeError.unauthorized }
            requestResult(request, status: 200)
            response(fd, status: 200, payload: ["ok": true, "token": token])
            return
        }
        if request.path == "/v1/diagnostics" {
            let auth = request.headers["authorization"] ?? ""
            guard auth.hasPrefix("Bearer "), constantTimeEqual(String(auth.dropFirst(7)), token) else { throw BridgeError.unauthorized }
            if request.method == "GET" {
                requestResult(request, status: 200)
                response(fd, status: 200, payload: ["ok": true, "events": recentDiagnostics()])
                return
            }
            guard request.method == "POST", request.headers["content-type"]?.lowercased() == diagnosticsContentType else {
                requestResult(request, status: 415)
                response(fd, status: 415, payload: ["ok": false, "error": "geçersiz tanı içeriği"])
                return
            }
            let accepted = try recordBrowserDiagnostics(request.body)
            requestResult(request, status: 200)
            response(fd, status: 200, payload: ["ok": true, "accepted": accepted])
            return
        }
        guard request.method == "POST", request.path == "/v1/images" else {
            requestResult(request, status: 404)
            response(fd, status: 404, payload: ["ok": false, "error": "bulunamadı"])
            return
        }
        guard request.headers["content-type"]?.lowercased() == frameContentType else {
            requestResult(request, status: 415)
            response(fd, status: 415, payload: ["ok": false, "error": "geçersiz içerik türü"])
            return
        }
        let auth = request.headers["authorization"] ?? ""
        guard auth.hasPrefix("Bearer "), constantTimeEqual(String(auth.dropFirst(7)), token) else { throw BridgeError.unauthorized }
        let images = try parseImages(request.body)
        try writeToClipboard(images)
        requestResult(request, status: 200, imageCount: images.count)
        response(fd, status: 200, payload: ["ok": true, "count": images.count])
    } catch let bridgeError as BridgeError {
        let code: Int
        switch bridgeError {
        case .unauthorized: code = 401
        case .tooLarge: code = 413
        default: code = 400
        }
        if let request = activeRequest { requestResult(request, status: code) }
        else { lastBridgeStatus = code; recordDiagnostic("bridge_request_failed", fields: ["route": lastBridgePath, "status": code]) }
        response(fd, status: code, payload: ["ok": false, "error": bridgeError.localizedDescription])
    } catch {
        lastBridgeStatus = 500
        recordDiagnostic("bridge_request_failed", fields: ["route": lastBridgePath, "status": 500])
        response(fd, status: 500, payload: ["ok": false, "error": "beklenmeyen yerel hata"])
    }
}

private func makePNG(red: UInt8, green: UInt8, blue: UInt8) -> Data? {
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 2, pixelsHigh: 2, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bitmapFormat: .alphaFirst, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
    guard let pixels = rep.bitmapData else { return nil }
    for index in stride(from: 0, to: 16, by: 4) {
        pixels[index] = 255; pixels[index + 1] = red; pixels[index + 2] = green; pixels[index + 3] = blue
    }
    return rep.representation(using: .png, properties: [:])
}

private func selfTest() -> Int32 {
    guard let red = makePNG(red: 255, green: 0, blue: 0), let blue = makePNG(red: 0, green: 0, blue: 255) else {
        fputs("Koppy Bridge self-test: PNG üretilemedi\n", stderr); return 1
    }
    let board = NSPasteboard(name: NSPasteboard.Name("KoppyBridgeSelfTest"))
    board.clearContents()
    guard (try? write([red, blue], to: board)) != nil, board.pasteboardItems?.count == 2,
          board.pasteboardItems?.allSatisfy({ $0.data(forType: .png) != nil }) == true else {
        fputs("Koppy Bridge self-test: çoklu pano yazımı başarısız\n", stderr); return 1
    }
    print("Koppy Bridge self-test OK: 2 bağımsız PNG öğesi")
    return 0
}

private func runServer() throws {
    let token = try loadOrCreateToken()
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { throw BridgeError.badRequest("socket açılamadı") }
    defer { close(fd) }
    var reuse: Int32 = 1
    _ = setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bindResult = withUnsafePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    guard bindResult == 0, listen(fd, 8) == 0 else { throw BridgeError.badRequest("127.0.0.1:\(port) dinlenemedi") }
    print("Koppy Bridge hazır: yalnız 127.0.0.1:\(port)")
    while true {
        var peer = sockaddr_in(); var size = socklen_t(MemoryLayout<sockaddr_in>.size)
        let client = withUnsafeMutablePointer(to: &peer) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.accept(fd, $0, &size) }
        }
        if client < 0 { continue }
        var timeout = timeval(tv_sec: 10, tv_usec: 0)
        _ = setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        handle(client, token: token)
        close(client)
    }
}

if CommandLine.arguments.contains("--self-test") {
    exit(selfTest())
}
do {
    try runServer()
} catch {
    fputs("Koppy Bridge başlatılamadı: \(error.localizedDescription)\n", stderr)
    exit(1)
}
