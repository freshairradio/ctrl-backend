import express from 'express';
import cors from 'cors';
import jwt from 'express-jwt';
import njwt from 'jsonwebtoken';
import { v4 } from 'uuid';
import AWS from 'aws-sdk';
import mime from 'mime-types';
import axios from 'axios';
import jwtAuthz from 'express-jwt-authz';
import jwksRsa from 'jwks-rsa';
import bcrypt from 'bcrypt';
import { URLSearchParams } from 'url';
import moment from 'moment';
import admin from './firebase';
import WebSocket from 'ws';
import format from 'xml-formatter';
import Podcast from 'podcast';
import { throttle } from 'lodash';
const checkJwt = jwt({
  secret: process.env.JWT_SECRET as string,
  audience: 'FreshAir',
  issuer: `https://freshair.radio`,
  algorithms: ['HS256']
});
import crypto from 'crypto';
import md5 from 'md5';
import listenToTweets from './twitter';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
// import "./streaming";
import './prisma-server';
import Router from 'express-promise-router';
import logger from './logger';
import prisma from './prisma';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const SPACES_ID = process.env.SPACES_ID;
const SPACES_SECRET = process.env.SPACES_SECRET;
const EP = new AWS.Endpoint('nyc3.digitaloceanspaces.com');
const s3 = new AWS.S3({
  endpoint: EP,
  accessKeyId: SPACES_ID,
  secretAccessKey: SPACES_SECRET,
  region: 'nyc3',
  signatureVersion: 'v4'
});
console.log(process.env.NODE_ENV);
const wss = new WebSocket.Server({ port: process.env.WS_PORT });
wss.on('connection', (ws) => {
  console.log('New Websocket client connected');
});
function broadcastMessage(msg) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  });
}
const tapp = express();
const app = Router();
tapp.use('/', app);
app.use(cors());
app.use(express.json());
const token = process.env.TWITTER_BEARER_TOKEN;

listenToTweets(async (tweet) => {
  logger.info(tweet.data.text);
  const tweetData = await fetch(
    `https://api.twitter.com/2/tweets?ids=${tweet.data.id}&tweet.fields=created_at&expansions=author_id,attachments.media_keys&user.fields=created_at&media.fields=duration_ms,height,media_key,preview_image_url,public_metrics,type,url,width`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  ).then((r) => r.json());
  const twitterUser = tweetData.includes.users[0].username;
  const [station] = await prisma.station.findMany({
    where: {
      meta: {
        equals: {
          twitter: twitterUser
        }
      }
    }
  });
  if (!station) {
    logger.error(`Couldn't find station for tweet from ${twitterUser}`);

    return;
  }
  admin.messaging().send({
    notification: {
      title: station.name,
      body: tweet.data.text
    },
    topic: station.id
  });
});

app.get(`/v1/auth/redirect/discord`, async (req, res) => {
  res
    .status(302)
    .setHeader(
      'Location',
      `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        `${process.env.API_HOST}/v1/auth/discord`
      )}&response_type=code&scope=identify%20email`
    );
  return res.send();
});

