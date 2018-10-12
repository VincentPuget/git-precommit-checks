const util = require('util')
const nodeExec = util.promisify(require('child_process').exec)

// Configuration stuff
const fs = require('fs')
const path = require('path')
const pathFromRoot = (target) => path.join(__dirname, '..', ...target)
const packagePath = pathFromRoot(['package.json'])

// Logs colors
const SEVERITY_PROPS = {
  error: {
    color: '\x1b[31m',
    icon: '✖',
    logMethod: 'error',
    title: 'oops, something’s wrong!  😱\n',
  },
  warning: {
    color: '\x1b[33m',
    icon: '❗',
    logMethod: 'warn',
    title: 'there may be something to improve or fix!\n',
  },
  success: {
    color: '\x1b[32m',
    icon: '✔',
    logMethod: 'log',
    title: 'everything’s fine 👍',
  },
}
// Git commands
const gitDiffBase = 'git diff --staged --diff-filter=ACM'
// List added or updated file names only
const gitStagedFiles = `${gitDiffBase} --name-only`
// We don't use `git show :0:${file}` because we only want to
// process created or updated raws.
const gitShowStaged = (file) =>
  `${gitDiffBase} --unified=0 ${file} | grep "^+[^+]" | sed -E "s/^\\+\\s*//"`

// If the process write stream is TTY, then we can print with colors
function isTTY() {
  return process.stderr.isTTY || process.stdout.isTTY
}

// Print error with color depending on given severity.
// - error: red
// - warning: yellow
// - standard: green
function colorizedLog(logLevel, text) {
  // Colors code won’t be used if not in TTY
  if (!isTTY()) {
    console.log(text)
    return
  }
  const { color, logMethod } = SEVERITY_PROPS[logLevel]
  console[logMethod](`${color}${text}\x1b[0m`)
}

// Print
function colorizedLogTitle(logLevel, hookTitle, text) {
  if (!isTTY()) {
    console.log(text)
    return
  }
  const { color, icon } = SEVERITY_PROPS[logLevel]
  console.log(`${color}${icon}  ${hookTitle}\x1b[0m: ${text}`)
}

// Because we need more than default output…
function largeOutputExec(command, options = {}) {
  return nodeExec(command, { maxBuffer: 1024 * 1024, ...options })
}

// Output an error using red color, then exit program
function logAndExitWithTitle(err, hookTitle) {
  colorizedLogTitle('error', hookTitle, `Couldn’t run 'exec' command: ${err}`)
  // EX_DATAERR (65): The input data was incorrect in some way
  process.exit(65)
}

// Wrap large output exec with automatic log on error
function exec(command, hookTitle, options = {}) {
  return largeOutputExec(command).catch((err) =>
    logAndExitWithTitle(err, hookTitle)
  )
}

// Get files names that are staged
async function getStagedFiles(hookTitle) {
  const { stdout } = await exec(gitStagedFiles, hookTitle)
  // Manage files, remove empty lines from `git diff` result
  return stdout.split('\n').filter(Boolean)
}

// Read one staged file content
async function getStagedContent(file, hookTitle) {
  const { stdout } = await exec(gitShowStaged(file), hookTitle)
  return { fileName: file, content: stdout }
}

// Load staged contents for later parsing.
// This won't load `pre-commit` files contents.
function getStagedContents(files) {
  return Promise.all(
    files.filter((file) => !/pre-commit$/.test(file)).map(getStagedContent)
  )
}

// Load configuration as JSON from package.json
function loadPackageJSON() {
  return JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
}

// Loop over errors and print them.
// Each errors group will be prefixed by its message, ie.:
//
// ```
// === You’ve got leftover conflict markers ===
// File1
// File2
// ```
function printErrors(severity, errors, hookTitle) {
  const entries = Object.entries(errors)
  if (entries.length === 0) {
    return false
  }

  const { title } = SEVERITY_PROPS[severity]
  colorizedLogTitle(severity, hookTitle, title)

  for (const [message, fileNames] of entries) {
    const title = `=== ${message} ===`
    const text = [title, ...fileNames].join('\n') + '\n'
    colorizedLog(severity, text)
  }

  return true
}

// Convert regExp from string, spliting options when needed.
//
// Examples:
// "/^[<>|=]{4,}/m" => new Regexp("^[<>|=]{4,}", "m")
// "(?:FIXME|TODO)" => new Regexp("(?:FIXME|TODO)")
function regexFromStr(regex) {
  if (!regex) {
    return
  }

  const [, model = regex, opts] = /^\/(.*)\/(.*)$/.exec(regex) || []
  return new RegExp(model, opts)
}

module.exports = {
  colorizedLog,
  colorizedLogTitle,
  exec,
  getStagedFiles,
  getStagedContents,
  isTTY,
  largeOutputExec,
  loadPackageJSON,
  logAndExitWithTitle,
  pathFromRoot,
  printErrors,
  regexFromStr,
  SEVERITY_PROPS,
}
