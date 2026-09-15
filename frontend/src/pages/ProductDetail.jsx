import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, Zap, Activity, Gauge, TrendingUp, TrendingDown, ScanLine } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import './ProductDetail.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const REFRESH_INTERVAL_MS = 1500;
const DELAY_START_TOLERANCE_MS = 120000;

// =================================================================================
// HELPER FORMAT & UTILITY (EKSTRAKSI S3776 & S7773)
// =================================================================================

const pad2 = (v) => String(v).padStart(2, '0');

const formatActualDate = (d) => `${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()]}, ${d.getDate()} ${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][d.getMonth()]} ${d.getFullYear()}`;

const formatActualTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

const formatDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseDateMs = (v) => {
  const ms = new Date(v ? String(v).replace('Z', '') : '').getTime();
  return Number.isNaN(ms) ? null : ms;
};

const formatDotTime = (ms) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}.${pad2(d.getMinutes())}.${pad2(d.getSeconds())}`;
};

const formatTableTimeWib = (v) => parseDateMs(v) ? `${formatDotTime(parseDateMs(v))} WIB` : '-';

const formatHHMM = (dateStr) => {
  if (!dateStr) return '-';
  if (typeof dateStr === 'string' && /^\d{2}:\d{2}/.test(dateStr)) return dateStr.substring(0, 5);
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const formatTimeStr = (sec, isMetric = false) => {
  const s = Math.round(Number(sec || 0));
  if (!s || Number.isNaN(s)) return '-';
  const m = Math.floor(s / 60);
  const r = s % 60;
  
  // S3358: Nested Ternary dipisahkan menjadi if/return terstruktur
  if (isMetric) return `${m}m ${r}s`;
  if (m <= 0) return `${r} detik`;
  if (r <= 0) return `${m} menit`;
  return `${m} menit ${r} detik`;
};

const formatPullingTime = (s) => formatTimeStr(s, false);
const formatMetricTime = (s) => formatTimeStr(s, true);

const getPullingScheduleText = (r) => {
  const start = r.displayStart || formatHHMM(r.scheduled_start);
  const finish = r.displayFinish || formatHHMM(r.scheduled_finish);
  return (!start || !finish || start === '-' || finish === '-') ? '-' : `${start} - ${finish}`;
};

const getTimestamp = (timeStr, baseDate, isCrossMid) => {
  const [hh, mm] = timeStr.split(':').map(Number);
  const d = new Date(baseDate).setHours(hh, mm, 0, 0);
  return (isCrossMid && hh < 12) ? d + 86400000 : d;
};

const toDatetimeLocal = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const getBubbleStyle = ({ actualStartMs, actualEndMs, scheduledStartMs, scheduledFinishMs }) => {
  const startMs = Number(actualStartMs || 0);
  const endMs = Number(actualEndMs || 0);
  const scheduleStartMs = Number(scheduledStartMs || 0);
  const scheduleFinishMs = Number(scheduledFinishMs || 0);

  if (scheduleFinishMs > 0 && endMs > scheduleFinishMs) {
    return { status: 'red', borderColor: '#ef4444', bg: '#fff5f5', durationColor: '#ef4444' };
  }
  if (scheduleStartMs > 0 && startMs > (scheduleStartMs + DELAY_START_TOLERANCE_MS)) {
    return { status: 'orange', borderColor: '#f59e0b', bg: '#fffbeb', durationColor: '#d97706' };
  }
  return { status: 'green', borderColor: '#22c55e', bg: '#f0fdf4', durationColor: '#16a34a' };
};

const getStatusPullingInfo = (row) => {
  const start = row.actual_start || row.start;
  const finish = row.actual_finish || row.finish;
  if (start && !finish) return { text: 'Counting', className: 'badge-counting' };
  
  const pCode = String(row.problem_code || '').toUpperCase();
  const status = String(row.status || row.status_pulling || '').toUpperCase();
  
  if (pCode.includes('LATE_FINISH') || pCode.includes('OVER_CT') || status === 'ABNORMAL') {
    return { text: 'Delay Finish', className: 'badge-delay-finish' };
  }
  if (pCode.includes('LATE_START') || status === 'DELAY') {
    return { text: 'Delay Start', className: 'badge-delay-start' };
  }
  return { text: 'Normal', className: 'badge-normal' };
};

const formatPercent = (v, d = 1) => (v == null || Number.isNaN(Number(v))) ? '-' : `${Number(v).toFixed(d)}%`;

// =================================================================================
// DATA PROCESSING HELPERS (EKSTRAKSI S3776 COGNITIVE COMPLEXITY)
// =================================================================================

const getShiftInfo = (currentTime) => {
  const currentHour = currentTime.getHours();
  const isShift1 = currentHour >= 6 && currentHour < 18;
  const baseDate = new Date(currentTime);
  baseDate.setHours(0, 0, 0, 0);
  if (!isShift1 && currentHour < 6) baseDate.setDate(baseDate.getDate() - 1);
  return { isShift1, baseDate, activeShiftName: isShift1 ? 'SHIFT_1' : 'SHIFT_2', scheduleDateKey: formatDateKey(baseDate) };
};

const buildScheduleRanges = (activeScheduleFallback, baseDate, isShift1) => {
  return Object.entries(activeScheduleFallback).map(([cycle, times], index) => {
    const scheduledStartMs = getTimestamp(times[0], baseDate, !isShift1);
    const scheduledFinishMs = getTimestamp(times[1], baseDate, !isShift1);
    return {
      cycle_no: Number(cycle), cycle: Number(cycle), index,
      scheduledStartMs, scheduledFinishMs,
      startMs: scheduledStartMs, endMs: scheduledFinishMs,
      displayStart: times[0], displayFinish: times[1],
    };
  });
};

const buildActualRows = (filteredMonitoringRows, scheduleLookup) => {
  const validSortedRows = filteredMonitoringRows
    .filter((row) => row.actual_start || row.start)
    .sort((a, b) => {
      const aStart = parseDateMs(a.actual_start || a.start) || 0;
      const bStart = parseDateMs(b.actual_start || b.start) || 0;
      if (aStart !== bStart) return aStart - bStart;
      return Number(a.counting_id || 0) - Number(b.counting_id || 0);
    });

  return validSortedRows.map((row, index) => {
    const chronoCycle = index + 1; 
    const scheduleMatch = scheduleLookup.get(chronoCycle) || {};
    return {
      ...row,
      _bubble_key: row.counting_id || row.id || index,
      cycle_no: chronoCycle, 
      scheduledStartMs: scheduleMatch.scheduledStartMs || parseDateMs(row.scheduled_start),
      scheduledFinishMs: scheduleMatch.scheduledFinishMs || parseDateMs(row.scheduled_finish),
      displayStart: scheduleMatch.displayStart || formatHHMM(row.scheduled_start),
      displayFinish: scheduleMatch.displayFinish || formatHHMM(row.scheduled_finish),
    };
  });
};

const calculateKPIs = (actualRows, scheduleRanges, nowMs) => {
  let greenCount = 0, orangeCount = 0, redCount = 0;
  
  actualRows.forEach((row) => {
    const startMs = parseDateMs(row.actual_start || row.start);
    if (!startMs) return;
    const schedMatch = scheduleRanges.find(r => r.cycle === Number(row.cycle_no));
    const style = getBubbleStyle({ 
      actualStartMs: startMs, 
      actualEndMs: row.actual_finish || row.finish ? parseDateMs(row.actual_finish || row.finish) : nowMs, 
      scheduledStartMs: schedMatch?.startMs || startMs, 
      scheduledFinishMs: schedMatch?.endMs || nowMs 
    });
    
    // S2681: Penggunaan Bracket Terstruktur
    if (style.status === 'green') { greenCount++; }
    else if (style.status === 'orange') { orangeCount++; }
    else if (style.status === 'red') { redCount++; }
  });

  const finishedRows = actualRows.filter((row) => (row.actual_start || row.start) && (row.actual_finish || row.finish));
  const finishedDurations = finishedRows.map((row) => Number(row.duration_sec || row.duration || 0)).filter((value) => value > 0 && !Number.isNaN(value));
  
  const avgCtSec = finishedDurations.length ? finishedDurations.reduce((a, b) => a + b, 0) / finishedDurations.length : null;
  const highestCtSec = finishedDurations.length ? Math.max(...finishedDurations) : null;
  const lowestCtSec = finishedDurations.length ? Math.min(...finishedDurations) : null;

  const finishedStatusInfo = finishedRows.map((row) => getStatusPullingInfo(row));
  const goodPullingCount = finishedStatusInfo.filter((item) => item.text === 'Normal' || item.text === 'Delay Start').length;

  const pullingPerformanceText = finishedStatusInfo.length ? formatPercent((goodPullingCount / finishedStatusInfo.length) * 100, 1) : '0.0%';

  return { greenCount, orangeCount, redCount, avgCtSec, highestCtSec, lowestCtSec, pullingPerformanceText };
};

const processHeijunkaData = (heijunkaData, productName, activeShiftName) => {
  const group = {};
  heijunkaData
    .filter((row) => String(row.product || '').toLowerCase() === String(productName || '').toLowerCase() && String(row.shift_name || '').toUpperCase() === activeShiftName)
    .forEach((row) => {
      const cycleNo = Number(row.cycle_no);
      if (!group[cycleNo]) group[cycleNo] = [];
      group[cycleNo].push({ heijunka_id: row.heijunka_id, pn_code: row.pn_code, plan_qty: Number(row.plan_qty || 0), scan_qty: Number(row.scan_qty || 0) });
    });

  const accuracyByCycle = {};
  let totalDailyPlan = 0;
  let totalDailyScan = 0;

  Object.entries(group).forEach(([cycleNo, items]) => {
    const plan = items.reduce((sum, item) => sum + Number(item.plan_qty || 0), 0);
    const scan = items.reduce((sum, item) => sum + Number(item.scan_qty || 0), 0);
    accuracyByCycle[Number(cycleNo)] = { 
      totalPlan: plan, 
      totalScan: scan, 
      percent: plan > 0 ? (scan / plan) * 100 : null, 
      text: plan > 0 ? formatPercent((scan / plan) * 100, 1) : '-', 
      isOk: plan > 0 && scan === plan 
    };
    totalDailyPlan += plan;
    totalDailyScan += scan;
  });

  const dailyAccuracyText = totalDailyPlan > 0 ? formatPercent((totalDailyScan / totalDailyPlan) * 100, 1) : '0.0%';
  return { heijunkaByCycle: group, kanbanAccuracyByCycle: accuracyByCycle, dailyKanbanAccuracyText: dailyAccuracyText };
};

// =================================================================================
// MAIN COMPONENT PRODUCT DETAIL
// =================================================================================

const ProductDetail = () => {
  const { productName } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const timelineScrollRef = useRef(null);
  const hasAutoScrolledRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [monitoringData, setMonitoringData] = useState([]);
  const [heijunkaData, setHeijunkaData] = useState([]);
  const [picOptions, setPicOptions] = useState([]);
  
  const [masterSchedule, setMasterSchedule] = useState({ SHIFT_1: {}, SHIFT_2: {} });
  
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('new');
  const [formData, setFormData] = useState({ counting_id: null, cycle_no: '', actual_start: '', actual_finish: '', problem_code: '' });
  const quickProblems = ['Material Kosong', 'Mesin Trouble', 'Operator Ganti', 'Mati Lampu'];
  const [saving, setSaving] = useState(false);

  // REALTIME CLOCK
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 200);
    return () => clearInterval(timer);
  }, []);

  const { isShift1, baseDate, activeShiftName, scheduleDateKey } = getShiftInfo(currentTime);
  const activeScheduleFallback = isShift1 ? masterSchedule.SHIFT_1 : masterSchedule.SHIFT_2;

  // FETCH ALL DATA
  useEffect(() => {
    let isCancelled = false;
    const fetchAllData = async () => {
      try {
        const safeProduct = encodeURIComponent(productName || 'VCT');
        const [monitoringRes, heijunkaRes, picRes, scheduleRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/monitoring?product=${safeProduct}&date=${scheduleDateKey}`),
          fetch(`${API_BASE_URL}/api/heijunka?product=${safeProduct}&date=${scheduleDateKey}`),
          fetch(`${API_BASE_URL}/api/pics`),
          fetch(`${API_BASE_URL}/api/master-schedule`) 
        ]);

        const monitoringJson = await monitoringRes.json();
        const heijunkaJson = await heijunkaRes.json();
        const picJson = picRes.ok ? await picRes.json() : [];
        const scheduleJson = scheduleRes.ok ? await scheduleRes.json() : [];

        if (!isCancelled) {
          setMonitoringData(Array.isArray(monitoringJson) ? monitoringJson : []);
          setHeijunkaData(Array.isArray(heijunkaJson) ? heijunkaJson : []);
          setPicOptions(Array.isArray(picJson) ? picJson : []);
          
          if (Array.isArray(scheduleJson) && scheduleJson.length > 0) {
            const formattedSchedule = { SHIFT_1: {}, SHIFT_2: {} };
            scheduleJson.forEach(item => {
              if (formattedSchedule[item.shift_name]) {
                formattedSchedule[item.shift_name][item.cycle_no] = [item.start_time, item.finish_time];
              }
            });
            setMasterSchedule(formattedSchedule);
          }
          setApiError('');
          setLoading(false);
        }
      } catch (error) {
        // S2486: Handle exception
        console.error("Fetch Data Error:", error.message);
        if (!isCancelled) {
          setApiError('Gagal mengambil data dari backend');
          setLoading(false);
        }
      }
    };
    fetchAllData();
    const interval = setInterval(fetchAllData, REFRESH_INTERVAL_MS);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [productName, scheduleDateKey, refreshToken]);

  // CORE LOGIC MAPPING
  const filteredMonitoringRows = useMemo(() => {
    return monitoringData.filter((row) => 
      String(row.product || '').toLowerCase() === String(productName || '').toLowerCase() && 
      String(row.shift_name || '').toUpperCase() === activeShiftName
    );
  }, [monitoringData, productName, activeShiftName]);

  const scheduleRanges = useMemo(() => buildScheduleRanges(activeScheduleFallback, baseDate, isShift1), [activeScheduleFallback, baseDate, isShift1]);

  const scheduleLookup = useMemo(() => {
    const byCycleNo = new Map();
    scheduleRanges.forEach(row => byCycleNo.set(Number(row.cycle_no), row));
    return byCycleNo;
  }, [scheduleRanges]);

  const actualRows = useMemo(() => buildActualRows(filteredMonitoringRows, scheduleLookup), [filteredMonitoringRows, scheduleLookup]);

  const tableRows = useMemo(() => [...actualRows].sort((a, b) => b.cycle_no - a.cycle_no), [actualRows]);

  // PIC DYNAMIC TEXT
  const picText = useMemo(() => {
    const uniqueUserIds = [...new Set(filteredMonitoringRows.map(r => r.user_id).filter(id => id != null && id !== ''))];
    if (uniqueUserIds.length === 0) return 'Operator'; 
    if (uniqueUserIds.length > 1) return 'Error (Data Ganda)';
    
    const picId = String(uniqueUserIds[0]).trim();
    const picInfo = picOptions.find(p => String(p.user_id).trim() === picId);
    // S6582: Optional chaining
    return picInfo?.user_name || picId;
  }, [filteredMonitoringRows, picOptions]);

  // RENDER VARIABLES
  const nowMs = currentTime.getTime();
  const cycleCount = scheduleRanges.length;
  const timelineGridTemplate = `repeat(${Math.max(cycleCount, 1)}, var(--cycle-width))`;

  const timelineStartMs = scheduleRanges[0]?.startMs || nowMs;
  // S7755: Array At diganti dari scheduleRanges[scheduleRanges.length - 1]
  const timelineEndMs = scheduleRanges.at(-1)?.endMs || nowMs;
  
  const isNowInsideTimeline = nowMs >= timelineStartMs && nowMs <= timelineEndMs;
  const currentCycle = scheduleRanges.find((range) => nowMs >= range.startMs && nowMs <= range.endMs);
  const currentCycleNo = currentCycle ? currentCycle.cycle : null;

  const getPercentByTime = (timeMs) => {
    if (!scheduleRanges.length) return 0;
    if (timeMs <= timelineStartMs) return 0;
    if (timeMs >= timelineEndMs) return 100;
    for (let i = 0; i < scheduleRanges.length; i++) {
      const range = scheduleRanges[i];
      if (timeMs >= range.startMs && timeMs <= range.endMs) return ((i + (timeMs - range.startMs) / Math.max(range.endMs - range.startMs, 1)) / cycleCount) * 100;
      if (scheduleRanges[i + 1] && timeMs > range.endMs && timeMs < scheduleRanges[i + 1].startMs) return ((i + 1) / cycleCount) * 100;
    }
    return 100;
  };
  const nowLinePercent = getPercentByTime(nowMs);

  // KPIs
  const { greenCount, orangeCount, redCount, avgCtSec, highestCtSec, lowestCtSec, pullingPerformanceText } = calculateKPIs(actualRows, scheduleRanges, nowMs);

  const avgCtText = avgCtSec ? formatMetricTime(avgCtSec) : '-';
  const highestCtText = highestCtSec ? formatMetricTime(highestCtSec) : '-';
  const lowestCtText = lowestCtSec ? formatMetricTime(lowestCtSec) : '-';

  // HEIJUNKA KANBAN
  const { heijunkaByCycle, kanbanAccuracyByCycle, dailyKanbanAccuracyText } = useMemo(() => processHeijunkaData(heijunkaData, productName, activeShiftName), [heijunkaData, productName, activeShiftName]);

  // CRUD FUNCTIONS
  const refreshPageData = () => setRefreshToken((prev) => prev + 1);
  const openNewModal = () => {
    setModalMode('new');
    setFormData({ counting_id: null, cycle_no: String(currentCycleNo || scheduleRanges[0]?.cycle || 1), actual_start: toDatetimeLocal(new Date()), actual_finish: '', problem_code: '' });
    setModalOpen(true);
  };
  const openEditModal = (row) => {
    setModalMode('edit');
    setFormData({ counting_id: row.counting_id, cycle_no: String(row.cycle_no || ''), actual_start: toDatetimeLocal(row.actual_start || row.start), actual_finish: (row.actual_finish || row.finish) ? toDatetimeLocal(row.actual_finish || row.finish) : '', problem_code: row.problem_code || '' });
    setModalOpen(true);
  };
  const closeModal = () => { if (!saving) setModalOpen(false); };
  const handleFormChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const submitCountingForm = async () => {
    try {
      if (!formData.cycle_no || !formData.actual_start) { alert('Cycle dan Start Pulling wajib diisi'); return; }
      setSaving(true);
      const payload = {
        product: productName, schedule_date: scheduleDateKey, shift_name: activeShiftName, cycle_no: Number(formData.cycle_no),
        actual_start: formData.actual_start.replace('T', ' '), actual_finish: formData.actual_finish ? formData.actual_finish.replace('T', ' ') : null, problem_code: formData.problem_code,
      };
      
      const isEdit = modalMode === 'edit' && formData.counting_id;
      const url = isEdit ? `${API_BASE_URL}/api/counting/${formData.counting_id}` : `${API_BASE_URL}/api/counting/manual`;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!result.success) { alert(result.message || 'Gagal menyimpan data'); return; }
      
      setModalOpen(false); 
      refreshPageData();
    } catch (error) { 
      // S2486: Unhandled exception
      console.error("Submit Error:", error.message);
      alert('Gagal konek ke backend'); 
    } finally { 
      setSaving(false); 
    }
  };

  const deleteCounting = async (row) => {
    if (!row.counting_id) return alert('Counting ID tidak ditemukan');
    if (!window.confirm(`Hapus data Cycle ${row.cycle_no}?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/counting/${row.counting_id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!result.success) return alert(result.message || 'Gagal menghapus data');
      refreshPageData();
    } catch (error) { 
      // S2486: Unhandled exception
      console.error("Delete Error:", error.message);
      alert('Gagal konek ke backend'); 
    }
  };

  // AUTO SCROLL (S2681 Fix Bracket)
  useEffect(() => {
    if (!isNowInsideTimeline || scheduleRanges.length === 0) return;
    if (hasAutoScrolledRef.current) return;

    let retryCount = 0;
    const maxRetry = 50;

    const runAutoScroll = () => {
      const scrollEl = timelineScrollRef.current;
      if (!scrollEl) { 
        if (++retryCount < maxRetry) { setTimeout(runAutoScroll, 100); }
        return; 
      }
      
      const liveLine = scrollEl.querySelector('.live-time-line');
      if (!liveLine) { 
        if (++retryCount < maxRetry) { setTimeout(runAutoScroll, 100); }
        return; 
      }
      
      if (scrollEl.scrollWidth <= scrollEl.clientWidth + 10) { 
        if (++retryCount < maxRetry) { setTimeout(runAutoScroll, 100); }
        return; 
      }
      
      scrollEl.scrollLeft = Math.max(liveLine.offsetLeft - (scrollEl.clientWidth / 2), 0);
      hasAutoScrolledRef.current = true;
    };

    const timer = setTimeout(() => requestAnimationFrame(runAutoScroll), 200);
    return () => clearTimeout(timer);
  }, [isNowInsideTimeline, scheduleRanges, activeShiftName, scheduleDateKey]);

  return (
    <div className="detail-bg">
      <div className="detail-header">
        <div className="header-left">
          {/* S6848 / S1082: Menggunakan button murni untuk aksesibilitas */}
          <button 
            type="button" 
            className="logo-box" 
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} 
            onClick={() => navigate('/')} 
            aria-label="Kembali"
          >
            <Zap size={20} />
          </button>
          <h1 className="header-title">PULLING LINE {productName}</h1>
        </div>

        <div className="header-badge-group">
          <div className="header-badge">
            <Calendar size={14} color="#3b82f6" />
            {formatActualDate(currentTime)}
          </div>
          <div className="header-badge header-badge--green">
            <Clock size={14} />
            {formatActualTime(currentTime)}
          </div>
          <div className="header-badge header-badge--yellow">
            Shift {isShift1 ? 'Pagi' : 'Malam'}
          </div>
        </div>
      </div>

      {/* SUB HEADER */}
      <div className="detail-subheader">
        <div className="metric-card-ui metric-card-pic">
          <User size={18} className="metric-icon" />
          <span>PIC: <strong>{picText}</strong></span>
        </div>

        <div className="metric-card-ui metric-card-ui--purple">
          <div className="metric-card-content">
            <div className="metric-card-left">
              <Activity size={16} className="metric-icon" />
              <span className="metric-label">PULLING PERFORMANCE</span>
            </div>
            <span className="metric-value">{pullingPerformanceText}</span>
          </div>
        </div>

        <div className="metric-card-ui metric-card-ui--blue">
          <div className="metric-card-content">
            <div className="metric-card-left">
              <Gauge size={16} className="metric-icon" />
              <span className="metric-label">AVG CT</span>
            </div>
            <span className="metric-value">{avgCtText}</span>
          </div>
        </div>

        <div className="metric-card-ui metric-card-ui--orange">
          <div className="metric-card-content">
            <div className="metric-card-left">
              <TrendingUp size={16} className="metric-icon" />
              <span className="metric-label">HIGHEST CT</span>
            </div>
            <span className="metric-value">{highestCtText}</span>
          </div>
        </div>

        <div className="metric-card-ui metric-card-ui--green">
          <div className="metric-card-content">
            <div className="metric-card-left">
              <TrendingDown size={16} className="metric-icon" />
              <span className="metric-label">LOWEST CT</span>
            </div>
            <span className="metric-value">{lowestCtText}</span>
          </div>
        </div>

        <div className="metric-card-ui metric-card-ui--purple">
          <div className="metric-card-content">
            <div className="metric-card-left">
              <ScanLine size={16} className="metric-icon" />
              <span className="metric-label">KANBAN ACCURACY</span>
            </div>
            <span className="metric-value">{dailyKanbanAccuracyText}</span>
          </div>
        </div>

        <div className="metric-card-live">
          LIVE UPDATE TODAY
        </div>
      </div>

      {apiError && <div className="api-error-box">{apiError}</div>}

      {/* MES GANTT */}
      <div className="mes-grid-wrapper">
        <div className="table-summary-footer">
          <div className="summary-left-area">
            <h3 className="section-title">LIVE MONITORING PULLING {productName}</h3>
            <div className="summary-total-pill">
              <span>Total Cycle Tercatat:</span>
              <strong>{actualRows.length} / {cycleCount}</strong>
            </div>
          </div>
          <div className="summary-right-box">
            <div className="summary-item"><span className="status-dot green"></span><span>Normal(Hijau):</span><strong>{greenCount}</strong></div>
            <div className="summary-item"><span className="status-dot orange"></span><span>Delay Start(Orange):</span><strong>{orangeCount}</strong></div>
            <div className="summary-item"><span className="status-dot red"></span><span>Delay Finish(Merah):</span><strong>{redCount}</strong></div>
          </div>
        </div>

        <div className="mes-table-container">
          <div className="mes-left-sticky">
            <div className="mes-row-header">CYCLE</div>
            <div className="mes-row-label">{productName}</div>
            <div className="mes-row-heijunka">
              <div className="mes-row-heijunka-text"><span>Heijunka</span><span>Schedule</span></div>
            </div>
          </div>

          <div className="mes-scroll-shell" ref={timelineScrollRef}>
            <div className="mes-scroll-content">
              {isNowInsideTimeline && (
                <div className="live-time-line" style={{ left: `${nowLinePercent}%` }}>
                  <div className="live-time-label">
                    {String(currentTime.getHours()).padStart(2, '0')}:{String(currentTime.getMinutes()).padStart(2, '0')}
                  </div>
                </div>
              )}

              <div className="mes-header-row" style={{ gridTemplateColumns: timelineGridTemplate }}>
                {scheduleRanges.map((range) => (
                  <div key={`head-${range.cycle}`} className="mes-cycle-col">
                    <div className="mes-col-header">
                      <strong>{range.cycle}</strong>
                      <span>{range.displayStart} – {range.displayFinish}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mes-actual-row" style={{ gridTemplateColumns: timelineGridTemplate }}>
                {scheduleRanges.map((range) => (
                  <div key={`grid-${range.cycle}`} className="mes-actual-grid-cell"></div>
                ))}
                <div className="bubble-layer">
                  {actualRows.map((actualData, index) => {
                    const actualStartMs = parseDateMs(actualData.actual_start || actualData.start);
                    const actualFinishMs = (actualData.actual_finish || actualData.finish) ? parseDateMs(actualData.actual_finish || actualData.finish) : nowMs;
                    if (!actualStartMs || !actualFinishMs) return null;

                    const leftPercent = getPercentByTime(actualStartMs);
                    const endPercent = getPercentByTime(actualFinishMs);
                    const widthPercent = Math.max(endPercent - leftPercent, 0.8);
                    const durMs = Math.max(actualFinishMs - actualStartMs, 0);
                    const durMins = Math.floor(durMs / 60000);
                    const durSecs = Math.floor((durMs % 60000) / 1000);
                    const startDot = formatDotTime(actualStartMs);
                    const endDot = (actualData.actual_finish || actualData.finish) ? formatDotTime(actualFinishMs) : 'Finish';

                    const scheduleForColor = scheduleRanges.find(r => r.cycle === Number(actualData.cycle_no));
                    const style = getBubbleStyle({
                      actualStartMs, actualEndMs: actualFinishMs,
                      scheduledStartMs: scheduleForColor?.startMs || actualStartMs,
                      scheduledFinishMs: scheduleForColor?.endMs || actualFinishMs,
                    });

                    return (
                      <div
                        key={`bubble-${actualData._bubble_key}`}
                        className={`bubble-realtime ${(actualData.actual_finish || actualData.finish) ? 'bubble-finish' : 'bubble-live'}`}
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, borderColor: style.borderColor, backgroundColor: style.bg }}
                      >
                        <span className="bubble__num">{index + 1}</span>
                        <div className="bubble__body">
                          <div className="bubble__time">{startDot} – {endDot}</div>
                          <div className="bubble__duration" style={{ color: style.durationColor }}>
                            {durMins > 0 ? `${durMins} Min ${durSecs} Sec` : `${durSecs} Sec`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mes-heijunka-row" style={{ gridTemplateColumns: timelineGridTemplate }}>
                {scheduleRanges.map((range) => {
                  const scheduleItems = heijunkaByCycle[range.cycle] || [];
                  return (
                    <div key={`heijunka-${range.cycle}`} className={`heijunka-cycle-cell ${range.cycle === currentCycleNo ? 'heijunka-cycle-cell--active' : ''}`}>
                      {scheduleItems.length === 0 ? <div className="heijunka-empty">No Plan</div> : (
                        scheduleItems.map((item) => (
                          <div key={`heijunka-item-${item.heijunka_id}`} className={`heijunka-card ${item.scan_qty === item.plan_qty ? 'heijunka-card--ok' : 'heijunka-card--ng'}`}>
                            <span className="heijunka-pn">{item.pn_code}</span>
                            <span className="heijunka-qty">{item.scan_qty}/{item.plan_qty}</span>
                            <span className="heijunka-status">Scanned</span>
                          </div>
                        ))
                      )}
                      {kanbanAccuracyByCycle[range.cycle] && (
                        <div className={`heijunka-accuracy-pill ${kanbanAccuracyByCycle[range.cycle].isOk ? 'heijunka-accuracy-pill--ok' : 'heijunka-accuracy-pill--ng'}`}>
                          Kanban Accuracy: {kanbanAccuracyByCycle[range.cycle].text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TABLE DETAIL */}
      <div className="table-card">
        <div className="table-header-row">
          <span className="table-title">Pulling Activities Detail</span>
          <div className="table-action-group">
            <button className="btn-import-excel" type="button">Import to Excel</button>
            {user?.role === 'admin' && (
              <button className="btn-new-data" type="button" onClick={openNewModal}>+ New</button>
            )}
          </div>
        </div>

        <div className="table-scroll-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Cycle</th><th>Line ID</th><th>Pulling Schedule</th><th>Start Pulling</th>
                <th>Finish Pulling</th><th>Pulling Time</th><th>Status Pulling</th>
                <th>Kanban Accuracy</th><th>Problem code</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {/* 1. Kondisi saat sedang Loading */}
              {loading && (
                <tr><td colSpan="10">Memuat data...</td></tr>
              )}

              {/* 2. Kondisi saat Loading selesai, tapi data kosong */}
              {!loading && tableRows.length === 0 && (
                <tr><td colSpan="10">Tidak ada aktivitas pulling untuk produk ini</td></tr>
              )}

              {/* 3. Kondisi saat Loading selesai dan data tersedia */}
              {!loading && tableRows.length > 0 && tableRows.map((row, index) => {
                const statusInfo = getStatusPullingInfo(row);
                return (
                  <tr key={row.counting_id || row.id || `tb-${index}`}>
                    <td style={{ fontWeight: 'bold' }}>{row.cycle_no || '-'}</td>
                    <td>{row.line_id || '-'}</td>
                    <td className="schedule-cell">{getPullingScheduleText(scheduleRanges.find(r => r.cycle === Number(row.cycle_no)) || row)}</td>
                    <td style={{ color: '#2563eb', fontWeight: '500' }}>{formatTableTimeWib(row.actual_start || row.start)}</td>
                    <td style={{ color: '#059669', fontWeight: '500' }}>{formatTableTimeWib(row.actual_finish || row.finish)}</td>
                    <td style={{ fontWeight: 'bold' }}>{formatPullingTime(row.duration_sec || row.duration)}</td>
                    <td><span className={statusInfo.className}>{statusInfo.text}</span></td>
                    <td><span className="kanban-accuracy-text">{kanbanAccuracyByCycle[Number(row.cycle_no)]?.text || '-'}</span></td>
                    <td>{row.problem_code || '-'}</td>
                    <td>
                      {user?.role === 'admin' ? (
                        <div className="table-row-action">
                          <button className="btn-edit-row" type="button" onClick={() => openEditModal(row)}>Edit</button>
                          <button className="btn-delete-row" type="button" onClick={() => deleteCounting(row)}>Delete</button>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '13px' }}>View Only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="counting-modal">
            <div className="modal-head">
              <h3>{modalMode === 'new' ? '+ New Counting Data' : 'Edit Counting Data'}</h3>
              <button className="modal-close-btn" type="button" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-form">
              <div className="form-group">
                {/* S6853: HtmlFor dan ID ditambahkan pada Form Elements */}
                <label htmlFor="inputCycleNo">Cycle</label>
                <select id="inputCycleNo" value={formData.cycle_no} onChange={(e) => handleFormChange('cycle_no', e.target.value)}>
                  <option value="" disabled>Pilih Cycle...</option>
                  {scheduleRanges.length > 0 ? scheduleRanges.map((range) => (
                    <option key={`opt-${range.cycle}`} value={range.cycle}>Cycle {range.cycle} | {range.displayStart} - {range.displayFinish}</option>
                  )) : Array.from({length: 36}, (_, i) => (
                    <option key={`opt-${i+1}`} value={i+1}>Cycle {i+1}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="inputActualStart">Start Pulling</label>
                  <input id="inputActualStart" type="datetime-local" step="1" value={formData.actual_start} onChange={(e) => handleFormChange('actual_start', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="inputActualFinish">Finish Pulling</label>
                  <input id="inputActualFinish" type="datetime-local" step="1" value={formData.actual_finish} onChange={(e) => handleFormChange('actual_finish', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="inputProblemCode">Problem code</label>
                <div className="quick-tags">
                  {quickProblems.map(tag => (
                    // S6848 / S1082: Penggunaan button asli
                    <button 
                      type="button"
                      key={tag} 
                      className={`tag-btn ${formData.problem_code === tag ? 'active' : ''}`} 
                      onClick={() => handleFormChange('problem_code', tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <textarea id="inputProblemCode" value={formData.problem_code} onChange={(e) => handleFormChange('problem_code', e.target.value)} placeholder="Isi problem code dari operator atau ketuk opsi di atas..." />
              </div>
            </div>

            <div className="modal-action">
              <button className="btn-cancel-modal" type="button" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="btn-save-modal" type="button" onClick={submitCountingForm} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;