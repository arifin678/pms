// utils.js

export const baseProductData = [
  { name: 'VCT', value: 99.9 },
  { name: 'Alternator', value: 99.9 },
  { name: 'Starter', value: 99.8 },
  { name: 'AISS', value: 99.7 },
  { name: 'ACGs', value: 99.8 },
  { name: 'ECU 4W', value: 97.8 },
  { name: 'ECU 2W', value: 97.5 },
  { name: 'ECU EFI', value: 99.6 },
  { name: 'ECU SONAR', value: 100 },
  { name: 'O2 4W', value: 99.9 },
  { name: 'O2 2W', value: 99.7 },
];

export const monthData = [
  { name: "Apr'26", value: 99.9 },
  { name: "May'26", value: 99.8 },
  { name: "Jun'26", value: 99.7 },
  { name: "Jul'26" },
  { name: "Aug'26" },
  { name: "Sep'26" },
  { name: "Oct'26" },
  { name: "Nov'26" },
  { name: "Dec'26" },
  { name: "Jan'26" },
  { name: "Feb'26" },
  { name: "Mar'26" }
];

export const MONTH_META = {
  "Jan'26": { monthIndex: 0, monthName: 'Januari', year: 2026 },
  "Feb'26": { monthIndex: 1, monthName: 'Februari', year: 2026 },
  "Mar'26": { monthIndex: 2, monthName: 'Maret', year: 2026 },
  "Apr'26": { monthIndex: 3, monthName: 'April', year: 2026 },
  "May'26": { monthIndex: 4, monthName: 'Mei', year: 2026 },
  "Jun'26": { monthIndex: 5, monthName: 'Juni', year: 2026 },
  "Jul'26": { monthIndex: 6, monthName: 'Juli', year: 2026 },
  "Aug'26": { monthIndex: 7, monthName: 'Agustus', year: 2026 },
  "Sep'26": { monthIndex: 8, monthName: 'September', year: 2026 },
  "Oct'26": { monthIndex: 9, monthName: 'Oktober', year: 2026 },
  "Nov'26": { monthIndex: 10, monthName: 'November', year: 2026 },
  "Dec'26": { monthIndex: 11, monthName: 'Desember', year: 2026 },
};

export const MONTH_KEY_BY_INDEX = {
  0: "Jan'26", 1: "Feb'26", 2: "Mar'26", 3: "Apr'26", 4: "May'26", 5: "Jun'26",
  6: "Jul'26", 7: "Aug'26", 8: "Sep'26", 9: "Oct'26", 10: "Nov'26", 11: "Dec'26",
};

export const MONTH_DAILY_CONFIG = {
  "Apr'26": {
    title: "Pulling Performance April '26",
    totalDays: 30,
    holidays: [3, 4, 5, 11, 12, 18, 19, 25, 26],
    values: { 1: 99.8, 2: 100, 6: 99.5, 7: 99.8, 8: 100, 9: 99.8, 10: 100, 13: 99.8, 14: 99.8, 15: 99.5, 16: 100, 17: 99.8, 20: 100, 21: 99.8, 22: 99.8, 23: 99.5, 24: 100, 27: 99.8, 28: 99.8, 29: 100, 30: 99.8 }
  },
  "May'26": {
    title: "Pulling Performance May '26",
    totalDays: 31,
    holidays: [1, 2, 3, 9, 10, 14, 16, 17, 23, 24, 27, 30, 31],
    values: { 4: 100, 5: 97.8, 6: 97.4, 7: 97.6, 8: 100, 11: 100, 12: 99.8, 13: 99.8, 15: 98.5, 18: 99.8, 19: 99.8, 20: 99.8, 21: 100, 22: 99.8, 25: 99.5, 26: 99.5, 28: 99.5, 29: 100 }
  },
  "Jun'26": {
    title: "Pulling Performance June '26",
    totalDays: 30,
    holidays: [1, 7, 13, 14, 16, 21, 27, 28],
    values: { 2: 100, 3: 99.8, 4: 99.5, 5: 99.8, 6: 100, 8: 98.5, 9: 100, 10: 99.8, 11: 100, 12: 99.8, 15: 99.5, 17: 99.8, 18: 100, 19: 99.8, 20: 100, 22: 99.5, 23: 100, 24: 99.8, 25: 99.8, 26: 99.5, 29: 100, 30: 99.8 }
  }
};

export const TARGET_PERFORMANCE = 99.6;

// Shared configuration for charts
export const CHART_STYLE = {
  margin: { top: 35, right: 35, left: -20, bottom: 0 },
  axis: { axisLine: false, tickLine: false },
  tick: { fontSize: 11, fill: 'var(--text-main)', fontWeight: 500 },
  tickSmall: { fontSize: 10, fill: 'var(--text-main)', fontWeight: 500 }
};

// Math helpers
export const seededRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
export const round1 = (value) => Number(value.toFixed(1));

export const secondsToCT = (seconds) => {
  const min = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}'${sec}"`;
};

// Date & Time Formatting
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const formatDateToString = (date) => {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

export const formatTimeToString = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Data Builders
export const getStatusColor = (value) => {
  if (value >= 100) return 'var(--color-success)';
  if (value >= 99.6) return 'var(--color-warning)';
  return 'var(--color-danger)';
};

export const getFirstWorkday = (monthName) => {
  const config = MONTH_DAILY_CONFIG[monthName] || MONTH_DAILY_CONFIG["Jun'26"];
  for (let day = 1; day <= config.totalDays; day++) {
    if (!config.holidays.includes(day)) return day;
  }
  return 1;
};

export const buildDayData = (monthName) => {
  const config = MONTH_DAILY_CONFIG[monthName] || MONTH_DAILY_CONFIG["Jun'26"];
  return Array.from({ length: config.totalDays }, (_, i) => {
    const day = i + 1;
    const isHoliday = config.holidays.includes(day);
    return {
      name: day.toString(),
      value: isHoliday ? 100 : (config.values[day] ?? 99.8),
      isHoliday,
    };
  });
};

export const getSeedByDate = (monthName, day) => {
  const meta = MONTH_META[monthName] || MONTH_META["Jun'26"];
  return meta.year * 10000 + (meta.monthIndex + 1) * 100 + Number(day || 1);
};