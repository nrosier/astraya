# Key-leak runbook

Runbook for operators when `ASTRAYA_ENCRYPTION_KEY` has leaked (#1782). It covers the encryption key and the TOTP state that the key protects. Run the steps in order.

## Why step 3 is needed

Rotation (step 2) re-encrypts the TOTP secrets and the recovery-code pepper under the new key. That protects the database against the old key from now on, but it does not undo a TOTP compromise. With the old key and a backup taken before rotation, an attacker can still decrypt every TOTP secret, and the recovery codes can be guessed offline (about 50 bits). `npm run ops:reset-totp` clears TOTP for every user, deletes all recovery codes and the pepper, and keeps sessions and passwords. Users then enrol TOTP again.

## Steps

1. **Stop the server.** Rotation and the reset both require the server to be stopped. A running server on the old key can write rows under it during rotation.

2. **Rotate the key.** Set the leaked key as `ASTRAYA_ENCRYPTION_KEY` and the replacement as `ASTRAYA_NEW_ENCRYPTION_KEY`. Store the replacement key in your secret store before rotation runs; it must stay set for the restart in step 4, because the server cannot read the rotated rows without it. Then run:

   ```sh
   npm run ops:rotate-key
   ```

   The command re-encrypts every stored operation, saved interpretation result, TOTP secret and the recovery-code pepper, all in one transaction.

   A Docker operator with no npm in the image runs the same script in a one-off container from the image, with the server container stopped and the data volume mounted at `/app/data`: `docker run --rm -v astraya-data:/app/data -e ASTRAYA_ENCRYPTION_KEY -e ASTRAYA_NEW_ENCRYPTION_KEY ghcr.io/nrosier/astraya:<tag> server/ops/rotate-key.ts`. The image's entrypoint is `node`, so the argument is the script path. Use the same tag as your running server container (for example, if it runs ghcr.io/nrosier/astraya:0.56.0, use that tag); do not use `:latest`, because opening the database runs migrations and a newer image would upgrade it in place. If your server uses a different volume, a bind mount, or a custom `ASTRAYA_DB_PATH`, pass the same `-v` mount and `-e ASTRAYA_DB_PATH` to this container, or it will open an empty database. Check that the reported row counts are not zero where you expected data; rotation does not guard against an empty database.

3. **Reset TOTP.** Run:

   ```sh
   npm run ops:reset-totp -- --yes
   ```

   This clears TOTP for every user and deletes all recovery codes and the pepper. The command refuses to run without `--yes`. Exit code 2 with the message "nothing was reset" is expected when no user ever enrolled TOTP, because there was no TOTP state to clear; it is not a failure.

   A Docker operator with no npm in the image runs the same script in a one-off container, with the server container stopped and the data volume mounted at `/app/data`: `docker run --rm -v astraya-data:/app/data ghcr.io/nrosier/astraya:<tag> server/ops/reset-totp.ts --yes`. The image's entrypoint is `node`, so the argument is the script path. Use the same tag as your running server container (for example, if it runs ghcr.io/nrosier/astraya:0.56.0, use that tag); do not use `:latest`, because opening the database runs migrations and a newer image would upgrade it in place. If your server uses a different volume, a bind mount, or a custom `ASTRAYA_DB_PATH`, pass the same `-v` mount and `-e ASTRAYA_DB_PATH` to this container, or it will open an empty database. Check that the reported row counts are not zero where you expected data; rotation does not guard against an empty database.

4. **Start the server with the new key.** Set `ASTRAYA_ENCRYPTION_KEY` to the replacement key and start the server.

5. **Tell users with TOTP to enrol again.** Every user who had TOTP enabled must set it up again. Until they do, TOTP is not active for them.

6. **Treat every pre-rotation backup as compromised.** Any backup or copy of the database taken before rotation still holds the old-key ciphertext and the old TOTP secrets. Destroy those copies if the leak matters, and do not restore them.

See [the environment reference](../../.env.example) for the key variables, and the rotation section of the [README](../../README.md).