app.get(`/v1/auth/discord`, async (req, res) => {
  console.log(req.query.code);
  try {
    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.API_HOST}/v1/auth/discord`,
        code: req.query.code as string,
        scope: 'identify email guilds'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    if (response.status == 200) {
      const { access_token, token_type } = response.data;
      const info = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `${token_type} ${access_token}` }
      });
      if (info.status == 200) {
        if (!info.data.verified) {
          throw {
            emailNotVerified: true
          };
        }
        let existing = await prisma.user.findUnique({
          where: {
            email: info.data.email
          },
          include: { credentials: true, roles: true }
        });
        if (existing && existing.credentials.find((c) => c.type == 'discord')) {
          await prisma.credential.update({
            where: {
              id: existing.credentials.find((c) => c.type == 'discord')?.id
            },
            data: {
              data: {
                auth: response.data,
                info: info.data
              }
            }
          });
          await prisma.user.update({
            where: {
              id: existing.id
            },
            data: {
              details: {
                username: info.data.username,
                avatar:
                  info.data.avatar &&
                  `https://cdn.discordapp.com/avatars/${info.data.id}/${info.data.avatar}.jpg`
              }
            }
          });
        } else if (
          existing &&
          !existing.credentials.find((c) => c.type == 'discord')
        ) {
          await prisma.credential.create({
            data: {
              id: v4(),
              type: 'discord',
              data: {
                auth: response.data,
                info: info.data
              },
              userId: existing.id
            }
          });
          await prisma.user.update({
            where: {
              id: existing.id
            },
            data: {
              details: {
                username: info.data.username,
                avatar:
                  info.data.avatar &&
                  `https://cdn.discordapp.com/avatars/${info.data.id}/${info.data.avatar}.jpg`
              }
            }
          });
        } else if (!existing) {
          existing = await prisma.user.create({
            data: {
              id: v4(),
              email: info.data.email,
              credentials: {
                create: [
                  {
                    id: v4(),
                    type: 'discord',
                    data: {
                      auth: response.data,
                      info: info.data
                    }
                  }
                ]
              },
              details: {
                username: info.data.username,
                avatar:
                  info.data.avatar &&
                  `https://cdn.discordapp.com/avatars/${info.data.id}/${info.data.avatar}.jpg`
              },
              updated: new Date(),
              created: new Date()
            },
            include: {
              credentials: true
            }
          });
        }
        njwt.sign(
          {
            id: existing.id,
            roles: (existing?.roles ?? []).map((r) => r.name)
          },
          process.env.JWT_SECRET,
          {
            algorithm: 'HS256',
            audience: 'FreshAir',
            issuer: `https://freshair.radio`
          },
          (err, token) => {
            if (err) {
              return res.status(500).json(err);
            } else {
              res
                .status(302)
                .setHeader(
                  'Location',
                  `${process.env.UI_HOST}/auth-callback?token=${token}`
                );
              return res.send();
            }
          }
        );
      } else {
        throw info;
      }
    } else {
      throw response;
    }
  } catch (e) {
    switch (true) {
      case e.isAxiosError:
        return res
          .status(302)
          .setHeader('Location', `${process.env.UI_HOST}/auth`);
      case e.emailNotVerified:
        return res
          .status(302)
          .setHeader(
            'Location',
            `${process.env.UI_HOST}/auth?reason=${encodeURIComponent(
              'The email on your account must be verified'
            )}`
          );
      default:
        console.error(e);
        return res.status(500).send();
    }
  }
});

app.get(`/v1/public/shows/`, async (req, res) => {
  return res.json(await prisma.show.findMany({}));
});
app.get(`/v1/stations/`, async (req, res) => {
  return res.json(await prisma.station.findMany({}));
});

app.get(`/v1/public/shows/:slug`, async (req, res) => {
  return res.json(
    await prisma.show.findUnique({
      where: {
        slug: req.params.slug
      },
      include: {
        episodes: true
      }
    })
  );
});
app.post(`/v1/auth/register`, async (req, res) => {
  const existing = await prisma.user.findUnique({
    where: {
      email: req.body.email
    }
  });
  if (existing) {
    return res.status(409).json({
      error: true,
      message:
        'That email is already linked to an account! Try logging in instead?'
    });
  }
  const user = await prisma.user.create({
    data: {
      id: v4(),
      email: req.body.email,
      credentials: {
        create: [
          {
            id: v4(),
            type: 'email',
            data: {
              hash: await bcrypt.hash(req.body.password, 12)
            }
          }
        ]
      },
      details: req.body.details,
      updated: new Date(),
      created: new Date()
    }
  });
  njwt.sign(
    { id: user.id, roles: [] },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      audience: 'FreshAir',
      issuer: `https://freshair.radio`
    },
    (err, token) => {
      if (err) {
        return res.status(500).json(err);
      } else {
        return res.json({
          token
        });
      }
    }
  );
});
app.post(`/v1/auth/login`, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      email: req.body.email
    },
    include: {
      credentials: true,
      roles: true
    }
  });
  if (!user) {
    return res.status(404).json({
      error: true,

      message: 'User not found'
    });
  }
  if (
    await bcrypt.compare(
      req.body.password,
      user.credentials.filter((c) => c.type === 'email')?.[0]?.data?.['hash'] ??
        ''
    )
  ) {
    njwt.sign(
      { id: user.id, roles: (user?.roles ?? []).map((r) => r.name) },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        audience: 'FreshAir',
        issuer: `https://freshair.radio`
      },
      (err, token) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: true, trace: err });
        } else {
          return res.json({
            token
          });
        }
      }
    );
  } else {
    return res.status(401).json({
      error: true,
      message: 'Incorrect password'
    });
  }
});
app.get(`/v1/auth/me`, checkJwt, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.id
    },
    include: {
      roles: true,
      shows: true,
      credentials: true,
      stations: true
    }
  });
  return res.json(user);
});

