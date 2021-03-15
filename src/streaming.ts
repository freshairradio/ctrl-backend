const net = require("net");
const https = require("https");
const fs = require("fs");
const { spawn } = require("child_process");
const _ = require("lodash");
// const redis = require("redis");
import Speaker from "speaker"
const express = require("express");
const stream = require("stream");
// const client = redis.createClient({ host: "redis", port: 6379 });
const cors = require("cors");
import moment from "moment";
const { Transform } = require("stream");
const Discord = require("discord.js");
const { Readable } = require("stream");

const client = new Discord.Client();
const fetch = require("node-fetch");
const _ = require("lodash");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SILENCE_TOKEN = process.env.SILENCE_TOKEN;
const streamOutput = process.env.STREAM;
const broadcastChannel = "listen";
const controlChannel = "studio3";
const { v4 } = require("uuid");
import Mixer from "./pcmMixer";
let pcmMixer = new Mixer({
  samplingRate: 48000,
  channels: 1
});

]
// client.on("error", function (error) {
//   console.error(error);
// });
import { PrismaClient } from "@prisma/client";
const jingle = fs.readFileSync("./ident.mp3");
const prisma = new PrismaClient();
client.login(DISCORD_TOKEN);

function spawnLiveFfmpeg() {
  var args = [
    "-hide_banner",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-i",
    "pipe:0",
    "-f",
    "mp3",
    "-reconnect_at_eof",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect",
    "1",
    "-reconnect_delay_max",
    "1000",
    "-content_type",
    "audio/mpeg",
    "-"
  ];

  var ffmpeg = spawn("ffmpeg", args);

  // console.log("Spawning ffmpeg " + args.join(" "));

  ffmpeg.on("exit", function (code) {
    // console.log("FFMPEG child process exited with code " + code);
  });

  ffmpeg.stderr.on("data", function (data) {
    console.log("Incoming data: " + data);
  });
  ffmpeg.stdout.pipe(require("fs").createWriteStream("./tmp.mp3"));

  ffmpeg.stderr.on("error", function (error) {
    // console.log("Error" + error);
  });

  return ffmpeg;
}
function spawnFfmpeg(label = "", inp = "pipe:0") {
  let args = [
    "-hide_banner",
    "-re",
    "-i",
    inp,
    "-f",
    "mp3",
    "-vn",
    "-ar",
    "44100",
    "-b:a",
    "196k",
    "-af",
    "loudnorm=I=-18:LRA=13:TP=-2",
    "pipe:1"
  ];

  const ffmpeg = spawn("ffmpeg", args);

  console.log("Spawning ffmpeg " + args.join(" "), label);
  ffmpeg.stderr.on("data", (d) => console.log(label, d.toString()));

  ffmpeg.stderr.on("error", function (error) {
    console.log(label, "Error" + error);
  });
  ffmpeg.on("exit", function (code) {
    console.log("FFMPEG child process exited with code " + code, label);
  });

  return ffmpeg;
}
// client.keys("freshcaster-schedule-item:*", (err, keys) => {
//   keys.map((k) => {
//     client.get(k, (err, reply) => {
//       scheduledItems.push(JSON.parse(reply));
//       scheduledItems = _.sortBy(scheduledItems, "time");
//     });
//   });
// });
let mixer;
var ffmpeg = spawnLiveFfmpeg("Live Stream mixing");
pcmMixer.start().pipe(ffmpeg.stdin);
ffmpeg.stdout.pipe(
  fs.createWriteStream(`./recordings/live-broadcast-${Date.now()}.mp3`)
);
ffmpeg.stdout.on("error", (e) => console.error("FFMPEG error", e));
ffmpeg.stdout.on("end", (e) => console.error("FFMPEG end", e));
ffmpeg.stdin.on("error", (e) => console.error("FFMPEG In error", e));
ffmpeg.stdin.on("end", (e) => console.error("FFMPEG In end", e));
const Clients = () => {
  const clients = [];
  const zeroCount = new Map();
  const muxAndFan = () => {
    const numToSend = Math.min(
      ...clients.map((c) => {
        if (c.buffer.length == 0) {
          zeroCount.set(c._id, zeroCount.get(c._id) + 1);
          if (zeroCount.get(c._id) > 50) {
            return Infinity;
          } else {
            return 0;
          }
        } else {
          zeroCount.set(c._id, 0);
          return c.buffer.length;
        }
      })
    );

    const buffers = _.zip(
      ...clients.map((c) => c.buffer.slice(0, numToSend).map((s) => [c._id, s]))
    );
    for (let samples of buffers) {
      samples = samples.filter(Boolean);
      if (samples.length == 0) {
        return;
      }
      const sample = samples[0][1].map((_, i) =>
        samples.map((v) => v[1][i]).reduce((a, e) => a + e, 0)
      );
      clients.map((cl) => {
        cl.buffer = cl.buffer.slice(numToSend);
      });
      try {
        // console.log(Buffer.from(sample.buffer).toString());
        ffmpeg.stdin.write(Buffer.from(sample.buffer));
      } catch (e) {
        console.log("PCM mixer write error", e);
      }
    }
  };
  setInterval(muxAndFan, 100);
  return {
    addClient(sock) {
      const id = v4();
      sock._id = id;
      sock.buffer = [];
      zeroCount.set(id, 0);
      clients.push(sock);
      sock.on("data", (data) => {
        let arr = new Int16Array(data.length / 2);
        for (let i = 0; i < data.length; i += 2) {
          arr[i / 2] = data.readIntLE(i, 2);
        }
        sock.buffer.push(arr);
        // sock.send(arr.buffer);
      });
    }
  };
};
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

