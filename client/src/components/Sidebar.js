import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FaHome, FaComments, FaBookmark, FaSignOutAlt } from 'react-icons/fa';

function Sidebar({ onLogout }) {
  const [showModal, setShowModal] = useState(false);

  const handleLogout = () => {
    setShowModal(true);
  };

  const confirmLogout = () => {
    setShowModal(false);
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <nav className="dashboard-sidebar">
      <div className="sidebar-top">
        <NavLink to="/dashboard/home" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <FaHome className="sidebar-icon" /> Home
        </NavLink>
        <NavLink to="/dashboard/chats" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <FaComments className="sidebar-icon" /> Chats
        </NavLink>
        <NavLink to="/dashboard/saves" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <FaBookmark className="sidebar-icon" /> Bookmarks
        </NavLink>
      </div>

      <div className="sidebar-bottom">
        <button className="logout-button" onClick={handleLogout}>
          <FaSignOutAlt className="sidebar-icon" /> Logout
        </button>

        {showModal && (
          <div className="modal-overlay">
            <div className="logout-modal" onClick={e => e.stopPropagation()}>
              <p>Are you sure you want to logout?</p>
              <div className="modal-buttons">
                <button onClick={confirmLogout} className="confirm-button">Logout</button>
                <button onClick={() => setShowModal(false)} className="cancel-button">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Sidebar;