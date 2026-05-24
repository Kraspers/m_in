const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { minify: terserMinify } = require('terser');
const CleanCSS = require('clean-css');
const { minify: htmlMinify } = require('html-minifier-terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const JS_FILES = ['app.js', 'admin.js', 'admin-login.js'];
const CSS_FILES = ['app.css', 'admin.css', 'admin-login.css'];
const HTML_FILES = ['index.html', 'admin.html', 'admin-login.html', 'admin-panel.html', 'banned.html', 'm-in.html', 'test.html'];
const ASSET_FILES = [
  'manifest.webmanifest','render.yaml','Dockerfile','README.md',
  'logo.png','logo_app.png','min-app.png','wp.png','vpsc.png','vpsc_btn.png','wallpaper-pc.png','wallpaper-mob.png',
  'icons/icon-192.PNG','icons/icon-512.PNG','icons/apple-touch-icon-180.PNG'
];

function ensureCleanDist() {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
}
function ensureParent(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function copyFile(relPath) {
  const src = path.join(ROOT, relPath);
  if (!fs.existsSync(src)) return;
  const dst = path.join(DIST, relPath);
  ensureParent(dst);
  fs.copyFileSync(src, dst);
}

async function buildJs(relPath) {
  const src = path.join(ROOT, relPath);
  if (!fs.existsSync(src)) return;
  const code = fs.readFileSync(src, 'utf8');
  const tersed = await terserMinify(code, {
    compress: { passes: 2, drop_console: true, pure_getters: true },
    mangle: { toplevel: true },
    format: { comments: false }
  });
  const obf = JavaScriptObfuscator.obfuscate(tersed.code || code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayThreshold: 1,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  });
  const dst = path.join(DIST, relPath);
  ensureParent(dst);
  fs.writeFileSync(dst, obf.getObfuscatedCode(), 'utf8');
}

function buildCss(relPath) {
  const src = path.join(ROOT, relPath);
  if (!fs.existsSync(src)) return;
  const css = fs.readFileSync(src, 'utf8');
  const out = new CleanCSS({ level: 2 }).minify(css);
  if (out.errors.length) throw new Error(out.errors.join('\n'));
  const dst = path.join(DIST, relPath);
  ensureParent(dst);
  fs.writeFileSync(dst, out.styles, 'utf8');
}

async function buildHtml(relPath) {
  const src = path.join(ROOT, relPath);
  if (!fs.existsSync(src)) return;
  let html = fs.readFileSync(src, 'utf8');
  html = html.replace(/\.map(["'])/g, '$1');
  const minified = await htmlMinify(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: false
  });
  const nonce = crypto.randomBytes(8).toString('hex');
  const stamped = minified.replace('</head>', `<meta name="x-build" content="${nonce}"></head>`);
  const dst = path.join(DIST, relPath);
  ensureParent(dst);
  fs.writeFileSync(dst, stamped, 'utf8');
}

(async () => {
  ensureCleanDist();
  for (const file of ASSET_FILES) copyFile(file);
  for (const file of CSS_FILES) buildCss(file);
  for (const file of JS_FILES) await buildJs(file);
  for (const file of HTML_FILES) await buildHtml(file);
  console.log('Secure production bundle created in ./dist');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
