// Strict lint of what this branch changed: "existing code gets warnings, new code gets errors".
// Runs ESLint with LINT_STRICT=1 (every rule is an error) on the files that differ from the base,
// and fails only on problems that sit on added or modified lines. Problems that were already in
// a touched file stay out of the way (the full run, `npm run lint`, lists them as warnings).
// A file that does not parse always fails.
//
// Usage: node scripts/lint-changed.cjs [baseRef]     (default: $LINT_BASE, else origin/main, else main)
// Compares the working tree (tracked changes plus new untracked files) against merge-base(baseRef, HEAD).
const { spawnSync } = require('child_process')
const fs = require('fs')

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts })
const git = (...args) => run('git', args)

const candidates = [process.argv[2], process.env.LINT_BASE, 'origin/main', 'main'].filter(Boolean)
let mergeBase = null
for (const ref of candidates) {
  const r = git('merge-base', ref, 'HEAD')
  if (r.status === 0 && r.stdout.trim()) { mergeBase = r.stdout.trim(); console.log(`lint-changed: base ${ref} (${mergeBase.slice(0, 8)})`); break }
}
if (!mergeBase) {
  console.error(`lint-changed: cannot find a base ref (tried ${candidates.join(', ')}). In CI use actions/checkout with fetch-depth: 0.`)
  process.exit(2)
}

const LINTABLE = /\.(js|jsx|mjs|cjs)$/
// file -> array of [from, to] changed line ranges (1-based, inclusive); null = whole file
const changed = new Map()

const diff = git('diff', '-U0', '--no-color', '--diff-filter=ACMR', mergeBase)
if (diff.status !== 0) { console.error(diff.stderr); process.exit(2) }
let file = null
for (const line of diff.stdout.split('\n')) {
  const f = /^\+\+\+ b\/(.+)$/.exec(line)
  if (f) { file = LINTABLE.test(f[1]) ? f[1] : null; if (file && !changed.has(file)) changed.set(file, []); continue }
  const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
  if (h && file) {
    const start = Number(h[1])
    const n = h[2] === undefined ? 1 : Number(h[2])
    if (n > 0 && changed.get(file)) changed.get(file).push([start, start + n - 1])
  }
}
for (const f of git('ls-files', '--others', '--exclude-standard').stdout.split('\n')) {
  if (f && LINTABLE.test(f)) changed.set(f, null)
}
for (const f of [...changed.keys()]) if (!fs.existsSync(f)) changed.delete(f)

if (changed.size === 0) { console.log('lint-changed: no JS/JSX files changed, nothing to lint'); process.exit(0) }

const res = run('npx', ['eslint', '--no-warn-ignored', '--format', 'json', ...changed.keys()], { env: { ...process.env, LINT_STRICT: '1' } })
let results
try { results = JSON.parse(res.stdout) } catch {
  console.error('lint-changed: ESLint did not produce JSON output\n' + res.stdout + res.stderr)
  process.exit(2)
}

const hits = (ranges, from, to) => ranges === null || ranges.some(([a, b]) => from <= b && to >= a)
const failures = []
let inherited = 0
for (const r of results) {
  const rel = require('path').relative(process.cwd(), r.filePath)
  const ranges = changed.get(rel)
  for (const m of r.messages) {
    const from = m.line || 1
    const to = m.endLine || from
    if (m.fatal || m.ruleId === null || hits(ranges, from, to)) failures.push(`${rel}:${from}:${m.column || 1}  ${m.ruleId || 'parse error'}  ${m.message}`)
    else inherited++
  }
}

console.log(`lint-changed: ${changed.size} changed file(s) checked, ${inherited} pre-existing problem(s) on untouched lines ignored`)
if (failures.length) {
  console.error(`\nlint-changed: ${failures.length} problem(s) on lines this branch added or changed:\n`)
  for (const f of failures) console.error('  ' + f)
  console.error('\nFix them (or prefix an unused name with _). `npm run lint` shows the whole repo.')
  process.exit(1)
}
console.log('lint-changed: OK')
