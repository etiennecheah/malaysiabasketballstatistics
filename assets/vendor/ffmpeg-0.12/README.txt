ffmpeg.wasm, used by the Scout room's "Trim" (scout.html) to cut a stretch of a film without re-encoding.
@ffmpeg/ffmpeg 0.12.10 (dist/umd: ffmpeg.js, 814.ffmpeg.js) and @ffmpeg/core 0.12.6 (dist/umd: ffmpeg-core.js,
ffmpeg-core.wasm), unchanged, from npm. Loaded only when someone presses Trim.
Source and licences: https://github.com/ffmpegwasm/ffmpeg.wasm (the wrapper is MIT; the FFmpeg build inside
ffmpeg-core.wasm is LGPL/GPL, with its source at https://github.com/ffmpegwasm/ffmpeg.wasm and https://ffmpeg.org).
