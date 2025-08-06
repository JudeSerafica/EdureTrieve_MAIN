import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/update-password', // Adjust if needed
    });

    if (error) {
      console.error('Password reset error:', error.message);
      setError(error.message);
    } else {
      setMessage('Password reset link sent! Please check your inbox.');
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-form-card">
        <h2>Forgot Password?</h2>
        <form onSubmit={handleReset}>
          <div className="form-group">
            <label htmlFor="email">Email Address:</label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        {error && <p className="auth-message error">{error}</p>}
        {message && <p className="auth-message success">{message}</p>}
        <p className="back-link">Back to <Link to="/login">Login page</Link></p>
      </div>
    </div>
  );
}
