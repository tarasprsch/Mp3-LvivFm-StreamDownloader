# CasaOS And Docker Guide

## CasaOS Custom App

1. Build the Docker image on the machine running CasaOS:

```bash
cd /path/to/Mp3-LvivFm-StreamDownloader-v2
docker compose build
```

2. In CasaOS, open **App Store**, choose **Custom Install**, then fill in:

| Field | Value |
| --- | --- |
| App name | `Lviv FM Stream Recorder` |
| Docker image | `lviv-fm-stream-recorder:latest` |
| Container name | `lviv-fm-stream-recorder` |
| Restart policy | `unless-stopped` |
| Network | `bridge` |
| Web UI port | `11080` |
| Container port | `11080` |
| Protocol | `HTTP` |
| Host volume 1 | `/DATA/AppData/lviv-fm-recorder/data` |
| Container volume 1 | `/data` |
| Host volume 2 | `/DATA/Media/lviv-fm-mp3` |
| Container volume 2 | `/mp3` |
| Environment variable | `NODE_ENV=production` |
| Devices | none |
| Privileged | off |

3. Save and start the app.
4. Open the app at `http://CASAOS-IP:11080`.
5. Log in with `change-me`, then change the password on the Settings page.

The `/data` volume stores configuration, text logs, and JSON statistics. The `/mp3` volume stores recordings. Do not map `/mp3` to a temporary folder unless you are comfortable losing recordings.

## Docker Compose Fallback

Build and start:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose stop
```

Restart:

```bash
docker compose restart
```

Rebuild after updating source:

```bash
docker compose up -d --build
```

Remove the container without deleting recordings or app data:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f
```

The web health check reports whether the HTTP service is alive. It does not fail just because a recording attempt failed; recording failures are visible in the dashboard and application history logs.
