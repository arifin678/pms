import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  Menu, 
  LayoutDashboard, 
  Activity, 
  Download, 
  FilePenLine, 
  MessageCircleMore,
  UserCircle2, 
  LogOut       
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    if (window.confirm('Apakah Anda yakin ingin keluar?')) {
      logout();
      navigate('/login');
    }
  };

  return (
    <aside className="side-navbar">
      
      {/* --- BAGIAN ATAS: MENU --- */}
      <div className="side-navbar__top-section">
        <div className="side-navbar__top">
          <button className="side-navbar__menu" type="button">
            <Menu size={22} />
          </button>
        </div>

        <nav className="side-navbar__nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'side-navbar__link active' : 'side-navbar__link'
            }
          >
            <LayoutDashboard size={20} />
            <span>DASHBOARD</span>
          </NavLink>

          <NavLink
            to="/live-monitoring"
            className={({ isActive }) =>
              isActive ? 'side-navbar__link active' : 'side-navbar__link'
            }
          >
            <Activity size={20} />
            <span>LIVE MONITORING</span>
          </NavLink>

          <NavLink 
            to="/status"
            className={({ isActive }) =>
              isActive ? 'side-navbar__link active' : 'side-navbar__link'
            }
          >
            <FilePenLine size={20} />
            <span>PULLING STATUS</span>
          </NavLink>

          <NavLink
            to="/master-schedule"
            className={({ isActive }) =>
              isActive ? 'side-navbar__link active' : 'side-navbar__link'
            }
          >
            <MessageCircleMore size={20} />
            <span>COMS ESP32</span>
          </NavLink>
          
          <NavLink
            to="/download-history"
            className={({ isActive }) =>
              isActive ? 'side-navbar__link active' : 'side-navbar__link'
            }
          >
            <Download size={20} />
            <span>Download History</span>
          </NavLink>
        </nav>
      </div>

      {/* --- BAGIAN BAWAH: PROFIL & LOGOUT --- */}
      <div className="side-navbar__bottom">
        <div className="sidebar-profile">
          <div className="profile-icon">
            <UserCircle2 size={24} strokeWidth={2} />
          </div>
          <div className="profile-info">
            <span className="profile-name">{user?.name || user?.userId || 'Guest'}</span>
            
            {/* PERUBAHAN LABEL ROLE ADA DI SINI */}
            <span className={`profile-role ${user?.role === 'admin' ? 'role-admin' : 'role-viewer'}`}>
              {user?.role === 'admin' ? 'Admin PMS' : 'Viewer'}
            </span>
            
          </div>
        </div>

        <button className="btn-logout" type="button" onClick={handleLogout}>
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>

    </aside>
  );
};

export default Sidebar;