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

app.get("/", (req, res) => {
	res.json({ status: "ok" });
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});


