# Future Layout Plan

Status: future work, not scheduled. Not part of V1 or the current dnd-proof
cutover.

This document tracks layout-model decisions that are larger than a local code
comment but not ready to implement yet.

## Frame Offset Semantics

`CustomWindowFrame` currently mixes two different models:

- OS-style window frames: `anchor`, `width`, `height`, `offsetX`, and `offsetY`
  describe a target rectangle.
- Workbench tiling layout: split nodes store ratios whose children fill all
  available space.

Those models do not encode the same thing. A frame can represent an inset
rectangle like `x = 10%, width = 30%`. A split node can only represent a boundary
between children, unless empty space is modeled as a real spacer/layout node.

## Current Behavior

`frameAxisSize()` projects an offset-aware frame onto a split ratio by using:

```ts
size + Math.abs(offset)
```

For a left-anchored frame on a 1000px root:

```ts
{ width: 30, offsetX: 10, unit: 'percent' }
```

The intuitive rectangle is:

```txt
[ empty 10% ][ target window 30% ][ remaining windows 60% ]
```

The current layout result is:

```txt
[ target window 40% ][ remaining windows 60% ]
```

The offset is not preserved as an origin shift. It is absorbed into the target
window's split allocation. Negative and positive offsets behave the same because
`Math.abs()` is used.

## Design Direction

Offset projection should be recipe policy, not an inherent property of the
layout manager.

The layout manager should be able to apply explicit geometry instructions, but
recipes should decide what happens to free space. Different recipes may want
different behavior:

- Default workbench recipe: keep panes tiled, but distribute offset/free space
  among the other flexible windows instead of growing the target window by the
  full offset.
- Future manual recipe: allow each panel to be resized independently and avoid
  automatic growth entirely.
- Future freeform/spacer-aware recipe: represent empty space as explicit spacer
  nodes or floating rects, so an inset frame can stay inset.

## Default Recipe Bug

The current behavior is wrong for the default recipe if `offsetX/Y` means
"reserve free space before the target frame."

For `width: 30, offsetX: 10`, the target window should remain 30%. The free 10%
should be distributed according to the recipe's flexible-space policy instead
of being added to the target window.

This is not being fixed in the current change because it needs a real policy
boundary and tests for multiple window arrangements.

## Follow-Up Work

1. Define a recipe-level frame/free-space policy. The name and exact shape are
   open, but it should live with recipe/layout policy state rather than in
   `frameAxisSize()`.
2. Split frame resolution into two steps:
   - resolve `CustomWindowFrame` into an intended rectangle or occupied span;
   - ask the active recipe policy how to project that intent onto the layout
     tree.
3. Add default-recipe tests for offsets:
   - left/right anchored horizontal offsets;
   - top/bottom anchored vertical offsets;
   - positive and negative offsets;
   - multiple sibling panes where the free space must be distributed.
4. Decide whether true inset behavior requires spacer nodes, freeform layout
   nodes, or a separate manual recipe mode.
5. Update the window-management settings UI copy once offset semantics are
   explicit enough to explain to users.
