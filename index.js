const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const API_KEY = "tPmAT5Ab3j7F9";
const ESP_TOKEN = "ESP_ALLOW_123";
const PORT = process.env.PORT || 3000;

const dbFile = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
	db.run(
		"CREATE TABLE IF NOT EXISTS data (id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
	);
});

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "data")));

function getInput(req) {
	return {
		api_key: req.body.api_key || req.query.api_key || "",
		esp_token: req.body.esp_token || req.query.esp_token || "",
		weight: req.body.weight || req.query.weight || "",
	};
}

function authorize(apiKey, espToken) {
	if (apiKey) {
		return apiKey === API_KEY;
	}
	return espToken === ESP_TOKEN;
}

app.all("/api/weight", (req, res) => {
	if (req.method !== "POST" && req.method !== "GET") {
		return res.status(405).json({ status: "error", message: "method not allowed" });
	}

	const { api_key, esp_token, weight } = getInput(req);

	if (!authorize(api_key, esp_token)) {
		return res.status(401).json({ status: "error", message: "unauthorized" });
	}

	const weightNum = parseFloat(weight);
	if (!Number.isFinite(weightNum) || weightNum < 0) {
		return res.status(400).json({ status: "error", message: "invalid weight" });
	}

	const stmt = db.prepare("INSERT INTO data (weight) VALUES (?)");
	stmt.run(weightNum, function (err) {
		if (err) {
			return res.status(500).json({ status: "error", message: "db insert failed" });
		}
		return res.json({ status: "success", weight: weightNum, id: this.lastID });
	});
	stmt.finalize();
});

app.get("/api/data", (req, res) => {
	const { api_key, esp_token } = getInput(req);
	if (!authorize(api_key, esp_token)) {
		return res.status(401).json({ status: "error", message: "unauthorized" });
	}

	db.all(
		"SELECT id, weight, created_at FROM data ORDER BY id DESC LIMIT 100",
		[],
		(err, rows) => {
			if (err) {
				return res.status(500).json({ status: "error", message: "db read failed" });
			}
			return res.json({ status: "success", count: rows.length, data: rows });
		}
	);
});

app.get("/dashboard", (req, res) => {
	const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>ESP32 Weights</title>
		<style>
			:root { color-scheme: light; }
			body { font-family: "Trebuchet MS", Verdana, sans-serif; background: #f6f4ef; color: #1b1b1b; margin: 0; padding: 24px; }
			header { display: flex; align-items: center; gap: 12px; }
			h1 { font-size: 28px; margin: 0; }
			.status { font-size: 14px; color: #5a5a5a; }
			.logo { height: 40px; width: auto; }
			.card { background: #ffffff; border: 1px solid #e2e2e2; border-radius: 10px; padding: 16px; margin-top: 16px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
			table { width: 100%; border-collapse: collapse; }
			th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #eee; }
			th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
			tbody tr:hover { background: #faf7f1; }
			.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f1e6d8; font-size: 12px; }
			.footer { margin-top: 12px; font-size: 12px; color: #777; }
			button { border: 0; background: #1f6feb; color: #fff; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
			button:hover { background: #1a5dcc; }
		</style>
	</head>
	<body>
		<header>
			<img src="/images/eco-growth.png" alt="EGOR" class="logo" />
			<h1>ESP32 Weight Log</h1>
			<span class="pill">live</span>
			<span class="status" id="status">loading...</span>
		</header>
		<div class="card">
			<button id="refresh">Refresh</button>
			<table>
				<thead>
					<tr>
						<th>ID</th>
						<th>Weight</th>
						<th>Timestamp (UTC)</th>
					</tr>
				</thead>
				<tbody id="rows"></tbody>
			</table>
			<div class="footer">Auto-refresh every 5 seconds.</div>
		</div>
		<script>
			const apiKey = "${API_KEY}";
			const statusEl = document.getElementById("status");
			const rowsEl = document.getElementById("rows");
			const refreshBtn = document.getElementById("refresh");

			function setStatus(text) {
				statusEl.textContent = text;
			}

			function renderRows(items) {
				rowsEl.innerHTML = "";
				for (const item of items) {
					const iso = String(item.created_at || "").replace(" ", "T") + "Z";
					const dt = new Date(iso);
					const mt = new Intl.DateTimeFormat("en-US", {
						timeZone: "America/Denver",
						year: "numeric",
						month: "2-digit",
						day: "2-digit",
						hour: "2-digit",
						minute: "2-digit",
						second: "2-digit",
						hour12: false,
					}).format(dt);
					const tr = document.createElement("tr");
					tr.innerHTML =
						"<td>" + item.id + "</td>" +
						"<td>" + Number(item.weight).toFixed(2) + "</td>" +
						"<td>" + mt + "</td>";
					rowsEl.appendChild(tr);
				}
			}

			async function loadData() {
				setStatus("loading...");
				try {
					const resp = await fetch("/api/data?api_key=" + encodeURIComponent(apiKey));
					const data = await resp.json();
					if (data.status !== "success") {
						setStatus("error: " + (data.message || "unknown"));
						return;
					}
					renderRows(data.data || []);
					setStatus("loaded " + data.count + " rows");
				} catch (err) {
					setStatus("error: failed to load");
				}
			}

			refreshBtn.addEventListener("click", loadData);
			loadData();
			setInterval(loadData, 5000);
		</script>
	</body>
</html>`;

	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.send(html);
});

app.get("/", (req, res) => {
	res.json({ status: "ok" });
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});



