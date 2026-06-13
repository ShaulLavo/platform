#import <Cocoa/Cocoa.h>

// Identifier so repeated calls reuse the one effect view instead of stacking a
// new frosted layer every time.
static NSString *const kVibrancyViewIdentifier = @"PlatformVibrancyView";

static NSVisualEffectView *findVibrancyView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[NSVisualEffectView class]] &&
			[[subview identifier] isEqualToString:kVibrancyViewIdentifier]) {
			return (NSVisualEffectView *)subview;
		}
	}

	return nil;
}

// Inserts an NSVisualEffectView *behind* the (transparent) webview so macOS
// frosts the user's real desktop wallpaper behind the window. Idempotent.
// Called from Bun over FFI with the NSWindow pointer (BrowserWindow.ptr).
extern "C" bool enableWindowVibrancy(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		// A transparent webview composites over whatever is behind the window;
		// these make the NSWindow itself clear and restore the shadow that a
		// non-opaque window otherwise drops.
		[window setOpaque:NO];
		[window setBackgroundColor:[NSColor clearColor]];
		[window setTitlebarAppearsTransparent:YES];
		[window setHasShadow:YES];

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		NSVisualEffectView *effectView = findVibrancyView(contentView);
		if (effectView == nil) {
			effectView = [[NSVisualEffectView alloc]
				initWithFrame:[contentView bounds]];
			[effectView setIdentifier:kVibrancyViewIdentifier];
			[effectView
				setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
		}

		// UnderWindowBackground = neutral window frost. Swap for .sidebar,
		// .hudWindow, or .headerView to change how much desktop bleeds through.
		[effectView setMaterial:NSVisualEffectMaterialUnderWindowBackground];
		[effectView setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
		[effectView setState:NSVisualEffectStateActive];

		// Keep the effect view below the renderer so the webview paints on top
		// of the frost wherever its content is transparent.
		if ([effectView superview] == nil) {
			NSView *renderer = [[contentView subviews] firstObject];
			if (renderer != nil) {
				[contentView addSubview:effectView
							 positioned:NSWindowBelow
							 relativeTo:renderer];
			} else {
				[contentView addSubview:effectView];
			}
		}

		[window invalidateShadow];
		success = YES;
	});

	return success;
}
