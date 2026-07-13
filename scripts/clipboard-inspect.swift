#!/usr/bin/env swift

import AppKit
import CryptoKit
import Foundation

let pasteboard = NSPasteboard.general
let items = pasteboard.pasteboardItems ?? []
let preferredTypes = [
    NSPasteboard.PasteboardType("public.png"),
    NSPasteboard.PasteboardType("public.jpeg"),
    .tiff,
]

var report: [String: Any] = [
    "itemCount": items.count,
    "changeCount": pasteboard.changeCount,
    "items": items.enumerated().map { index, item in
        [
            "index": index,
            "types": item.types.map(\.rawValue),
        ] as [String: Any]
    },
]

for (index, item) in items.enumerated() {
    guard let selectedType = preferredTypes.first(where: { item.availableType(from: [$0]) != nil }),
          let data = item.data(forType: selectedType) else { continue }

    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    var imageInfo: [String: Any] = [
        "index": index,
        "type": selectedType.rawValue,
        "bytes": data.count,
        "sha256": digest,
    ]

    if let bitmap = NSBitmapImageRep(data: data) {
        imageInfo["width"] = bitmap.pixelsWide
        imageInfo["height"] = bitmap.pixelsHigh
    } else if let image = NSImage(data: data) {
        imageInfo["width"] = Int(image.size.width)
        imageInfo["height"] = Int(image.size.height)
    }
    report["image"] = imageInfo
    break
}

let json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(json)
FileHandle.standardOutput.write(Data("\n".utf8))
