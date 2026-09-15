import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import { Calendar, Clock, User } from 'lucide-react';
import './LineSummary.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const EIGHT_MINUTE_SEC = 8 * 60;
const THIRTEEN_MINUTE_SEC = 13 * 60;

const LINE_OPTIONS = ['VCT', 'Alternator', 'Starter', 'AISS', 'ACGs', 'ECU 4W', 'ECU 2W', 'ECU EFI'];

// Helper Formatting
const pad2 = (num) => String(num).padStart(2, '0');
const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const formatDuration = (seconds) => {
  if (!seconds) return '-';
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}' ${pad2(total % 60)}"`;
};
const formatDurationBarLabel = (seconds) => {
  if (!seconds) return '';
  const total = Math.round(Number(seconds));
  return `${Math.floor(total / 60)} Min ${pad2(total % 60)} Sec`;
};

// S7773: Menggunakan Number.isNaN() strict
const formatPercent = (value) => (value == null || Number.isNaN(Number(value)) ? '-' : `${Number(value).toFixed(1)}%`);

const formatActualDate = (date) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const formatActualTime = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const formatTimeOnly = (dateStr) => {
  if (!dateStr) return '-';
  
  if (typeof dateStr === 'string' && /^\d{2}:\d{2}(:\d{2})?/.test(dateStr)) {
    return dateStr.substring(0, 5).replace(':', '.'); 
  }
  
  const d = new Date(dateStr);
  // S7773: Pengecekan tanggal invalid yang aman
  if (Number.isNaN(d.getTime())) return '-';
  return `${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
};

const getStatusColor = (status) => {
  if (status === 'ABNORMAL') return '#ef4444'; 
  if (status === 'DELAY') return '#ef4444'; 
  if (status === 'NORMAL') return '#22c55e'; 
  return '#e5e7eb'; 
};

const formatProblemCode = (code) => {
  if (!code) return '-';
  return code.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

// =================================================================================
// LOGIKA PEMROSESAN DATA (DIEKSTRAK KE LUAR UNTUK MENGHINDARI COGNITIVE COMPLEXITY)
// =================================================================================

const generateEmptySkeleton = () => {
  const baseTimeShift1 = new Date(); baseTimeShift1.setHours(7, 35, 0, 0);
  const baseTimeShift2 = new Date(); baseTimeShift2.setHours(21, 5, 0, 0);

  return Array.from({ length: 72 }, (_, index) => {
    const seq = index + 1;
    const isShift1 = seq <= 36;
    const shiftName = isShift1 ? 'SHIFT_1' : 'SHIFT_2';
    
    const baseTime = isShift1 ? baseTimeShift1 : baseTimeShift2;
    const cycleIndex = isShift1 ? seq - 1 : seq - 37;
    const cycleStart = new Date(baseTime.getTime() + (cycleIndex * 13 * 60000));
    const cycleEnd = new Date(baseTime.getTime() + ((cycleIndex + 1) * 13 * 60000));
    const scheduleTimeStr = `${pad2(cycleStart.getHours())}.${pad2(cycleStart.getMinutes())} - ${pad2(cycleEnd.getHours())}.${pad2(cycleEnd.getMinutes())}`;

    return {
      sequenceNo: seq, cycleLabel: String(seq), shiftName,
      targetSec: THIRTEEN_MINUTE_SEC, actualSec: 0, status: 'NO_DATA', isOpen: false,
      problemNote: '-', scheduleTime: scheduleTimeStr,
      actualStartStr: '-', actualFinishStr: '-', durationStr: ''
    };
  });
};

// HELPER BARU 1: Menentukan Indeks Slot (Memotong percabangan kompleks)
const getSlotIndex = (isNight, dayCounter, nightCounter) => {
  if (isNight) {
    return nightCounter < 36 ? { index: 36 + nightCounter, isValid: true } : { isValid: false };
  }
  return dayCounter < 36 ? { index: dayCounter, isValid: true } : { isValid: false };
};

// HELPER BARU 2: Menentukan Status Final (Memotong if-else bertingkat)
const determineFinalStatus = (rowStatus, isOpen, actualSec) => {
  if (rowStatus) return rowStatus;
  if (isOpen) return 'OPEN';
  if (actualSec > 0) return 'NORMAL';
  return 'NO_DATA';
};

const processMonitoringRows = (skeleton, monitoringRows) => {
  if (!monitoringRows?.length) return skeleton;

  const validRows = monitoringRows.filter(row => row.actual_start || row.start || Number(row.duration_sec) > 0);
  const sortedRows = [...validRows].sort((a, b) => new Date(a.actual_start || a.start).getTime() - new Date(b.actual_start || b.start).getTime());

  let dayCounter = 0;
  let nightCounter = 0;

  sortedRows.forEach((row) => {
    const shift = String(row.shift_name || row.shift || 'SHIFT_1').toUpperCase();
    const isNight = shift === 'SHIFT_2' || shift.includes('MALAM');

    // Menggunakan helper pemosisian slot
    const slotInfo = getSlotIndex(isNight, dayCounter, nightCounter);
    if (!slotInfo.isValid) return; // Skip jika slot shift penuh (melebihi 36)

    if (isNight) nightCounter++; else dayCounter++;

    const actualSec = Number(row.duration_sec ?? row.duration ?? row.actual_duration_sec ?? 0);
    const isOpen = Boolean((row.actual_start || row.start) && !(row.actual_finish || row.finish));

    // Menggunakan helper penentuan status
    const status = determineFinalStatus(row.status || row.status_pulling, isOpen, actualSec);

    let mappedProblem = 'NORMAL';
    if (status === 'ABNORMAL' || status === 'DELAY') {
       mappedProblem = row.problem_code ? formatProblemCode(row.problem_code) : (row.problem_note || row.problemNote || '-');
    }

    const startVal = row.actual_start || row.start;
    const finishVal = row.actual_finish || row.finish;

    skeleton[slotInfo.index] = {
      ...skeleton[slotInfo.index],
      actualSec, status, isOpen,
      problemNote: mappedProblem,
      sequenceNo: isNight ? nightCounter : dayCounter,
      actualStartStr: startVal ? formatTimeOnly(startVal) : '-',
      actualFinishStr: finishVal ? formatTimeOnly(finishVal) : '-',
      durationStr: formatDurationBarLabel(actualSec)
    };
  });

  return skeleton;
};

// =================================================================================
// SUB COMPONENTS CHARTS
// =================================================================================

const SummaryCustomTooltip = ({ active, payload }) => {
  // S6582: Optional Chaining diaktifkan
  if (active && payload?.length) {
    const data = payload[0].payload;
    if (data.status === 'NO_DATA') return null;

    const isOk = data.status === 'NORMAL';
    const statusColor = isOk ? '#16a34a' : '#dc2626';
    const statusText = isOk ? 'NORMAL' : data.problemNote;

    return (
      <div className="ls-tooltip-container">
        <div className="ls-tooltip-header">
          <strong>Cycle {data.cycleLabel}</strong>
          <span className="ls-tooltip-status" style={{ color: statusColor }}>
            {isOk ? '✅ ' : '⚠️ '}{statusText}
          </span>
        </div>
        <div className="ls-tooltip-body">
          {/* S5256: Penggunaan th scope=row untuk mendefinisikan Table Header yang valid */}
          <table className="ls-tooltip-table">
            <tbody>
              <tr><th scope="row" className="text-left">Duration</th><td className="val">{data.durationStr}</td></tr>
              <tr><th scope="row" className="text-left">Schedule</th><td className="val">{data.scheduleTime}</td></tr>
              <tr><th scope="row" className="text-left">Actual</th><td className="val">{data.actualStartStr} - {data.actualFinishStr}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return null;
};

const BarDurationLabel = ({ x, y, width, height, value }) => {
  if (!value) return null;
  const cx = x + width / 2;
  const cy = height > 55 ? y + height - 12 : y + height / 2;
  const anchor = height > 55 ? 'start' : 'middle';
  
  return (
    <text x={cx} y={cy} textAnchor={anchor} dominantBaseline="central" className="bar-duration-label" transform={`rotate(-90 ${cx} ${cy})`}>
      {value}
    </text>
  );
};

const StandardLineLabel = ({ viewBox, value, color }) => {
  if (!viewBox) return null;
  return (
    <text x={viewBox.x + viewBox.width + 10} y={viewBox.y} textAnchor="start" dominantBaseline="middle" className="std-reference-label-text" fill={color}>
      {value}
    </text>
  );
};

const ShiftChartCard = ({ title, startTime, finishTime, data, performance, cycleOk, cycleNg, hasData }) => {
  // S3358: Logika Ternary bersarang diekstrak secara independen agar rapi
  let perfColor = '#94a3b8';
  if (hasData) {
    perfColor = performance >= 100 ? '#22c55e' : '#ef4444';
  }

  return (
    <section className="ls-shift-chart-card">
      <div className="ls-shift-chart-head">
        <div className="ls-shift-time-line"></div>
        <span className="ls-shift-time-label">{startTime}</span>
        
        <div className="ls-shift-center-head">
          <div className="ls-shift-cycle-badge ls-shift-cycle-badge--ok">
            <span className="dot"></span> Cycle OK: <strong>{hasData ? cycleOk : 0}</strong>
          </div>
          
          <h2>{title}</h2>
          
          <div className="ls-shift-cycle-badge ls-shift-cycle-badge--ng">
            <span className="dot"></span> Cycle NG: <strong>{hasData ? cycleNg : 0}</strong>
          </div>
        </div>
        
        <div className="ls-shift-perf-box">
          <span className="ls-shift-perf-label">Performance</span>
          <div className="ls-shift-perf-values">
            <span className="ls-shift-perf-pct" style={{ color: perfColor }}>
              {hasData ? formatPercent(performance) : '-'}
            </span>
          </div>
        </div>

        <span className="ls-shift-time-label">{finishTime}</span>
      </div>
      <div className="ls-shift-chart-body">
        <ResponsiveContainer width="100%" height="100%" debounce={80}>
          <BarChart data={data} margin={{ top: 20, right: 50, left: 0, bottom: 5 }} barCategoryGap="15%">
            <YAxis width={55} tickFormatter={formatDuration} domain={[0, 'dataMax + 90']} axisLine={false} tickLine={false} tick={{ fontSize: 13, fontWeight: 600, fill: '#1e293b' }} />
            <XAxis dataKey="cycleLabel" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 18, fontWeight: 600, fill: '#1e293b' }} tickMargin={8} />
            
            <Tooltip content={<SummaryCustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />

            <ReferenceLine y={THIRTEEN_MINUTE_SEC} stroke="#ef4444" strokeWidth={1.5} ifOverflow="extendDomain" label={<StandardLineLabel value="13 MIN" color="#ef4444" />} />
            <ReferenceLine y={EIGHT_MINUTE_SEC} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" ifOverflow="extendDomain" label={<StandardLineLabel value="8 MIN" color="#3b82f6" />} />

            <Bar dataKey="actualSec" radius={[4, 4, 0, 0]} maxBarSize={36}>
              <LabelList dataKey="durationStr" content={<BarDurationLabel />} />
              {data.map((item) => (
                // S6479: Menggunakan item.sequenceNo agar tidak menggunakan Array Index
                <Cell key={`bar-cell-${item.sequenceNo}`} fill={getStatusColor(item.status)} opacity={item.status === 'NO_DATA' ? 0.0 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

const calculateShiftMetrics = (shiftData) => {
  const hasData = shiftData.some(item => item.actualSec > 0);
  const countNg = shiftData.filter(item => item.status === 'ABNORMAL' || item.status === 'DELAY').length;
  const countOk = 36 - countNg;
  const performance = hasData ? (countOk / 36) * 100 : null;
  
  return { hasData, countNg, countOk, performance };
};

const calculateDurationStats = (cycleData) => {
  const closed = cycleData.filter(item => item.actualSec > 0 && !item.isOpen);
  const durations = closed.map(i => i.actualSec);
  
  if (!durations.length) return { avg: null, lowest: null, highest: null };
  
  return {
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    lowest: Math.min(...durations),
    highest: Math.max(...durations)
  };
};



// =================================================================================
// MAIN COMPONENT DASHBOARD (PAGE)
// =================================================================================

const LineSummary = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const { lineName } = useParams();
  
  const queryParams = new URLSearchParams(location.search);
  const urlDate = queryParams.get('date');
  
  const [selectedLine, setSelectedLine] = useState(decodeURIComponent(lineName || 'Alternator'));
  const [selectedDate, setSelectedDate] = useState(urlDate || getTodayKey());

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (urlDate && urlDate !== selectedDate) {
      setSelectedDate(urlDate);
    }
  }, [urlDate]);

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    navigate(`/line-summary/${encodeURIComponent(selectedLine)}?date=${newDate}`, { replace: true });
  };

  const [monitoringRows, setMonitoringRows] = useState([]);
  const [picOptions, setPicOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch API
  useEffect(() => {
    let isCancelled = false;
    const fetchSummaryData = async () => {
      try {
        setLoading(true);
        const safeLine = encodeURIComponent(selectedLine);
        
        const monRes = await fetch(`${API_BASE_URL}/api/monitoring?product=${safeLine}&date=${selectedDate}`);
        const monJson = monRes.ok ? await monRes.json() : [];

        const picRes = await fetch(`${API_BASE_URL}/api/pics`);
        const picJson = picRes.ok ? await picRes.json() : [];

        if (!isCancelled) {
          setMonitoringRows(Array.isArray(monJson) ? monJson : []);
          setPicOptions(Array.isArray(picJson) ? picJson : []);
        }
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchSummaryData();
    return () => { isCancelled = true; };
  }, [selectedLine, selectedDate]);

  const getShiftTitle = (isNight, baseTitle) => {
    const shiftRows = monitoringRows.filter((row) => {
      const shift = String(row.shift_name || row.shift || 'SHIFT_1').toUpperCase();
      const rowIsNight = shift === 'SHIFT_2' || shift.includes('MALAM');
      return rowIsNight === isNight;
    });

    const uniqueUserIds = [...new Set(shiftRows.map(r => r.user_id).filter(id => id != null && id !== ''))];
    if (uniqueUserIds.length === 0) return baseTitle;
    if (uniqueUserIds.length > 1) return `${baseTitle} - Multiple PICs`;

    const picId = String(uniqueUserIds[0]).trim();
    const picInfo = picOptions.find(p => String(p.user_id).trim() === picId);
    
    // S6582: Optional Chaining digunakan
    const picName = picInfo?.user_name || picId;

    return `${baseTitle} - ${picName}`;
  };

  const dayShiftTitle = useMemo(() => getShiftTitle(false, 'DAY SHIFT'), [monitoringRows, picOptions]);
  const nightShiftTitle = useMemo(() => getShiftTitle(true, 'NIGHT SHIFT'), [monitoringRows, picOptions]);

  // S3776: Pengurangan ekstrim Cognitive Complexity dengan memanggil fungsi eksternal
  const cycleData = useMemo(() => {
    const skeleton = generateEmptySkeleton();
    return processMonitoringRows(skeleton, monitoringRows);
  }, [monitoringRows]);

  const dayShiftData = useMemo(() => cycleData.filter((item) => item.shiftName !== 'SHIFT_2').slice(0, 36), [cycleData]);
  const nightShiftData = useMemo(() => cycleData.filter((item) => item.shiftName === 'SHIFT_2').slice(0, 36), [cycleData]);
  
  const problemCycleList = useMemo(() => cycleData.filter(item => item.status === 'ABNORMAL' || item.status === 'DELAY'), [cycleData]);

  // S3776: Cognitive Complexity turun drastis dengan memanggil fungsi eksternal
  const summary = useMemo(() => {
    const day = calculateShiftMetrics(dayShiftData);
    const night = calculateShiftMetrics(nightShiftData);
    const stats = calculateDurationStats(cycleData);

    let totalTarget = 0;
    if (day.hasData) totalTarget += 36;
    if (night.hasData) totalTarget += 36;
    if (totalTarget === 0) totalTarget = 36;

    let totalRed = 0;
    if (day.hasData) totalRed += day.countNg;
    if (night.hasData) totalRed += night.countNg;

    const hasAnyData = day.hasData || night.hasData;
    const totalAssumedOk = hasAnyData ? (totalTarget - totalRed) : 0;
    const pullingPerf = hasAnyData ? (totalAssumedOk / totalTarget) * 100 : null;

    return {
      hasDayData: day.hasData, 
      hasNightData: night.hasData, 
      pullingPerformance: pullingPerf, 
      totalAssumedOk, 
      totalTarget,
      dayPerformance: day.performance, 
      displayDayOk: day.countOk, 
      displayDayNg: day.countNg,
      nightPerformance: night.performance, 
      displayNightOk: night.countOk, 
      displayNightNg: night.countNg,
      ...stats
    };
  }, [cycleData, dayShiftData, nightShiftData]);

  return (
    <div className="line-summary-page">
      
      <div className="header-container">
        <div className="header-left-group">
          <button className="ls-back-button" onClick={() => navigate('/')}>‹</button>
          <h1 className="header-title">DASHBOARD PULLING PERFORMANCE</h1>
        </div>
        <div className="header-right-group">
          
          <div className="header-slicer-group">
            <label className="ls-slicer-compact">
              <span className="ls-slicer-label">SLICER LINE</span>
              <select className="ls-slicer-input" value={selectedLine} onChange={(e) => { setSelectedLine(e.target.value); navigate(`/line-summary/${encodeURIComponent(e.target.value)}`, { replace: true }); }}>
                {LINE_OPTIONS.map(line => <option key={line} value={line}>{line}</option>)}
              </select>
            </label>
            <div className="slicer-divider"></div>
            <label className="ls-slicer-compact">
              <span className="ls-slicer-label">SLICER DATE</span>
              <input className="ls-slicer-input" type="date" value={selectedDate} onChange={handleDateChange} />
            </label>
          </div>

          <div className="header-badge"><Calendar size={16} color="#3b82f6" />{formatActualDate(currentTime)}</div>
          <div className="header-badge header-badge--time"><Clock size={16} />{formatActualTime(currentTime)}</div>
          <div className="header-badge"><User size={16} color="#64748b" />Morning Shift</div>
        </div>
      </div>

      <div className="ls-split-wrapper">
        
        <div className="ls-shape-box ls-shape-box--blue ls-left-col">
          <h2 className="ls-half-title" style={{ fontSize: '24px' }}>Detail by Cycle</h2>
          <div className="ls-charts-container">
            <ShiftChartCard 
               title={dayShiftTitle} startTime="07.35" finishTime="15.36" 
               data={dayShiftData} performance={summary.dayPerformance} 
               cycleOk={summary.displayDayOk} cycleNg={summary.displayDayNg} hasData={summary.hasDayData}
            />
            <ShiftChartCard 
               title={nightShiftTitle} startTime="21.05" finishTime="04.52" 
               data={nightShiftData} performance={summary.nightPerformance} 
               cycleOk={summary.displayNightOk} cycleNg={summary.displayNightNg} hasData={summary.hasNightData}
            />
          </div>
        </div>

        <div className="ls-right-col">
          
          <div className="ls-shape-box ls-shape-box--green ls-kpi-card-shape">
            <h3 className="ls-half-title">Pulling Performance</h3>
            <div className="ls-kpi-split">
              
              <div className="ls-kpi-donut-area">
                <div className="ls-donut-large" style={{ '--val': `${summary.pullingPerformance || 0}%` }}>
                  <span>{summary.pullingPerformance !== null ? formatPercent(summary.pullingPerformance) : '-'}</span>
                </div>
                {/* S6772: Merapikan Spasi yang ambigu */}
                <div className="ls-cycle-ok-badge">
                  <span className="dot"></span> Cycle OK <strong>{summary.totalAssumedOk}/{summary.totalTarget}</strong>
                </div>
              </div>

              <div className="ls-kpi-pills-area">
                <div className="ls-pill-card ls-pill-card--red">
                  <div className="ls-pill-left"><span className="ls-pill-icon">⚠</span> HIGHEST PULLING TIME</div>
                  <strong>{formatDuration(summary.highest)}</strong>
                </div>
                <div className="ls-pill-card ls-pill-card--green">
                  <div className="ls-pill-left"><span className="ls-pill-icon">◴</span> AVG. PULLING TIME</div>
                  <strong>{formatDuration(summary.avg)}</strong>
                </div>
                <div className="ls-pill-card ls-pill-card--blue">
                  <div className="ls-pill-left"><span className="ls-pill-icon">↘</span> LOWEST PULLING TIME</div>
                  <strong>{formatDuration(summary.lowest)}</strong>
                </div>
              </div>

            </div>
          </div>

          <div className="ls-shape-box ls-shape-box--red ls-history-card-shape">
            <h3 className="ls-half-title">HISTORY RED CYCLE</h3>
            <div className="ls-history-table-wrap">
              <table className="ls-history-table">
                <thead>
                  <tr>
                    <th>NO</th>
                    <th>Cycle</th>
                    <th>Standart</th>
                    <th>Actual</th>
                    <th className="text-left">Problem Code</th>
                  </tr>
                </thead>
                <tbody>
                  {problemCycleList.map((item, idx) => (
                    // S6479: Menggunakan Key unik tanpa memanfaatkan indeks array secara langsung
                    <tr key={`red-history-${item.sequenceNo}`}>
                      <td>{idx + 1}</td>
                      <td>{item.sequenceNo}</td>
                      <td>13 Min</td>
                      <td>{formatDuration(item.actualSec)}</td>
                      <td className="text-left">{item.problemNote}</td>
                    </tr>
                  ))}
                  {problemCycleList.length === 0 && !loading && (
                    <tr>
                      <td colSpan="5" className="empty-text">Tidak ada History Red Cycle hari ini.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default LineSummary;