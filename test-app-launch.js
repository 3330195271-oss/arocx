// This simulates what default_app does when loading an app
const path = require('path');
const url = require('url');

console.log('__dirname:', __dirname);
console.log('process.argv:', process.argv);
console.log('process.defaultApp:', process.defaultApp);

// The default_app uses import() to load the app
// Let's see if that makes a difference
async function main() {
  try {
    // Try to load the app the way default_app does
    const appPath = path.resolve(process.cwd(), 'out/main/index.js');
    console.log('Loading:', appPath);
    await import(url.pathToFileURL(appPath).toString());
  } catch(e) {
    console.error('Failed to load:', e.message);
    process.exit(1);
  }
}
main();
