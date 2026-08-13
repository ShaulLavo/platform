// Electrobun's dist ships untyped .ts, and one of its modules imports `three`,
// which carries no declarations of its own. Nothing here touches three, so an
// ambient `any` is enough to keep the desktop typecheck from depending on a
// stray @types/three that is in no package.json and no lockfile.
declare module 'three'