app.get(`/v1/users`, checkJwt, async (req, res) => {
  const users = await prisma.user.findMany({
    include: {
      roles: true,
      shows: true,
      credentials: true
    }
  });
  return res.json(users);
});

app.get(`/v1/media-upload`, checkJwt, async (req, res) => {
  const mimeType = req.query.ct;
  console.log(req.query);
  if (
    ![
      'audio/mpeg',
      'audio/mp3',
      'image/jpg',
      'image/png',
      'image/jpeg'
    ].includes(mimeType)
  ) {
    return res.status(400).json({
      error: true,
      message: 'Invalid file type'
    });
  }

  const id = v4();
  const url = s3.getSignedUrl('putObject', {
    Bucket: 'freshair',
    Key: `media/${id}.${
      mimeType == 'audio/mpeg' ? 'mp3' : mime.extension(mimeType) // mime-types classifies audio/mpeg as .mpga, which we don't want
    }`,
    Expires: 60 * 60 * 24, // 1 day
    ContentType: req.headers['Content-Type']
  });
  return res.status(200).json({
    signed: url,
    access: `https://cdn.freshair.radio/media/${id}.${
      mimeType == 'audio/mpeg' ? 'mp3' : mime.extension(mimeType)
    }`,
    id
  });
});

app.get(`/v1/my/shows`, checkJwt, async (req, res) => {
  const shows = await prisma.show.findMany({
    where: {
      users: {
        some: {
          id: req.user.id
        }
      }
    },
    include: {
      episodes: true
    }
  });
  return res.json(shows);
});
app.get(`/v1/public/stations`, async (req, res) => {
  const stations = await prisma.station.findMany({});

  return res.json(stations);
});

app.get(`/v1/shows/:slug`, checkJwt, async (req, res) => {
  const show = await prisma.show.findUnique({
    where: {
      slug: req.params.slug
    },
    include: {
      episodes: true,
      users: true
    }
  });
  if (!show?.users.find((u) => u.id == req.user.id)) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that show"
    });
  }
  return res.json(show);
});
app.put(`/v1/shows/:slug`, checkJwt, async (req, res) => {
  const show = await prisma.show.findUnique({
    where: {
      slug: req.params.slug
    },
    include: {
      episodes: true,
      users: true
    }
  });
  if (!show?.users.find((u) => u.id == req.user.id)) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that show"
    });
  }
  let update = await prisma.show.update({
    where: {
      slug: req.params.slug
    },
    data: {
      title: req.body.title,
      description: req.body.description,
      meta: req.body.meta,
      picture: req.body.picture,
      when: req.body.when
    }
  });
  setTimeout(() => updateRSSFeeds(req.params.slug), 10000);

  return res.json(update);
});

