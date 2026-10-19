package com.codesyncr.sigma.reactnative

import android.util.Base64
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import space.nimbusgo.sigma.SigmaException
import space.nimbusgo.sigma.SigmaFormat
import space.nimbusgo.sigma.SigmaSession
import space.nimbusgo.sigma.SigmaSheetView

/**
 * Hosts one SigmaSheetView and its SigmaSession, and tells JavaScript what
 * happens: link requests, the phase, save state, title and saves.
 */
class RNSigmaSheetView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  var sheetId: String? = null
    set(value) {
      if (field == value) return
      field?.let { Sheets.remove(it, this) }
      field = value
      value?.let { Sheets.put(it, this) }
    }

  var session: SigmaSession? = null
    private set
  private var sheet: SigmaSheetView? = null
  private var scope: CoroutineScope? = null
  /** The last link request ended in a failure from JavaScript, not the server. */
  @Volatile private var linkFailure: String? = null

  /** Starts the sheet once React Native has set the id. */
  fun startIfReady() {
    if (session != null || sheetId == null) return
    val s = SigmaSession(reactContext) {
      try {
        Links.request { id -> emit("SigmaLinkRequest", Arguments.createMap().apply { putString("requestId", id) }) }
          .also { linkFailure = null }
      } catch (e: LinkFailed) {
        linkFailure = e.message
        throw SigmaException.Network(e.message ?: "The link could not be fetched.")
      }
    }
    session = s
    // Dialogs and menus need the activity, not the application context React gives views.
    val v = SigmaSheetView(reactContext.currentActivity ?: reactContext)
    v.open(s)
    sheet = v
    addView(v, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    val sc = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    scope = sc
    sc.launch {
      s.phase.collect { p ->
        emit("SigmaPhase", Arguments.createMap().apply {
          when (p) {
            SigmaSession.Phase.Loading -> putString("phase", "loading")
            SigmaSession.Phase.Ready -> {
              putString("phase", "ready")
              s.document.value?.let { d ->
                putMap("document", Arguments.createMap().apply {
                  putInt("id", d.id); putString("title", d.title); putString("filename", d.filename)
                  putString("format", d.format.value); putString("mode", d.mode.value); putBoolean("test", d.test)
                })
              }
            }
            is SigmaSession.Phase.Failed -> {
              putString("phase", "failed")
              putMap("error", errorMap(p.error, linkFailure))
            }
          }
        })
      }
    }
    sc.launch {
      s.saveState.collect { st ->
        emit("SigmaSaveState", Arguments.createMap().apply {
          when (st) {
            SigmaSession.SaveState.Saved -> putString("state", "saved")
            SigmaSession.SaveState.Unsaved -> putString("state", "unsaved")
            SigmaSession.SaveState.Saving -> putString("state", "saving")
            is SigmaSession.SaveState.Failed -> { putString("state", "failed"); putMap("error", errorMap(st.error, null)) }
          }
        })
      }
    }
    // The title is empty until the sheet opens; only a real one is news.
    sc.launch { s.title.collect { t -> if (t.isNotEmpty() || s.phase.value == SigmaSession.Phase.Ready) emit("SigmaTitle", Arguments.createMap().apply { putString("title", t) }) } }
    sc.launch { s.lastSaved.collect { at -> if (at != null) emit("SigmaSaved", Arguments.createMap().apply { putDouble("at", at.toDouble()) }) } }
  }

  /** Saves what was typed last, then stops the engine. */
  fun dispose() {
    sheetId?.let { Sheets.remove(it, this) }
    scope?.cancel()
    val s = session ?: return
    session = null
    CoroutineScope(Dispatchers.Main).launch {
      withContext(NonCancellable) { runCatching { s.save() } }
      s.close()
    }
  }

  fun undo() = sheet?.controller?.undo()
  fun redo() = sheet?.controller?.redo()

  suspend fun export(format: String?): WritableMap {
    val s = session ?: throw SigmaException.NotReady()
    val f = s.export(format?.let { SigmaFormat.of(it) })
    return Arguments.createMap().apply {
      putString("base64", Base64.encodeToString(f.data, Base64.NO_WRAP))
      putString("filename", f.filename)
      putString("format", f.format.value)
      putString("mimeType", f.format.mimeType)
    }
  }

  private fun emit(name: String, body: WritableMap) {
    val ctx = context as? ReactContext ?: return
    val surface = UIManagerHelper.getSurfaceId(this)
    UIManagerHelper.getEventDispatcherForReactTag(ctx, id)?.dispatchEvent(SheetEvent(surface, id, "top$name", body))
  }

  // React Native lays out its own views only; the editor's views ask for layout among themselves.
  private val relayout = Runnable {
    measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    layout(left, top, right, bottom)
  }

  override fun requestLayout() {
    super.requestLayout()
    post(relayout)
  }

  private class SheetEvent(surfaceId: Int, viewTag: Int, private val name: String, private val body: WritableMap) : Event<SheetEvent>(surfaceId, viewTag) {
    override fun getEventName() = name
    override fun canCoalesce() = false
    override fun getEventData(): WritableMap = body
  }

  companion object {
    val EVENTS = listOf("SigmaLinkRequest", "SigmaPhase", "SigmaSaveState", "SigmaTitle", "SigmaSaved")

    /** The JavaScript error code for a SigmaException. */
    fun code(e: SigmaException, linkFailure: String?): String = when (e) {
      is SigmaException.Unauthorized -> "unauthorized"
      is SigmaException.QuotaExceeded -> "quota_exceeded"
      is SigmaException.NotFound -> "not_found"
      is SigmaException.LinkExpired -> "link_expired"
      is SigmaException.LinkInvalid -> "link_invalid"
      is SigmaException.Engine -> "engine"
      is SigmaException.NotReady -> "not_ready"
      is SigmaException.Editor -> "editor"
      is SigmaException.Server -> "server"
      is SigmaException.Network -> if (linkFailure != null && e.message == linkFailure) "link_failed" else "network"
    }

    fun errorMap(e: SigmaException, linkFailure: String?): WritableMap = Arguments.createMap().apply {
      putString("code", code(e, linkFailure))
      putString("message", e.message ?: "")
      if (e is SigmaException.Server) putInt("status", e.status)
    }
  }
}
