import https from 'https';
import fs from 'fs';

const HOST = "dbc-90895339-f24a.cloud.databricks.com";
const TOKEN = "dapi6ce0f67da652f3d0ca5fb8e0e79c9179";
const WAREHOUSE_ID = "31da13c58d75ea81";

function queryDatabricks(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ warehouse_id: WAREHOUSE_ID, statement: sql, wait_timeout: "30s" });
    const options = {
      hostname: HOST,
      path: '/api/2.0/sql/statements',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  let output = "";
  const tables = [
    "workspace.default.nifty_daily_prices",
    "workspace.default.nifty_summary_2024",
    "workspace.default.nifty_monthly_summary_2024"
  ];
  
  for (const table of tables) {
    output += `\n=== SCHEMA: ${table} ===\n`;
    try {
      const res = await queryDatabricks(`DESCRIBE TABLE ${table}`);
      if (res.result?.data_array) {
        res.result.data_array.forEach(row => { output += ` ${row[0]}: ${row[1]}\n`; });
      } else {
        output += JSON.stringify(res).substring(0, 300) + "\n";
      }
    } catch (e) { output += "Error: " + e.message + "\n"; }
    
    output += `\n=== SAMPLE: ${table} ===\n`;
    try {
      const res = await queryDatabricks(`SELECT * FROM ${table} LIMIT 3`);
      if (res.result?.data_array) {
        const cols = res.manifest?.schema?.columns?.map(c => c.name) || [];
        output += "Columns: " + cols.join(", ") + "\n";
        res.result.data_array.forEach(row => { output += row.join(" | ") + "\n"; });
      } else {
        output += JSON.stringify(res).substring(0, 400) + "\n";
      }
    } catch (e) { output += "Error: " + e.message + "\n"; }
  }

  fs.writeFileSync('./server/schema_output.txt', output);
  process.stdout.write(output);
}

main();
