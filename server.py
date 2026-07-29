from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import base64
import json
import mimetypes
import re
import sqlite3
import time


ROOT = Path(__file__).parent.resolve()
APP_DIR = ROOT / "app"
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "dailyops.sqlite"
MAINTENANCE_SEED_PATH = DATA_DIR / "maintenance_seed.json"
DEFAULT_LOCATION_ID = "store-01"

BASE_TASKS = [
    {"id": "sanitize", "name": "Sanitize all prep surfaces"},
    {"id": "coolers", "name": "Check cooler and freezer doors", "photo": True},
    {"id": "labels", "name": "Verify food labels and dates"},
    {"id": "floors", "name": "Sweep and mop kitchen floors", "photo": True},
    {"id": "cash", "name": "Count and record opening cash"},
]

TEMPERATURE_ITEMS = {
    "Grill Area": ["Hamburger patties", "Chicken breast", "Grilled fish", "Hot holding"],
    "Chill Area": ["Walk-in cooler", "Prep cooler", "Dairy products", "Prepared foods"],
}


def safe_name(value):
    return re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-") or "item"


def table_columns(connection, table):
    return [row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()]


def ensure_storage():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        location_columns = table_columns(connection, "locations")
        if "address" not in location_columns:
            connection.execute("ALTER TABLE locations ADD COLUMN address TEXT NOT NULL DEFAULT ''")
        if "phone" not in location_columns:
            connection.execute("ALTER TABLE locations ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
        location_count = connection.execute("SELECT COUNT(*) FROM locations").fetchone()[0]
        if location_count == 0:
            connection.executemany(
                "INSERT INTO locations(id, name) VALUES (?, ?)",
                [(f"store-{number:02d}", f"Store {number}") for number in range(1, 14)],
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS maintenance_data (
                key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        maintenance_count = connection.execute("SELECT COUNT(*) FROM maintenance_data").fetchone()[0]
        if maintenance_count == 0 and MAINTENANCE_SEED_PATH.exists():
            seed = json.loads(MAINTENANCE_SEED_PATH.read_text(encoding="utf-8"))
            for key, payload in seed.items():
                connection.execute(
                    "INSERT INTO maintenance_data(key, payload) VALUES (?, ?)",
                    (key, json.dumps(payload)),
                )

        days_exists = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='days'"
        ).fetchone()
        if not days_exists:
            create_days_table(connection)
        else:
            columns = table_columns(connection, "days")
            if "location_id" not in columns:
                connection.execute("ALTER TABLE days RENAME TO days_old")
                create_days_table(connection)
                rows = connection.execute("SELECT date, payload, updated_at FROM days_old").fetchall()
                connection.executemany(
                    """
                    INSERT OR REPLACE INTO days(location_id, date, payload, updated_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(DEFAULT_LOCATION_ID, date, payload, updated_at) for date, payload, updated_at in rows],
                )
                connection.execute("DROP TABLE days_old")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'Employee',
                location_id TEXT NOT NULL DEFAULT 'store-01',
                active INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        if "location_id" not in table_columns(connection, "users"):
            connection.execute("ALTER TABLE users ADD COLUMN location_id TEXT NOT NULL DEFAULT 'store-01'")
        if "location_ids" not in table_columns(connection, "users"):
            connection.execute("ALTER TABLE users ADD COLUMN location_ids TEXT NOT NULL DEFAULT '[\"store-01\"]'")
            rows = connection.execute("SELECT id, location_id FROM users").fetchall()
            for user_id, location_id in rows:
                connection.execute(
                    "UPDATE users SET location_ids = ? WHERE id = ?",
                    (json.dumps([location_id or DEFAULT_LOCATION_ID]), user_id),
                )

        user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0:
            connection.execute(
                "INSERT INTO users(id, name, role, location_id) VALUES (?, ?, ?, ?)",
                ("alex-rivera", "Alex Rivera", "Manager", DEFAULT_LOCATION_ID),
            )


def create_days_table(connection):
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS days (
            location_id TEXT NOT NULL,
            date TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(location_id, date)
        )
        """
    )


def new_day(location_id):
    return {
        "locationId": location_id,
        "tasks": [{**task, "done": False} for task in BASE_TASKS],
        "temps": [],
        "complete": False,
    }


def read_day(location_id, date):
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT payload FROM days WHERE location_id = ? AND date = ?",
            (location_id, date),
        ).fetchone()
        if row:
            day = json.loads(row[0])
            day["locationId"] = location_id
            return day

        day = new_day(location_id)
        write_day(location_id, date, day)
        return day


def write_day(location_id, date, day):
    day["locationId"] = location_id
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO days(location_id, date, payload, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(location_id, date) DO UPDATE SET
                payload = excluded.payload,
                updated_at = CURRENT_TIMESTAMP
            """,
            (location_id, date, json.dumps(day)),
        )


def read_history(location_id=None):
    with sqlite3.connect(DB_PATH) as connection:
        if location_id:
            rows = connection.execute(
                "SELECT location_id, date, payload FROM days WHERE location_id = ? ORDER BY date DESC",
                (location_id,),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT location_id, date, payload FROM days ORDER BY date DESC, location_id"
            ).fetchall()
    return [
        {"locationId": location, "date": date, "day": json.loads(payload)}
        for location, date, payload in rows
        if json.loads(payload).get("complete")
    ]


def read_locations():
    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute(
            "SELECT id, name, address, phone FROM locations WHERE active = 1 ORDER BY id"
        ).fetchall()
    return [{"id": row[0], "name": row[1], "address": row[2] or "", "phone": row[3] or ""} for row in rows]


def write_location(location):
    location_id = location["id"]
    name = location["name"].strip()
    with sqlite3.connect(DB_PATH) as connection:
        existing = connection.execute(
            "SELECT address, phone FROM locations WHERE id = ?", (location_id,)
        ).fetchone() or ("", "")
        address = str(existing[0] if "address" not in location else (location.get("address") or "")).strip()
        phone = str(existing[1] if "phone" not in location else (location.get("phone") or "")).strip()
        connection.execute(
            """
            UPDATE locations
            SET name = ?, address = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (name, address, phone, location_id),
        )
    return {"id": location_id, "name": name, "address": address, "phone": phone}


def read_users():
    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute(
            "SELECT id, name, role, location_id, location_ids FROM users WHERE active = 1 ORDER BY name"
        ).fetchall()
    users = []
    for row in rows:
        try:
            location_ids = json.loads(row[4] or "[]")
        except json.JSONDecodeError:
            location_ids = []
        if not location_ids:
            location_ids = [row[3] or DEFAULT_LOCATION_ID]
        users.append({"id": row[0], "name": row[1], "role": row[2], "locationId": row[3], "locationIds": location_ids})
    return users


def write_user(user):
    user_id = user.get("id") or safe_name(user["name"]).lower()
    location_ids = user.get("locationIds") or [user.get("locationId", DEFAULT_LOCATION_ID)]
    location_ids = [location_id for location_id in location_ids if location_id] or [DEFAULT_LOCATION_ID]
    primary_location_id = user.get("locationId") or location_ids[0]
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO users(id, name, role, location_id, location_ids, active, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                role = excluded.role,
                location_id = excluded.location_id,
                location_ids = excluded.location_ids,
                active = 1,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                user_id,
                user["name"].strip(),
                user.get("role", "Employee"),
                primary_location_id,
                json.dumps(location_ids),
            ),
        )
    return {
        "id": user_id,
        "name": user["name"].strip(),
        "role": user.get("role", "Employee"),
        "locationId": primary_location_id,
        "locationIds": location_ids,
    }


