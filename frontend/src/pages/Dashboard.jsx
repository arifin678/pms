import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import { Calendar, Clock, User, AlertTriangle } from 'lucide-react';
import './Dashboard.css';

// Memanggil URL dari .env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const TARGET_PERFORMANCE = 99.6;

// Extracted Constants agar tidak membebani memori komponen (S1481)
const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// HELPER FORMAT & STYLING
const getStatusColor = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '#e5e7eb';
  if (value >= 100) return '#22c55e';
  if (value >= 99.6 && value < 100) return '#f59e0b';
  return '#ef4444';
};

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

const pad2 = (num) => String(num).padStart(2, '0');

const CHART_MARGIN = {
  product: { top: 20, right: 35, left: -20, bottom: 0 },
  month: { top: 35, right: 35, left: -20, bottom: 0 },
  daily: { top: 25, right: 50, left: -10, bottom: 5 }, 
};

const AXIS_STYLE = { axisLine: false, tickLine: false };
const Y_AXIS_TICK = { fontSize: 13, fill: '#374151', fontWeight: 500 };
const X_AXIS_TICK = { fontSize: 13, fill: '#374151', fontWeight: 500 };
const HORIZONTAL_Y_TICK = { fontSize: 14, fill: '#374151', fontWeight: 600 };

const getDynamicMin = (dataMin) => {
  if (dataMin === Infinity || dataMin == null) return 90;
  if (dataMin >= 95) return 90; 
  return Math.max(0, Math.floor(dataMin / 10) * 10); 
};


// CUSTOM TOOLTIP & LABELS
const CustomDailyLabel = (props) => {
  const { x, y, width, height, value } = props;
  if (!value || value <= 0) return null;
  return (
    <text x={x + width + 6} y={y + height / 2} fill="#111827" fontSize={13} fontWeight="bold" textAnchor="start" dominantBaseline="central" stroke="none">
      {value}%
    </text>
  );
};

const CustomTooltip = ({ active, payload, label, chartTitle }) => {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  if (data.isHoliday) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip__title">{chartTitle}</p>
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__label">Date {label}</span>
          <span className="chart-tooltip__value chart-tooltip__value--holiday">HOLIDAY</span>
        </div>
      </div>
    );
  }
  const val = payload[0].value;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{chartTitle || 'Performance Detail'}</p>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">{label}</span>
        <span className="chart-tooltip__value" style={{ color: getStatusColor(val) }}>{val != null && val > 0 ? `${val}%` : 'No Data'}</span>
      </div>
    </div>
  );
};

const CustomMonthLabel = ({ x, y, width, index, monthData, selectedMonth }) => {
  const entry = monthData[index];
  if (entry?.value == null) return null;
  
  const centerX = x + width / 2;
  const isSelected = entry.name === selectedMonth;
  return (
    <>
      {isSelected && <text x={centerX} y={y - 20} fill="#2563eb" fontSize={13} fontWeight="900" textAnchor="middle">SELECTED</text>}
      <text x={centerX} y={y - 6} fill="#111827" fontSize={14} fontWeight="bold" textAnchor="middle">{entry.value > 0 ? entry.value : ''}</text>
    </>
  );
};


// =================================================================================
// KOMPONEN CHART DIPISAH AGAR TIDAK RE-RENDER BERKALI-KALI
// =================================================================================

