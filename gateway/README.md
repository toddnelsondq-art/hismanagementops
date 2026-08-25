# DQ OPS thermostat gateway

This service runs on the Raspberry Pi, reads the Venstar Local API, and securely sends the latest reading to DQ OPS every five minutes. It does not change thermostat settings.

Add a private random token to Netlify as `DQOPS_GATEWAY_TOKEN`. Store the same value in `/etc/dqops-gateway.env` on the Pi and never commit it.

Copy `thermostat_gateway.py` to `/opt/dqops-gateway/`, copy the service file to `/etc/systemd/system/`, and create `/etc/dqops-gateway.env` from the example. Protect that file with mode `600`, then enable the service.

Use `python3 /opt/dqops-gateway/thermostat_gateway.py --once` for the first report. Use `systemctl status dqops-thermostat` and `journalctl -u dqops-thermostat -n 50` for diagnostics.

The example uses `store-02`, the current North St. Paul mapping in the user-import template. Confirm that ID in DQ OPS before the first report.
