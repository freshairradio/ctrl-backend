import fs from "fs";
import { spawn } from "child_process";
import { zip } from "lodash";
import Discord from "discord.js";
import { v4 } from "uuid";
import logger from "./logger";
import { Readable, PassThrough } from "stream";
const jingle = fs.readFileSync("./ident.mp3");

const client = new Discord.Client();
const broadcastClient = new Discord.Client();
const silenceClient = new Discord.Client();
client.login(process.env.DISCORD_TOKEN);
broadcastClient.login(process.env.BROADCAST_BOT_TOKEN);
silenceClient.login(process.env.SILENCE_BOT_TOKEN);

function startFFMPEGProcess() {
  const ffmpeg = spawn("ffmpeg", [
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
    "pipe:1"
  ]);
  ffmpeg.on("exit", (code) => {
    logger.info("Discord ffmpeg process exited");
  });
  ffmpeg.stderr.pipe(
    fs.createWriteStream(`/tmp/ffmpeg-live-log-${Date.now()}.txt`)
  );
  ffmpeg.stderr.on("error", (e) => {
    logger.error("Discord ffmpeg process", e);
  });
  return ffmpeg;
}
let ffmpeg = startFFMPEGProcess();

const PCMMixer = () => {
  const clients = [];
  const zeroCount = new Map();
  const muxAndFan = () => {
    const numToSend = Math.min(
      ...clients.map((c) => {
        if (c.buffer.length == 0) {
          zeroCount.set(c._id, zeroCount.get(c._id) + 1);
          if (zeroCount.get(c._id) >= 50) {
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

    const buffers = zip(
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
        ffmpeg.stdin.write(Buffer.from(sample.buffer));
      } catch (e) {
        logger.error("PCM mixer write error", e);
      }
    }
  };
  setInterval(muxAndFan, 0);
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
      });
    }
  };
};

const mixer = PCMMixer();
ffmpeg.stdout.pipe(
  fs.createWriteStream(`./recordings/live-mixed-${Date.now()}.mp3`)
);
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
  }
}
silenceClient.once("ready", () => {
  silenceClient.on("message", (message) => {
    if (message.content == "!listen") {
      silenceClient.channels
        .fetch(process.env.LIVE_CHANNEL)
        .then(async (ch) => {
          const connection = await ch.join();
          connection.play(new Silence(), { type: "opus" });
        });
    }
  });
});
client.once("ready", () => {
  logger.info("Discord connection ready!");
  client.on("message", async (message) => {
    if (message.content == "!listen") {
      let speakers = [];

      await client.channels.fetch(process.env.LIVE_CHANNEL).then(async (ch) => {
        const connection = await ch.join();

        ch.members.forEach((member) => {
          if (member.user.username === "FreshBot") {
            return;
          }
          logger.info(
            `Listening to ${member.user.username}#${member.user.discriminator}`
          );
          speakers.push(`${member.user.username}`);

          const audio = connection.receiver.createStream(member, {
            mode: "pcm",
            end: "manual"
          });
          mixer.addClient(audio);
        });
      });
      message.channel.send("Users added to stream: " + speakers.join(", "));
    }
  });
});

export async function playStream(source) {
  broadcastClient.once("ready", () => {
    broadcastClient.channels
      .fetch(process.env.BROADCAST_CHANNEL)
      .then(async (ch) => {
        const connection = await ch.join();
        const buffer = new PassThrough();
        buffer.write(jingle);
        source.pipe(buffer);
        connection.play(buffer);
      });
  });
}
export async function pipe(destination) {
  ffmpeg.stdout.pipe(destination);
}
export async function unpipe(destination) {
  ffmpeg.stdout.unpipe(destination);
}
