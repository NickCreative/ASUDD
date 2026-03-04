import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = "failures.db";
let db = new Database(DB_PATH);
const MAX_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id TEXT,
    equipment_name TEXT,
    failure_type TEXT,
    timestamp DATETIME,
    end_timestamp DATETIME,
    duration_minutes INTEGER,
    description TEXT,
    service TEXT,
    location TEXT,
    linear_object TEXT,
    initiator TEXT,
    source_file TEXT,
    data_type TEXT, -- 'failure' or 'working_hours'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(equipment_id, timestamp, failure_type)
  );

  CREATE TABLE IF NOT EXISTS column_mappings (
    field_name TEXT PRIMARY KEY,
    display_name TEXT,
    mapped_keys TEXT -- Comma separated keys
  );
`);

// Add missing columns if they don't exist (for existing databases)
const tableInfo = db.prepare("PRAGMA table_info(failures)").all() as any[];
const columns = tableInfo.map(c => c.name);
const missingColumns = [
  { name: 'end_timestamp', type: 'DATETIME' },
  { name: 'service', type: 'TEXT' },
  { name: 'location', type: 'TEXT' },
  { name: 'linear_object', type: 'TEXT' },
  { name: 'initiator', type: 'TEXT' },
  { name: 'data_type', type: 'TEXT' }
];

missingColumns.forEach(col => {
  if (!columns.includes(col.name)) {
    db.exec(`ALTER TABLE failures ADD COLUMN ${col.name} ${col.type}`);
  }
});

// Seed default mappings if empty
const mappingCount = db.prepare("SELECT COUNT(*) as count FROM column_mappings").get() as { count: number };
if (mappingCount.count === 0) {
  const defaultMappings = [
    { field: 'equipment_id', display: 'ID оборудования', keys: 'ID оборудования,equipment_id,id' },
    { field: 'equipment_name', display: 'Наименование', keys: 'Наименование,equipment_name,name,Название' },
    { field: 'failure_type', display: 'Тип отказа', keys: 'Тип отказа,failure_type,type,Услуга' },
    { field: 'timestamp', display: 'Дата начала', keys: 'Дата начала,timestamp,date,time,Время начала неисправности' },
    { field: 'end_timestamp', display: 'Дата окончания', keys: 'Дата окончания,end_timestamp,Время завершения неисправности' },
    { field: 'duration', display: 'Длительность', keys: 'Длительность,duration,duration_minutes,Время на решение' },
    { field: 'description', display: 'Описание', keys: 'Описание,description,desc' },
    { field: 'location', display: 'Местоположение', keys: 'Местоположение,location,М4 "Дон" , км' },
    { field: 'linear_object', display: 'Линейный объект', keys: 'Линейный объект,linear_object' },
    { field: 'initiator', display: 'Инициатор', keys: 'Инициатор,initiator' },
    { field: 'working_hours', display: 'Часы работы (0-24)', keys: 'Часы работы,working_hours,работа,часов работы' }
  ];
  const insertMapping = db.prepare("INSERT INTO column_mappings (field_name, display_name, mapped_keys) VALUES (?, ?, ?)");
  defaultMappings.forEach(m => insertMapping.run(m.field, m.display, m.keys));
} else {
  // Add new default mappings if they don't exist
  const newMappings = [
    { field: 'end_timestamp', display: 'Дата окончания', keys: 'Дата окончания,end_timestamp,Время завершения неисправности' },
    { field: 'location', display: 'Местоположение', keys: 'Местоположение,location,М4 "Дон" , км' },
    { field: 'linear_object', display: 'Линейный объект', keys: 'Линейный объект,linear_object' },
    { field: 'initiator', display: 'Инициатор', keys: 'Инициатор,initiator' },
    { field: 'working_hours', display: 'Часы работы (0-24)', keys: 'Часы работы,working_hours,работа,часов работы' }
  ];
  const checkMapping = db.prepare("SELECT 1 FROM column_mappings WHERE field_name = ?");
  const insertMapping = db.prepare("INSERT INTO column_mappings (field_name, display_name, mapped_keys) VALUES (?, ?, ?)");
  newMappings.forEach(m => {
    if (!checkMapping.get(m.field)) {
      insertMapping.run(m.field, m.display, m.keys);
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // API: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API: Get availability calendar
  app.get("/api/availability", (req, res) => {
    try {
      const data = db.prepare(`
        SELECT 
          date(timestamp) as date,
          MAX(CASE WHEN data_type = 'failure' THEN 1 ELSE 0 END) as hasFailures,
          MAX(CASE WHEN data_type = 'working_hours' THEN 1 ELSE 0 END) as hasWorkingHours
        FROM failures
        GROUP BY date
        ORDER BY date DESC
        LIMIT 60
      `).all();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Ошибка при получении данных о доступности" });
    }
  });

  // API: Get statistics
  app.get("/api/stats", (req, res) => {
    try {
      const totalFailures = db.prepare("SELECT COUNT(*) as count FROM failures").get() as { count: number };
      const equipmentCount = db.prepare("SELECT COUNT(DISTINCT equipment_id) as count FROM failures").get() as { count: number };
      const recentFailures = db.prepare("SELECT * FROM failures ORDER BY timestamp DESC LIMIT 10").all();
      
      const failuresByMonth = db.prepare(`
        SELECT strftime('%Y-%m', timestamp) as month, COUNT(*) as count 
        FROM failures 
        GROUP BY month 
        ORDER BY month DESC 
        LIMIT 12
      `).all();

      let storageSize = 0;
      try {
        storageSize = fs.statSync(DB_PATH).size;
      } catch (e) {}

      res.json({
        totalFailures: totalFailures.count,
        equipmentCount: equipmentCount.count,
        recentFailures,
        failuresByMonth,
        storageSize,
        maxStorage: MAX_STORAGE_BYTES
      });
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Ошибка при получении статистики" });
    }
  });

  // API: Get monthly report
  app.get("/api/report/:year/:month", (req, res) => {
    const { year, month } = req.params;
    const dateStr = `${year}-${month.padStart(2, '0')}`;
    
    try {
      const rawFailures = db.prepare(`
        SELECT * FROM failures 
        WHERE strftime('%Y-%m', timestamp) = ? 
        ORDER BY equipment_id, timestamp ASC
      `).all(dateStr) as any[];

      // Aggregation logic:
      // 1. Group by equipment and day
      // 2. Filter: total downtime > 12 hours
      // 3. Start: first failure > 30 mins
      // 4. End: last failure followed by > 10m uptime
      
      const aggregated: any[] = [];
      const groups: Record<string, any[]> = {};

      rawFailures.forEach(f => {
        const date = f.timestamp.split('T')[0];
        const key = `${f.equipment_id}_${date}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
      });

      for (const key in groups) {
        const group = groups[key];
        const totalDowntime = group.reduce((sum, f) => sum + f.duration_minutes, 0);

        if (totalDowntime > 720) { // More than 12 hours of downtime
          // Find first failure > 30 mins
          const firstMajor = group.find(f => f.duration_minutes > 30) || group[0];
          
          // Find last failure followed by > 10m uptime
          let lastFailure = group[group.length - 1];
          for (let i = group.length - 1; i >= 0; i--) {
            const current = group[i];
            const currentEnd = new Date(current.end_timestamp || current.timestamp).getTime();
            
            if (i < group.length - 1) {
              const next = group[i+1];
              const nextStart = new Date(next.timestamp).getTime();
              const gap = (nextStart - currentEnd) / 60000;
              if (gap > 10) {
                lastFailure = current;
                break;
              }
            } else {
              // Last failure of the day - check if it ends before 23:49
              const dayEnd = new Date(current.timestamp);
              dayEnd.setHours(23, 59, 59, 999);
              if ((dayEnd.getTime() - currentEnd) / 60000 > 10) {
                lastFailure = current;
                break;
              }
            }
          }

          aggregated.push({
            id: firstMajor.id,
            equipment_id: firstMajor.equipment_id,
            equipment_name: firstMajor.equipment_name,
            failure_type: firstMajor.failure_type,
            timestamp: firstMajor.timestamp,
            end_timestamp: lastFailure.end_timestamp || lastFailure.timestamp,
            duration_minutes: totalDowntime,
            description: `Агрегированный отчёт (${group.length} зап.). ${firstMajor.description}`,
            location: firstMajor.location,
            linear_object: firstMajor.linear_object,
            initiator: firstMajor.initiator
          });
        }
      }

      // Re-calculate summaries based on aggregated data
      const summaryMap: Record<string, any> = {};
      aggregated.forEach(f => {
        if (!summaryMap[f.equipment_id]) {
          summaryMap[f.equipment_id] = { equipment_name: f.equipment_name, count: 0, total_duration: 0 };
        }
        summaryMap[f.equipment_id].count++;
        summaryMap[f.equipment_id].total_duration += f.duration_minutes;
      });

      const typeSummaryMap: Record<string, any> = {};
      aggregated.forEach(f => {
        if (!typeSummaryMap[f.failure_type]) {
          typeSummaryMap[f.failure_type] = { failure_type: f.failure_type, count: 0 };
        }
        typeSummaryMap[f.failure_type].count++;
      });

      res.json({ 
        failures: aggregated, 
        summary: Object.values(summaryMap).sort((a: any, b: any) => b.count - a.count),
        typeSummary: Object.values(typeSummaryMap).sort((a: any, b: any) => b.count - a.count)
      });
    } catch (error) {
      console.error("Report error:", error);
      res.status(500).json({ error: "Ошибка при формировании отчета" });
    }
  });

  // API: Get/Update Mappings
  app.get("/api/settings/mappings", (req, res) => {
    try {
      const mappings = db.prepare("SELECT * FROM column_mappings").all();
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ error: "Ошибка при получении настроек" });
    }
  });

  app.post("/api/settings/mappings", (req, res) => {
    const { mappings } = req.body;
    if (!Array.isArray(mappings)) return res.status(400).json({ error: "Invalid format" });

    const update = db.prepare("UPDATE column_mappings SET mapped_keys = ? WHERE field_name = ?");
    const transaction = db.transaction((items) => {
      for (const item of items) {
        update.run(item.mapped_keys, item.field_name);
      }
    });

    try {
      transaction(mappings);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Ошибка при сохранении настроек" });
    }
  });

  // API: Get failures (paginated)
  app.get("/api/failures", (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    try {
      let query = "SELECT * FROM failures";
      let countQuery = "SELECT COUNT(*) as count FROM failures";
      const params: any[] = [];

      if (search) {
        query += " WHERE equipment_name LIKE ? OR equipment_id LIKE ? OR description LIKE ? OR location LIKE ?";
        countQuery += " WHERE equipment_name LIKE ? OR equipment_id LIKE ? OR description LIKE ? OR location LIKE ?";
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }

      query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      const total = db.prepare(countQuery).get(...(search ? [params[0], params[1], params[2], params[3]] : [])) as { count: number };
      const failures = db.prepare(query).all(...params, limit, offset);

      res.json({ failures, total: total.count, page, limit });
    } catch (error) {
      res.status(500).json({ error: "Ошибка при получении данных" });
    }
  });

  // API: Update failure
  app.put("/api/failures/:id", (req, res) => {
    const { id } = req.params;
    const { equipment_name, equipment_id, failure_type, timestamp, end_timestamp, duration_minutes, description, location, linear_object, initiator } = req.body;

    try {
      db.prepare(`
        UPDATE failures SET 
          equipment_name = ?, equipment_id = ?, failure_type = ?, 
          timestamp = ?, end_timestamp = ?, duration_minutes = ?, 
          description = ?, location = ?, linear_object = ?, initiator = ?
        WHERE id = ?
      `).run(equipment_name, equipment_id, failure_type, timestamp, end_timestamp, duration_minutes, description, location, linear_object, initiator, id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Ошибка при обновлении записи" });
    }
  });

  // API: Delete failure
  app.delete("/api/failures/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM failures WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Ошибка при удалении записи" });
    }
  });

  // API: Backup Database
  app.get("/api/admin/backup", (req, res) => {
    try {
      res.download(path.resolve(DB_PATH), "failures_backup.db");
    } catch (error) {
      res.status(500).json({ error: "Ошибка при создании резервной копии" });
    }
  });

  // API: Restore Database
  app.post("/api/admin/restore", (req, res) => {
    const { databaseBase64 } = req.body;
    if (!databaseBase64) return res.status(400).json({ error: "Данные не получены" });

    try {
      const buffer = Buffer.from(databaseBase64, 'base64');
      db.close();
      fs.writeFileSync(DB_PATH, buffer);
      
      // Re-open database
      db = new Database(DB_PATH);
      
      res.json({ success: true, message: "База данных успешно восстановлена" });
    } catch (error) {
      console.error("Restore error:", error);
      // Try to recover connection if possible
      try { db = new Database(DB_PATH); } catch(e) {}
      res.status(500).json({ error: "Ошибка при восстановлении базы данных" });
    }
  });

  // API: Upload data
  app.post("/api/upload", (req, res) => {
    console.log(`[${new Date().toISOString()}] POST /api/upload started`);
    try {
      // Check storage limit
      const stats = fs.statSync(DB_PATH);
      if (stats.size >= MAX_STORAGE_BYTES) {
        return res.status(400).json({ error: "Превышен лимит хранилища (1 ГБ). Удалите старые данные." });
      }

      const { data, fileName } = req.body;
      console.log(`[${new Date().toISOString()}] File: ${fileName}, Rows: ${data?.length}`);
      
      if (!data || !Array.isArray(data)) {
        console.log(`[${new Date().toISOString()}] Invalid data format`);
        return res.status(400).json({ error: "Неверный формат данных или пустой файл" });
      }

      const insert = db.prepare(`
        INSERT OR IGNORE INTO failures (
          equipment_id, equipment_name, failure_type, timestamp, end_timestamp, 
          duration_minutes, description, service, location, linear_object, initiator, source_file, data_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Fetch current mappings
      const mappings = db.prepare("SELECT * FROM column_mappings").all() as any[];
      const mappingObj: Record<string, string[]> = {};
      mappings.forEach(m => {
        mappingObj[m.field_name] = m.mapped_keys.split(',').map((k: string) => k.trim());
      });

      const transaction = db.transaction((rows) => {
        let count = 0;
        for (const row of rows) {
          if (!row) continue;
          
          const getValue = (keys: string[]) => {
            if (!keys) return null;
            const foundKey = Object.keys(row).find(k => 
              keys.some(searchKey => k.trim().toLowerCase() === searchKey.toLowerCase())
            );
            return foundKey ? row[foundKey] : null;
          };

          const equipment_id = String(getValue(mappingObj['equipment_id']) || 'НЕИЗВЕСТНО');
          const equipment_name = String(getValue(mappingObj['equipment_name']) || 'Неизвестное оборудование');
          const failure_type = String(getValue(mappingObj['failure_type']) || 'Общий');
          let timestamp = getValue(mappingObj['timestamp']);
          let end_timestamp = getValue(mappingObj['end_timestamp']);
          const working_hours = getValue(mappingObj['working_hours']);
          let duration = Number(getValue(mappingObj['duration']) || 0);
          
          if (working_hours !== null && working_hours !== undefined) {
            const hours = parseFloat(String(working_hours).replace(',', '.'));
            if (!isNaN(hours)) {
              duration = Math.max(0, (24 - hours) * 60);
            }
          }

          const description = String(getValue(mappingObj['description']) || '');
          const service = String(getValue(mappingObj['service']) || '');
          const location = String(getValue(mappingObj['location']) || '');
          const linear_object = String(getValue(mappingObj['linear_object']) || '');
          const initiator = String(getValue(mappingObj['initiator']) || '');

          const parseDate = (val: any) => {
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'number') {
              const date = new Date((val - 25569) * 86400 * 1000);
              return date.toISOString();
            }
            if (val) return new Date(val).toISOString();
            return null;
          };

          const finalTimestamp = parseDate(timestamp) || new Date().toISOString();
          const finalEndTimestamp = parseDate(end_timestamp);
          const dataType = (working_hours !== null && working_hours !== undefined) ? 'working_hours' : 'failure';

          try {
            const result = insert.run(
              equipment_id,
              equipment_name,
              failure_type,
              finalTimestamp,
              finalEndTimestamp,
              duration,
              description,
              service,
              location,
              linear_object,
              initiator,
              fileName,
              dataType
            );
            if (result.changes > 0) count++;
          } catch (e) {
            console.error("Row insert error:", e);
          }
        }
        return count;
      });

      const addedCount = transaction(data);
      res.json({ success: true, addedCount });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Ошибка сервера при сохранении данных" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
