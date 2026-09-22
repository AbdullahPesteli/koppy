#!/usr/bin/env swift

import AppKit
import Foundation

// Opt-in experiment only. It puts two source images into a single RTF or RTFD
// item so we can distinguish a rich document from independent image items.
let rawArgs = Array(CommandLine.arguments.dropFirst())
let rtfOnly = rawArgs.first == "--rtf"
let args = rtfOnly ? Array(rawArgs.dropFirst()) : rawArgs
guard args.count == 2 else {
    fputs("usage: rtfd-pasteboard-test.swift [--rtf] <image-a> <image-b>\n", stderr)
    exit(64)
}
let paths = Array(args)
let images = paths.compactMap { NSImage(contentsOfFile: $0) }
guard images.count == 2 else {
    fputs("RTFD test: iki okunabilir görsel gerekli\n", stderr)
    exit(1)
}

let text = NSMutableAttributedString(string: "Koppy RTFD deneyi\n\n")
for (index, image) in images.enumerated() {
    text.append(NSAttributedString(string: "Görsel \(index + 1)\n"))
    let attachment = NSTextAttachment()
    attachment.image = image
    attachment.bounds = NSRect(x: 0, y: 0, width: min(420, image.size.width), height: min(280, image.size.height))
    text.append(NSAttributedString(attachment: attachment))
    text.append(NSAttributedString(string: "\n\n"))
}

let range = NSRange(location: 0, length: text.length)
let document: Data?
if rtfOnly {
    // NSTextAttachment is a package concept, so AppKit's automatic .rtf
    // exporter intentionally drops it. Classic RTF carries raster images via
    // \pict; encode PNG bytes explicitly for this experiment.
    var rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 Koppy RTF deneyi\\par\\par"
    for (index, path) in paths.enumerated() {
        guard let png = try? Data(contentsOf: URL(fileURLWithPath: path)) else { continue }
        let size = images[index].size
        let width = max(1, Int(size.width))
        let height = max(1, Int(size.height))
        let goalWidth = min(420, width) * 15
        let goalHeight = max(1, Int(Double(height) * Double(goalWidth) / Double(width))) * 15
        let hex = png.map { String(format: "%02x", $0) }.joined()
        rtf += "Gorsel \(index + 1)\\par{\\pict\\pngblip\\picw\(width)\\pich\(height)\\picwgoal\(goalWidth)\\pichgoal\(goalHeight)\n\(hex)}\\par\\par"
    }
    rtf += "}"
    document = Data(rtf.utf8)
} else {
    document = try? text.data(from: range, documentAttributes: [.documentType: NSAttributedString.DocumentType.rtfd])
}
guard let document else {
    fputs("RTFD test: belge üretilemedi\n", stderr)
    exit(1)
}
let item = NSPasteboardItem()
item.setData(document, forType: rtfOnly ? .rtf : .rtfd)
if !rtfOnly {
    item.setString("Koppy RTFD deneyi: iki gömülü görsel", forType: .string)
}
let board = NSPasteboard.general
if rtfOnly {
    // Do not ask AppKit to create any text representation.  This is the
    // narrowest possible RTF pasteboard offer: one item, one advertised type.
    board.declareTypes([.rtf], owner: nil)
    guard board.setData(document, forType: .rtf) else {
        fputs("RTF test: pano yazılamadı\n", stderr)
        exit(1)
    }
} else {
    board.clearContents()
    guard board.writeObjects([item]) else {
        fputs("RTFD test: pano yazılamadı\n", stderr)
        exit(1)
    }
}
let report: [String: Any] = [
    "itemCount": board.pasteboardItems?.count ?? 0,
    "types": board.pasteboardItems?.first?.types.map(\.rawValue) ?? [],
    "format": rtfOnly ? "rtf" : "rtfd",
    "documentBytes": document.count,
    "embeddedImages": 2,
]
let json = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
FileHandle.standardOutput.write(json)
FileHandle.standardOutput.write(Data("\n".utf8))