// class Silence extends Readable {
//   _read() {
//     this.push(SILENCE_FRAME);
//   }
// }

const Silence = new Readable({
  _read() {
    this.push(SILENCE_FRAME);
  }
});

const s = Clients();
// silentClient.once("ready", () => {
//   console.log("Ready!");
//   client.on("message", async (message) => {
//     // Join the same voice channel of the author of the message
//     console.log(message);
//   });
//   client.channels.fetch("763501444560322640").then(async (ch) => {
//     const connection = await ch.join();
//     console.log(connection);

//     connection.play(new Silence(), { type: "opus" });
//   });
// });
// silentClient.on("debug", console.log);
client.once("ready", () => {
  console.log("Ready!");

  client.channels.fetch("818269575673020450").then(async (ch) => {
    const connection = await ch.join();

    ch.members.forEach((member) => {
      // Skip the streaming bot - don't skip the silence bot!
      if (member.user.username === "freshbot") {
        return;
      }

      // usersJoined.push(member);
      const audio = connection.receiver.createStream(member, {
        mode: "pcm",
        end: "manual"
      });
      // audio.pipe(fs.createWriteStream("user_audio"));
      // let input = mixer.input({
      //   channels: 2,
      //   volume: 100
      // });
      audio.pipe(pcmMixer.input({ channels: 1 }));

      // console.log(
      //   "User connection added " +
      //     member.user.username +
      //     " with id " +
      //     member.user.id
      // );
    });
  });
});

const schedulingTick = async () => {
  const episodes = await prisma.episode.findMany({
    include: {
      Show: true
    }
  });
  const toSchedule = episodes
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
    .filter(([e, m]) => !e.meta.hasBroadcast)?.[0]?.[0];
  if (toSchedule) {
    console.log("toSchedule", toSchedule);
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
      ctrl.schedule(State.LIVE, toSchedule.meta.audio);
    } else {
      ctrl.schedule(State.SCHEDULED, toSchedule.meta.audio);
    }
  }
};
setInterval(schedulingTick, 5_000);
setTimeout(() => ctrl.schedule(State.LIVE), 5000);
let muxer = spawnFfmpeg("Muxer");
muxer.stdout.on("end", () => {
  console.log("Muxer ended. This is bad!!");
  process.exit(1);
});
muxer.stdout.on("error", (e) => {
  console.log("Muxer errored. This is bad!!", e);
  process.exit(1);
});
muxer.stdout.pipe(
  fs.createWriteStream(`./recordings/broadcast-${Date.now()}.mp3`)
);
const State = {
  LIVE: Symbol("live"),
  OFFAIR: Symbol("offair"),
  SCHEDULED: Symbol("scheduled")
};

