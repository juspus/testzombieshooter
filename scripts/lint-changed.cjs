// Strict lint of what this branch changed: "existing code gets warnings, new code gets errors".
//
// Runs ESLint with LINT_STRICT=1 (every rule is an error) on each file that differs from the base,
// and fails on every problem that is NEW: one whose (rule, message) pair is not already reported
// for the base version of the same file, counting duplicates. So:
//   - an effect body edited to use `b` while the deps array stays `[a]` fails (new exhaustive-deps
//     message), even though the reported line, the deps array, is untouched;
//   - removing the only use of a variable fails (new no-unused-vars), though the declaration line
//     is untouched;
//   - a warning that was already there stays quiet, wherever the lines move.
// A file that is new in the branch has no base, so all its problems are new. A parse error always fails.
// (`npm run lint` lists the pre-existing warnings.)
//
// Usage: node scripts/lint-changed.cjs [baseRef]     (default: $LINT_BASE, else origin/main, else main)
//        node scripts/lint-changed.cjs --self-check  (in-memory proof of the rules above; no git needed)
// Compares the working tree (tracked changes plus new untracked files) against merge-base(baseRef, HEAD).
process.env.LINT_STRICT = '1'   // read by eslint.config.js
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { ESLint } = require('eslint')

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const git = (...args) => run('git', args)
const LINTABLE = /\.(js|jsx|mjs|cjs)$/

const keyOf = (m) => `${m.ruleId || 'parse error'}\u0000${m.message}`

// Messages of `head` that the base version does not account for. baseMessages = null: new file.
function newProblems(baseMessages, headMessages) {
  const left = new Map()
  for (const m of baseMessages || []) left.set(keyOf(m), (left.get(keyOf(m)) || 0) + 1)
  const out = []
  for (const m of headMessages) {
    const k = keyOf(m)
    const n = left.get(k) || 0
    if (m.fatal || m.ruleId === null || baseMessages === null || n === 0) out.push(m)
    else left.set(k, n - 1)
  }
  return out
}

async function lintText(eslint, text, filePath) {
  const res = await eslint.lintText(text, { filePath, warnIgnored: false })
  return res.length ? res[0].messages : []
}

