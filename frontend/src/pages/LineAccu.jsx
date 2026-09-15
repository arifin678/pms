import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis, ReferenceLine, Tooltip
} from 'recharts';
import { Calendar, Clock, User } from 'lucide-react';
import './LineAccu.css';

const API_BASE_URL = 'http://localhost:5000';
const LINE_OPTIONS = ['VCT', 'Alternator', 'Starter', 'AISS', 'ACGs', 'ECU 4W', 'ECU 2W', 'ECU EFI'];

// Helper Formatting
const pad2 = (num) => String(num).padStart(2, '0');
const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// S7773: Menggunakan Number.isNaN()
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

// Logika Warna
const getAccuColor = (status) => {
  if (status === 'MATCH') return '#22c55e'; 
  if (status === 'SHORTAGE') return '#ef4444'; 
  if (status === 'OVER') return '#eab308'; 
  return '#e5e7eb'; 
};

// COMPONENT PENDUKUNG CHART
const StandardLineLabel = ({ viewBox, value, color }) => {
  if (!viewBox) return null;
  return (
    <text x={viewBox.x + viewBox.width + 10} y={viewBox.y} textAnchor="start" dominantBaseline="middle" className="std-reference-label-text" fill={color}>
      {value}
    </text>
  );
};

const AccuCustomTooltip = ({ active, payload }) => {
  // S6582: Menggunakan Optional Chaining
  if (active && payload?.length) {
    const data = payload[0].payload;
    if (data.status === 'NO_DATA') return null;

    return (
      <div className="accu-tooltip-container">
        <div className="accu-tooltip-header">
          <strong>Cycle {data.cycleLabel}</strong>
          <span>⏱ {data.scheduleTime}</span>
        </div>
        
        {data.status === 'MATCH' && (
          <div className="accu-tooltip-body match">
            <span>✅ MATCH ({data.scanQty}/{data.planQty})</span>
          </div>
        )}
        
        {data.status === 'SHORTAGE' && (
          <div className="accu-tooltip-body shortage">
            <div className="status-title">⚠️ OPEN ({data.scanQty}/{data.planQty})</div>
            <table className="tooltip-table">
              <tbody>
                {data.details.filter(d => d.type === 'OPEN').map((d) => (
                  // S6479: Menggunakan key dari partNo
                  <tr key={`shortage-${d.partNo}`}>
                    <td>{d.partNo}</td>
                    <td className="qty">{d.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.status === 'OVER' && (
          <div className="accu-tooltip-body over">
            <div className="status-title">🔼 SURPLUS ({data.scanQty}/{data.planQty})</div>
            <table className="tooltip-table">
              <tbody>
                {data.details.filter(d => d.type === 'SURPLUS').map((d) => (
                  // S6479: Menggunakan key dari partNo
                  <tr key={`over-${d.partNo}`}>
                    <td>{d.partNo}</td>
                    <td className="qty">{d.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const AccuBarLabel = (props) => {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  
  const cx = x + width / 2;
  const cy = height > 55 ? y + height / 2 : y - 24; 
  const textAnchor = height > 55 ? "middle" : "start";

  return (
    <text x={cx} y={cy} textAnchor={textAnchor} dominantBaseline="central" className="accu-bar-label" transform={`rotate(-90 ${cx} ${cy})`}>
      {value}
    </text>
  );
};

// COMPONENT SHIFT CHART CARD
const AccuShiftChartCard = ({ title, startTime, finishTime, data }) => {
  const matchCount = data.filter(d => d.status === 'MATCH').length;
  const openCount = data.filter(d => d.status === 'SHORTAGE').length;
  const surplusCount = data.filter(d => d.status === 'OVER').length;

  const dataMaxPlan = Math.max(0, ...data.map(d => d.planQty || 0));
  const dataMaxScan = Math.max(0, ...data.map(d => d.scanQty || 0));
  
  const targetLineQty = dataMaxPlan > 0 ? dataMaxPlan : 20;
  const highestValue = Math.max(targetLineQty, dataMaxScan);
  const yAxisDomain = [0, Math.ceil(highestValue + (highestValue * 0.25))]; 

  return (
    <section className="la-shift-chart-card">
      <div className="la-shift-chart-head">
        <div className="la-shift-time-line"></div>
        <span className="la-shift-time-label">{startTime}</span>

        <div className="la-shift-center-group">
          <h2 className="la-shift-title-center">{title}</h2>
          <div className="la-legend-group">
            <span className="la-legend-item match"><span className="dot"></span> MATCH <strong>{matchCount}</strong></span>
            <span className="la-legend-item open"><span className="dot"></span> OPEN <strong>{openCount}</strong></span>
            <span className="la-legend-item surplus"><span className="dot"></span> SURPLUS <strong>{surplusCount}</strong></span>
          </div>
        </div>

        <span className="la-shift-time-label">{finishTime}</span>
      </div>

      <div className="la-shift-chart-body">
        <ResponsiveContainer width="100%" height="100%" debounce={80}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: -20, bottom: 5 }} barCategoryGap="15%">
            <YAxis domain={yAxisDomain} axisLine={false} tickLine={false} tick={{ fontSize: 13, fontWeight: 600, fill: '#1e293b' }} />
            <XAxis dataKey="cycleLabel" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 12.5, fontWeight: 600, fill: '#1e293b' }} tickMargin={8} />
            <Tooltip content={<AccuCustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            
            <ReferenceLine 
              y={targetLineQty} 
              stroke="#3b82f6" 
              strokeWidth={1.5} 
              strokeDasharray="4 4" 
              ifOverflow="extendDomain" 
              label={<StandardLineLabel value={`${targetLineQty} QTY`} color="#3b82f6" />} 
            />

            <Bar dataKey="scanQty" radius={[4, 4, 0, 0]} maxBarSize={36}>
              <LabelList dataKey="barLabel" content={<AccuBarLabel />} />
              {data.map((item) => (
                // S6479: Menggunakan item.sequenceNo sebagai key unik
                <Cell key={`bar-${item.sequenceNo}`} fill={getAccuColor(item.status)} opacity={item.status === 'NO_DATA' ? 0.0 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

// MAIN COMPONENT LINE ACCU
const LineAccu = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const { lineName } = useParams();
  
  const queryParams = new URLSearchParams(location.search);
  const urlDate = queryParams.get('date');
  
  const [selectedLine, setSelectedLine] = useState(decodeURIComponent(lineName || 'Alternator'));
  const [selectedDate, setSelectedDate] = useState(urlDate || getTodayKey());

  const [currentTime, setCurrentTime] = useState(new Date());
  const [heijunkaData, setHeijunkaData] = useState([]);
  const [scansData, setScansData] = useState([]);
  const [masterSchedule, setMasterSchedule] = useState({ SHIFT_1: {}, SHIFT_2: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const fetchAccuData = async () => {
      try {
        setLoading(true);
        const safeLine = encodeURIComponent(selectedLine);

        const [heijunkaRes, scansRes, scheduleRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/heijunka?product=${safeLine}&date=${selectedDate}`),
          fetch(`${API_BASE_URL}/api/scans?product=${safeLine}&date=${selectedDate}`),
          fetch(`${API_BASE_URL}/api/master-schedule`)
        ]);

        const heijunkaJson = heijunkaRes.ok ? await heijunkaRes.json() : [];
        const scansJson = scansRes.ok ? await scansRes.json() : [];
        const scheduleJson = scheduleRes.ok ? await scheduleRes.json() : [];

        if (!isCancelled) {
          setHeijunkaData(Array.isArray(heijunkaJson) ? heijunkaJson : []);
          setScansData(Array.isArray(scansJson) ? scansJson : []);

          if (Array.isArray(scheduleJson) && scheduleJson.length > 0) {
            const formattedSchedule = { SHIFT_1: {}, SHIFT_2: {} };
            scheduleJson.forEach(item => {
              if (formattedSchedule[item.shift_name]) {
                formattedSchedule[item.shift_name][item.cycle_no] = [item.start_time, item.finish_time];
              }
            });
            setMasterSchedule(formattedSchedule);
          }
          setLoading(false);
        }
      } catch (error) {
        // S2486: Menangani error pada block catch
        console.error('Fetch Accu Data Error:', error.message);
        if (!isCancelled) setLoading(false);
      }
    };

    fetchAccuData();
    const interval = setInterval(fetchAccuData, 5000); 
    return () => { isCancelled = true; clearInterval(interval); };
  }, [selectedLine, selectedDate]);

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    navigate(`/line-accu/${encodeURIComponent(selectedLine)}?date=${newDate}`, { replace: true });
  };

  const cycleData = useMemo(() => {
    const cycleMap = {};
    for (let i = 1; i <= 72; i++) {
      cycleMap[i] = { planTotal: 0, scanTotal: 0, parts: {} };
    }

    heijunkaData.forEach(row => {
      const shift = String(row.shift_name).toUpperCase();
      const isNight = shift === 'SHIFT_2' || shift.includes('MALAM');
      const cycleNo = Number(row.cycle_no);
      if (!cycleNo) return;
      
      const absCycle = isNight ? cycleNo + 36 : cycleNo;
      if (absCycle > 72 || absCycle < 1) return;

      const pn = String(row.pn_code || 'UNKNOWN').trim().toUpperCase(); 
      const qty = Number(row.plan_qty || row.qty || 0);

      if (!cycleMap[absCycle].parts[pn]) cycleMap[absCycle].parts[pn] = { plan: 0, scan: 0 };
      cycleMap[absCycle].parts[pn].plan += qty;
      cycleMap[absCycle].planTotal += qty;
    });

    scansData.forEach(row => {
      const shift = String(row.shift_name).toUpperCase();
      const isNight = shift === 'SHIFT_2' || shift.includes('MALAM');
      const cycleNo = Number(row.cycle_no);
      if (!cycleNo) return;
      
      const absCycle = isNight ? cycleNo + 36 : cycleNo;
      if (absCycle > 72 || absCycle < 1) return;

      const pn = String(row.pn_code || 'UNKNOWN').trim().toUpperCase(); 
      const qty = Number(row.scan_qty || row.qty || 1);

      if (!cycleMap[absCycle].parts[pn]) cycleMap[absCycle].parts[pn] = { plan: 0, scan: 0 };
      cycleMap[absCycle].parts[pn].scan += qty;
      cycleMap[absCycle].scanTotal += qty;
    });

    const baseTimeShift1 = new Date(); baseTimeShift1.setHours(7, 35, 0, 0);
    const baseTimeShift2 = new Date(); baseTimeShift2.setHours(21, 5, 0, 0);

    return Array.from({ length: 72 }, (_, index) => {
      const seq = index + 1;
      const isShift1 = seq <= 36;
      const shiftName = isShift1 ? 'SHIFT_1' : 'SHIFT_2';
      const localCycleNo = isShift1 ? seq : seq - 36;

      const activeScheduleFallback = isShift1 ? masterSchedule.SHIFT_1 : masterSchedule.SHIFT_2;
      const times = activeScheduleFallback[localCycleNo];
      let scheduleTimeStr = '-';
      
      // S6582: Menggunakan Optional Chaining
      if (times?.[0] && times?.[1]) {
        scheduleTimeStr = `${times[0].substring(0, 5).replace(':', '.')} - ${times[1].substring(0, 5).replace(':', '.')}`;
      } else {
        const baseTime = isShift1 ? baseTimeShift1 : baseTimeShift2;
        const cycleIndex = localCycleNo - 1;
        const cycleStart = new Date(baseTime.getTime() + (cycleIndex * 13 * 60000));
        const cycleEnd = new Date(baseTime.getTime() + ((cycleIndex + 1) * 13 * 60000));
        scheduleTimeStr = `${pad2(cycleStart.getHours())}.${pad2(cycleStart.getMinutes())} - ${pad2(cycleEnd.getHours())}.${pad2(cycleEnd.getMinutes())}`;
      }

      const cData = cycleMap[seq];
      let status = 'NO_DATA';
      let details = [];

      if (cData.planTotal > 0 || cData.scanTotal > 0) {
        status = 'MATCH';
        Object.keys(cData.parts).forEach(pn => {
          const p = cData.parts[pn].plan;
          const s = cData.parts[pn].scan;

          if (s < p) {
            status = 'SHORTAGE'; 
            details.push({ partNo: pn, qty: p - s, type: 'OPEN', schedule: scheduleTimeStr });
          } else if (s > p) {
            if (status !== 'SHORTAGE') status = 'OVER'; 
            details.push({ partNo: pn, qty: s - p, type: 'SURPLUS', schedule: scheduleTimeStr });
          }
        });
      }

      let pct = cData.planTotal > 0 ? (cData.scanTotal / cData.planTotal) * 100 : 0;
      // S7766: Menggunakan Math.min() untuk Ternary
      const visualPct = Math.min(110, pct); 
      const barLabel = cData.planTotal > 0 ? `${cData.scanTotal} / ${cData.planTotal}` : '';

      return { 
        sequenceNo: localCycleNo, cycleLabel: String(localCycleNo), shiftName: shiftName, 
        scheduleTime: scheduleTimeStr, planQty: cData.planTotal, scanQty: cData.scanTotal, 
        status, pct: visualPct, details, barLabel 
      };
    });
  }, [heijunkaData, scansData, masterSchedule]);

  const dayShiftData = useMemo(() => cycleData.filter((item) => item.shiftName === 'SHIFT_1'), [cycleData]);
  const nightShiftData = useMemo(() => cycleData.filter((item) => item.shiftName === 'SHIFT_2'), [cycleData]);
  
  const summary = useMemo(() => {
    let totalPlan = 0;
    let totalScan = 0;
    let historyAbnormal = []; 
    let summaryAbnormalParts = {}; 

    cycleData.forEach(cycle => {
      if (cycle.planQty > 0) {
        totalPlan += cycle.planQty;
        totalScan += cycle.scanQty; 
      }

      if ((cycle.status === 'SHORTAGE' || cycle.status === 'OVER') && cycle.details.length > 0) {
        cycle.details.forEach(part => {
          if (part.type === 'OPEN' || part.type === 'SURPLUS') {
            historyAbnormal.push({
              cycle: cycle.sequenceNo,
              progres: `${cycle.scanQty}/${cycle.planQty}`,
              partNo: part.partNo,
              qty: part.qty,
              schedule: part.schedule,
              type: part.type
            });

            const key = `${part.partNo}|${part.schedule}|${part.type}`;
            if (summaryAbnormalParts[key]) {
              summaryAbnormalParts[key].qty += part.qty;
            } else {
              summaryAbnormalParts[key] = { partNo: part.partNo, qty: part.qty, schedule: part.schedule, type: part.type };
            }
          }
        });
      }
    });

    const accuracyPct = totalPlan > 0 ? (totalScan / totalPlan) * 100 : 0;
    const topAbnormalList = Object.values(summaryAbnormalParts);

    return {
      // S7766: Menggunakan Math.min() untuk Ternary
      accuracyPct: Math.min(100, accuracyPct), 
      totalPlan,
      totalScan,
      historyAbnormal,
      topAbnormalList
    };
  }, [cycleData]);

  return (
    <div className="line-accu-page">
      
      <div className="header-container">
        <div className="header-left-group">
          <button className="la-back-button" onClick={() => navigate('/')}>‹</button>
          <h1 className="header-title">DASHBOARD PULLING ACCURACY</h1>
        </div>
        <div className="header-right-group">
          
          <div className="header-slicer-group">
            <label className="la-slicer-compact">
              <span className="la-slicer-label">SLICER LINE</span>
              <select className="la-slicer-input" value={selectedLine} onChange={(e) => { setSelectedLine(e.target.value); navigate(`/line-accu/${encodeURIComponent(e.target.value)}`, { replace: true }); }}>
                {LINE_OPTIONS.map(line => <option key={line} value={line}>{line}</option>)}
              </select>
            </label>
            <div className="slicer-divider"></div>
            <label className="la-slicer-compact">
              <span className="la-slicer-label">SLICER DATE</span>
              <input className="la-slicer-input" type="date" value={selectedDate} onChange={handleDateChange} />
            </label>
          </div>

          <div className="header-badge"><Calendar size={16} color="#3b82f6" />{formatActualDate(currentTime)}</div>
          <div className="header-badge header-badge--time"><Clock size={16} />{formatActualTime(currentTime)}</div>
          <div className="header-badge"><User size={16} color="#64748b" />Morning Shift</div>
        </div>
      </div>

      <div className="la-split-wrapper">
        <div className="la-shape-box la-shape-box--blue la-left-col">
          <h2 className="la-half-title">Detail by Cycle</h2>
          <div className="la-charts-container">
            <AccuShiftChartCard title="DAY SHIFT - Multiple PICs" startTime="07.35" finishTime="15.36" data={dayShiftData} />
            <AccuShiftChartCard title="NIGHT SHIFT" startTime="21.05" finishTime="04.52" data={nightShiftData} />
          </div>
        </div>

        <div className="la-right-col">
          <div className="la-shape-box la-shape-box--green la-kpi-card-shape">
            <h3 className="la-half-title">Akurasi Kanban</h3>
            <div className="la-kpi-split">
              
              <div className="la-kpi-donut-area">
                <div className="la-donut-large" style={{ '--val': `${summary.accuracyPct}%` }}>
                  <span>{summary.totalPlan > 0 ? formatPercent(summary.accuracyPct) : '-'}</span>
                </div>
                {/* S6772: Merapikan spacing teks */}
                <div className="la-cycle-ok-badge">
                  <span className="dot"></span> Kanban OK <strong>{summary.totalScan}/{summary.totalPlan}</strong>
                </div>
              </div>

              {/* TABEL ATAS SCROLLABLE */}
              <div className="la-open-part-area">
                <div className="la-open-part-header">PART NO. ABNORMAL</div>
                <div className="la-open-part-table-wrap">
                  <table className="la-open-part-table">
                    <thead>
                      <tr>
                        <th className="col-no">NO</th>
                        <th className="col-pn">PART NUMBER</th>
                        <th className="col-qty">QTY (STATUS)</th>
                        <th className="col-schedule">SCHEDULE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topAbnormalList.map((item, idx) => (
                        // S6479: Menggunakan key partNo
                        <tr key={`top-ab-${item.partNo}`}>
                          <td>{idx + 1}</td>
                          <td className="text-left">{item.partNo}</td>
                          <td style={{ color: item.type === 'SURPLUS' ? '#eab308' : '#dc2626', fontWeight: 900 }}>
                            {item.qty} {item.type === 'SURPLUS' ? '(Over)' : '(Open)'}
                          </td>
                          <td>{item.schedule}</td>
                        </tr>
                      ))}
                      {summary.topAbnormalList.length === 0 && !loading && (
                        <tr><td colSpan="4" style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px' }}>Semua Part Terpenuhi Normal</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>

          {/* TABEL BAWAH SCROLLABLE */}
          <div className="la-shape-box la-shape-box--red la-history-card-shape">
            <h3 className="la-half-title">HISTORY ABNORMAL KANBAN</h3>
            <div className="la-history-table-wrap">
              <table className="la-history-table">
                <thead>
                  <tr>
                    <th className="col-no">NO</th>
                    <th className="col-cycle">Cycle</th>
                    <th className="col-progres">Progres</th>
                    <th className="col-pn">Part Number</th>
                    <th className="col-qty">QTY (STATUS)</th>
                    <th className="col-schedule">Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.historyAbnormal.map((item, idx) => (
                    // S6479: Key gabungan karena partNo bisa berulang
                    <tr key={`hist-${item.cycle}-${item.partNo}`}>
                      <td>{idx + 1}</td>
                      <td>{item.cycle}</td>
                      <td>{item.progres}</td>
                      <td className="text-left">{item.partNo}</td>
                      <td style={{ color: item.type === 'SURPLUS' ? '#eab308' : '#dc2626', fontWeight: 900 }}>
                        {item.qty} {item.type === 'SURPLUS' ? '(Over)' : '(Open)'}
                      </td>
                      <td>{item.schedule}</td>
                    </tr>
                  ))}
                  {summary.historyAbnormal.length === 0 && !loading && (
                    <tr>
                      <td colSpan="6" className="empty-text">Tidak ada anomali Kanban (semua normal).</td>
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

export default LineAccu;