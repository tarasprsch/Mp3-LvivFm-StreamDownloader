# Lviv FM Stream Recorder

Node.js and TypeScript appliance for recording the Lviv FM MP3 stream without FFmpeg. It stores raw stream bytes, rotates files by approximate size, exposes a password-only web UI, and runs well in Docker or CasaOS.

## Quick Start

```bash
docker compose up -d --build
```

Open `http://localhost:11080` and log in with the default password `change-me`.

Recordings are written to `./mp3`. Application data, logs, statistics, and `config.json` are written to `./data`.

## Useful Commands

```bash
docker compose up -d --build
docker compose stop
docker compose restart
docker compose pull
docker compose down
```

`docker compose down` removes only the container and network. It does not delete `./data` or `./mp3`.

## Configuration

On first start, `/data/config.json` is created automatically. The web UI edits only:

- `enabled`
- `schedule.start`
- `schedule.end`
- `recording.splitSize`
- `auth.password`

The stream URL, timezone, output directory, web host, and web port stay hidden from the UI.

## Details

The recorder connects to `https://onair.lviv.fm:8443/lviv.fm` with Node's HTTPS client and writes received MP3 bytes directly. It does not use FFmpeg and does not parse MP3 frames. Completed files are named `YYYY-MM-DD__NN.mp3`; active files use `.part` names and are atomically renamed when finalized.

See [docs/CasaOS.md](docs/CasaOS.md) for a beginner-friendly CasaOS setup guide.
