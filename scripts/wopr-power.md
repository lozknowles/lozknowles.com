# WOPR plug power

The existing hpubuntu `wopr-health.timer` invokes `/home/loz/bin/wopr-health-collect.py` every completed run plus ten seconds. The collector starts `/home/loz/.local/share/wopr-power/venv/bin/python /home/loz/bin/wopr-power-sample.py` in parallel with the three server samples. The virtual environment uses TinyTuya 1.20.0. The sampler sends a read-only Tuya v3.4 `status()` request; it never changes the relay.

Private files on hpubuntu: `/home/loz/.config/wopr-power/device.json` contains the device ID and LAN IP; `/home/loz/.config/wopr-power/local-key` contains its local key. The directory must be mode 0700 and both files mode 0600. Do not copy these into the repository, publication directory, logs, or chat.

The collector publishes only `power.wopr: {"watts": number, "observed_at": unix_seconds}` or `null` to the existing cottageserver receiver. The receiver validates the public fields and writes `/wopr-health.json`. The browser polls every ten seconds and shows unavailable if a reading is absent, invalid, or more than 35 seconds old. Zero watts is a valid reading. A five-second plug timeout produces `null` while server readings continue.

Deployment order: install the new receiver first, then the new sampler and collector, then publish the matching HTML and JS. Check the timer, several JSON updates and the rendered page on desktop/mobile. Rollback order: restore the previous collector before restoring the previous receiver, because the old receiver rejects the `power` field. Restore the previous HTML and JS together. Keep private files private during rollback.
