import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    console.log('Attempting password reset for email:', email.trim());
    console.log('Redirect URL:', `${window.location.origin}/reset-password`);

    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      console.log('Supabase response data:', data);
      console.log('Supabase response error:', error);

      if (error) {
        console.error('Password reset error details:', error);
        setError(error.message);
      } else {
        setMessage('Password reset link sent! Please check your inbox.');
      }
    } catch (err) {
      console.error('Unexpected error during password reset:', err);
      setError('Failed to send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-container-img" />
      <div className="auth-form-card">
        <div className="auth-header-flex">
          <h2>Forgot Password?</h2>
          <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-header-flex-img" />
        </div>

        <form onSubmit={handleReset}>
          <div className="form-group">
            <label>Email Address:</label>
            <input
              type="email"
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

        {error && (
          <div className="auth-message error">
            <span className="error-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="auth-message success">
            <span className="success-icon">✅</span>
            <span>{message}</span>
          </div>
        )}

        <p className="auth-link">
          Remember your password? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;