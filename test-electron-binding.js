// Try various ways to access electron API inside Electron runtime
console.log('versions.electron:', process.versions.electron)

// Try _linkedBinding
try {
  const eb = process._linkedBinding('electron')
  console.log('_linkedBinding electron:', typeof eb, eb ? Object.keys(eb).slice(0,5) : null)
} catch(e) {
  console.log('_linkedBinding error:', e.message)
}

// Try _linkedBinding for electron_common
try {
  const ec = process._linkedBinding('electron_common')
  console.log('_linkedBinding electron_common:', typeof ec, ec ? Object.keys(ec).slice(0,5) : null)
} catch(e) {
  console.log('_linkedBinding electron_common error:', e.message)
}

// Check all _linkedBinding possibilities
try {
  const bindings = process._linkedBinding('electron_browser_app')
  console.log('electron_browser_app:', typeof bindings, bindings ? Object.keys(bindings).slice(0,5) : null)
} catch(e) {
  console.log('electron_browser_app error:', e.message)
}

// Check builtinModules
try {
  const builtins = require('module').builtinModules
  const electronBuiltins = builtins.filter(m => m.includes('electron'))
  console.log('electron builtins:', electronBuiltins)
} catch(e) {
  console.log('builtinModules error:', e.message)
}

process.exit(0)
