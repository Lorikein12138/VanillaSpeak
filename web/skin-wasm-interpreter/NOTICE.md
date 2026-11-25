# Skin WASM interpreter licensing

The checked-in WebAssembly artifact was built from the source in this directory
using the pinned Rust toolchain and Cargo lockfile.

The [third-party notice](../public/skin-wasm-licenses/NOTICE.txt) identifies
the components bundled with the artifact and the upstream license texts in
that same directory. Vite copies the directory next to the WASM in its build
output. Docker includes all of web/dist and the Android gateway uses a copy
of that output under its embedded nodejs/www directory.
