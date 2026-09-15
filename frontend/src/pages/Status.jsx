import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, UserRound, Loader2 } from 'lucide-react';
import './Status.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const LINE_OPTIONS = ['VCT', 'Alternator', 'Starter', 'AISS', 'ACGs', 'ECU 4W', 'ECU 2W', 'ECU EFI'];

// Helper Tanggal & Waktu
const pad2 = (num) => String(num).padStart(2, '0');

const getTodayKey = () => {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const getShiftName = () => {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'Shift Pagi' : 'Shift Malam';
};

const formatDateIndo = (date) => {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

const formatTime = (date) => {
  return date.toLocaleTimeString('id-ID', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

// =================================================================================
// HELPER LOGIKA PEMROSESAN DATA (EKSTRAKSI S3776 COGNITIVE COMPLEXITY)
// =================================================================================

const processCycleMap = (heijunkaData, scansData) => {
  const cycleMap = {};
  for (let i = 1; i <= 72; i++) cycleMap[i] = { parts: {} };

  (Array.isArray(heijunkaData) ? heijunkaData : []).forEach(row => {
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
  });

  (Array.isArray(scansData) ? scansData : []).forEach(row => {
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
  });

  return cycleMap;
};

const findOpenCycles = (cycleMap, formattedSchedule) => {
  const openItems = [];
  const baseTimeShift1 = new Date(); baseTimeShift1.setHours(7, 35, 0, 0);
  const baseTimeShift2 = new Date(); baseTimeShift2.setHours(21, 5, 0, 0);

  for (let seq = 1; seq <= 72; seq++) {
    const isShift1 = seq <= 36;
    const localCycleNo = isShift1 ? seq : seq - 36;
    
    const activeScheduleFallback = isShift1 ? formattedSchedule.SHIFT_1 : formattedSchedule.SHIFT_2;
    const times = activeScheduleFallback[localCycleNo];
    
    // S1854 & S6582: Optional Chaining digunakan untuk menghindari Useless Assignment
    let scheduleTimeStr;
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
    let isCycleOpen = false;

    Object.keys(cData.parts).forEach(pn => {
      if (cData.parts[pn].scan < cData.parts[pn].plan) {
        isCycleOpen = true;
      }
    });

    if (isCycleOpen) {
      openItems.push({
        customer: '-',
        cycleCustomer: '-',
        dept: '-',
        dateDlv: '-',
        status: 'OPEN',
        cyclePulling: `${localCycleNo} (${scheduleTimeStr})`
      });
    }
  }
  return openItems;
};

// =================================================================================
// MAIN COMPONENT STATUS
// =================================================================================

const Status = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [linesData, setLinesData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Jam Realtime
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Logic Terintegrasi dengan Akurasi Kanban (Plan vs Actual)
  useEffect(() => {
    let isCancelled = false;

    const fetchAllLinesData = async () => {
      try {
        const today = getTodayKey();
        
        const scheduleRes = await fetch(`${API_BASE_URL}/api/master-schedule`);
        const scheduleJson = scheduleRes.ok ? await scheduleRes.json() : [];
        const formattedSchedule = { SHIFT_1: {}, SHIFT_2: {} };
        
        if (Array.isArray(scheduleJson)) {
          scheduleJson.forEach(item => {
            if (formattedSchedule[item.shift_name]) {
              formattedSchedule[item.shift_name][item.cycle_no] = [item.start_time, item.finish_time];
            }
          });
        }

        // S3776: Logika pemetaan dipecah menggunakan Helpers
        const linePromises = LINE_OPTIONS.map(async (lineName) => {
          const safeLine = encodeURIComponent(lineName);
          const [hRes, sRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/heijunka?product=${safeLine}&date=${today}`),
            fetch(`${API_BASE_URL}/api/scans?product=${safeLine}&date=${today}`)
          ]);

          const heijunkaData = hRes.ok ? await hRes.json() : [];
          const scansData = sRes.ok ? await sRes.json() : [];

          const cycleMap = processCycleMap(heijunkaData, scansData);
          const openItems = findOpenCycles(cycleMap, formattedSchedule);

          return { productName: lineName, openItems };
        });

        const results = await Promise.all(linePromises);
        
        if (!isCancelled) {
          setLinesData(results);
          setLoading(false);
        }
      } catch (error) {
        console.error('Gagal mengambil data akurasi:', error.message);
        if (!isCancelled) setLoading(false);
      }
    };

    fetchAllLinesData();
    const interval = setInterval(fetchAllLinesData, 5000); // Sinkronisasi setiap 5 detik
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleCardClick = (productName) => {
    navigate(`/line-accu/${encodeURIComponent(productName)}`);
  };

  return (
    <div className="status-page-container">
      
      <header className="status-header">
        <h1 className="status-title">
          PREPARATION PULLING STATUS
          {loading && <Loader2 size={20} className="spin-icon" style={{ color: '#3b82f6', marginLeft: '10px' }} />}
        </h1>

        <div className="status-header-right">
          <div className="status-info-pill status-date-pill">
            <CalendarDays size={16} />
            <span>{formatDateIndo(now)}</span>
          </div>

          <div className="status-info-pill status-time-pill">
            <Clock3 size={16} />
            <span>{formatTime(now)}</span>
          </div>

          <div className="status-info-pill status-shift-pill">
            <UserRound size={16} />
            <span>{getShiftName()}</span>
          </div>
        </div>
      </header>

      <div className="status-grid">
        {linesData.length === 0 && !loading && LINE_OPTIONS.map(line => (
           <div key={line} className="status-card">
              <div className="status-card-header"><h2>{line}</h2><span className="card-badge card-badge--close">CLOSE</span></div>
           </div>
        ))}

        {linesData.map((line) => {
          const hasOpenItems = line.openItems.length > 0;
          
          const formattedTitle = line.productName
            .toUpperCase()
            .split(' ') 
            .map(word => word.split('').join(' ')) 
            .join(' \u00A0\u00A0 '); 
          
          return (
            // S6848 & S1082: Penggunaan button asli untuk elemen interaktif
            <button 
              type="button"
              key={line.productName} 
              className="status-card" 
              onClick={() => handleCardClick(line.productName)}
              style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer' }}
            >
              <div className="status-card-header">
                <h2>{formattedTitle}</h2>
                {hasOpenItems ? (
                  <span className="card-badge card-badge--open">OPEN</span>
                ) : (
                  <span className="card-badge card-badge--close">CLOSE</span>
                )}
              </div>

              <div className="status-table-wrapper">
                <table className="status-mini-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>CUSTOMER</th>
                      <th>CYCLE CUSTOMER</th>
                      <th>DEPT</th>
                      <th>DATE DLV</th>
                      <th>STATUS</th>
                      <th>CYCLE PULLING</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasOpenItems ? (
                      line.openItems.map((item, idx) => (
                        // S6479: Key gabungan (karena bisa jadi ada 2 cycle open yang sama)
                        <tr key={`open-${item.cyclePulling}-${idx}`}>
                          <td>{idx + 1}</td>
                          <td style={{fontWeight: 800, color: '#0f172a'}}>{item.customer}</td>
                          <td>{item.cycleCustomer}</td>
                          <td style={{fontWeight: 700}}>{item.dept}</td>
                          <td>{item.dateDlv}</td>
                          <td><span className="badge-open">{item.status}</span></td>
                          <td className="pulling-cell">{item.cyclePulling}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="status-empty-row">
                          Semua preparation pulling untuk line ini berstatus CLOSE.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="status-card-footer">
                Lihat Line Accuracy <ArrowRight size={14} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Status;