/**
 * Databricks SQL Integration Service
 * Connects to Databricks via the local CORS Proxy on port 3000.
 */

const DATABRICKS_CONFIG = {
  host: "dbc-90895339-f24a.cloud.databricks.com",
  token: "dapi6ce0f67da652f3d0ca5fb8e0e79c9179",
  warehouseId: "31da13c58d75ea81",
  tables: {
    summary:        "workspace.default.nifty_summary_2024",
    monthlySummary: "workspace.default.nifty_monthly_summary_2024",
    dailyPrices:    "workspace.default.nifty_daily_prices",
  }
};

import { CONFIG } from '../config';

/**
 * Execute any SQL statement via the local proxy, returning named-column row objects.
 */
export const executeQuery = async (sqlString) => {
  try {
    const response = await fetch(CONFIG.ENDPOINTS.DATAPROX, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: DATABRICKS_CONFIG.host,
        token: DATABRICKS_CONFIG.token,
        warehouse_id: DATABRICKS_CONFIG.warehouseId,
        statement: sqlString
      })
    });

    if (!response.ok) throw new Error("Proxy Error: " + response.statusText);

    const resultJson = await response.json();

    if (resultJson.result?.data_array && resultJson.manifest?.schema?.columns) {
      const cols = resultJson.manifest.schema.columns.map(c => c.name);
      return resultJson.result.data_array.map(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    }

    if (resultJson.error_code) {
      throw new Error(`Databricks Error ${resultJson.error_code}: ${resultJson.message}`);
    }

    return [];
  } catch (error) {
    console.error("Databricks Execution Error:", error);
    throw error;
  }
};

export const TABLES = DATABRICKS_CONFIG.tables;
