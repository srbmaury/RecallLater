import CommonCrypto
import ExpoModulesCore
import PDFKit
import UIKit
import Vision

public class RecallNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RecallNative")

    AsyncFunction("recognizeTextAsync") { (uri: String) async throws -> [String: Any] in
      let url = try fileURL(uri)
      let lines = try await recognizeLines(VNImageRequestHandler(url: url))
      return ["text": lines.joined(separator: "\n"), "lines": lines]
    }

    // PBKDF2-HMAC-SHA256 for backup passphrases (UTF-8 passphrase, 32-byte key).
    AsyncFunction("deriveKeyAsync") { (passphrase: String, salt: String, iterations: Int) throws -> String in
      guard let saltData = Data(base64Encoded: salt) else { throw KeyDerivationException() }
      let password = Array(passphrase.utf8)
      var derived = [UInt8](repeating: 0, count: 32)
      let status = saltData.withUnsafeBytes { saltBytes in
        password.withUnsafeBufferPointer { passwordBytes in
          CCKeyDerivationPBKDF(
            CCPBKDFAlgorithm(kCCPBKDF2),
            UnsafeRawPointer(passwordBytes.baseAddress!).assumingMemoryBound(to: Int8.self), password.count,
            saltBytes.bindMemory(to: UInt8.self).baseAddress, saltData.count,
            CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iterations),
            &derived, derived.count
          )
        }
      }
      guard status == kCCSuccess else { throw KeyDerivationException() }
      return Data(derived).base64EncodedString()
    }

    AsyncFunction("extractPdfTextAsync") { (uri: String, maxPages: Int) async throws -> [String: Any] in
      let url = try fileURL(uri)
      guard let document = PDFDocument(url: url) else {
        throw PdfOpenException(uri)
      }
      var pages: [String] = []
      var ocrPageCount = 0
      for index in 0..<min(document.pageCount, maxPages) {
        guard let page = document.page(at: index) else { continue }
        let layerText = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // Scanned PDFs have no (or a junk) text layer; OCR those pages instead.
        if layerText.count >= 20 {
          pages.append(layerText)
          continue
        }
        guard let image = render(page) else { continue }
        let lines = try await recognizeLines(VNImageRequestHandler(cgImage: image))
        pages.append(lines.joined(separator: "\n"))
        ocrPageCount += 1
      }
      return [
        "text": pages.joined(separator: "\n\n"),
        "pageCount": document.pageCount,
        "ocrPageCount": ocrPageCount,
      ]
    }

    // Keeps a local folder out of iCloud / iTunes device backups.
    AsyncFunction("excludeFromBackupAsync") { (path: String) throws in
      var url = URL(fileURLWithPath: path.hasPrefix("file://") ? (URL(string: path)?.path ?? path) : path)
      guard FileManager.default.fileExists(atPath: url.path) else { return }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try url.setResourceValues(values)
    }

    AsyncFunction("detectBarcodesAsync") { (uri: String) async throws -> [[String: Any]] in
      let url = try fileURL(uri)
      let request = VNDetectBarcodesRequest()
      try await perform(request, on: VNImageRequestHandler(url: url))
      var seen = Set<String>()
      return (request.results ?? []).compactMap { observation in
        guard let value = observation.payloadStringValue, seen.insert(value).inserted else {
          return nil
        }
        return ["format": formatName(observation.symbology), "rawValue": value]
      }
    }
  }
}

private struct TextFragment {
  let text: String
  let minX: CGFloat
  let minY: CGFloat
  let maxY: CGFloat
  var midY: CGFloat { (minY + maxY) / 2 }
}

private func recognizeLines(_ handler: VNImageRequestHandler) async throws -> [String] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.automaticallyDetectsLanguage = true
  try await perform(request, on: handler)
  let fragments = (request.results ?? []).compactMap { observation -> TextFragment? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    // Vision uses a bottom-left origin; flip so y grows downwards.
    return TextFragment(text: candidate.string, minX: box.minX, minY: 1 - box.maxY, maxY: 1 - box.minY)
  }
  return groupIntoLines(fragments)
}

/// Joins fragments that sit on the same visual row into one line, cells separated by
/// tabs, so the parser can pair a row of labels with the row of values below it.
private func groupIntoLines(_ fragments: [TextFragment]) -> [String] {
  var rows: [[TextFragment]] = []
  for fragment in fragments.sorted(by: { $0.midY < $1.midY }) {
    if let anchor = rows.last?.first, abs(fragment.midY - anchor.midY) < (anchor.maxY - anchor.minY) / 2 {
      rows[rows.count - 1].append(fragment)
    } else {
      rows.append([fragment])
    }
  }
  return rows.map { row in
    row.sorted { $0.minX < $1.minX }.map(\.text).joined(separator: "\t")
  }
}

private func perform(_ request: VNRequest, on handler: VNImageRequestHandler) async throws {
  try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
        continuation.resume()
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }
}

private func render(_ page: PDFPage) -> CGImage? {
  let bounds = page.bounds(for: .mediaBox)
  let scale = min(2.0, 2000 / max(bounds.width, bounds.height, 1))
  let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
  return page.thumbnail(of: size, for: .mediaBox).cgImage
}

private func formatName(_ symbology: VNBarcodeSymbology) -> String {
  switch symbology {
  case .qr: return "qr"
  case .ean13: return "ean13"
  case .ean8: return "ean8"
  case .code128: return "code128"
  case .code39: return "code39"
  case .pdf417: return "pdf417"
  case .aztec: return "aztec"
  case .dataMatrix: return "datamatrix"
  case .upce: return "upce"
  default:
    return symbology.rawValue.replacingOccurrences(of: "VNBarcodeSymbology", with: "").lowercased()
  }
}

private func fileURL(_ uri: String) throws -> URL {
  if let url = URL(string: uri), url.isFileURL {
    return url
  }
  if uri.hasPrefix("/") {
    return URL(fileURLWithPath: uri)
  }
  throw InvalidUriException(uri)
}

private class InvalidUriException: GenericException<String> {
  override var reason: String {
    "Expected a local file URI, got '\(param)'"
  }
}

private class KeyDerivationException: Exception {
  override var reason: String {
    "Could not derive the backup key"
  }
}

private class PdfOpenException: GenericException<String> {
  override var reason: String {
    "Could not open PDF at '\(param)'"
  }
}