app.get(`/v1/stations/:id`, checkJwt, async (req, res) => {
  const station = await prisma.station.findUnique({
    where: {
      id: req.params.id
    },
    include: {
      members: true
    }
  });
  if (!station?.members.find((u) => u.id == req.user.id)) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that Station"
    });
  }
  return res.json(station);
});
app.put(`/v1/stations/:id`, checkJwt, async (req, res) => {
  const station = await prisma.station.findUnique({
    where: {
      id: req.params.id
    },
    include: {
      members: true
    }
  });
  if (!station?.members.find((u) => u.id == req.user.id)) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that Station"
    });
  }
  let update = await prisma.station.update({
    where: {
      id: req.params.id
    },
    data: {
      name: req.body.name,
      picture: req.body.picture,
      meta: req.body.meta,
      colour: req.body.colour,
      stream: req.body.stream
    }
  });
  return res.json(update);
});

app.get(`/v1/shows/:slug/episodes/:episodeId`, checkJwt, async (req, res) => {
  const episode = await prisma.episode.findUnique({
    where: {
      id: req.params.episodeId
    },
    include: {
      Show: {
        include: { users: true }
      }
    }
  });
  if (!episode?.Show?.users.find((u) => u.id == req.user.id)) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that episode"
    });
  }
  return res.json(episode);
});

app.delete(
  `/v1/shows/:slug/episodes/:episodeId`,
  checkJwt,
  async (req, res) => {
    const episode = await prisma.episode.findUnique({
      where: {
        id: req.params.episodeId
      },
      include: {
        Show: {
          include: { users: true }
        }
      }
    });
    if (!episode?.Show?.users.find((u) => u.id == req.user.id)) {
      return res.status(404).json({
        error: true,
        message: "Couldn't find that episode"
      });
    }
    return res.json(
      await prisma.episode.delete({ where: { id: req.params.episodeId } })
    );
  }
);
const generateRSSFeed = async (show) => {
  const { slug, title, description, picture, meta, episodes } = show;

  const feed = new Podcast({
    title: title,
    description,
    feed_url: `https://freshair.nyc3.digitaloceanspaces.com/rssfeed/${slug}.xml`,
    site_url: `https://freshair.radio/shows/${slug}`,
    image_url: `https://freshair.nyc3.digitaloceanspaces.com/rssfeed/${slug}.jpg`,
    author: `Freshair Radio`,
    language: 'en',
    ttl: '60',
    itunesAuthor: `Freshair Radio`,
    itunesSummary: description,
    itunesOwner: { name: 'Freshair', email: 'manager@freshair.radio' },
    itunesExplicit: false,
    itunesCategory: (meta.category || '')
      .split(',')
      .filter(Boolean)
      .map((c) => ({ text: c })),
    itunesImage: `https://freshair.nyc3.digitaloceanspaces.com/rssfeed/${slug}.jpg`
  });
  await Promise.all(
    episodes
      .filter((e) => !!e.meta.audio)
      .map(
        async ({ id: epIdent, title, created, description, audio, meta }) => {
          feed.addItem({
            title: title,
            itunesTitle: title,
            itunesAuthor: `Freshair Radio`,

            description: description,
            url: `https://freshair.radio/shows/${slug}#episode-${epIdent}`,
            enclosure: {
              url: meta.audio.replace(
                'cdn.freshair.radio',
                'freshair.nyc3.cdn.digitaloceanspaces.com'
              ),
              type: 'audio/mpeg',
              size: Math.round(meta.length)
            }, // optional enclosure
            date: created, // any format that js Date can parse.
            itunesExplicit: false,
            itunesSummary: description,
            itunesDuration: Math.round(meta.length)
          });
        }
      )
  );
  return format(feed.buildXml());
};
app.get(`/rss/:slug`, async (req, res) => {
  const show = await prisma.show.findUnique({
    where: {
      slug: req.params.slug
    },
    include: { episodes: true }
  });

  if (!show) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that show"
    });
  }
  res.set('Content-Type', 'application/rss+xml');
  res.send(await generateRSSFeed(show));
});
console.log(process.env.NODE_ENV);

