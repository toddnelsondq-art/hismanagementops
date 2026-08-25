#!/usr/bin/env python3
"""Read a Venstar thermostat locally and report it to DQ OPS."""
import json, logging, os, signal, sys, time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
RUNNING = True

def required(name):
    value = os.environ.get(name, "").strip()
    if not value: raise RuntimeError(f"Missing required setting: {name}")
    return value

def fetch_json(url, timeout=10):
    with urlopen(Request(url, headers={"Accept":"application/json","User-Agent":"DQOPS-Gateway/1.0"}), timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

def post_report(url, token, payload, timeout=15):
    request = Request(url, data=json.dumps(payload).encode(), method="POST", headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"DQOPS-Gateway/1.0","X-DQOPS-Gateway-Token":token})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

def stop(_signum, _frame):
    global RUNNING
    RUNNING = False

def main():
    dqops_url, token = required("DQOPS_URL").rstrip("/"), required("DQOPS_GATEWAY_TOKEN")
    location_id, gateway_id = required("DQOPS_LOCATION_ID"), required("DQOPS_GATEWAY_ID")
    thermostat_ip = required("VENSTAR_IP")
    device_id = os.environ.get("VENSTAR_DEVICE_ID", "nsp-main").strip() or "nsp-main"
    name = os.environ.get("VENSTAR_NAME", "NSP Main").strip() or "NSP Main"
    model = os.environ.get("VENSTAR_MODEL", "T2050 Explorer Mini").strip()
    poll_seconds = max(60, int(os.environ.get("POLL_SECONDS", "300")))
    once = "--once" in sys.argv
    logging.info("Starting %s for %s; reporting every %s seconds", gateway_id, name, poll_seconds)
    while RUNNING:
        try:
            info = fetch_json(f"http://{thermostat_ip}/query/info")
            result = post_report(f"{dqops_url}/api/gateway/thermostat/report", token, {"gatewayId":gateway_id,"deviceId":device_id,"locationId":location_id,"name":name,"model":model,"observedAt":datetime.now(timezone.utc).isoformat(),"info":info})
            logging.info("Reported %s: %.1f°F (%s)", name, float(info.get("spacetemp", 0)), result.get("receivedAt", "received"))
        except HTTPError as error:
            logging.error("HTTP %s: %s", error.code, error.read().decode("utf-8", errors="replace")[:300])
        except (URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as error:
            logging.error("Report failed: %s", error)
        if once: return
        for _ in range(poll_seconds):
            if not RUNNING: break
            time.sleep(1)

if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop); signal.signal(signal.SIGINT, stop)
    try: main()
    except RuntimeError as error:
        logging.error("%s", error); raise SystemExit(2)
