package com.codesyncr.sigma.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import space.nimbusgo.sigma.SigmaException

/** Answers link requests and drives the sheets on screen, by their ids. */
class RNSigmaModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  override fun getName() = "RNSigma"

  @ReactMethod
  fun provideLink(requestId: String, url: String) = Links.provide(requestId, url)

  @ReactMethod
  fun failLink(requestId: String, message: String) = Links.fail(requestId, message)

  @ReactMethod
  fun save(sheetId: String, promise: Promise) = run(sheetId, promise) { v -> (v.session ?: throw SigmaException.NotReady()).save(); null }

  @ReactMethod
  fun exportSheet(sheetId: String, format: String?, promise: Promise) = run(sheetId, promise) { v -> v.export(format) }

  @ReactMethod
  fun undo(sheetId: String, promise: Promise) = run(sheetId, promise) { v -> v.undo(); null }

  @ReactMethod
  fun redo(sheetId: String, promise: Promise) = run(sheetId, promise) { v -> v.redo(); null }

  @ReactMethod
  fun reload(sheetId: String, promise: Promise) = run(sheetId, promise) { v -> (v.session ?: throw SigmaException.NotReady()).reload(); null }

  @ReactMethod
  fun rename(sheetId: String, title: String, promise: Promise) = run(sheetId, promise) { v -> (v.session ?: throw SigmaException.NotReady()).rename(title); null }

  private fun run(sheetId: String, promise: Promise, block: suspend (RNSigmaSheetView) -> Any?) {
    scope.launch {
      val view = Sheets.get(sheetId)
      if (view == null) {
        promise.reject("not_ready", "That sheet is not on screen.")
        return@launch
      }
      try {
        promise.resolve(block(view))
      } catch (e: SigmaException) {
        val info = Arguments.createMap()
        if (e is SigmaException.Server) info.putInt("status", e.status)
        promise.reject(RNSigmaSheetView.code(e, null), e.message, e, info)
      } catch (e: Exception) {
        promise.reject("server", e.message ?: "Sigma could not complete the request.", e)
      }
    }
  }
}
