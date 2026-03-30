/**
 * AI Query Service
 * Translates natural language to SQL using the real Nifty 50 schema.
 *
 * Tables:
 *   workspace.default.nifty_summary_2024        -> avg_open, avg_close, avg_day_range, open_above_prev_close_200_count, close_above_prev_close_500_count, close_below_prev_close_500_count
 *   workspace.default.nifty_monthly_summary_2024 -> index_name, year_month, avg_open, avg_close, avg_day_range, open_above_prev_close_200_count, close_above_prev_close_500_count, close_below_prev_close_500_count
 *   workspace.default.nifty_daily_prices         -> index_name, trade_date, open, high, low, close, instrument_type
 */

import { executeQuery } from './databricks';

const TABLES = {
  summary:        "workspace.default.nifty_summary_2024",
  monthly:        "workspace.default.nifty_monthly_summary_2024",
  daily:          "workspace.default.nifty_daily_prices",
};

const MONTH_MAP = {
  jan: '2024-01', january: '2024-01',
  feb: '2024-02', february: '2024-02', febrary: '2024-02',
  mar: '2024-03', march: '2024-03',
  apr: '2024-04', april: '2024-04',
  may: '2024-05',
  jun: '2024-06', june: '2024-06',
  jul: '2024-07', july: '2024-07',
  aug: '2024-08', august: '2024-08',
  sep: '2024-09', september: '2024-09',
  oct: '2024-10', october: '2024-10',
  nov: '2024-11', november: '2024-11',
  dec: '2024-12', december: '2024-12',
};

function detectMonth(query) {
  for (const [key, val] of Object.entries(MONTH_MAP)) {
    if (query.includes(key)) return val;
  }
  return null;
}

export const translateToSql = (prompt) => {
  const q = prompt.toLowerCase();
  const month = detectMonth(q);

  // Monthly queries
  if (month) {
    if (q.includes("open"))  return `SELECT year_month, avg_open FROM ${TABLES.monthly} WHERE year_month = '${month}'`;
    if (q.includes("close")) return `SELECT year_month, avg_close FROM ${TABLES.monthly} WHERE year_month = '${month}'`;
    if (q.includes("range")) return `SELECT year_month, avg_day_range FROM ${TABLES.monthly} WHERE year_month = '${month}'`;
    return `SELECT * FROM ${TABLES.monthly} WHERE year_month = '${month}'`;
  }

  // Annual summary queries
  if (q.includes("average open") || q.includes("avg open"))   return `SELECT avg_open FROM ${TABLES.summary}`;
  if (q.includes("average close") || q.includes("avg close")) return `SELECT avg_close FROM ${TABLES.summary}`;
  if (q.includes("day range") || q.includes("range"))         return `SELECT avg_day_range FROM ${TABLES.summary}`;
  if (q.includes("threshold") || q.includes("count"))         return `SELECT open_above_prev_close_200_count, close_above_prev_close_500_count, close_below_prev_close_500_count FROM ${TABLES.summary}`;

  // Daily queries
  if (q.includes("highest") && q.includes("close"))  return `SELECT trade_date, close FROM ${TABLES.daily} ORDER BY close DESC LIMIT 1`;
  if (q.includes("lowest") && q.includes("close"))   return `SELECT trade_date, close FROM ${TABLES.daily} ORDER BY close ASC LIMIT 1`;
  if (q.includes("highest") && q.includes("open"))   return `SELECT trade_date, open FROM ${TABLES.daily} ORDER BY open DESC LIMIT 1`;
  if (q.includes("best day") || q.includes("top day")) return `SELECT trade_date, open, close, (close - open) as gain FROM ${TABLES.daily} ORDER BY gain DESC LIMIT 1`;
  if (q.includes("worst day"))                        return `SELECT trade_date, open, close, (close - open) as gain FROM ${TABLES.daily} ORDER BY gain ASC LIMIT 1`;

  // Monthly leaderboard
  if (q.includes("best month"))  return `SELECT year_month, avg_close FROM ${TABLES.monthly} ORDER BY avg_close DESC LIMIT 1`;
  if (q.includes("worst month")) return `SELECT year_month, avg_close FROM ${TABLES.monthly} ORDER BY avg_close ASC LIMIT 1`;

  // Fallback
  return `SELECT * FROM ${TABLES.summary}`;
};

export const handleUserQuery = async (prompt) => {
  try {
    const sql = translateToSql(prompt);
    const results = await executeQuery(sql);

    if (results && results.length > 0) {
      const row = results[0];
      const lines = Object.entries(row)
        .filter(([, v]) => v !== null && v !== undefined && !isNaN(Number(v)) || typeof v === 'string')
        .map(([k, v]) => {
          const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const value = isNaN(Number(v))
            ? v
            : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
          return `${label}: ${value}`;
        });

      return {
        text: `Here are the results from your Databricks database:\n${lines.join('\n')}`,
        success: true
      };
    }

    return { text: "No data found for that query in your Databricks database.", success: false };
  } catch (error) {
    console.error("AI Query Error:", error);
    return { text: `Error querying Databricks: ${error.message}`, success: false };
  }
};
