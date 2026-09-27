package com.srbmaury.recalllater.recallnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlin.math.abs

class RecallNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
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

  private suspend fun recognizeLines(image: InputImage): List<String> {
    val result = textRecognizer.process(image).await()
    val fragments = result.textBlocks.flatMap { it.lines }.mapNotNull { line ->
      line.boundingBox?.let { TextFragment(line.text, it.left, it.top, it.bottom) }
    }
    return groupIntoLines(fragments)
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

private data class TextFragment(val text: String, val minX: Int, val minY: Int, val maxY: Int) {
  val midY: Int get() = (minY + maxY) / 2
}

/**
 * Joins fragments that sit on the same visual row into one line, cells separated by
 * tabs, so the parser can pair a row of labels with the row of values below it.
 */
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
