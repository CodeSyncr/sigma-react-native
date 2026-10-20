package com.codesyncr.sigma.reactnative

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/** `<RNSigmaSheet>`: Sigma's native editor as a React Native view. */
class RNSigmaSheetManager : SimpleViewManager<RNSigmaSheetView>() {
  override fun getName() = "RNSigmaSheet"

  override fun createViewInstance(context: ThemedReactContext) = RNSigmaSheetView(context)

  @ReactProp(name = "sheetId")
  fun setSheetId(view: RNSigmaSheetView, id: String?) {
    view.sheetId = id
  }

  @ReactProp(name = "showHeader", defaultBoolean = true)
  fun setShowHeader(view: RNSigmaSheetView, on: Boolean) { view.showHeader = on }

  @ReactProp(name = "showBack", defaultBoolean = true)
  fun setShowBack(view: RNSigmaSheetView, on: Boolean) { view.showBack = on }

  @ReactProp(name = "showLogo", defaultBoolean = true)
  fun setShowLogo(view: RNSigmaSheetView, on: Boolean) { view.showLogo = on }

  @ReactProp(name = "hasBack")
  fun setHasBack(view: RNSigmaSheetView, on: Boolean) { view.hasBack = on }

  override fun onAfterUpdateTransaction(view: RNSigmaSheetView) {
    super.onAfterUpdateTransaction(view)
    view.startIfReady()
  }

  override fun onDropViewInstance(view: RNSigmaSheetView) {
    view.dispose()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> {
    val events = MapBuilder.builder<String, Any>()
    for (name in RNSigmaSheetView.EVENTS) events.put("top$name", MapBuilder.of("registrationName", "on$name"))
    return events.build()
  }
}
