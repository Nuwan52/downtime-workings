const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());

// ── Dev mode ─────────────────────────────────────────────────────────────────
// Set USE_CSV = true  → reads dbo_ProdData_FULL.csv (no SQL needed)
// Set USE_CSV = false → connects to the SQL database
const USE_CSV = false;
// ─────────────────────────────────────────────────────────────────────────────

// Database config
const config = {
    server: "10.227.73.20\\SQLEXPRESS",
    database: "Automation",
    authentication: {
        type: "default",
        options: {
            userName: "NuwanSa",
            password: "nUw@2029"
        }
    },
    options: {
        encrypt: false,
        trustServerCertificate: true,
        rowCollectionOnRequestCompletion: true
    }
};

let pool = null;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function readCSVData() {
    const csvPath = path.join(__dirname, "dbo_ProdData_FULL.csv");
    const content = fs.readFileSync(csvPath, "utf8");
    const lines = content.split(/\r?\n/);
    if (!lines.length) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const values = parseCSVLine(line);
        const raw = {};
        headers.forEach((h, idx) => {
            raw[h] = values[idx] !== undefined ? values[idx].trim() : "";
        });
        // Map CSV column names → field names the dashboard expects
        rows.push({
            "No":                  raw["No"],
            "ReasonCode":          raw["ReasonCode"],
            "Reason Description":  raw["ReasonDescription"],
            "PostingDate":         raw["PostingDate"],
            "WorkShiftCode":       raw["WorkShiftCode"],
            "Work Shift Name":     raw["WorkShiftName"],
            "WorkCenterGroupCode": raw["WorkCenterGroupCode"],
            "Search_Name":         raw["SearchName"],
            "WorkCenterNo":        raw["WorkCenterNo"],
            "ItemNo":              raw["ItemNo"],
            "Item Description":    raw["ItemDescription"],
            "Segment":             raw["GlobalDimension1Code"],
            "Output Quantity":     raw["OutputQuantity"],
            "Down Time (Min)":     raw["TotDownTimeMin"],
        });
    }
    return rows;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Serve static files (including Mold names.csv, CSS, etc.)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});


app.get("/api/data", async (req, res) => {
    if (USE_CSV) {
        try {
            const data = readCSVData();
            res.json(data);
        } catch (err) {
            console.error("CSV Error:", err);
            res.status(500).json({ error: err.message });
        }
        return;
    }
    try {
        const p = await getPool();
        const result = await p.request().query(`
            SELECT
                [No]                  AS [No],
                [ReasonCode]          AS [ReasonCode],
                [ReasonDescription]   AS [Reason Description],
                [PostingDate]         AS [PostingDate],
                [WorkShiftCode]       AS [WorkShiftCode],
                [WorkShiftName]       AS [Work Shift Name],
                [WorkCenterGroupCode] AS [WorkCenterGroupCode],
                [SearchName]          AS [Search_Name],
                [WorkCenterNo]        AS [WorkCenterNo],
                [ItemNo]              AS [ItemNo],
                [ItemDescription]     AS [Item Description],
                [GlobalDimension1Code] AS [Segment],
                [OutputQuantity]      AS [Output Quantity],
                [TotDownTimeMin]      AS [Down Time (Min)]
            FROM [dbo].[ProdData]
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/schema", async (req, res) => {
    if (USE_CSV) {
        res.json([{ COLUMN_NAME: "CSV dev mode — schema not available" }]);
        return;
    }
    try {
        const p = await getPool();
        const result = await p.request().query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ProdData'
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const mode = USE_CSV ? "CSV dev mode (dbo_ProdData_FULL.csv)" : "SQL database";
    console.log(`Server running on http://localhost:${PORT}  [${mode}]`);
});
