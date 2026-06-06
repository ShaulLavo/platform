/**
 * AST-based codemod: for each test file passed on argv, bump every relative
 * module specifier by one '../' (because the file moved one dir deeper into
 * tests/). Only real module specifiers are touched — string literals that
 * merely contain import-like text are left alone.
 */
import ts from 'typescript'

const MOCK_CALLEES = new Set([
  'require',
  'vi.mock',
  'vi.doMock',
  'vi.importActual',
  'vi.importMock',
  'jest.mock',
  'jest.doMock',
  'jest.requireActual',
])

function calleeName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) {
    return `${calleeName(expr.expression)}.${expr.name.text}`
  }
  return ''
}

function bump(spec: string): string {
  if (spec.startsWith('./')) return `../${spec.slice(2)}`
  if (spec.startsWith('../')) return `../${spec}`
  return spec
}

function collectSpecifiers(sf: ts.SourceFile): ts.StringLiteralLike[] {
  const out: ts.StringLiteralLike[] = []
  const visit = (node: ts.Node) => {
    // static import / re-export: `from '...'`
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier)
    }
    // import x = require('...')
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      out.push(node.moduleReference.expression)
    }
    // dynamic import('...'), require('...'), vi.mock('...'), etc.
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const named = MOCK_CALLEES.has(calleeName(node.expression))
      if ((isDynamicImport || named) && node.arguments.length > 0) {
        const arg = node.arguments[0]
        if (ts.isStringLiteralLike(arg)) out.push(arg)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

let changed = 0
for (const file of process.argv.slice(2)) {
  const source = ts.sys.readFile(file)
  if (source === undefined) {
    console.error(`SKIP unreadable: ${file}`)
    continue
  }
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = collectSpecifiers(sf)
    .map((lit) => ({ lit, text: lit.text }))
    .filter(({ text }) => text.startsWith('./') || text.startsWith('../'))
    .sort((a, b) => b.lit.getStart(sf) - a.lit.getStart(sf))

  if (edits.length === 0) continue
  let next = source
  for (const { lit } of edits) {
    // getStart/getEnd include the surrounding quotes; rewrite just the inner text.
    const start = lit.getStart(sf) + 1
    const end = lit.getEnd() - 1
    next = next.slice(0, start) + bump(lit.text) + next.slice(end)
  }
  ts.sys.writeFile(file, next)
  changed += 1
}
console.log(`Rewrote imports in ${changed} files.`)
