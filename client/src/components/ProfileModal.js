import React, { useState } from 'react';
import UserProfile from './UserProfile';
import ProgressAnalytics from './ProgressAnalytics';
import { FaTimes } from 'react-icons/fa';

function ProfileModal({ isOpen, onClose, user }) {
  const [activeTab, setActiveTab] = useState('profile');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          <FaTimes />
        </button>

        <div className="modal-tabs">
          <button
            className={`modal-tab-button ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            User Profile
          </button>
          <button
            className={`modal-tab-button ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Progress Analytics
          </button>
        </div>

        <div className="modal-panel-container">
          {activeTab === 'profile' && <UserProfile user={user} />}
          {activeTab === 'analytics' && <ProgressAnalytics user={user} />}
        </div>
      </div>
    </div>
  );
}

export default ProfileModal;
