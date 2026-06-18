# Lviv FM Stream Recorder

## Summary

Build a Node.js and TypeScript application that records the Lviv FM MP3 stream
at `https://onair.lviv.fm:8443/lviv.fm` directly, without FFmpeg. It runs in
Docker, follows a daily schedule, supports manual control, splits recordings at
approximately 20-minute intervals based on file size, and provides an
authenticated React web UI.

The primary product goal is minimum audio loss with a simple, reliable
appliance-style implementation.

## Implementation

- Use Node.js 24 LTS, TypeScript, and ECMAScript modules. Run the recorder,
  scheduler, API, and static React application in one process.
- Read the MP3 stream as an `https` stream and preserve the raw bytes exactly as
  received.
- Do not use FFmpeg.
- Split recordings by approximate byte size only. Do not parse MP3 frames.
- Rotate files at `splitSize` without reconnecting.
- Use `AbortController` for immediate manual stops and graceful shutdown.
- On stream drop, stop the current capture and add an appropriate stream error
  record to the application history logs.
- The scheduler does not retry during the same failed schedule window. It tries
  again only at the next scheduled start.
- Manual Start may be attempted at any time unless capture is disabled.
- If Manual Start fails because of a stream error, reset manual state to stopped
  immediately.

## Files And Recording

- Write active recordings as `.part`.
- On graceful shutdown, finalize the active `.part` file to `.mp3`.
- On startup, leave existing `.part` files untouched and report them.
- Atomically rename completed recordings to `YYYY-MM-DD__NN.mp3`.
- Never overwrite existing recordings.
- Choose the next filename by scanning `/mp3` for existing
  `YYYY-MM-DD__NN.mp3` files and using `max(NN) + 1`.
- Ignore `.part` files when choosing the next number.
- Every file in one uninterrupted capture session retains that session's
  starting date.
- Splitting is based on file size. Because rollover is approximate and not
  MP3-frame-aware, a completed file may end in the middle of an MP3 frame.

## Configuration

Use `/data/config.json` with UI editing and validation:

```json
{
  "enabled": true,
  "stream": {
    "url": "https://onair.lviv.fm:8443/lviv.fm"
  },
  "schedule": {
    "start": "23:00",
    "end": "06:00",
    "timezone": "Europe/Kyiv"
  },
  "recording": {
    "splitSize": 19.2,
    "outputDirectory": "/mp3"
  },
  "web": {
    "host": "0.0.0.0",
    "port": 11080
  },
  "auth": {
    "password": "change-me"
  }
}
```

`splitSize` is expressed in decimal megabytes, where 1 MB equals 1,000,000
bytes. The default of `19.2` MB represents about 20 minutes of audio at the
stream's advertised constant bitrate of 128 kbps.

- Validate settings and API payloads with Zod.
- If `/data/config.json` does not exist on startup, create it with the default
  settings shown above.
- Save configuration through a temporary file and atomic replacement of
  `/data/config.json`.
- Read the plaintext admin password from `config.json`.
- Support exactly one implicit admin user. Login requires only the password. Do
  not implement named accounts, roles, multiple users, or a password reset flow.
- Use plain HTTP for the web UI.
- Scheduled windows may cross midnight.
- Use `"Europe/Kyiv"` as the schedule timezone.
- On startup during an active enabled schedule window, recording starts
  immediately.
- Invalid external config changes retain the last valid configuration and
  produce a visible error.
- The web UI can change the password by atomically updating `config.json`.
- Config changes are saved immediately while recording, but normal changes do
  not restart the active stream. New values apply to future recordings.
- Setting `enabled` to `false` disables future scheduled starts and Manual Start.
  Manual Stop and scheduled stop behavior remain available so an active capture
  can still be stopped.

## Schedule And Manual Controls

- Manual Start begins recording immediately, regardless of schedule, unless
  `enabled` is `false`.
