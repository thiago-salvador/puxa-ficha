import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write(Data("uso: ocr-programa-governo.swift <imagem>\n".utf8))
  exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard
  let image = NSImage(contentsOf: imageURL),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  FileHandle.standardError.write(Data("imagem invalida\n".utf8))
  exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["pt-BR", "en-US"]
request.usesLanguageCorrection = true

do {
  try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
  let observations = (request.results ?? []).sorted { left, right in
    let verticalDistance = abs(left.boundingBox.maxY - right.boundingBox.maxY)
    if verticalDistance > 0.012 { return left.boundingBox.maxY > right.boundingBox.maxY }
    return left.boundingBox.minX < right.boundingBox.minX
  }
  let lines = observations.compactMap { $0.topCandidates(1).first?.string }
  print(lines.joined(separator: "\n"))
} catch {
  FileHandle.standardError.write(Data("OCR falhou: \(error)\n".utf8))
  exit(1)
}