def read_overdue(date):
    locations = read_locations()
    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute(
            "SELECT location_id, payload FROM days WHERE date = ?",
            (date,),
        ).fetchall()
    completed = {location for location, payload in rows if json.loads(payload).get("complete")}
    started = {location for location, _ in rows}
    return [
        {
            "locationId": location["id"],
            "locationName": location["name"],
            "status": "not started" if location["id"] not in started else "incomplete",
        }
        for location in locations
        if location["id"] not in completed
    ]


def read_maintenance_key(key, default=None):
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute("SELECT payload FROM maintenance_data WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else (default if default is not None else [])


def write_maintenance_key(key, payload):
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO maintenance_data(key, payload, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                payload = excluded.payload,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, json.dumps(payload)),
        )


def maintenance_lists():
    rows = read_maintenance_key("lists", [])
    keys = {
        "priorities": "Priority",
        "statuses": "Status",
        "categories": "Category",
        "equipmentTypes": "Equipment Type",
        "pmFrequencies": "PM Frequency",
    }
    result = {}
    for output_key, source_key in keys.items():
        seen = []
        for row in rows:
            value = row.get(source_key)
            if value and value not in seen:
                seen.append(value)
        result[output_key] = seen
    return result


def maintenance_state(location_id=None):
    work_orders = read_maintenance_key("workOrders", [])
    equipment = read_maintenance_key("equipment", [])
    pm_schedule = read_maintenance_key("pmSchedule", [])
    vendors = read_maintenance_key("vendors", [])
    locations = read_maintenance_key("locations", [])
    if location_id and location_id != "all":
        work_orders = [row for row in work_orders if str(row.get("Location ID")) == str(location_id)]
        equipment = [row for row in equipment if str(row.get("Location ID")) == str(location_id)]
        pm_schedule = [row for row in pm_schedule if str(row.get("Location ID")) == str(location_id)]
    return {
        "locations": locations,
        "equipment": equipment,
        "workOrders": work_orders,
        "pmSchedule": pm_schedule,
        "vendors": vendors,
        "lists": maintenance_lists(),
    }