const updateRSSFeeds = throttle(async (slug: string) => {
  if (process.env.NODE_ENV !== 'production') {
    logger.warn('Refusing to update RSS feeds in dev environment');
    return;
  }
  try {
    const show = await prisma.show.findUnique({
      where: {
        slug: slug
      },
      include: { episodes: true }
    });
    if (!show) {
      console.error('RSS generation called for non-existent show', slug);
      return false;
    }

    let rss = await generateRSSFeed(show);

    const { data, headers } = await axios.get(
      `https://imgproxy.freshair.radio/signature/fill/2000/2000/sm/1/plain/${show.picture}@jpg`,
      {
        responseType: 'arraybuffer'
      }
    );
    let params = {
      Bucket: 'freshair',
      ACL: 'public-read',
      ContentType: 'application/rss+xml'
    };
    await s3
      .putObject({
        ...params,
        ContentType: 'image/jpeg',
        Body: data,
        Key: `rssfeed/${slug}.jpg`
      })
      .promise();
    let req = await s3
      .putObject({
        ...params,
        Body: rss,
        Key: `rssfeed/${slug}.xml`
      })
      .promise();
    return true;
  } catch (e) {
    console.error(e);
  }
}, 60 * 1000);

const processAudio = (url) => {
  console.log('Starting to process media:', url);
  return new Promise(async (yes, no) => {
    console.log('Beginning ffmpeg process');

    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-i',
      url,
      '-f',
      'mp3',
      '-vn',
      '-ar',
      '44100',
      '-b:a',
      '192k',
      '-af',
      'loudnorm=I=-18:LRA=13:TP=-2',
      '-ac',
      '2',
      `pipe:1`
    ]);
    let ffmpegOutput = '';
    let duration;
    ffmpeg.stderr
      .on('data', (data) => {
        logger.info(data.toString());
        if (!duration) {
          ffmpegOutput += data;
          let durationMatch = ffmpegOutput.match(
            /Duration: (\d\d):(\d\d):(\d\d)\.(\d\d)/
          );
          if (durationMatch) {
            let [hours, minutes, seconds, centiseconds] =
              durationMatch.slice(1);
            duration = Math.round(
              parseInt(hours) * 60 * 60 +
                parseInt(minutes) * 60 +
                parseFloat(`${seconds}.${centiseconds}`)
            );
            console.log(duration);
          }
        } else {
          let progressMatch = data
            .toString()
            .match(/time=(\d\d):(\d\d):(\d\d)\.(\d\d)/);
          if (progressMatch) {
            let [hours, minutes, seconds, centiseconds] =
              progressMatch.slice(1);
            let progress = Math.round(
              parseInt(hours) * 60 * 60 +
                parseInt(minutes) * 60 +
                parseFloat(`${seconds}.${centiseconds}`)
            );
            broadcastMessage({
              type: 'processingUpdate',
              for: url,
              progress: (progress / duration) * 100
            });
          }
        }
      })

      .on('error', console.error)
      .on('end', async () => {
        console.log('ffmpeg process finished');
      });

    console.log('Starting Spaces upload');

    let params = {
      Bucket: 'freshair',
      ACL: 'public-read',
      ContentType: 'audio/mpeg'
    };
    const id = v4();
    await s3
      .upload({
        ...params,
        Body: ffmpeg.stdout,
        Key: `processed_media/mp3/${id}.mp3`
      })
      .on('httpUploadProgress', (event) => {
        console.log(event);
      })
      .promise();
    broadcastMessage({
      type: 'processingDone',
      for: url,
      with: `https://cdn.freshair.radio/processed_media/mp3/${id}.mp3`
    });
    yes({
      audio: `https://cdn.freshair.radio/processed_media/mp3/${id}.mp3`,
      duration
    });
  });
};