async function selfCheck() {
  const eslint = new ESLint()
  const file = path.join(process.cwd(), 'src', '__selfcheck__.jsx')   // virtual: never written
  const cases = [
    {
      name: 'effect body now uses b, deps array untouched -> new exhaustive-deps',
      base: "import { useEffect } from 'react'\nexport function X({ a, b }) {\n  useEffect(() => { console.log(a) }, [a])\n  return b\n}\n",
      head: "import { useEffect } from 'react'\nexport function X({ a, b }) {\n  useEffect(() => { console.log(a, b) }, [a])\n  return b\n}\n",
      expect: ['react-hooks/exhaustive-deps'],
    },
    {
      name: 'only use of x removed, declaration line untouched -> new no-unused-vars',
      base: 'export function f(a) {\n  const x = a + 1\n  return x + a\n}\n',
      head: 'export function f(a) {\n  const x = a + 1\n  return a\n}\n',
      expect: ['no-unused-vars'],
    },
    {
      name: 'pre-existing warnings, unrelated edit elsewhere -> nothing new',
      base: "import { useEffect } from 'react'\nconst old = 1\nexport function X({ a, b }) {\n  useEffect(() => { console.log(a, b) }, [a])\n  return null\n}\n",
      head: "import { useEffect } from 'react'\n\n// a new helper above moves every old line down\nexport const helper = (n) => n + 1\nconst old = 1\nexport function X({ a, b }) {\n  useEffect(() => { console.log(a, b) }, [a])\n  return null\n}\n",
      expect: [],
    },
    {
      name: 'a second effect repeats an existing problem -> the duplicate is new',
      base: "import { useEffect } from 'react'\nexport function X({ a }) {\n  useEffect(() => { console.log(a) }, [])\n  return null\n}\n",
      head: "import { useEffect } from 'react'\nexport function X({ a }) {\n  useEffect(() => { console.log(a) }, [])\n  useEffect(() => { console.log(a) }, [])\n  return null\n}\n",
      expect: ['react-hooks/exhaustive-deps'],
    },
    {
      name: 'file new in the branch with an unused variable -> fails',
      base: null,
      head: 'export const f = () => { const unused = 1; return 2 }\n',
      expect: ['no-unused-vars'],
    },
    {
      name: 'a problem fixed in the branch -> nothing new',
      base: 'export function f(a) {\n  const x = a + 1\n  return a\n}\n',
      head: 'export function f(a) {\n  return a\n}\n',
      expect: [],
    },
    {
      name: 'undefined name in a new line -> fails',
      base: 'export const f = (a) => a\n',
      head: 'export const f = (a) => a + missingName\n',
      expect: ['no-undef'],
    },
  ]
  let bad = 0
  for (const c of cases) {
    const base = c.base === null ? null : await lintText(eslint, c.base, file)
    const head = await lintText(eslint, c.head, file)
    const got = newProblems(base, head).map((m) => m.ruleId).sort()
    const ok = JSON.stringify(got) === JSON.stringify([...c.expect].sort())
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  (new problems: ${got.join(', ') || 'none'})`)
  }
  console.log(bad ? `\nlint-changed self-check FAILED (${bad})` : '\nlint-changed self-check OK')
  process.exit(bad ? 1 : 0)
}

async function main() {
  if (process.argv.includes('--self-check')) return selfCheck()

  const candidates = [process.argv[2], process.env.LINT_BASE, 'origin/main', 'main'].filter(Boolean)
  let mergeBase = null
  for (const ref of candidates) {
    const r = git('merge-base', ref, 'HEAD')
    if (r.status === 0 && r.stdout.trim()) { mergeBase = r.stdout.trim(); console.log(`lint-changed: base ${ref} (${mergeBase.slice(0, 8)})`); break }
  }
  if (!mergeBase) {
    console.error(`lint-changed: cannot find a base ref (tried ${candidates.join(', ')}). In CI use actions/checkout with fetch-depth: 0.`)
    return 2
  }

  // Changed files. --no-renames: a renamed file counts as new (all its problems are new).
  const diff = git('diff', '--name-only', '--no-renames', '--diff-filter=ACMR', mergeBase)
  if (diff.status !== 0) { console.error(diff.stderr); return 2 }
  const files = new Set(diff.stdout.split('\n').filter((f) => f && LINTABLE.test(f)))
  for (const f of git('ls-files', '--others', '--exclude-standard').stdout.split('\n')) if (f && LINTABLE.test(f)) files.add(f)
  for (const f of [...files]) if (!fs.existsSync(f)) files.delete(f)
  if (files.size === 0) { console.log('lint-changed: no JS/JSX files changed, nothing to lint'); return 0 }

  const eslint = new ESLint()
  const failures = []
  let inherited = 0
  for (const rel of [...files].sort()) {
    const abs = path.resolve(rel)
    const head = await lintText(eslint, fs.readFileSync(abs, 'utf8'), abs)
    if (!head.length) continue
    const show = git('show', `${mergeBase}:${rel}`)
    const base = show.status === 0 ? await lintText(eslint, show.stdout, abs) : null
    const fresh = newProblems(base, head)
    inherited += head.length - fresh.length
    for (const m of fresh) failures.push(`${rel}:${m.line || 1}:${m.column || 1}  ${m.ruleId || 'parse error'}  ${m.message}`)
  }

  console.log(`lint-changed: ${files.size} changed file(s) checked, ${inherited} pre-existing problem(s) ignored`)
  if (failures.length) {
    console.error(`\nlint-changed: ${failures.length} new problem(s) (not present in the base version of the file):\n`)
    for (const f of failures) console.error('  ' + f)
    console.error('\nFix them (add the hook dependency, use or remove the name, or prefix an unused name with _). `npm run lint` shows the whole repo.')
    return 1
  }
  console.log('lint-changed: OK')
  return 0
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2) })
