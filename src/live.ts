const net = require("net");
const https = require("https");
const fs = require("fs");
const { spawn } = require("child_process");
const _ = require("lodash");
// const redis = require("redis");
import Speaker from "speaker";
const express = require("express");
const stream = require("stream");
// const client = redis.createClient({ host: "redis", port: 6379 });
const cors = require("cors");
import moment from "moment";
const { Transform } = require("stream");
const Discord = require("discord.js");
const { Readable, Writable } = require("stream");
import colada from "pino-colada";
import pino from "pino";

const logger = pino({
  prettyPrint: {
    levelFirst: true
  },
  prettifier: colada
});
logger.error("hi");
const client = new Discord.Client();
const fetch = require("node-fetch");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SILENCE_TOKEN = process.env.SILENCE_TOKEN;
const streamOutput = process.env.STREAM;
const broadcastChannel = "listen";
const controlChannel = "studio3";
const { v4 } = require("uuid");
import Mixer from "./pcmMixer";

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
  //   ffmpeg.stderr.on("data", (d) => console.log(label, d.toString()));

  ffmpeg.stderr.on("error", function (error) {
    console.log(label, "Error" + error);
  });
  ffmpeg.on("exit", function (code) {
    console.log("FFMPEG child process exited with code " + code, label);
  });

  return ffmpeg;
}

const fromBuffer = (buf) => {
  let arr = new Int16Array(buf.length / 2);
  for (let i = 0; i < buf.length; i += 2) {
    arr[i / 2] = buf.readIntLE(i, 2);
  }
  return arr;
};
const NS_PER_PACKET = 2e7;
const TheMixer = () => {
  let clients = new Map();
  let last = process.hrtime.bigint();
  let stream = new Readable({
    read(size) {
      return;
      let current = process.hrtime.bigint();
      console.log(current - last);
      if (current - last >= NS_PER_PACKET)
        this.push(Buffer.from([0xf8, 0xff, 0xfe]));
      last = current;
    }
  });
  function check() {
    let current = process.hrtime.bigint();
    if (current - last >= 25 * NS_PER_PACKET) {
      const remainder = current - last - BigInt(25) * BigInt(NS_PER_PACKET);
      console.log(remainder);
      const packets: number = 25;
      let toSend: Int16Array[] = [];
      for (let p = 0; p < packets; p++) {
        let mixedPacket = new Int16Array(1920);
        for (let index = 0; index < mixedPacket.length; index++) {
          mixedPacket[index] = 0;
        }
        for (const client of clients.entries()) {
          if (client[1][p]) {
            for (let index = 0; index < client[1][p].length; index++) {
              mixedPacket[index] += client[1][p][index];
            }
          }
        }
        toSend.push(mixedPacket);
      }
      for (const client of clients.entries()) {
        clients.set(client[0], client[1].slice(packets));
      }
      console.log(toSend.length);
      for (const packet of toSend) {
        stream.push(Buffer.from(packet.buffer));
      }
      last = last + BigInt(26) * BigInt(NS_PER_PACKET);
    }
  }
  setInterval(check, 40);
  return {
    addSource() {
      let id = v4();
      let buf: Int16Array[] = [];
      let mode = 0;
      let last = process.hrtime.bigint();
      return new Writable({
        write(chunk, encoding, callback) {
          if (mode === 0) {
            buf.push(fromBuffer(chunk));
            if (buf.length >= 50) {
              mode = 1;
              clients.set(id, buf);
            }
          } else {
            console.log(clients.get(id).length);
            clients.get(id).push(fromBuffer(chunk));
          }

          callback();
        },
        final(callback) {
          clients.delete(id);
          callback();
        }
      });
    },
    stream
    // addSource(sock) {
    //   const id = v4()
    //   sock.buffer = [];
    //   clients.push(sock);
    //   sock.on("data", (data) => {
    //     let arr = new Int16Array(data.length / 2);
    //     for (let i = 0; i < data.length; i += 2) {
    //       arr[i / 2] = data.readIntLE(i, 2);
    //     }
    //     sock.buffer.push(arr);
    //     // sock.send(arr.buffer);
    //   });

    // },
  };
};
console.log(40000000 == 4e7);
const tm = TheMixer();
const Clients = () => {
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
let mixer;
var ffmpeg = spawnLiveFfmpeg("Live Stream mixing");
tm.stream.pipe(ffmpeg.stdin);

ffmpeg.stdout.pipe(fs.createWriteStream(`./recordings/test-${Date.now()}.mp3`));
// pcmMixer.start().on("data", console.log)

// ffmpeg.stdout.pipe(
//   fs.createWriteStream(`./recordings/test-${Date.now()}.mp3`)
// );
// ffmpeg.stdout.on("error", (e) => console.error("FFMPEG error", e));
// ffmpeg.stdout.on("end", (e) => console.error("FFMPEG end", e));
// ffmpeg.stdin.on("error", (e) => console.error("FFMPEG In error", e));
// ffmpeg.stdin.on("end", (e) => console.error("FFMPEG In end", e));

client.once("ready", () => {
  console.log("Ready!");
  let audio;
  client.channels.fetch("818269575673020450").then(async (ch) => {
    const connection = await ch.join();

    ch.members.forEach((member) => {
      if (member.user.username === "FreshBot") {
        audio = connection.receiver.createStream(member, {
          mode: "pcm",
          end: "manual"
        });
        const source = tm.addSource();
        audio.on("data", (d) => source.write(d));
      } else {
        let a = connection.receiver.createStream(member, {
          mode: "opus",
          end: "manual"
        });
        a.on("data", (d) => connection.play(d));
      }

      //   audio.pipe(pcmMixer.input({ channels: 1, volume: 1.0 }));
    });
  });
});
