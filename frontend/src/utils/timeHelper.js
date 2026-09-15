import dayjs from "dayjs";

export const formatDay = (date) => {
  return dayjs(date).format("dddd");
};

export const formatDateLocal = (date) => {
  return dayjs(date).format("DD-MM-YYYY");
};

export const formatDate = (datetimeString) => {
  return dayjs(datetimeString).format("YYYY-MM-DD");
};

export const formatTime = (date) => {
  return dayjs(date).format("HH:mm:ss");
};

export const formatDateTime = (datetimeString) => {
  return dayjs(datetimeString).format("HH:mm:ss");
};

export function formatToMMSS(isoTime) {
  if (!isoTime) return "-";
  const date = dayjs(isoTime);
  const minutes = String(date.minute()).padStart(2, "0");
  const seconds = String(date.second()).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export const getShift = (date) => {
  const time = dayjs(date);
  const totalMinutes = time.hour() * 60 + time.minute();
  const startShift1 = 6 * 60 + 30;
  const endShift1 = 16 * 60 + 30;
  return totalMinutes >= startShift1 && totalMinutes <= endShift1
    ? "Shift 1"
    : "Shift 2";
};

export const isWithinRange = (date, startDate, endDate) => {
  const target = dayjs(date);
  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate + "T23:59:59") : null;
  if (start && target.isBefore(start)) return false;
  if (end && target.isAfter(end)) return false;
  return true;
};
