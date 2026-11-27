import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import ts from 'typescript'

// Zod's discriminatedUnion reads each member's `.shape` when the union is
// built. A member wrapped in refine/superRefine/transform has no shape, so the
// Edge Function throws on module load and every action fails with a non-2xx.
// manage-planning shipped that way. Refine the union instead.
const functionsRoot = new URL('../../../supabase/functions/', import.meta.url)
const wrappers = new Set(['refine', 'superRefine', 'transform', 'pipe', 'brand', 'catch'])

function sourceFiles(dir: URL): URL[] {
  return readdirSync(dir).flatMap((name) => {
    const entry = new URL(name, dir)
    if (statSync(entry).isDirectory()) return sourceFiles(new URL(`${name}/`, dir))
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [entry] : []
  })
}

function wrappedMembers(file: URL) {
  const source = ts.createSourceFile(file.pathname, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const initializers = new Map<string, ts.Expression>()
  const unions: ts.CallExpression[] = []
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) initializers.set(node.name.text, node.initializer)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'discriminatedUnion') unions.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return unions.flatMap((union) => {
    const members = union.arguments[1]
    if (!members || !ts.isArrayLiteralExpression(members)) return []
    return members.elements.flatMap((element) => {
      const expression = ts.isIdentifier(element) ? initializers.get(element.text) : element
      const outer = expression && ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
        ? expression.expression.name.text : undefined
      return outer && wrappers.has(outer) ? [`${element.getText(source)} (.${outer})`] : []
    })
  })
}

describe('Edge Function payload schemas', () => {
  const files = sourceFiles(functionsRoot)

  it('finds the discriminated unions it guards', () => {
    expect(files.some((file) => file.pathname.endsWith('manage-planning/index.ts'))).toBe(true)
  })

  it('builds every discriminated union from plain object members', () => {
    const offenders = files.flatMap((file) => wrappedMembers(file).map((member) => `${file.pathname.split('/supabase/functions/')[1]}: ${member}`))
    expect(offenders).toEqual([])
  })
})
