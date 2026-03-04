import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Calendar,
  ChevronRight,
  BarChart3,
  Search,
  Download,
  Settings as SettingsIcon,
  Save,
  Plus,
  Trash2,
  Table as TableIcon,
  Pencil
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Stats, Failure, MonthlyReport, ColumnMapping, AvailabilityData } from './types';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'reports' | 'settings' | 'data' | 'availability'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; count: number; error?: string } | null>(null);
  
  // Availability state
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData[]>([]);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);

  // Mappings state
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [isSavingMappings, setIsSavingMappings] = useState(false);
  const [activeMappingField, setActiveMappingField] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Reports state
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([
    'Начало', 'Окончание', 'Оборудование', 'ID', 'Тип отказа', 'Длительность (мин)', 'Описание'
  ]);

  const EXPORT_COLUMNS = [
    'Начало', 'Окончание', 'Оборудование', 'ID', 'Тип отказа', 
    'Местоположение', 'Линейный объект', 'Инициатор', 'Длительность (мин)', 'Описание'
  ];

  // Data Management state
  const [failures, setFailures] = useState<Failure[]>([]);
  const [totalFailures, setTotalFailures] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [editingFailure, setEditingFailure] = useState<Failure | null>(null);
  const [isSavingFailure, setIsSavingFailure] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/mappings');
      const data = await res.json();
      setMappings(data);
    } catch (error) {
      console.error('Failed to fetch mappings:', error);
    }
  }, []);

  const fetchAvailability = useCallback(async () => {
    setIsAvailabilityLoading(true);
    try {
      const res = await fetch('/api/availability');
      const data = await res.json();
      setAvailabilityData(data);
    } catch (error) {
      console.error('Failed to fetch availability:', error);
    } finally {
      setIsAvailabilityLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchMappings();
    fetchAvailability();
  }, [fetchStats, fetchMappings, fetchAvailability]);

  const saveMappings = async () => {
    setIsSavingMappings(true);
    try {
      const res = await fetch('/api/settings/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      if (res.ok) {
        alert('Настройки сохранены');
      }
    } catch (error) {
      console.error('Failed to save mappings:', error);
    } finally {
      setIsSavingMappings(false);
    }
  };

  const addHeaderToMapping = (header: string) => {
    if (!activeMappingField) {
      alert('Сначала выберите поле в настройках или ниже, куда добавить этот заголовок');
      return;
    }
    
    setMappings(prev => prev.map(m => {
      if (m.field_name === activeMappingField) {
        const keys = m.mapped_keys.split(',').map(k => k.trim()).filter(Boolean);
        if (!keys.includes(header)) {
          return { ...m, mapped_keys: [...keys, header].join(', ') };
        }
      }
      return m;
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    setDetectedHeaders([]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        if (!dataBuffer) throw new Error('Не удалось прочитать файл');

        const wb = XLSX.read(dataBuffer, { 
          type: 'array',
          cellDates: true,
          cellNF: false,
          cellText: false
        });

        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Get headers
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headers: string[] = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
          if (cell && cell.t) headers.push(XLSX.utils.format_cell(cell));
        }
        setDetectedHeaders(headers);

        const rawData = XLSX.utils.sheet_to_json(ws, { defval: null });
        
        if (rawData.length === 0) {
          throw new Error('Файл пуст или имеет неверный формат');
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: rawData, fileName: file.name }),
        });

        const responseText = await res.text();
        let result;
        
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          throw new Error(`Сервер вернул некорректный ответ (${res.status}). Попробуйте еще раз через 5-10 секунд.`);
        }
        
        if (!res.ok) {
          throw new Error(result.error || `Ошибка сервера: ${res.status}`);
        }

        setUploadResult({ success: true, count: result.addedCount });
        fetchStats();
        fetchAvailability();
      } catch (error) {
        console.error('Upload failed:', error);
        setUploadResult({ 
          success: false, 
          count: 0, 
          error: (error as Error).message 
        });
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const fetchFailures = useCallback(async (page = 1, search = '') => {
    setIsDataLoading(true);
    try {
      const res = await fetch(`/api/failures?page=${page}&limit=50&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setFailures(data.failures);
      setTotalFailures(data.total);
    } catch (error) {
      console.error('Failed to fetch failures:', error);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'data') {
      fetchFailures(currentPage, searchQuery);
    }
  }, [activeTab, currentPage, searchQuery, fetchFailures]);

  const handleDeleteFailure = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту запись?')) return;
    try {
      const res = await fetch(`/api/failures/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchFailures(currentPage, searchQuery);
        fetchStats();
      }
    } catch (error) {
      console.error('Failed to delete failure:', error);
    }
  };

  const handleUpdateFailure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFailure) return;
    setIsSavingFailure(true);
    try {
      const res = await fetch(`/api/failures/${editingFailure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingFailure),
      });
      if (res.ok) {
        setEditingFailure(null);
        fetchFailures(currentPage, searchQuery);
      }
    } catch (error) {
      console.error('Failed to update failure:', error);
    } finally {
      setIsSavingFailure(false);
    }
  };

  const handleBackup = () => {
    window.open('/api/admin/backup', '_blank');
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('ВНИМАНИЕ: Это полностью заменит текущую базу данных! Все текущие данные будут удалены. Продолжить?')) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = (evt.target?.result as string).split(',')[1];
        const res = await fetch('/api/admin/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ databaseBase64: base64 }),
        });
        if (res.ok) {
          alert('База данных успешно восстановлена. Страница будет перезагружена.');
          window.location.reload();
        } else {
          const err = await res.json();
          alert('Ошибка при восстановлении: ' + (err.error || 'Неизвестная ошибка'));
        }
      } catch (error) {
        alert('Ошибка при чтении файла');
      } finally {
        setIsRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/report/${reportYear}/${reportMonth}`);
      const data = await res.json();
      setMonthlyReport(data);
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setReportLoading(false);
    }
  };

  const exportToExcel = () => {
    if (!monthlyReport) return;
    
    const data = monthlyReport.failures.map(f => {
      const row: any = {};
      if (selectedExportColumns.includes('Начало')) row['Начало'] = new Date(f.timestamp).toLocaleString('ru-RU');
      if (selectedExportColumns.includes('Окончание')) row['Окончание'] = f.end_timestamp ? new Date(f.end_timestamp).toLocaleString('ru-RU') : '-';
      if (selectedExportColumns.includes('Оборудование')) row['Оборудование'] = f.equipment_name;
      if (selectedExportColumns.includes('ID')) row['ID'] = f.equipment_id;
      if (selectedExportColumns.includes('Тип отказа')) row['Тип отказа'] = f.failure_type;
      if (selectedExportColumns.includes('Местоположение')) row['Местоположение'] = f.location || '';
      if (selectedExportColumns.includes('Линейный объект')) row['Линейный объект'] = f.linear_object || '';
      if (selectedExportColumns.includes('Инициатор')) row['Инициатор'] = f.initiator || '';
      if (selectedExportColumns.includes('Длительность (мин)')) row['Длительность (мин)'] = f.duration_minutes;
      if (selectedExportColumns.includes('Описание')) row['Описание'] = f.description;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Отчет");
    XLSX.writeFile(wb, `Отчет_${reportYear}_${reportMonth}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-6 border-bottom border-zinc-100">
          <div className="flex items-center gap-3 text-emerald-600 font-bold text-xl">
            <AlertCircle className="w-8 h-8" />
            <span>АСУДД отчёты</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 uppercase tracking-widest font-semibold">некоммерческое ПО, предназначено исключительно для личного использования</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Панель управления
          </button>
          <button 
            onClick={() => setActiveTab('upload')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'upload' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <Upload className="w-5 h-5" />
            Загрузка XLS
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <FileText className="w-5 h-5" />
            Ежемесячные отчеты
          </button>
          <button 
            onClick={() => setActiveTab('data')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'data' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <TableIcon className="w-5 h-5" />
            Управление данными
          </button>
          <button 
            onClick={() => setActiveTab('availability')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'availability' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <Calendar className="w-5 h-5" />
            Доступность данных
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <SettingsIcon className="w-5 h-5" />
            Настройки
          </button>
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <div className="bg-zinc-900 text-white p-4 rounded-2xl">
            <p className="text-xs text-zinc-400">Хранилище (1 ГБ макс.)</p>
            <div className="mt-2">
              <div className="flex justify-between text-[10px] mb-1">
                <span>{stats ? (stats.storageSize / (1024 * 1024)).toFixed(2) : 0} МБ</span>
                <span>{stats ? (stats.maxStorage / (1024 * 1024)).toFixed(0) : 1024} МБ</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${stats && (stats.storageSize / stats.maxStorage) > 0.9 ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${stats ? Math.min(100, (stats.storageSize / stats.maxStorage) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">База данных онлайн</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white border-b border-zinc-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="text-xl font-semibold text-zinc-800 capitalize">
            {activeTab === 'dashboard' ? 'Обзор системы' : 
             activeTab === 'upload' ? 'Импорт данных' : 
             activeTab === 'reports' ? 'Генератор отчетов' : 
             activeTab === 'data' ? 'Управление данными' :
             activeTab === 'availability' ? 'Проверка наличия данных' :
             'Настройки колонок'}
          </h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Поиск оборудования..." 
                className="pl-10 pr-4 py-2 bg-zinc-100 border-none rounded-full text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-64"
              />
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card p-6">
                    <p className="text-sm text-zinc-500 font-medium">Всего отказов в базе</p>
                    <div className="flex items-end justify-between mt-2">
                      <h2 className="text-4xl font-bold text-zinc-900">{stats?.totalFailures || 0}</h2>
                      <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">
                        +12% в этом месяце
                      </div>
                    </div>
                  </div>
                  <div className="glass-card p-6">
                    <p className="text-sm text-zinc-500 font-medium">Активных единиц оборудования</p>
                    <div className="flex items-end justify-between mt-2">
                      <h2 className="text-4xl font-bold text-zinc-900">{stats?.equipmentCount || 0}</h2>
                      <BarChart3 className="w-8 h-8 text-zinc-200" />
                    </div>
                  </div>
                  <div className="glass-card p-6">
                    <p className="text-sm text-zinc-500 font-medium">Среднее кол-во отказов / день</p>
                    <div className="flex items-end justify-between mt-2">
                      <h2 className="text-4xl font-bold text-zinc-900">
                        {stats?.totalFailures ? (stats.totalFailures / 30).toFixed(1) : 0}
                      </h2>
                      <div className="bg-zinc-100 text-zinc-600 px-2 py-1 rounded text-xs font-bold">
                        Стабильно
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts & Recent */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-emerald-500" />
                      Тренды отказов
                    </h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats?.failuresByMonth || []}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {(stats?.failuresByMonth || []).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-emerald-500" />
                      Последние инциденты
                    </h3>
                    <div className="space-y-4">
                      {stats?.recentFailures.map((failure) => (
                        <div key={failure.id} className="flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl transition-colors border border-transparent hover:border-zinc-100">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-bold text-xs">
                              {failure.equipment_id.slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">{failure.equipment_name}</p>
                              <p className="text-xs text-zinc-500">{new Date(failure.timestamp).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded uppercase tracking-tighter">
                              {failure.failure_type}
                            </span>
                          </div>
                        </div>
                      ))}
                      {(!stats?.recentFailures || stats.recentFailures.length === 0) && (
                        <div className="text-center py-12 text-zinc-400 italic">
                          Инцидентов пока не зафиксировано.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="max-w-4xl mx-auto py-12 space-y-8"
              >
                <div className="glass-card p-12 text-center border-2 border-dashed border-zinc-200 bg-white">
                  <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Upload className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-2">Импорт данных об отказах</h2>
                  <p className="text-zinc-500 mb-4 max-w-md mx-auto">
                    Загрузите ваши XLS файлы отчетов за 4 суток. Система автоматически удалит дубликаты и обновит базу данных.
                  </p>

                  {stats && (stats.storageSize / stats.maxStorage) > 0.8 && (
                    <div className="mb-6 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-xs font-medium flex items-center gap-2 max-w-md mx-auto">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Хранилище заполнено на {((stats.storageSize / stats.maxStorage) * 100).toFixed(1)}%. Пожалуйста, удалите старые данные во вкладке «Управление данными».</span>
                    </div>
                  )}
                  
                  <div className="relative group max-w-sm mx-auto">
                    <input 
                      type="file" 
                      accept=".xls,.xlsx"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className={`py-4 px-8 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 ${uploading ? 'bg-zinc-100 text-zinc-400' : 'bg-emerald-600 text-white group-hover:bg-emerald-700 shadow-lg shadow-emerald-200'}`}>
                      {uploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Обработка файла...
                        </>
                      ) : (
                        <>
                          <FileText className="w-5 h-5" />
                          Выбрать XLS файл
                        </>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {uploadResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mt-8 p-4 rounded-2xl flex items-center gap-3 text-left ${uploadResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
                      >
                        {uploadResult.success ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <AlertCircle className="w-6 h-6 shrink-0" />}
                        <div>
                          <p className="font-bold">{uploadResult.success ? 'Импорт завершен' : 'Ошибка импорта'}</p>
                          <p className="text-sm opacity-90">
                            {uploadResult.success 
                              ? `Успешно добавлено ${uploadResult.count} новых записей об отказах.` 
                              : uploadResult.error || 'Произошла ошибка при обработке файла. Пожалуйста, проверьте формат.'}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {detectedHeaders.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <TableIcon className="w-5 h-5 text-emerald-500" />
                        Заголовки в загруженном файле
                      </h3>
                      <p className="text-xs text-zinc-400">Нажмите на заголовок, чтобы добавить его в настройки</p>
                    </div>
                    
                    <div className="mb-4 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wider">Куда добавить:</p>
                      <div className="flex flex-wrap gap-2">
                        {mappings.map(m => (
                          <button
                            key={m.field_name}
                            onClick={() => setActiveMappingField(m.field_name)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${activeMappingField === m.field_name ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-zinc-600 border-zinc-200 hover:border-emerald-300'}`}
                          >
                            {m.display_name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {detectedHeaders.map((header, idx) => (
                        <button 
                          key={idx} 
                          onClick={() => addHeaderToMapping(header)}
                          className="px-3 py-1.5 bg-white text-zinc-700 rounded-lg text-sm font-medium border border-zinc-200 hover:border-emerald-500 hover:text-emerald-600 transition-all cursor-pointer shadow-sm"
                        >
                          {header}
                        </button>
                      ))}
                    </div>

                    {activeMappingField && (
                      <div className="mt-6 flex justify-end">
                        <button 
                          onClick={saveMappings}
                          disabled={isSavingMappings}
                          className="flex items-center gap-2 text-emerald-600 font-bold text-sm hover:text-emerald-700 transition-colors"
                        >
                          {isSavingMappings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Сохранить обновленные настройки
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-100 rounded-2xl">
                    <p className="text-xs font-bold text-zinc-400 uppercase mb-2">Ожидаемые колонки</p>
                    <div className="flex flex-wrap gap-2">
                      {mappings.map(m => (
                        <span key={m.field_name} className="px-2 py-1 bg-white rounded text-[10px] font-bold text-zinc-600 border border-zinc-200">
                          {m.display_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 bg-zinc-100 rounded-2xl">
                    <p className="text-xs font-bold text-zinc-400 uppercase mb-2">Советы</p>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Вы можете настроить соответствие колонок во вкладке «Настройки», если названия в ваших XLS файлах отличаются.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="glass-card p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold text-zinc-500">Год:</label>
                      <select 
                        value={reportYear}
                        onChange={(e) => setReportYear(parseInt(e.target.value))}
                        className="bg-zinc-100 border-none rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold text-zinc-500">Месяц:</label>
                      <select 
                        value={reportMonth}
                        onChange={(e) => setReportMonth(parseInt(e.target.value))}
                        className="bg-zinc-100 border-none rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>
                            {new Date(0, m - 1).toLocaleString('ru-RU', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button 
                      onClick={fetchReport}
                      disabled={reportLoading}
                      className="ml-4 bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Сформировать отчет
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={exportToExcel}
                      disabled={!monthlyReport}
                      className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm transition-colors disabled:opacity-50"
                    >
                      <TableIcon className="w-4 h-4" />
                      Экспорт Excel
                    </button>
                  </div>
                </div>

                {monthlyReport && (
                  <div className="glass-card p-6">
                    <h4 className="text-sm font-bold text-zinc-500 mb-4 uppercase tracking-wider">Выберите столбцы для экспорта:</h4>
                    <div className="flex flex-wrap gap-3">
                      {EXPORT_COLUMNS.map(col => (
                        <label key={col} className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox"
                            checked={selectedExportColumns.includes(col)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedExportColumns([...selectedExportColumns, col]);
                              } else {
                                setSelectedExportColumns(selectedExportColumns.filter(c => c !== col));
                              }
                            }}
                            className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-zinc-600 group-hover:text-zinc-900 transition-colors">{col}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {monthlyReport ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-6">
                      <div className="glass-card p-6">
                        <h3 className="text-lg font-bold mb-4">Сводка по оборудованию</h3>
                        <div className="space-y-4">
                          {monthlyReport.summary.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between group">
                              <div className="flex-1 min-w-0 pr-4">
                                <p className="text-sm font-semibold text-zinc-900 truncate">{item.equipment_name}</p>
                                <div className="w-full bg-zinc-100 h-1.5 rounded-full mt-1 overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (item.count / monthlyReport.failures.length) * 100)}%` }}
                                    className="bg-emerald-500 h-full rounded-full"
                                  />
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-zinc-900">{item.count}</p>
                                <p className="text-[10px] text-zinc-400 uppercase font-bold">Отказов</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="glass-card p-6">
                        <h3 className="text-lg font-bold mb-4">Сводка по типам</h3>
                        <div className="space-y-3">
                          {monthlyReport.typeSummary.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                              <span className="text-xs font-bold text-zinc-700 uppercase tracking-tight">{item.failure_type}</span>
                              <span className="px-2 py-1 bg-white rounded-lg text-xs font-bold text-emerald-600 border border-zinc-200 shadow-sm">
                                {item.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <div className="glass-card overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-zinc-50 border-b border-zinc-100">
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Время возникновения</th>
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Время устранения</th>
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Оборудование</th>
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Тип отказа</th>
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Место / Объект</th>
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Описание</th>
                              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Длит.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {monthlyReport.failures.map((f) => (
                              <tr key={f.id} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">
                                  {new Date(f.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-6 py-4 text-sm text-zinc-600 whitespace-nowrap">
                                  {f.end_timestamp ? new Date(f.end_timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-sm font-semibold text-zinc-900">{f.equipment_name}</p>
                                  <p className="text-[10px] text-zinc-400 font-mono">{f.equipment_id}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded uppercase border border-emerald-100">
                                    {f.failure_type}
                                  </span>
                                  {f.initiator && <p className="text-[10px] text-zinc-400 mt-1 italic">Иниц: {f.initiator}</p>}
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-xs text-zinc-600">{f.location || '-'}</p>
                                  <p className="text-[10px] text-zinc-400">{f.linear_object}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-xs text-zinc-600 line-clamp-2 max-w-[200px]">{f.description || '-'}</p>
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-zinc-900">
                                  {f.duration_minutes}м
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-card p-20 text-center">
                    <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-zinc-300" />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900">Отчет не сформирован</h3>
                    <p className="text-zinc-500 text-sm">Выберите месяц и год для просмотра отчета об отказах.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'data' && (
              <motion.div 
                key="data"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold text-zinc-900">Управление данными</h2>
                    <p className="text-zinc-500 mt-1">Просмотр, поиск и редактирование всех записей об отказах.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input 
                        type="text"
                        placeholder="Поиск по названию, ID, описанию..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-80"
                      />
                    </div>
                  </div>
                </div>

                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-100">
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Время возникновения</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Время устранения</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Оборудование</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Тип</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Место</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {isDataLoading ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-20 text-center">
                              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500" />
                              <p className="text-zinc-400 mt-2 text-sm">Загрузка данных...</p>
                            </td>
                          </tr>
                        ) : failures.length > 0 ? (
                          failures.map((f) => (
                            <tr key={f.id} className="hover:bg-zinc-50/50 transition-colors group">
                              <td className="px-6 py-4 text-sm text-zinc-600">
                                {new Date(f.timestamp).toLocaleString('ru-RU')}
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-600">
                                {f.end_timestamp ? new Date(f.end_timestamp).toLocaleString('ru-RU') : '-'}
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm font-semibold text-zinc-900">{f.equipment_name}</p>
                                <p className="text-[10px] text-zinc-400 font-mono">{f.equipment_id}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded uppercase">
                                  {f.failure_type}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-600">
                                {f.location || '-'}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => setEditingFailure(f)}
                                    className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteFailure(f.id!)}
                                    className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-20 text-center text-zinc-400">
                              Данные не найдены
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {totalFailures > 50 && (
                    <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                      <p className="text-sm text-zinc-500">
                        Показано {failures.length} из {totalFailures} записей
                      </p>
                      <div className="flex items-center gap-2">
                        <button 
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                          className="px-4 py-2 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Назад
                        </button>
                        <span className="text-sm font-bold text-zinc-900 px-4">
                          {currentPage}
                        </span>
                        <button 
                          disabled={currentPage * 50 >= totalFailures}
                          onClick={() => setCurrentPage(p => p + 1)}
                          className="px-4 py-2 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Вперед
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit Modal */}
                <AnimatePresence>
                  {editingFailure && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
                      >
                        <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                          <h3 className="text-xl font-bold text-zinc-900">Редактирование записи</h3>
                          <button onClick={() => setEditingFailure(null)} className="text-zinc-400 hover:text-zinc-600">
                            <Plus className="w-6 h-6 rotate-45" />
                          </button>
                        </div>
                        <form onSubmit={handleUpdateFailure} className="p-8 space-y-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">Оборудование</label>
                              <input 
                                type="text"
                                value={editingFailure.equipment_name}
                                onChange={e => setEditingFailure({...editingFailure, equipment_name: e.target.value})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">ID Оборудования</label>
                              <input 
                                type="text"
                                value={editingFailure.equipment_id}
                                onChange={e => setEditingFailure({...editingFailure, equipment_id: e.target.value})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">Тип отказа</label>
                              <input 
                                type="text"
                                value={editingFailure.failure_type}
                                onChange={e => setEditingFailure({...editingFailure, failure_type: e.target.value})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">Длительность (мин)</label>
                              <input 
                                type="number"
                                value={editingFailure.duration_minutes}
                                onChange={e => setEditingFailure({...editingFailure, duration_minutes: parseInt(e.target.value)})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">Время возникновения</label>
                              <input 
                                type="datetime-local"
                                value={new Date(editingFailure.timestamp).toISOString().slice(0, 16)}
                                onChange={e => setEditingFailure({...editingFailure, timestamp: e.target.value})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">Время устранения</label>
                              <input 
                                type="datetime-local"
                                value={editingFailure.end_timestamp ? new Date(editingFailure.end_timestamp).toISOString().slice(0, 16) : ''}
                                onChange={e => setEditingFailure({...editingFailure, end_timestamp: e.target.value})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-400 uppercase">Местоположение</label>
                              <input 
                                type="text"
                                value={editingFailure.location || ''}
                                onChange={e => setEditingFailure({...editingFailure, location: e.target.value})}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Описание</label>
                            <textarea 
                              value={editingFailure.description || ''}
                              onChange={e => setEditingFailure({...editingFailure, description: e.target.value})}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                            />
                          </div>
                          <div className="flex justify-end gap-4 pt-4">
                            <button 
                              type="button"
                              onClick={() => setEditingFailure(null)}
                              className="px-6 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700"
                            >
                              Отмена
                            </button>
                            <button 
                              type="submit"
                              disabled={isSavingFailure}
                              className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 disabled:opacity-50"
                            >
                              {isSavingFailure ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Сохранить
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'availability' && (
              <motion.div 
                key="availability"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-8"
              >
                <div className="glass-card p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-zinc-900">Проверка наличия данных</h2>
                      <p className="text-zinc-500 text-sm mt-1">
                        Ниже отображены последние 60 дней и статус загрузки отчетов для каждого дня.
                      </p>
                    </div>
                    <button 
                      onClick={fetchAvailability}
                      className="text-emerald-600 hover:text-emerald-700 font-bold text-sm flex items-center gap-2"
                    >
                      <Loader2 className={`w-4 h-4 ${isAvailabilityLoading ? 'animate-spin' : ''}`} />
                      Обновить данные
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {availabilityData.map((item) => (
                      <div key={item.date} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-900">
                            {new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">{item.date}</span>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-zinc-100">
                            <span className="text-xs font-medium text-zinc-600">Журнал отказов</span>
                            {item.hasFailures ? (
                              <div className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Есть данные</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-red-500">
                                <AlertCircle className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Отсутствуют</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-zinc-100">
                            <span className="text-xs font-medium text-zinc-600">Отчет о работоспособности</span>
                            {item.hasWorkingHours ? (
                              <div className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Есть данные</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-red-500">
                                <AlertCircle className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Отсутствуют</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {availabilityData.length === 0 && !isAvailabilityLoading && (
                      <div className="col-span-full py-20 text-center text-zinc-400 italic">
                        Данные о загрузках пока отсутствуют. Загрузите файлы во вкладке «Загрузка XLS».
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex gap-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Как это работает?</p>
                    <p className="text-sm text-emerald-800 mt-1">
                      Система автоматически определяет тип данных при загрузке. Если в файле есть колонка с часами работы оборудования (0-24), данные помечаются как «Отчет о работоспособности». В противном случае они считаются записями из «Журнала отказов».
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="glass-card p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-zinc-900">Управление базой данных</h2>
                      <p className="text-zinc-500 text-sm mt-1">
                        Вы можете скачать всю базу данных для резервного копирования или восстановить её из файла.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <Download className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-zinc-900 mb-2">Скачать базу данных</h3>
                      <p className="text-xs text-zinc-500 mb-6">Загрузить файл .db со всеми данными и настройками.</p>
                      <button 
                        onClick={handleBackup}
                        className="w-full bg-white border border-emerald-200 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-50 transition-all"
                      >
                        Скачать failures.db
                      </button>
                    </div>

                    <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                        <Upload className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-zinc-900 mb-2">Восстановить из файла</h3>
                      <p className="text-xs text-zinc-500 mb-6">Заменить текущую базу данных файлом резервной копии.</p>
                      <div className="relative w-full">
                        <input 
                          type="file"
                          accept=".db"
                          onChange={handleRestore}
                          disabled={isRestoring}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <button 
                          disabled={isRestoring}
                          className="w-full bg-white border border-amber-200 text-amber-600 px-4 py-2 rounded-xl font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                        >
                          {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Выбрать файл .db'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-zinc-900">Настройка сопоставления колонок</h2>
                      <p className="text-zinc-500 text-sm mt-1">
                        Укажите через запятую все возможные названия колонок из ваших XLS файлов для каждого поля.
                      </p>
                    </div>
                    <button 
                      onClick={saveMappings}
                      disabled={isSavingMappings}
                      className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 disabled:opacity-50"
                    >
                      {isSavingMappings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Сохранить изменения
                    </button>
                  </div>

                  <div className="space-y-6">
                    {mappings.map((mapping, idx) => (
                      <div 
                        key={mapping.field_name} 
                        onClick={() => setActiveMappingField(mapping.field_name)}
                        className={`grid grid-cols-1 md:grid-cols-3 gap-6 items-start p-4 rounded-2xl transition-all border cursor-pointer ${activeMappingField === mapping.field_name ? 'bg-emerald-50/50 border-emerald-200 shadow-sm' : 'hover:bg-zinc-50 border-transparent hover:border-zinc-100'}`}
                      >
                        <div className="pt-2">
                          <p className="font-bold text-zinc-900">{mapping.display_name}</p>
                          <p className="text-xs text-zinc-400 font-mono mt-1 uppercase tracking-tighter">{mapping.field_name}</p>
                        </div>
                        <div className="md:col-span-2">
                          <textarea 
                            value={mapping.mapped_keys}
                            onChange={(e) => {
                              const newMappings = [...mappings];
                              newMappings[idx].mapped_keys = e.target.value;
                              setMappings(newMappings);
                            }}
                            placeholder="Например: ID оборудования, equipment_id, id"
                            className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none min-h-[80px] resize-none"
                          />
                          <p className="text-[10px] text-zinc-400 mt-2">
                            Текущие ключи: {mapping.mapped_keys.split(',').map(k => k.trim()).filter(Boolean).join(' • ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex gap-4">
                  <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">Важное примечание</p>
                    <p className="text-sm text-amber-800 mt-1">
                      Система ищет колонки без учета регистра и лишних пробелов. Если вы добавите новое название, оно сразу станет доступно для будущих загрузок. Порядок названий не имеет значения.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
