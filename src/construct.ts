import { config } from "dotenv";
config();
import { sql, multiple } from "./db";

const bootstrap = async () => {
  await multiple(sql`
    drop table if exists shows cascade;
    drop table if exists link_show_user cascade;
    drop table if exists episodes cascade;
    drop table if exists link_show_episode cascade;

    create table shows (
        identifier uuid primary key,
        title text,
        description text,
        slug text unique,
        picture text,
        meta jsonb,
        created timestamp,
        updated timestamp
    );
    create table link_show_user (
        identifier uuid primary key,
        "show" uuid references shows,
        "user" uuid
    );
    create table episodes (
        identifier uuid primary key,
        title text,
        description text,
        slug text unique,
        audio text,
        meta jsonb,
        scheduling jsonb,
        created timestamp,
        updated timestamp
    );
    create table link_show_episode (
        identifier uuid primary key,
        "show" uuid references shows,
        "episode" uuid references episodes
    );
    `);
  process.exit(0);
};
bootstrap();
