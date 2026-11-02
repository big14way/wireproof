# Seed

The case a fresh deploy opens on. When a job has no saved case in `DATA_DIR`, the app reads `seed/cases/<jobId>.json` and the media beside it. On a hosted server (`WIREPROOF_HOSTED=1`), "start again" in the console goes back to this seed, so a visitor can't wipe the demo.

Capture the job on this machine, then save it here:

```sh
npm run seed:save          # the demo job
npm run seed:save -- --all # also media no reading used; look at it first
```

This folder is public. By default only media that a reading used is copied, so a photo the privacy gate blocked never lands here.
