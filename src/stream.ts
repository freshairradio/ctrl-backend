import net from "net";
import fs from "fs";
import { spawn } from "child_process";
import { sample } from "lodash";
import moment from "moment";
import logger from "./logger";
import { pipe, unpipe } from "./rtmp";
// import { playStream } from "./discord";
import prisma from "./prisma";
const jingle = fs.readFileSync("./ident.mp3");

function startFFMPEGProcess({
  from = "pipe:0",
  extra = [],
  label,
  re = ["-re"]
}) {
  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    ...re,
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
    logger.info(`${label} ffmpeg process exited`);
  });
  ffmpeg.stderr.on("error", (e) => {
    logger.error(`${label} ffmpeg process`, e);
  });
  ffmpeg.stderr.pipe(
    fs.createWriteStream(
      `/tmp/ffmpeg-log-${encodeURIComponent(label)}-${Date.now()}.txt`
    )
  );
  //   ffmpeg.stderr.on("data", (d) => {
  //     logger.info(d.toString());
  //   });
  return ffmpeg;
}
let disconnectLive;
const schedulingTick = async () => {
  if (disconnectLive?.isSameOrBefore(moment())) {
    logger.info("Disconnecting live after 1 hour");
    disconnectLive = null;
    ctrl.disconnectLive();
  }
  const episodes = await prisma.episode.findMany({
    include: {
      Show: true
    }
  });
  const first = episodes
    .map((e) => {
      const day = e.Show?.when?.day;
      const hour = e.Show?.when?.hour?.split(":")?.[0];
      if (!day || !hour) {
        return [false, false];
      }

      return [
        e,
        moment(e.scheduling?.week, "Do MMMM")
          .startOf("isoWeek")
          .isoWeekday(e.Show?.when?.day)
          .add(hour, "hours")
      ];
    })
    .filter(([e, m]) => !!m)
    .filter(([e, m]) => m?.isValid())
    .filter(([e, m]) => m?.isSameOrBefore(moment()))
    .filter(([e, m]) => e.meta.audio || e.Show?.when?.type === "Live")
    .filter(([e, m]) => !e.meta.hasBroadcast)?.[0];
  if (!first) {
    return;
  }
  const [toSchedule, time] = first;
  console.log(toSchedule);
  if (toSchedule) {
    logger.info(`Starting scheduled: ${JSON.stringify(toSchedule)}`);
    await prisma.episode.update({
      where: {
        id: toSchedule.id
      },
      data: {
        meta: {
          ...toSchedule.meta,
          hasBroadcast: true
        }
      }
    });
    if (toSchedule.Show?.when?.type === "Live") {
      disconnectLive = moment().add(1, "h");
      logger.info(
        `Disconnecting this source at ${disconnectLive.format(
          "dddd, MMMM Do YYYY, h:mm:ss a"
        )}`
      );
      ctrl.schedule(State.LIVE);
    } else {
      ctrl.schedule(State.SCHEDULED, toSchedule.meta.audio);
    }
  }
};
setInterval(schedulingTick, 60_000);
let muxer = startFFMPEGProcess({
  label: "Global muxer",
  extra: ["-af", "loudnorm=I=-18:LRA=13:TP=-2"],
  re: []
});
muxer.stdout.on("end", () => {
  logger.error("Muxer ended. This is bad!!");
  process.exit(1);
});
muxer.stdout.on("error", (e) => {
  logger.error("Muxer errored. This is bad!!", e);
  process.exit(1);
});
muxer.stdout.pipe(
  fs.createWriteStream(`./recordings/broadcast-${Date.now()}.mp3`)
);
// playStream(muxer.stdout);
const State = {
  LIVE: Symbol("live"),
  OFFAIR: Symbol("offair"),
  SCHEDULED: Symbol("scheduled")
};

const Fanout = (muxer) => {
  let mode = State.OFFAIR;
  let currentStream;
  const choose = () => {
    console.log("Choosing new Offair track");
    if (mode === State.OFFAIR) {
      fs.readdir("./eighties", (err, files) => {
        if (currentStream) currentStream.kill();
        let file = sample(files);
        currentStream = startFFMPEGProcess({ label: `Offair: ${file}` });
        fs.createReadStream(`./eighties/${file}`)
          .pipe(currentStream.stdin)
          .on("error", (e) => logger.error(`FS error for offair: ${file}`));
        currentStream.stdout.on("data", (d) => {
          muxer.stdin.write(d);
        });
        currentStream.stdout.on("end", () => {
          logger.error(`EOF for offair: ${file}`);
          choose();
        });
        currentStream.stdout.on("error", (e) => {
          logger.error(`Error for offair: ${file}`);
        });
      });
    }
  };
  choose();
  const actions = {
    disconnectLive() {
      if (mode === State.LIVE) {
        unpipe(muxer.stdin);
        mode = State.OFFAIR;
        choose();
      }
    },
    schedule(type, url) {
      if (type === State.LIVE) {
        mode = State.LIVE;
        if (currentStream) currentStream.kill();
        currentStream = null;
        muxer.stdin.write(jingle);
        pipe(muxer.stdin);
      }
      if (type === State.SCHEDULED) {
        actions.disconnectLive();
        mode = State.SCHEDULED;
        if (currentStream) currentStream.kill();
        currentStream = null;
        muxer.stdin.write(jingle);

        currentStream = startFFMPEGProcess({
          label: `Scheduled: ${url}`,
          from: url
        });

        currentStream.stdout.on("data", (d) => {
          muxer.stdin.write(d);
        });
        currentStream.stdout.on("end", () => {
          if (mode === State.SCHEDULED) {
            mode = State.OFFAIR;
            choose();
          }
        });
        currentStream.stdout.on("error", (e) => {
          logger.error("Scheduled item download errored out", e);
        });
      }
    }
  };
  return actions;
};
const ctrl = Fanout(muxer);

export async function start({ port = 7878, onAddListener, onRemoveListener }) {
  const server = net
    .createServer((socket) => {
      socket.once("data", (d) => {
        let head = d.toString();
        const [meta, ...rawHeaders] = head.split("\r\n");
        const [method, url, version] = meta.split(" ");
        if (method == "GET") {
          socket.write(
            "HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n"
          );
          logger.info("New listener added " + JSON.stringify(rawHeaders));
          socket.write(jingle);
          muxer.stdout.pipe(socket, { end: false });
          onAddListener(rawHeaders);
          socket.on("error", () => {
            logger.error("Listener error " + JSON.stringify(rawHeaders));
            onRemoveListener(rawHeaders);
          });
          socket.on("end", () => {
            logger.info("Listener close " + JSON.stringify(rawHeaders));
            onRemoveListener(rawHeaders);
          });
        }
      });
    })
    .on("error", (err) => {
      logger.error("Server error?", err);
    });
  server.listen(port, "0.0.0.0", () => {
    logger.info(`Livestream listening at 0.0.0.0:${port}`);
  });
}
