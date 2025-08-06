import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { FaUserCircle, FaSignOutAlt } from 'react-icons/fa';
import ProfileModal from './ProfileModal';

function Header({ user }) {
  const navigate = useNavigate();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleLogoutClick = () => {
    setShowModal(true);
  };

  const confirmLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      console.log('User logged out');
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error.message);
    } finally {
      setShowModal(false);
    }
  };

  return (
    <header className="dashboard-header">
      <div className="header-left">
        <h1 className="app-logo">EduRetrieve</h1>
      </div>

      <div className="header-right">
        {user && <span className="user-greeting">Welcome, {user.email}!</span>}

        <button
          className="icon-button profile-button"
          onClick={() => setIsProfileModalOpen(true)}
        >
          <FaUserCircle />
        </button>

        <button className="icon-button logout-button" onClick={handleLogoutClick}>
          <FaSignOutAlt className="icon" /> Logout
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <p>Are you sure you want to logout?</p>
            <div className="modal-buttons">
              <button onClick={confirmLogout} className="confirm-button">Logout</button>
              <button onClick={() => setShowModal(false)} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
      />
    </header>
  );
}

export default Header;
