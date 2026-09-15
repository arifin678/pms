import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock3, UserRound } from 'lucide-react';
import maintenanceIcon from '../assets/maintenance-icon.png';
import './LiveMonitoring.css';

const PRODUCT_DETAIL_BASE_PATH = '/product';

const PRODUCTS = [
  'VCT',
  'Alternator',
  'Starter',
  'AISS',
  'ACGs',
  'ECU 4W',
  'ECU 2W',
  'ECU EFI',
  'ECU SONAR',
  'O2 4W',
  'O2 2W',
];

const getShiftName = () => {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'Shift Pagi' : 'Shift Malam';
};

const formatDateIndo = (date) => {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatTime = (date) => {
  return date.toLocaleTimeString('id-ID', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const LiveMonitoring = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleOpenProduct = (productName) => {
    navigate(`/product/${encodeURIComponent(productName)}`);
  };

  return (
    <main className="line-monitor-page">
      <header className="lm-header">
        <h1 className="lm-title">LIVE MONITORING DETAIL</h1>

        <div className="lm-header-right">
          <div className="lm-info-pill lm-date-pill">
            <CalendarDays size={16} />
            <span>{formatDateIndo(now)}</span>
          </div>

          <div className="lm-info-pill lm-time-pill">
            <Clock3 size={16} />
            <span>{formatTime(now)}</span>
          </div>

          <div className="lm-info-pill lm-shift-pill">
            <UserRound size={16} />
            <span>{getShiftName()}</span>
          </div>
        </div>
      </header>

      <section className="line-monitor-grid">
        {PRODUCTS.map((productName) => (
          <button
            key={productName}
            type="button"
            className="line-product-card"
            onClick={() => handleOpenProduct(productName)}
          >
            <div className="line-product-icon-wrap">
              <img
                src={maintenanceIcon}
                alt={productName}
                className="line-product-icon"
                draggable="false"
              />
            </div>

            <div className="line-product-name">
              {productName}
            </div>
          </button>
        ))}
      </section>
    </main>
  );
};

export default LiveMonitoring;