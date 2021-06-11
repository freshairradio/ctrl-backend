import { spawn } from "child_process";
import { PassThrough } from "stream";
import fs from "fs";
// Start an RTMP server at rtmp://localhost/live

function startFFMPEGProcess({ from = "pipe:0", extra = [], label }) {
  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-f",
    "flv",
    "-listen",
    "1",
    "-i",
    from,
    "-f",
    "mp3",
    "-vn",
    "-ar",
    "44100",
    "-b:a",
    "196k",
    ...extra,
    "pipe:1"
  ]);
  ffmpeg.on("exit", (code) => {
    console.info(`${label} ffmpeg process exited`);
  });
  ffmpeg.stderr.on("error", (e) => {
    console.error(`${label} ffmpeg process`, e);
  });
  ffmpeg.stderr.on("data", (e) => {
    console.log(e.toString());
  });
  ffmpeg.stderr.pipe(
    process.stdout
    // fs.createWriteStream(
    //   `./ffmpeg-log-${encodeURIComponent(label)}-${Date.now()}.txt`
    // )
  );
  //   ffmpeg.stderr.on("data", (d) => {
  //     logger.info(d.toString());
  //   });
  return ffmpeg;
}
let rtmpStream;
const robustStream = new PassThrough();

const register = () => {
  rtmpStream = startFFMPEGProcess({
    label: "rtmp",
    from: `rtmp://0.0.0.0:23789/live/${process.env.RTMP_STREAM_KEY}`
  });
  rtmpStream.stdout.pipe(robustStream, { end: false });
  rtmpStream.once("exit", register);
};
// register();

robustStream.pipe(
  fs.createWriteStream(`./recordings/live-rtmp-${Date.now()}.mp3`)
);

export async function pipe(destination) {
  robustStream.pipe(destination, { end: false });
}
export async function unpipe(destination) {
  robustStream.unpipe(destination);
}
