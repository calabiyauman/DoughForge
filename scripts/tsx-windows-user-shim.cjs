// Temporary test-runner compatibility shim for Node/libuv environments where
// os.userInfo() fails on Windows. tsx only needs a stable temp-directory suffix.
if (process.platform === 'win32' && typeof process.geteuid !== 'function') {
  process.geteuid = () => 0
}
