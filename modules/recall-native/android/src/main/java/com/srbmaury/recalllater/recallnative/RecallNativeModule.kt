package com.srbmaury.recalllater.recallnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.util.Base64
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlin.math.abs

class RecallNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
  private val devanagariRecognizer by lazy { TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build()) }
  private val barcodeScanner by lazy { BarcodeScanning.getClient() }

  override fun definition() = ModuleDefinition {
    Name("RecallNative")

    AsyncFunction("recognizeTextAsync") Coroutine { uri: String ->
      val lines = recognizeLines(InputImage.fromFilePath(context, Uri.parse(uri)))
      mapOf("text" to lines.joinToString("\n"), "lines" to lines)
    }

    AsyncFunction("extractPdfTextAsync") Coroutine { uri: String, maxPages: Int ->
      extractPdfText(Uri.parse(uri), maxPages)
    }

    // PBKDF2-HMAC-SHA256 for backup passphrases: native is ~100x faster than JS on Hermes.
    // Java encodes the passphrase as UTF-8, matching the JS fallback, so files open anywhere.
    AsyncFunction("deriveKeyAsync") Coroutine { passphrase: String, salt: String, iterations: Int ->
      withContext(Dispatchers.Default) {
        val spec = PBEKeySpec(passphrase.toCharArray(), Base64.decode(salt, Base64.NO_WRAP), iterations, 256)
        try {
          Base64.encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded, Base64.NO_WRAP)
        } finally {
          spec.clearPassword()
        }
      }
    }

    // Android backup is disabled for the whole app (allowBackup="false"), so nothing to do.
    AsyncFunction("excludeFromBackupAsync") { _: String -> }

    AsyncFunction("detectBarcodesAsync") Coroutine { uri: String ->
      val image = InputImage.fromFilePath(context, Uri.parse(uri))
      barcodeScanner.process(image).await()
        .mapNotNull { barcode ->
          barcode.rawValue?.let { mapOf("format" to formatName(barcode.format), "rawValue" to it) }
        }
        .distinctBy { it["rawValue"] }
    }
  }

  // Both models run on every image. The Devanagari model also reads English, but less
  // reliably ("ACCount", Bengali digits), so each line comes from the model that suits it:
  // Hindi lines from the Devanagari reading, everything else from the Latin one.
  private suspend fun recognizeLines(image: InputImage): List<String> = coroutineScope {
    val latin = async { fragmentsOf(textRecognizer.process(image).await()) }
    val devanagari = async { fragmentsOf(devanagariRecognizer.process(image).await()) }
    val hindi = devanagari.await().filter { it.devanagariChars >= MIN_DEVANAGARI_CHARS }
    val english = latin.await().filter { fragment -> hindi.none { it.overlaps(fragment) } }
    groupIntoLines(hindi + english)
  }

  private fun fragmentsOf(result: Text): List<TextFragment> =
    result.textBlocks.flatMap { it.lines }.mapNotNull { line ->
      line.boundingBox?.let { TextFragment(line.text, it.left, it.right, it.top, it.bottom) }
    }

  // Android's PdfRenderer exposes no text layer on older API levels, so every page is OCR'd.
  private suspend fun extractPdfText(uri: Uri, maxPages: Int): Map<String, Any> {
    val descriptor = withContext(Dispatchers.IO) {
      context.contentResolver.openFileDescriptor(uri, "r")
    } ?: throw PdfOpenException(uri.toString())

    return descriptor.use { fd ->
      PdfRenderer(fd).use { renderer ->
        val pages = mutableListOf<String>()
        for (index in 0 until minOf(renderer.pageCount, maxPages)) {
          val bitmap = renderer.openPage(index).use { renderPage(it) }
          try {
            pages += recognizeLines(InputImage.fromBitmap(bitmap, 0)).joinToString("\n")
          } finally {
            bitmap.recycle()
          }
        }
        mapOf(
          "text" to pages.joinToString("\n\n"),
          "pageCount" to renderer.pageCount,
          "ocrPageCount" to pages.size
        )
      }
    }
  }

  private fun renderPage(page: PdfRenderer.Page): Bitmap {
    val scale = minOf(2f, 2000f / maxOf(page.width, page.height, 1))
    val bitmap = Bitmap.createBitmap(
      (page.width * scale).toInt().coerceAtLeast(1),
      (page.height * scale).toInt().coerceAtLeast(1),
      Bitmap.Config.ARGB_8888
    )
    // PDF pages are transparent by default; OCR needs dark text on a light background.
    bitmap.eraseColor(Color.WHITE)
    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
    return bitmap
  }
}

private data class TextFragment(val text: String, val minX: Int, val maxX: Int, val minY: Int, val maxY: Int) {
  val midY: Int get() = (minY + maxY) / 2
  val devanagariChars: Int get() = text.count { it in '\u0900'..'\u097F' }

  /** Two readings of the same words: on the same row and sharing some width. */
  fun overlaps(other: TextFragment): Boolean =
    other.midY in minY..maxY && minOf(maxX, other.maxX) > maxOf(minX, other.minX)
}

/**
 * Joins fragments that sit on the same visual row into one line, cells separated by
 * tabs, so the parser can pair a row of labels with the row of values below it.
 */
/** A stray glyph misread as Devanagari shouldn't replace an English line with the Hindi reading. */
private const val MIN_DEVANAGARI_CHARS = 4

private fun groupIntoLines(fragments: List<TextFragment>): List<String> {
  val rows = mutableListOf<MutableList<TextFragment>>()
  for (fragment in fragments.sortedBy { it.midY }) {
    val anchor = rows.lastOrNull()?.first()
    if (anchor != null && abs(fragment.midY - anchor.midY) < (anchor.maxY - anchor.minY) / 2) {
      rows.last().add(fragment)
    } else {
      rows.add(mutableListOf(fragment))
    }
  }
  return rows.map { row -> row.sortedBy { it.minX }.joinToString("\t") { it.text } }
}

private fun formatName(format: Int): String = when (format) {
  Barcode.FORMAT_QR_CODE -> "qr"
  Barcode.FORMAT_EAN_13 -> "ean13"
  Barcode.FORMAT_EAN_8 -> "ean8"
  Barcode.FORMAT_CODE_128 -> "code128"
  Barcode.FORMAT_CODE_39 -> "code39"
  Barcode.FORMAT_PDF417 -> "pdf417"
  Barcode.FORMAT_AZTEC -> "aztec"
  Barcode.FORMAT_DATA_MATRIX -> "datamatrix"
  Barcode.FORMAT_UPC_E -> "upce"
  Barcode.FORMAT_UPC_A -> "upca"
  else -> "unknown"
}

private class PdfOpenException(uri: String) : CodedException("Could not open PDF at '$uri'")