- If `enabled` is `false`, Manual Start is blocked and the web UI must show an
  appropriate disabled-capture message.
- Manual Stop immediately stops recording.
- Manual Stop during an active schedule window keeps recording stopped until the
  next scheduled start.
- After Manual Start, scheduled start is a no-op and scheduled end stops
  recording.
- After Manual Stop, the current scheduled end is a no-op and the next enabled
  scheduled start resumes recording.
- If the stream drops during scheduled or manual recording, stop recording and
  log a stream error.
- After a scheduled stream failure, the scheduler waits until the next scheduled
  start before trying again.
- After a manual stream failure, manual state resets to stopped immediately.

## Web UI

Provide exactly three authenticated pages:

- Main page:
  - Current state, disabled state, current filename, size, duration, capture
    start, and expected stop.
  - Manual Start and Manual Stop controls.
  - Next scheduled start/end and active manual override.
  - Service uptime, recording time, files and bytes created, recording days and
    failures.
  - Recent sessions, last successful connection, last error, disk usage,
    available space, and other useful read-only operational information.
- Log page:
  - Searchable auto-refreshing application history logs.
- Settings page:
  - Editable validated settings for only `enabled`, `schedule.start`,
    `schedule.end`, `recording.splitSize`, and `auth.password`.
  - Do not expose, stream URL, timezone, output directory,
    web host, or web port in the web UI.
  - Include logout.

The authentication window asks only for the password. Do not require a
login name anywhere.

Do not provide a page for downloading or listing recordings. Users access
recorded files through the mounted `/mp3` folder.

Do not provide a test-stream-connection button.

## Application History Logs

Keep application history logs as plain text files under `/data`.

Log at least these events:

- App start and stop.
- Schedule changed.
- Scheduled recording started and stopped.
- Manual recording started and stopped.
- File error.
- Stream error.
- Storage error.
- Config validation error.

Avoid logging admin identity details or IP address.

## Persistent Data

- `./data:/data` stores `config.json`, JSON statistics, JSON Lines capture
  history if needed, and rotating text application logs.
- `./mp3:/mp3` stores recordings.
- If `/mp3` is missing, create it.
- If storage errors occur after directory creation, stop recording and add an
  appropriate application history log entry.
- Never delete recordings automatically.

## Docker

- Use a multi-stage Docker build: compile the React UI and TypeScript backend,
  then copy production artifacts into a minimal Node.js 24 LTS runtime image.
- Run as a non-root user.
- Include a Docker health check.
- The health check should not fail merely because recording failed. Recording
  failures are reported in the UI and application history logs.
- Include `Dockerfile`, `docker-compose.yml`, sample configuration, and usage
  documentation.

## User Documentation

After implementation is complete, create a detailed beginner-friendly guide for
running the application with Docker and CasaOS.

- Provide a step-by-step CasaOS custom app setup, mapping every image, port,
  volume, environment variable, and device field to the supplied Docker
  configuration.
- Provide Docker Compose commands as a fallback for building, starting,
  stopping, restarting, updating, and removing the container without deleting
  recordings or application data.

## Testing

- Use Vitest for backend unit tests and React Testing Library for component unit
  tests.
- Unit-test schedule calculations, manual control transitions, stream failure
  transitions, disabled scheduling, and disabled manual start.
- Unit-test size-based rollover, filename sequencing, partial file startup
  reporting, graceful shutdown finalization, and statistics calculations.
- Unit-test configuration validation, password-only authentication helpers, API
  handlers with mocked dependencies, and React component behavior.
- Mock network, filesystem, timers, and persistent text-file boundaries.
- Do not include integration, end-to-end, Docker, or live-stream tests.

## Deferred Decisions

- Whether `.part` startup warnings appear only in logs or persist on the
  dashboard until manually removed.
- Whether `schedule changed` logs only schedule-field changes or every settings
  save.
- Whether JSON Lines capture history is needed if recordings are not listed in
  the UI.