const Fanout = (muxer) => {
  let mode = State.OFFAIR;
  let liveSource;
  let currentStream;
  let lastStream;
  const choose = () => {
    console.log("Choosing new Offair track");
    if (mode === State.OFFAIR) {
      fs.readdir("./eighties", (err, files) => {
        if (currentStream) currentStream.kill();
        let file = _.sample(files);
        currentStream = spawnFfmpeg(`Offair: ${file}`);
        fs.createReadStream(`./eighties/${file}`)
          .pipe(currentStream.stdin)
          .on("error", (e) => console.error("FS error"));
        currentStream.stdout.on("data", (d) => {
          muxer.stdin.write(d);
        });
        currentStream.stdout.on("end", () => {
          console.log("EOF offair track");
          choose();
        });
        currentStream.stdout.on("error", (e) => {
          console.log("Error offair track", e);
        });
      });
    }
  };
  choose();
  return {
    disconnectLive() {
      if (mode === State.LIVE) {
        mode = State.OFFAIR;
        choose();
      }
    },
    schedule(type, url) {
      if (type === State.LIVE) {
        if (!ffmpeg) {
          return false;
        }
        mode = State.LIVE;
        currentStream.kill();
        currentStream = null;
        muxer.stdin.write(jingle);
        ffmpeg.stdout
          .on("data", (d) => {
            muxer.stdin.write(d);
          })
          .on("end", () => {
            console.log("Live Stream encoding ended early");
            if (mode === State.LIVE) {
              mode = State.OFFAIR;
              choose();
            }
          })
          .on("error", (e) => {
            console.log("Live Stream encoding errored out", e);
          });
      }
      if (type === State.SCHEDULED) {
        mode = State.SCHEDULED;
        lastStream = currentStream;
        currentStream = spawnFfmpeg(`Scheduled: ${url}`, url);

        currentStream.stdout.on("data", (d) => {
          if (lastStream && mode === State.SCHEDULED) {
            lastStream.kill();
            lastStream = null;
          }

          muxer.stdin.write(d);
        });
        currentStream.stdout.on("end", () => {
          console.log("Scheduled encoding ended early");
          if (mode === State.SCHEDULED) {
            mode = State.OFFAIR;
            choose();
          }
        });
        currentStream.stdout.on("error", (e) => {
          console.log("Scheduled item download errored out", e);
        });
      }
    },
    connectLiveSource(socket) {
      if (mode === State.LIVE) {
        return false;
      }
      if (mode === State.SCHEDULED || mode == State.OFFAIR) {
        if (liveSource) {
          liveSource.end();
        } else {
          liveSource = socket;
          // liveSource.pipe(
          //   fs.createWriteStream(`./recordings/${Date.now()}.mp3`)
          // );
        }
      }
    }
  };
};
const ctrl = Fanout(muxer);

const server = net
  .createServer((socket) => {
    socket.once("data", (d) => {
      let head = d.toString();
      const [meta, ...rawHeaders] = head.split("\r\n");
      const [method, url, version] = meta.split(" ");
      if (method == "SOURCE" || method == "PUT") {
        const headers = Object.fromEntries(
          rawHeaders
            .filter((h) => h.length > 0)
            .map((h) => h.split(":"))
            .map(([name, value]) => [name.trim().toLowerCase(), value.trim()])
        );
        const [protocol, auth] = headers.authorization.split(" ");
        const [username, password] = Buffer.from(auth, "base64")
          .toString()
          .split(":");
        if (username !== "source" || password != process.env.STREAM_PW) {
          return socket.end("HTTP/1.1 401 UNAUTHORIZED\r\n\r\n");
        }
        socket.write("HTTP/1.1 200 OK\r\n\r\n");
        if (url == "/live") {
          console.log("Connecting live source", headers);
          ctrl.connectLiveSource(socket);
        } else {
          socket.end();
        }
      } else {
        socket.write(
          "HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nConnection: keep-alive\r\n\r\n"
        );
        console.log("Add listener", rawHeaders);
        socket.write(jingle);
        muxer.stdout.pipe(socket);
        socket.on("error", () => console.log("Listener error", rawHeaders));
        socket.on("end", () => console.log("Close Listener", rawHeaders));
      }
    });
  })
  .on("error", (err) => {
    console.log("Big ol' error", err);
  });

server.listen(7878, "0.0.0.0", () => {
  console.log("opened server on", server.address());
});

// const app = express();
// app.use(express.json());
// app.use(cors());

// app.post(`/schedule`, (req, res) => {
//   req.body.time = Date.parse(req.body.time);
//   client.set(
//     `freshcaster-schedule-item:${req.body.time}`,
//     JSON.stringify(req.body)
//   );
//   scheduledItems.push(req.body);
//   scheduledItems = _.sortBy(scheduledItems, "time");

//   res.json(req.body);
// });
// app.post(`/disconnect`, (req, res) => {
//   ctrl.disconnectLive();
//   res.status(200).send();
// });
// console.log("Listening");
// app.listen(8989, () => "Server started");