app.post(`/v1/reprocess/:eid`, checkJwt, async (req, res) => {
  await prisma.episode
    .findUnique({ where: { id: req.params.eid }, include: { Show: true } })
    .then(async (episode) => {
      console.log('Episode', req.params.eid);
      await processAudio(episode.audio).then(async (r: any) => {
        console.log(
          await prisma.episode.update({
            where: {
              id: episode.id
            },
            data: {
              meta: {
                audio: r.audio,
                length: r.duration
              }
            }
          })
        );
        setTimeout(() => updateRSSFeeds(episode.Show.slug), 10000);
      });
    });
});

app.put(`/v1/raw/:episodeId`, checkJwt, async (req, res) => {
  const episode = await prisma.episode.update({
    where: {
      id: req.params.episodeId
    },
    data: {
      title: req.body.title,
      description: req.body.description,
      scheduling: req.body.scheduling,
      audio: req.body.audio,
      meta: req.body.meta
    }
  });

  return res.json(episode);
});

app.put(`/v1/shows/:slug/episodes/:episodeId`, checkJwt, async (req, res) => {
  console.log(req.body.audio);
  const existing = await prisma.episode.findUnique({
    where: {
      id: req.params.episodeId
    },
    include: {
      Show: {
        include: { users: true }
      }
    }
  });
  if (!existing || !existing?.Show?.users.find((u) => u.id == req.user.id)) {
    return res.status(404).json({
      error: true,
      message: "Couldn't find that episode"
    });
  }
  let meta = existing.meta;
  if (existing.audio != req.body.audio) {
    meta = { published: false };
    console.log('Audio changed');
    processAudio(req.body.audio).then(async (r: any) => {
      console.log(
        await prisma.episode.update({
          where: {
            id: req.params.episodeId
          },
          data: {
            meta: {
              audio: r.audio,
              length: r.duration
            }
          }
        })
      );
      setTimeout(() => updateRSSFeeds(req.params.slug), 10000);
    });
  }
  const episode = await prisma.episode.update({
    where: {
      id: req.params.episodeId
    },
    data: {
      title: req.body.title,
      description: req.body.description,
      scheduling: req.body.scheduling,
      audio: req.body.audio,
      meta
    }
  });
  setTimeout(() => updateRSSFeeds(req.params.slug), 10000);

  return res.json(episode);
});
app.post(`/v1/shows/:showId/episodes`, checkJwt, async (req, res) => {
  const episode = await prisma.episode.create({
    data: {
      id: v4(),
      Show: {
        connect: {
          id: req.params.showId
        }
      },
      scheduling: { week: null },
      meta: { published: false },
      created: new Date(),
      updated: new Date()
    }
  });

  return res.json(episode);
});

app.post(`/v1/shows`, checkJwt, async (req, res) => {
  const show = await prisma.show.create({
    data: {
      id: v4(),
      title: req.body.title,
      slug: req.body.slug,
      when: {},
      meta: {},
      users: {
        connect: {
          id: req.user.id
        }
      }
    },
    include: {
      users: true
    }
  });

  return res.json(show);
});
app.post(`/v1/stations`, checkJwt, async (req, res) => {
  const station = await prisma.station.create({
    data: {
      id: v4(),
      name: req.body.name ?? '',
      approved: false,
      picture: '',
      meta: {},
      colour: '',
      stream: '',
      members: {
        connect: {
          id: req.user.id
        }
      }
    },
    include: {
      members: true
    }
  });

  return res.json(station);
});
app.put(`/v1/users/:id/roles`, checkJwt, async (req, res) => {
  const users = await prisma.user.update({
    where: {
      id: req.params.id
    },
    data: {
      roles: {
        set: req.body.map((r) => ({
          id: r
        }))
      }
    }
  });
  return res.json(users);
});

app.post(`/v1/my/stations`, checkJwt, async (req, res) => {
  const user = await prisma.user.update({
    where: {
      id: req.user.id
    },
    data: {
      stations: {
        connect: {
          id: req.body.station
        }
      }
    }
  });
  return res.json(user);
});

tapp.listen(process.env.PORT);