def next_work_order_id(work_orders):
    highest = 0
    for row in work_orders:
        value = str(row.get("Work Order ID") or "")
        if value.startswith("WO-"):
            try:
                highest = max(highest, int(value.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"WO-{highest + 1:04d}"


def write_work_order(payload):
    work_orders = read_maintenance_key("workOrders", [])
    equipment = read_maintenance_key("equipment", [])
    selected_equipment = next((row for row in equipment if row.get("Equipment ID") == payload.get("equipmentId")), {})
    location_name = payload.get("locationName") or selected_equipment.get("Location Name")
    today = time.strftime("%Y-%m-%d")
    work_order = {
        "Work Order ID": next_work_order_id(work_orders),
        "Date Submitted": today,
        "Location ID": payload.get("locationId"),
        "Location Name": location_name,
        "Requested By": payload.get("requestedBy", "App User"),
        "Category": payload.get("category"),
        "Equipment ID": payload.get("equipmentId"),
        "Equipment Name": payload.get("equipmentName") or selected_equipment.get("Equipment Name"),
        "Priority": payload.get("priority", "Medium"),
        "Status": payload.get("status", "New"),
        "Assigned To": payload.get("assignedTo"),
        "Vendor ID": payload.get("vendorId"),
        "Issue Description": payload.get("issueDescription"),
        "Photo Link": payload.get("photoLink"),
        "Manual Link": payload.get("manualLink"),
        "Target Date": payload.get("targetDate"),
        "Date Completed": None,
        "Days Open": 0,
        "Labor Hours": None,
        "Parts Cost": None,
        "Vendor Cost": None,
        "Total Cost": 0,
        "Resolution Notes": None,
        "Invoice Link": None,
        "Last Updated": today,
    }
    work_orders.append(work_order)
    write_maintenance_key("workOrders", work_orders)
    return work_order


def update_work_order(payload):
    work_orders = read_maintenance_key("workOrders", [])
    work_order_id = payload.get("workOrderId")
    today = time.strftime("%Y-%m-%d")
    for row in work_orders:
        if row.get("Work Order ID") == work_order_id:
            mapping = {
                "status": "Status",
                "assignedTo": "Assigned To",
                "vendorId": "Vendor ID",
                "targetDate": "Target Date",
                "dateCompleted": "Date Completed",
                "laborHours": "Labor Hours",
                "partsCost": "Parts Cost",
                "vendorCost": "Vendor Cost",
                "resolutionNotes": "Resolution Notes",
                "invoiceLink": "Invoice Link",
                "photoLink": "Photo Link",
                "manualLink": "Manual Link",
                "issueDescription": "Issue Description",
                "priority": "Priority",
            }
            for source, destination in mapping.items():
                if source in payload and payload[source] not in (None, ""):
                    row[destination] = payload[source]
            parts = float(row.get("Parts Cost") or 0)
            vendor = float(row.get("Vendor Cost") or 0)
            row["Total Cost"] = parts + vendor
            row["Last Updated"] = today
            write_maintenance_key("workOrders", work_orders)
            return row
    raise ValueError("Work order not found")


def next_prefixed_id(rows, key, prefix):
    highest = 0
    for row in rows:
        value = str(row.get(key) or "")
        if value.startswith(f"{prefix}-"):
            try:
                highest = max(highest, int(value.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"{prefix}-{highest + 1:04d}"


def write_equipment(payload):
    equipment = read_maintenance_key("equipment", [])
    item = {
        "Equipment ID": next_prefixed_id(equipment, "Equipment ID", "EQ"),
        "Location ID": payload.get("locationId"),
        "Location Name": payload.get("locationName"),
        "Equipment Name": payload.get("equipmentName"),
        "Equipment Type": payload.get("equipmentType"),
        "Manufacturer": payload.get("manufacturer"),
        "Model": payload.get("model"),
        "Serial Number": payload.get("serialNumber"),
        "Install/Purchase Date": payload.get("installDate"),
        "Warranty Expiration": payload.get("warrantyExpiration"),
        "Vendor ID": payload.get("vendorId"),
        "Manual Link": payload.get("manualLink"),
        "QR Code ID": payload.get("qrCodeId"),
        "Active": "Yes",
        "Notes": payload.get("notes"),
    }
    equipment.append(item)
    write_maintenance_key("equipment", equipment)
    return item


def write_pm_task(payload):
    pm_schedule = read_maintenance_key("pmSchedule", [])
    task = {
        "PM ID": next_prefixed_id(pm_schedule, "PM ID", "PM"),
        "Location ID": payload.get("locationId"),
        "Location Name": payload.get("locationName"),
        "Equipment ID": payload.get("equipmentId"),
        "Equipment Name": payload.get("equipmentName"),
        "Task": payload.get("task"),
        "Frequency": payload.get("frequency"),
        "Last Completed": payload.get("lastCompleted"),
        "Next Due": payload.get("nextDue"),
        "Assigned To": payload.get("assignedTo"),
        "Status": payload.get("status", "Due"),
        "Instructions / Checklist": payload.get("instructions"),
        "Manual Link": payload.get("manualLink"),
        "Photo Link": payload.get("photoLink"),
        "Auto Create Work Order?": payload.get("autoCreateWorkOrder", "Yes"),
        "Notes": payload.get("notes"),
    }
    pm_schedule.append(task)
    write_maintenance_key("pmSchedule", pm_schedule)
    return task


def save_maintenance_attachment(payload):
    header, encoded = payload["dataUrl"].split(",", 1)
    extension = mimetypes.guess_extension(header.split(";")[0].replace("data:", "")) or ".bin"
    filename = f"maintenance-{safe_name(payload.get('kind', 'file'))}-{safe_name(payload.get('name', 'attachment'))}-{int(time.time())}{extension}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(base64.b64decode(encoded))
    return f"/uploads/{filename}"


class DailyOpsHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        if parsed.path.startswith("/uploads/"):
            return str(DATA_DIR / parsed.path.lstrip("/"))
        if parsed.path == "/":
            return str(APP_DIR / "index.html")
        return str(APP_DIR / parsed.path.lstrip("/"))

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/api/state":
            date = query.get("date", [""])[0]
            location_id = query.get("locationId", [DEFAULT_LOCATION_ID])[0]
            history_scope = query.get("historyScope", ["location"])[0]
            if not date:
                self.send_json({"error": "Missing date"}, 400)
                return

            self.send_json(
                {
                    "day": read_day(location_id, date),
                    "history": read_history(None if history_scope == "all" else location_id),
                    "temperatureItems": TEMPERATURE_ITEMS,
                    "users": read_users(),
                    "locations": read_locations(),
                    "overdue": read_overdue(date),
                }
            )
            return

        if parsed.path == "/api/users":
            self.send_json({"users": read_users()})
            return

        if parsed.path == "/api/locations":
            self.send_json({"locations": read_locations()})
            return

        if parsed.path == "/api/overdue":
            date = query.get("date", [""])[0]
            if not date:
                self.send_json({"error": "Missing date"}, 400)
                return
            self.send_json({"overdue": read_overdue(date)})
            return

        if parsed.path == "/api/maintenance/state":
            location_id = query.get("locationId", ["all"])[0]
            self.send_json(maintenance_state(location_id))
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/day":
            payload = self.read_json()
            location_id = payload.get("locationId", DEFAULT_LOCATION_ID)
            write_day(location_id, payload["date"], payload["day"])
            self.send_json({"ok": True, "history": read_history(location_id), "overdue": read_overdue(payload["date"])})
            return

        if parsed.path == "/api/photo":
            payload = self.read_json()
            header, encoded = payload["dataUrl"].split(",", 1)
            extension = mimetypes.guess_extension(header.split(";")[0].replace("data:", "")) or ".jpg"
            filename = f"{safe_name(payload.get('locationId', DEFAULT_LOCATION_ID))}-{safe_name(payload['date'])}-{safe_name(payload['taskId'])}-{int(time.time())}{extension}"
            file_path = UPLOAD_DIR / filename
            file_path.write_bytes(base64.b64decode(encoded))
            self.send_json({"url": f"/uploads/{filename}"})
            return

        if parsed.path == "/api/user":
            payload = self.read_json()
            if not payload.get("name", "").strip():
                self.send_json({"error": "Missing name"}, 400)
                return
            user = write_user(payload)
            self.send_json({"user": user, "users": read_users()})
            return

        if parsed.path == "/api/location":
            payload = self.read_json()
            if not payload.get("id") or not payload.get("name", "").strip():
                self.send_json({"error": "Missing location id or name"}, 400)
                return
            location = write_location(payload)
            self.send_json({"location": location, "locations": read_locations()})
            return

        if parsed.path == "/api/maintenance/work-order":
            payload = self.read_json()
            if not payload.get("locationId") or not payload.get("issueDescription"):
                self.send_json({"error": "Missing location or issue description"}, 400)
                return
            work_order = write_work_order(payload)
            self.send_json({"workOrder": work_order, "state": maintenance_state(payload.get("locationId"))})
            return

        if parsed.path == "/api/maintenance/work-order/update":
            payload = self.read_json()
            if not payload.get("workOrderId"):
                self.send_json({"error": "Missing work order id"}, 400)
                return
            try:
                work_order = update_work_order(payload)
            except ValueError:
                self.send_json({"error": "Work order not found"}, 404)
                return
            self.send_json({"workOrder": work_order, "state": maintenance_state(payload.get("locationId", "all"))})
            return

        if parsed.path == "/api/maintenance/equipment":
            payload = self.read_json()
            if not payload.get("locationId") or not payload.get("equipmentName"):
                self.send_json({"error": "Missing location or equipment name"}, 400)
                return
            equipment = write_equipment(payload)
            self.send_json({"equipment": equipment, "state": maintenance_state(payload.get("locationId"))})
            return

        if parsed.path == "/api/maintenance/pm":
            payload = self.read_json()
            if not payload.get("locationId") or not payload.get("task"):
                self.send_json({"error": "Missing location or PM task"}, 400)
                return
            pm_task = write_pm_task(payload)
            self.send_json({"pmTask": pm_task, "state": maintenance_state(payload.get("locationId"))})
            return

        if parsed.path == "/api/maintenance/attachment":
            payload = self.read_json()
            if not payload.get("dataUrl"):
                self.send_json({"error": "Missing attachment"}, 400)
                return
            self.send_json({"url": save_maintenance_attachment(payload)})
            return

        self.send_json({"error": "Not found"}, 404)


if __name__ == "__main__":
    ensure_storage()
    host = "0.0.0.0"
    port = 8765
    print(f"DailyOps backend running at http://127.0.0.1:{port}")
    print(f"Database: {DB_PATH}")
    ThreadingHTTPServer((host, port), DailyOpsHandler).serve_forever()
