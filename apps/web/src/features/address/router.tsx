import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * Code-based routes, not `@tanstack/router-plugin` codegen: our shape is one route
 * with rich search params, so a generated `routeTree.gen.ts` would buy nothing.
 *
 * The tree is deliberately degenerate — a root plus one catch-all. Every address
 * matches the same pair, so navigating never changes which route component is
 * mounted. That is not laziness, it is the safety property: `EditorStateProvider`
 * creates the workspace store and the document service that holds unsaved buffers,
 * and TanStack unmounts a route component when its route id changes. A real route
 * hierarchy above that provider would silently discard every project's unsaved work
 * on a project switch, keyed or not.
 *
 * The app therefore renders from the root component and the leaf renders nothing.
 */

/**
 * TanStack strips search params no schema validates. Four dev params are read outside
 * React's lifecycle — `editorPerfTrace` and `editorPerfDisable` before mount,
 * `editorPerfLayout` live during every editor render, and `decode` on the first
 * editor's idle callback — so stripping them would change behaviour mid-session with
 * no error and no log. Everything is passed through untouched; ownership of specific
 * keys lives in the address grammar, not here.
 */
function validateSearch(search: Record<string, unknown>) {
  return search
}

export function createAppRouteTree(renderApp: () => ReactNode) {
  const rootRoute = createRootRoute({
    component: () => renderApp(),
    validateSearch,
  })
  const catchAllRoute = createRoute({
    component: () => null,
    getParentRoute: () => rootRoute,
    path: '$',
  })

  return rootRoute.addChildren([catchAllRoute])
}

export function createAppRouter({
  history,
  renderApp,
}: {
  readonly history?: RouterHistory
  readonly renderApp: () => ReactNode
}) {
  return createRouter({
    // A stale address is never worth a blank screen: the app renders from the root
    // component, which does not depend on the match resolving.
    defaultNotFoundComponent: () => null,
    history,
    routeTree: createAppRouteTree(renderApp),
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>
