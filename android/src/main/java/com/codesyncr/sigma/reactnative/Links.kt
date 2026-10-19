package com.codesyncr.sigma.reactnative

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** A link request JavaScript answered with a failure: its message, kept so the editor can name it. */
class LinkFailed(message: String) : Exception(message)

/**
 * Link requests waiting for JavaScript. The native session asks for a link;
 * the sheet view sends an event; your `link` function answers through the
 * module's provideLink / failLink.
 */
object Links {
  private val pending = ConcurrentHashMap<String, CompletableDeferred<String>>()

  suspend fun request(send: (String) -> Unit): String {
    val id = UUID.randomUUID().toString()
    val answer = CompletableDeferred<String>()
    pending[id] = answer
    try {
      send(id)
      return withTimeout(120_000) { answer.await() }
    } finally {
      pending.remove(id)
    }
  }

  fun provide(id: String, url: String) {
    pending[id]?.complete(url)
  }

  fun fail(id: String, message: String) {
    pending[id]?.completeExceptionally(LinkFailed(message))
  }
}

/** The sheet views on screen, by the id JavaScript gave each. */
object Sheets {
  private val views = ConcurrentHashMap<String, java.lang.ref.WeakReference<RNSigmaSheetView>>()

  fun put(id: String, view: RNSigmaSheetView) { views[id] = java.lang.ref.WeakReference(view) }
  fun remove(id: String, view: RNSigmaSheetView) { if (views[id]?.get() === view) views.remove(id) }
  fun get(id: String): RNSigmaSheetView? = views[id]?.get()
}
