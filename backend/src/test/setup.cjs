// Register tsx CJS hook so createRequire() inside test files can load .ts source files.
// All backend tests use the createRequire + module-cache injection pattern,
// which bypasses Vite's transform pipeline and relies on Node's native require().
// tsx/cjs patches require.extensions and require.resolve to handle .ts files.
require('tsx/cjs');
