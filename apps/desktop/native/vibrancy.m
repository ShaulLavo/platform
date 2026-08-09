// Native macOS vibrancy for the app window.
//
// The web layer used to fake this: it fetched the host's real wallpaper and, for
// macOS dynamic wallpapers, played a full-screen video behind translucent panes.
// That decoded a 2560x1440 frame ~52 times a second forever and pegged the GPU
// process at idle, purely to approximate what the compositor already draws.
//
// NSVisualEffectView in behind-window blending mode asks the window server for
// the blurred contents behind the window instead. macOS is already compositing
// the desktop, so the marginal cost is effectively zero, the wallpaper stays
// live and animated, and it tracks wallpaper changes, Spaces and appearance
// without us watching for any of it.
//
// The window is resolved by title rather than by the pointer Electrobun hands
// back from createWindow: that pointer's type is not part of Electrobun's public
// contract, and messaging a non-Objective-C pointer would crash the app.

#import <Cocoa/Cocoa.h>

static NSWindow *platform_find_window(const char *titleUtf8) {
  if (titleUtf8 == NULL) return nil;

  NSString *title = [NSString stringWithUTF8String:titleUtf8];
  if (title == nil) return nil;

  for (NSWindow *window in [NSApp windows]) {
    if ([[window title] isEqualToString:title]) return window;
  }

  return nil;
}

static void platform_apply_vibrancy(NSWindow *window, int material) {
  NSView *contentView = [window contentView];
  if (contentView == nil) return;

  // A vibrant window must not paint its own opaque background, or the effect
  // view is composited against it and the desktop never shows through.
  [window setOpaque:NO];
  [window setBackgroundColor:[NSColor clearColor]];

  NSVisualEffectView *effectView =
      [[NSVisualEffectView alloc] initWithFrame:[contentView bounds]];
  [effectView setMaterial:(NSVisualEffectMaterial)material];
  [effectView setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
  // Active regardless of key state, otherwise the blur flattens to grey the
  // moment the user focuses another app.
  [effectView setState:NSVisualEffectStateActive];
  [effectView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
  [effectView setIdentifier:@"platform-vibrancy"];

  [contentView addSubview:effectView
               positioned:NSWindowBelow
               relativeTo:nil];
}

static BOOL platform_has_vibrancy(NSWindow *window) {
  for (NSView *subview in [[window contentView] subviews]) {
    if ([[subview identifier] isEqualToString:@"platform-vibrancy"]) return YES;
  }

  return NO;
}

// Returns 1 when the effect view is attached, 0 when the window is not up yet so
// the caller can retry. AppKit is confined to the main thread; the Bun process
// that dlopens this hosts AppKit, but calls arrive off the main thread, so the
// work is dispatched and the return value only reports that the window exists.
int platform_attach_vibrancy(const char *titleUtf8, int material) {
  __block int found = 0;

  void (^attach)(void) = ^{
    NSWindow *window = platform_find_window(titleUtf8);
    if (window == nil) return;
    if (platform_has_vibrancy(window)) return;

    platform_apply_vibrancy(window, material);
  };

  if ([NSThread isMainThread]) {
    found = platform_find_window(titleUtf8) != nil ? 1 : 0;
    attach();
    return found;
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    found = platform_find_window(titleUtf8) != nil ? 1 : 0;
    attach();
  });

  return found;
}
