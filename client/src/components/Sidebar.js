import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FaHome, FaComments, FaBookmark, FaSignOutAlt, FaSearch, FaBars, FaUserCircle, FaChartBar } from 'react-icons/fa';
import ProfileModal from './ProfileModal';

function Sidebar({ onLogout, user }) {
  const [showModal, setShowModal] = useState(false);
  const [isOpen, setIsOpen] = useState(true); // ✅ control open/close sidebar
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

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
    <>
      <div className="sidebar-container">
        <nav className={`dashboard-sidebar ${isOpen ? 'open' : 'collapsed'}`}>
          {/* Profile Section at Top - Centered */}
          <div className="sidebar-profile-section">
            <button
              className="sidebar-profile-button"
              onClick={() => setIsProfileModalOpen(true)}
            >
              <FaUserCircle className="sidebar-profile-icon" />
            </button>
            {user && user.user_metadata && user.user_metadata.full_name && (
              <div className="sidebar-profile-info">
                <div className="sidebar-profile-name">{user.user_metadata.full_name}</div>
                <div className="sidebar-profile-divider"></div>
              </div>
            )}
          </div>

          <div className="sidebar-top">
            <NavLink to="/dashboard/home" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <FaHome className="sidebar-icon" /> {isOpen && 'Home'}
            </NavLink>
            <NavLink to="/dashboard/chats" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <FaComments className="sidebar-icon" /> {isOpen && 'Chats'}
            </NavLink>
            <NavLink to="/dashboard/saves" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <FaBookmark className="sidebar-icon" /> {isOpen && 'Bookmarks'}
            </NavLink>
            <NavLink to="/dashboard/search" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <FaSearch className="sidebar-icon" /> {isOpen && 'Find Modules'}
            </NavLink>
            <NavLink to="/dashboard/analytics" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <FaChartBar className="sidebar-icon" /> {isOpen && 'Analytics'}
            </NavLink>
          </div>
        
          <div className="sidebar-bottom">
            <button className="logout-button" onClick={handleLogout}>
              <FaSignOutAlt className="sidebar-icon" /> {isOpen && ''}
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

        <div className="sidebar-toggle">
          <button onClick={() => setIsOpen(!isOpen)}>
            <FaBars />
          </button>
        </div>
      </div>

      {/* Profile Modal - positioned outside sidebar */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
      />
    </>
  );
}

export default Sidebar;
