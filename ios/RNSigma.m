// Exposes Sigma to JavaScript: the RNSigma module (link answers and commands)
// and the RNSigmaSheet view. Both are classic bridge APIs, which React Native's
// interop layer also serves on the new architecture.

#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>

// The pod's Swift header (module name SigmaReactNative, see the podspec).
#if __has_include(<SigmaReactNative/SigmaReactNative-Swift.h>)
#import <SigmaReactNative/SigmaReactNative-Swift.h>
#else
#import "SigmaReactNative-Swift.h"
#endif

#pragma mark - The view

@interface RNSigmaSheetView : UIView
@property (nonatomic, copy) NSString *sheetId;
@property (nonatomic, copy) RCTDirectEventBlock onSigmaLinkRequest;
@property (nonatomic, copy) RCTDirectEventBlock onSigmaPhase;
@property (nonatomic, copy) RCTDirectEventBlock onSigmaSaveState;
@property (nonatomic, copy) RCTDirectEventBlock onSigmaTitle;
@property (nonatomic, copy) RCTDirectEventBlock onSigmaSaved;
@property (nonatomic, copy) RCTDirectEventBlock onSigmaBack;
@property (nonatomic, assign) BOOL showHeader;
@property (nonatomic, assign) BOOL showBack;
@property (nonatomic, assign) BOOL showLogo;
@property (nonatomic, assign) BOOL hasBack;
@end

@implementation RNSigmaSheetView {
  RNSigmaSheetHost *_host;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _host = [[RNSigmaSheetHost alloc] initWithFrame:self.bounds];
    _host.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    __weak RNSigmaSheetView *weakSelf = self;
    _host.emit = ^(NSString *name, NSDictionary<NSString *, id> *body) {
      RNSigmaSheetView *view = weakSelf;
      if (!view) return;
      RCTDirectEventBlock block = nil;
      if ([name isEqualToString:@"SigmaLinkRequest"]) block = view.onSigmaLinkRequest;
      else if ([name isEqualToString:@"SigmaPhase"]) block = view.onSigmaPhase;
      else if ([name isEqualToString:@"SigmaSaveState"]) block = view.onSigmaSaveState;
      else if ([name isEqualToString:@"SigmaTitle"]) block = view.onSigmaTitle;
      else if ([name isEqualToString:@"SigmaSaved"]) block = view.onSigmaSaved;
      else if ([name isEqualToString:@"SigmaBack"]) block = view.onSigmaBack;
      if (block) block(body);
    };
    [self addSubview:_host];
  }
  return self;
}

- (void)didSetProps:(NSArray<NSString *> *)changedProps
{
  [_host configureHeader:self.showHeader back:self.showBack logo:self.showLogo hasBack:self.hasBack];
  if (self.sheetId.length > 0) [_host start:self.sheetId];
}

- (void)removeFromSuperview
{
  [super removeFromSuperview];
}

- (void)dealloc
{
  RNSigmaSheetHost *host = _host;
  dispatch_async(dispatch_get_main_queue(), ^{ [host dispose]; });
}

@end

#pragma mark - The view manager

@interface RNSigmaSheetManager : RCTViewManager
@end

@implementation RNSigmaSheetManager

RCT_EXPORT_MODULE(RNSigmaSheet)

- (UIView *)view
{
  return [RNSigmaSheetView new];
}

RCT_EXPORT_VIEW_PROPERTY(sheetId, NSString)
RCT_EXPORT_VIEW_PROPERTY(onSigmaLinkRequest, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSigmaPhase, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSigmaSaveState, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSigmaTitle, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSigmaSaved, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSigmaBack, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(showHeader, BOOL)
RCT_EXPORT_VIEW_PROPERTY(showBack, BOOL)
RCT_EXPORT_VIEW_PROPERTY(showLogo, BOOL)
RCT_EXPORT_VIEW_PROPERTY(hasBack, BOOL)

@end

#pragma mark - The module

@interface RNSigma : NSObject <RCTBridgeModule>
@end

typedef void (^RNSigmaReject)(NSString *code, NSString *message, NSDictionary *_Nullable userInfo);

static RNSigmaReject RNSigmaRejecter(RCTPromiseRejectBlock reject)
{
  return ^(NSString *code, NSString *message, NSDictionary *_Nullable userInfo) {
    reject(code, message, [NSError errorWithDomain:@"com.codesyncr.sigma" code:0 userInfo:userInfo ?: @{}]);
  };
}

@implementation RNSigma

RCT_EXPORT_MODULE(RNSigma)

+ (BOOL)requiresMainQueueSetup { return NO; }

// The editor lives on the main thread.
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

RCT_EXPORT_METHOD(provideLink:(NSString *)requestId url:(NSString *)url)
{
  [RNSigmaLinks provide:requestId url:url];
}

RCT_EXPORT_METHOD(failLink:(NSString *)requestId message:(NSString *)message)
{
  [RNSigmaLinks fail:requestId message:message];
}

#define RNSIGMA_SHEET(ID) \
  RNSigmaSheetHost *sheet = [RNSigmaSheetHost sheet:ID]; \
  if (!sheet) { reject(@"not_ready", @"That sheet is not on screen.", nil); return; }

RCT_EXPORT_METHOD(save:(NSString *)sheetId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  RNSIGMA_SHEET(sheetId)
  [sheet save:resolve reject:RNSigmaRejecter(reject)];
}

RCT_EXPORT_METHOD(exportSheet:(NSString *)sheetId format:(NSString *)format resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  RNSIGMA_SHEET(sheetId)
  [sheet export:format resolve:resolve reject:RNSigmaRejecter(reject)];
}

RCT_EXPORT_METHOD(undo:(NSString *)sheetId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  RNSIGMA_SHEET(sheetId)
  [sheet undo:resolve reject:RNSigmaRejecter(reject)];
}

RCT_EXPORT_METHOD(redo:(NSString *)sheetId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  RNSIGMA_SHEET(sheetId)
  [sheet redo:resolve reject:RNSigmaRejecter(reject)];
}

RCT_EXPORT_METHOD(reload:(NSString *)sheetId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  RNSIGMA_SHEET(sheetId)
  [sheet reload:resolve reject:RNSigmaRejecter(reject)];
}

RCT_EXPORT_METHOD(rename:(NSString *)sheetId title:(NSString *)title resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  RNSIGMA_SHEET(sheetId)
  [sheet rename:title resolve:resolve reject:RNSigmaRejecter(reject)];
}

@end
