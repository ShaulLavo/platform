// Whether the shell window is transparent, and therefore whether the
// NSVisualEffectView attached behind it is visible at all.
//
// Electrobun's CEF renderer implements window transparency by switching to
// offscreen rendering (osr_enabled=1), which blits the whole 1440x960 surface
// through a CPU memcpy on every paint instead of letting the GPU composite it.
// Measured: transparent:false produces zero OnPaint events, transparent:true
// produces a 5.5MB copy per paint. For an editor that trade is worse than the
// wallpaper it would replace, so this stays off until the shell can be
// transparent without OSR.
//
// Both halves of the shell read this one constant: the bun process sizes the
// window with it, and the preload reports it to the web layer, which draws its
// own wallpaper whenever the compositor is not supplying one. Flipping it here
// is the whole switch.
export const WINDOW_TRANSPARENT = false
