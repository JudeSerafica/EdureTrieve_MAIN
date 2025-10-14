import React from 'react';
import UserProfile from './UserProfile';
import { FaTimes } from 'react-icons/fa';

function ProfileModal({ isOpen, onClose, user }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          <FaTimes />
        </button>
        <UserProfile user={user} />
      </div>
    </div>
  );
}

export default ProfileModal;
