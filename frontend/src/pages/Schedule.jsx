import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, AlertTriangle, Cpu, RefreshCw, Timer } from 'lucide-react';
import './ProductDetail.css'; 

// Memanggil URL dari .env (Vite Environment Variable)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Memanggil IP ESP32 dari .env
const ESP32_LINES = [
  { id: 'ALT', name: 'Line Alternator', ip: import.meta.env.VITE_ESP_IP_ALT || '' },
  { id: 'STR', name: 'Line Starter', ip: import.meta.env.VITE_ESP_IP_STR || '' },
  { id: 'VCT', name: 'Line VCT', ip: import.meta.env.VITE_ESP_IP_VCT || '' },
  { id: 'AISS', name: 'Line AISS', ip: import.meta.env.VITE_ESP_IP_AISS || '' },
  { id: 'ACG', name: 'Line ACGs', ip: import.meta.env.VITE_ESP_IP_ACG || '' },
];

const ScheduleTable = ({ title, data, onEditClick }) => (
  <div className="table-card" style={{ marginBottom: '24px' }}>
    <div className="table-header-row">
      <span className="table-title">{title}</span>
    </div>
    <div className="table-scroll-wrapper" style={{ maxHeight: '400px' }}>
      <table className="custom-table">
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Start Time</th>
            <th>Finish Time</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={`cycle-${item.cycle_no}-${item.start_time}`}>
              <td style={{ fontWeight: 'bold' }}>Cycle {item.cycle_no}</td>
              <td style={{ color: '#2563eb', fontWeight: '500' }}>{item.start_time}</td>
              <td style={{ color: '#059669', fontWeight: '500' }}>{item.finish_time}</td>
              <td>
                <button className="btn-edit-row" onClick={() => onEditClick(item)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const Schedule = () => {
  const navigate = useNavigate();
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    shift_name: '', cycle_no: '', start_time: '', finish_time: ''
  });

  const [selectedIp, setSelectedIp] = useState(ESP32_LINES[0].ip);
  const [durationMs, setDurationMs] = useState(240000);
  const [isEspBusy, setIsEspBusy] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/master-schedule`);
        const json = await res.json();
        setScheduleData(Array.isArray(json) ? json : []);
        setApiError('');
      } catch (err) {
        console.error("Fetch Schedule Error:", err); 
        setApiError('Gagal memuat Master Schedule dari server');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [refresh]);

  const shift1Data = scheduleData.filter(d => d.shift_name === 'SHIFT_1');
  const shift2Data = scheduleData.filter(d => d.shift_name === 'SHIFT_2');

  const handleEditClick = (item) => {
    setEditData({
      shift_name: item.shift_name,
      cycle_no: item.cycle_no,
      start_time: item.start_time,
      finish_time: item.finish_time
    });
    setModalOpen(true);
  };

  const handleSaveSchedule = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/api/master-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });
      const result = await res.json();

      if (result.success) {
        setModalOpen(false);
        setRefresh(prev => prev + 1); 
      } else {
        alert('Gagal: ' + result.error);
      }
    } catch (err) {
      console.error("Save Schedule Error:", err); 
      alert('Terjadi kesalahan koneksi ke server Node.js');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDuration = async () => {
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(selectedIp)) {
      return alert("Format IP tidak valid! Pastikan formatnya benar (Contoh: 192.168.43.102)");
    }

    if (!selectedIp) return alert("Isi Alamat IP ESP32 terlebih dahulu!");
    if (!durationMs || durationMs <= 0) return alert("Durasi tidak valid!");

    try {
      setIsEspBusy(true);
      const res = await fetch(`${API_BASE_URL}/api/esp32/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_esp32: selectedIp, action: 'duration', value_ms: durationMs })
      });
      const result = await res.json();
      
      if(result.success) {
        alert(`Sukses mengubah durasi ESP32 di IP ${selectedIp}`);
      } else {
        alert(`Gagal: ${result.error}`);
      }
    } catch (err) {
      console.error("Update Duration Error:", err); 
      alert('Gagal menghubungi ESP32. Pastikan hardware menyala dan IP benar.');
    } finally {
      setIsEspBusy(false);
    }
  };

  const handleResetESP32 = async () => {
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(selectedIp)) {
      return alert("Format IP tidak valid! Pastikan formatnya benar (Contoh: 192.168.43.102)");
    }

    if (!selectedIp) return alert("Isi Alamat IP ESP32 terlebih dahulu!");
    if (!window.confirm("Anda yakin ingin merestart ESP32 secara paksa?")) return;

    try {
      setIsEspBusy(true);
      await fetch(`${API_BASE_URL}/api/esp32/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_esp32: selectedIp, action: 'reset' })
      });
      
      alert('Perintah Restart terkirim! ESP32 akan offline beberapa detik sebelum terhubung kembali.');
    } catch (err) {
      console.error("Reset ESP32 Error:", err); 
      alert('Gagal mengirim perintah reset ke ESP32.');
    } finally {
      setIsEspBusy(false);
    }
  };

  return (
    <div className="detail-bg" style={{ minHeight: '100vh', padding: '24px' }}>
      
      <div className="detail-header" style={{ marginBottom: '24px' }}>
        <div className="header-left">
          {/* Sesuai saran SonarQube, mengganti <div role="button"> menjadi tag <button> murni (S1082/S6853) */}
          <button 
            className="logo-box" 
            onClick={() => navigate('/')} 
            style={{ cursor: 'pointer', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', padding: 0 }}
            aria-label="Kembali ke Beranda"
          >
            <Settings size={20} />
          </button>
          <h1 className="header-title">ESP32 CONTROL PANEL</h1>
        </div>
      </div>

      {apiError && (
        <div style={{ padding: '12px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '20px' }}>
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '8px' }} />
          {apiError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', fontWeight: 'bold' }}>Memuat Sistem...</div>
      ) : (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          
          <div style={{ flex: '7', minWidth: '600px' }}>
            <ScheduleTable title="📅 MASTER SCHEDULE - SHIFT 1 (PAGI)" data={shift1Data} onEditClick={handleEditClick} />
            <ScheduleTable title="📅 MASTER SCHEDULE - SHIFT 2 (MALAM)" data={shift2Data} onEditClick={handleEditClick} />
          </div>

          <div style={{ flex: '3', minWidth: '320px', position: 'sticky', top: '24px' }}>
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
              
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={22} color="#dc2626" />
                Hardware Control
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="inputTargetIp" style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Pilih Line Produksi (Target IP)</label>
                <input 
                  id="inputTargetIp"
                  type="text"
                  placeholder="Contoh: 10.39.229.102"
                  value={selectedIp}
                  onChange={(e) => setSelectedIp(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', background: '#f8fafc' }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '20px 0' }} />

              <div style={{ marginBottom: '24px' }}>
                <label htmlFor="inputDuration" style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Ubah Minimal Durasi Siklus (ms)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    id="inputDuration"
                    type="number" 
                    value={durationMs}
                    onChange={(e) => setDurationMs(e.target.value)}
                    style={{ flex: '1', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                  />
                  <button 
                    onClick={handleUpdateDuration}
                    disabled={isEspBusy}
                    style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 16px', fontWeight: '700', cursor: isEspBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Timer size={16} /> Update
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>* Contoh: 1 Menit = 60000 ms</div>
              </div>

              <button 
                onClick={handleResetESP32}
                disabled={isEspBusy}
                style={{ width: '100%', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', fontWeight: '700', cursor: isEspBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                onFocus={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
                onBlur={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
              >
                <RefreshCw size={16} /> 
                Restart Modul ESP32
              </button>

            </div>
          </div>

        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay">
          <div className="counting-modal">
            <div className="modal-head">
              <h3>Edit Jadwal - {editData.shift_name} (Cycle {editData.cycle_no})</h3>
              <button className="modal-close-btn" onClick={() => !saving && setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="inputStartTime">Start Time (Jam:Menit)</label>
                  <input id="inputStartTime" type="time" value={editData.start_time} onChange={(e) => setEditData({...editData, start_time: e.target.value})} />
                </div>
                <div className="form-group">
                  <label htmlFor="inputFinishTime">Finish Time (Jam:Menit)</label>
                  <input id="inputFinishTime" type="time" value={editData.finish_time} onChange={(e) => setEditData({...editData, finish_time: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-action">
              <button className="btn-cancel-modal" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn-save-modal" onClick={handleSaveSchedule} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;