const ProductChart = ({ data, onClickHandler, chartTitle, productTitleDate }) => (
  <ResponsiveContainer width="100%" height="100%" debounce={80}>
    <BarChart data={data} margin={CHART_MARGIN.product}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
      <YAxis domain={[dataMin => getDynamicMin(dataMin), 100]} {...AXIS_STYLE} tick={Y_AXIS_TICK} />
      <XAxis dataKey="name" {...AXIS_STYLE} interval={0} tick={X_AXIS_TICK} tickMargin={8} />
      <Tooltip content={<CustomTooltip chartTitle={`${chartTitle} - ${productTitleDate}`} />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
      <Bar dataKey="value" onClick={onClickHandler} radius={[4, 4, 0, 0]}>
        <LabelList dataKey="value" position="top" fill="#111827" fontSize={14} fontWeight="bold" formatter={(val) => (val > 0 ? val : '')} />
        {data.map((entry) => <Cell key={`prod-cell-${entry.name}`} cursor="pointer" fill={getStatusColor(entry.value)} />)}
      </Bar>
      <ReferenceLine y={TARGET_PERFORMANCE} stroke="#ef4444" strokeWidth={2} label={{ position: 'right', value: '99.6', fill: '#ef4444', fontSize: 14, fontWeight: 'bold' }} />
    </BarChart>
  </ResponsiveContainer>
);

const DailyHorizontalChart = ({ data, selectedDay, onDayClick }) => (
  <ResponsiveContainer width="100%" height="100%" debounce={80}>
    <BarChart layout="vertical" data={data} margin={CHART_MARGIN.daily}>
      <defs>
        <pattern id="holiday-pattern-daily" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="4" />
        </pattern>
      </defs>
      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} opacity={0.3} />
      <XAxis type="number" domain={[dataMin => getDynamicMin(dataMin), 100]} axisLine={true} tickLine={true} tick={X_AXIS_TICK} tickFormatter={(val) => `${val}%`} />
      <YAxis type="category" dataKey="name" axisLine={true} tickLine={true} tick={HORIZONTAL_Y_TICK} width={35} interval="preserveStartEnd" minTickGap={2} />
      <Tooltip content={<CustomTooltip chartTitle="Daily Performance" />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
      <ReferenceLine x={TARGET_PERFORMANCE} stroke="#ef4444" strokeWidth={2} label={{ position: 'top', value: '99.6', fill: '#ef4444', fontSize: 13, fontWeight: 'bold' }} />
      
      <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={onDayClick} barSize={26}>
        <LabelList dataKey="value" content={<CustomDailyLabel />} />
        {data.map((entry) => {
          const isSelected = Number(entry.name) === Number(selectedDay);
          return <Cell key={`daily-cell-${entry.name}`} cursor="pointer" fill={entry.isHoliday ? 'url(#holiday-pattern-daily)' : getStatusColor(entry.value)} stroke={isSelected ? '#1e40af' : 'none'} strokeWidth={isSelected ? 2 : 0} />;
        })}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const MonthChart = ({ data, monthLabelKey, onMonthClick }) => (
  <ResponsiveContainer width="100%" height="100%" debounce={80}>
    <BarChart data={data} margin={CHART_MARGIN.month}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
      <YAxis domain={[dataMin => getDynamicMin(dataMin), 100]} {...AXIS_STYLE} tick={Y_AXIS_TICK} />
      <XAxis dataKey="name" {...AXIS_STYLE} interval={0} tick={X_AXIS_TICK} tickMargin={8} />
      <Tooltip content={<CustomTooltip chartTitle="Monthly History" />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
      <Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={onMonthClick}>
        <LabelList 
          content={<CustomMonthLabel monthData={data} selectedMonth={monthLabelKey} />} 
        />
        {data.map((entry) => {
          const isSelected = monthLabelKey === entry.name;
          return <Cell key={`month-cell-${entry.name}`} cursor="pointer" fill={getStatusColor(entry.value)} stroke={isSelected ? '#2563eb' : 'none'} strokeWidth={isSelected ? 1.5 : 0} />;
        })}
      </Bar>
      <ReferenceLine y={TARGET_PERFORMANCE} stroke="#ef4444" strokeWidth={2} label={{ position: 'right', value: '99.6', fill: '#ef4444', fontSize: 14, fontWeight: 'bold' }} />
    </BarChart>
  </ResponsiveContainer>
);


// =================================================================================
// KOMPONEN UTAMA DASHBOARD
// =================================================================================

const Dashboard = () => {
  const navigate = useNavigate();

  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [selectedYear] = useState(currentTime.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(currentTime.getMonth()); 
  const [selectedDay, setSelectedDay] = useState(currentTime.getDate());

  const [monthData, setMonthData] = useState([]);
  const [dayData, setDayData] = useState([]);
  const [productData, setProductData] = useState([]);

  const [accuMonthData, setAccuMonthData] = useState([]);
  const [accuDayData, setAccuDayData] = useState([]);
  const [accuProductData, setAccuProductData] = useState([]);

  const [apiError, setApiError] = useState('');

  // WAKTU REALTIME
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedDateKey = useMemo(() => `${selectedYear}-${pad2(selectedMonthIndex + 1)}-${pad2(selectedDay)}`, [selectedYear, selectedMonthIndex, selectedDay]);
  const monthLabelKey = useMemo(() => `${monthShorts[selectedMonthIndex]}'${String(selectedYear).slice(2)}`, [selectedMonthIndex, selectedYear]);

  // Fungsi helper untuk mencegah Cognitive Complexity di useEffect (S3776)
  const fetchChartData = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    } catch (err) {
      console.error(`Fetch API Error for ${url}:`, err.message);
      return [];
    }
  };

  // FETCH DATA DARI DATABASE
  useEffect(() => {
    let isMounted = true;
    
    const fetchDashboardData = async () => {
      try {
        const [productJson, dailyJson, monthlyJson, accuProductJson, accuDailyJson, accuMonthlyJson] = await Promise.all([
          fetchChartData(`${API_BASE_URL}/api/dashboard/products?date=${selectedDateKey}`),
          fetchChartData(`${API_BASE_URL}/api/dashboard/daily?year=${selectedYear}&month=${selectedMonthIndex + 1}`),
          fetchChartData(`${API_BASE_URL}/api/dashboard/monthly?year=${selectedYear}`),
          fetchChartData(`${API_BASE_URL}/api/dashboard/accuracy/products?date=${selectedDateKey}`),
          fetchChartData(`${API_BASE_URL}/api/dashboard/accuracy/daily?year=${selectedYear}&month=${selectedMonthIndex + 1}`),
          fetchChartData(`${API_BASE_URL}/api/dashboard/accuracy/monthly?year=${selectedYear}`)
        ]);

        if (!isMounted) return;

        const emptyMonthData = monthShorts.map(m => ({ name: `${m}'${String(selectedYear).slice(2)}`, value: null }));

        // Set State Data Waktu
        setMonthData(monthlyJson.length > 0 ? monthlyJson : emptyMonthData);
        setDayData(dailyJson);
        setProductData(productJson);
        
        // Set State Data Akurasi
        setAccuMonthData(accuMonthlyJson.length > 0 ? accuMonthlyJson : emptyMonthData);
        setAccuDayData(accuDailyJson);
        setAccuProductData(accuProductJson);

        setApiError('');
      } catch (err) {
        if (!isMounted) return;
        console.error('Fatal Dashboard Error:', err);
        setApiError('Gagal terhubung ke Database Backend');
      }
    };

    fetchDashboardData();
    return () => { isMounted = false; };
  }, [selectedYear, selectedMonthIndex, selectedDay, selectedDateKey]);
  
  // NAVIGASI TIME (KIRI)
  const handleTimeProductClick = (data) => {
    const productName = data?.productName || data?.name;
    if (productName) navigate(`/line-summary/${encodeURIComponent(productName)}?date=${selectedDateKey}`);
  };

  // NAVIGASI ACCURACY (KANAN)
  const handleAccuProductClick = (data) => {
    const productName = data?.productName || data?.name;
    if (productName) navigate(`/line-accu/${encodeURIComponent(productName)}?date=${selectedDateKey}`);
  };

  // GENERAL HANDLER (KLIK BULAN & HARI)
  const handleMonthClick = (data) => {
    if (!data?.name) return;
    const parts = data.name.split("'");
    const mIdx = monthShorts.indexOf(parts[0]);
    if (mIdx !== -1) { setSelectedMonthIndex(mIdx); setSelectedDay(1); }
  };

  const handleDayClick = (data) => {
    if (!data?.name) return;
    setSelectedDay(Number(data.name));
  };

  const isTodaySelected = selectedYear === currentTime.getFullYear() && selectedMonthIndex === currentTime.getMonth() && selectedDay === currentTime.getDate();
  const productTitleDate = isTodaySelected ? 'TODAY' : `${selectedDay} ${monthShorts[selectedMonthIndex]} ${selectedYear}`;

  return (
    <div className="dashboard-bg">
      <div className="header-container">
        <h1 className="header-title">DASHBOARD PULLING PERFORMANCE</h1>
        <div className="header-hint-box">Click on the Bar chart to see details</div>
        <div className="header-badge"><Calendar size={14} color="#3b82f6" />{formatActualDate(currentTime)}</div>
        <div className="header-badge header-badge--green"><Clock size={14} />{formatActualTime(currentTime)}</div>
        <div className="header-badge header-badge--yellow"><User size={14} />Morning Shift</div>
      </div>

      {apiError && (
        <div style={{ padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: '6px' }} />{apiError}
        </div>
      )}

      <div className="dashboard-split-wrapper">
        
        {/* LEFT SIDE (TIME PERFORMANCE) */}
        <div className="dashboard-half">
          <h2 className="half-title">PULLING TIME PERFORMANCE</h2>
          <div className="half-grid-layout">
            <div className="card card--daily">
              <h3 className="card-title">By Day ({monthShorts[selectedMonthIndex]} '{String(selectedYear).slice(2)})</h3>
              <div className="chart-box">
                <DailyHorizontalChart data={dayData} selectedDay={selectedDay} onDayClick={handleDayClick} />
              </div>
            </div>
            <div className="card card--product">
              <h3 className="card-title">Detail/Product ({productTitleDate})</h3>
              <div className="chart-box">
                <ProductChart data={productData} onClickHandler={handleTimeProductClick} chartTitle="Time Performance" productTitleDate={productTitleDate} />
              </div>
            </div>
            <div className="card card--month">
              <h3 className="card-title">History by Month ({selectedYear})</h3>
              <div className="chart-box">
                {/* Kode yang salah tempat sudah diperbaiki kembali menggunakan komponen MonthChart */}
                <MonthChart data={monthData} monthLabelKey={monthLabelKey} onMonthClick={handleMonthClick} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE (ACCURACY PERFORMANCE) */}
        <div className="dashboard-half">
          <h2 className="half-title">PULLING ACCURACY PERFORMANCE</h2>
          <div className="half-grid-layout">
            <div className="card card--daily">
              <h3 className="card-title">By Day ({monthShorts[selectedMonthIndex]} '{String(selectedYear).slice(2)})</h3>
              <div className="chart-box">
                <DailyHorizontalChart data={accuDayData} selectedDay={selectedDay} onDayClick={handleDayClick} />
              </div>
            </div>
            <div className="card card--product">
              <h3 className="card-title">Detail/Product ({productTitleDate})</h3>
              <div className="chart-box">
                <ProductChart data={accuProductData} onClickHandler={handleAccuProductClick} chartTitle="Accuracy Performance" productTitleDate={productTitleDate} />
              </div>
            </div>
            <div className="card card--month">
              <h3 className="card-title">History by Month ({selectedYear})</h3>
              <div className="chart-box">
                <MonthChart data={accuMonthData} monthLabelKey={monthLabelKey} onMonthClick={handleMonthClick} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;