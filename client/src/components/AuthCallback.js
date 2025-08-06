import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function AuthCallback() {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing Google authentication...');
  const navigate = useNavigate();

  useEffect(() => {
    const handleGoogleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (!code || !state) {
          setStatus('error');
          setMessage('Missing authorization parameters. Please try again.');
          return;
        }

        setMessage('Verifying with Google...');

        const response = await fetch('http://localhost:5000/api/auth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Authentication failed');
        }

        sessionStorage.setItem('auth_email', result.email);
        sessionStorage.setItem('auth_name', result.name);
        sessionStorage.setItem('google_verified', 'true');

        setStatus('success');
        setMessage('Google verification successful! Redirecting to complete signup...');

        setTimeout(() => {
          navigate('/signup?verified=true');
        }, 2000);

      } catch (error) {
        console.error('❌ Auth callback error:', error);
        setStatus('error');
        setMessage(error.message || 'Authentication failed. Please try again.');
        
        setTimeout(() => {
          navigate('/signup?error=' + encodeURIComponent(error.message));
        }, 3000);
      }
    };

    handleGoogleCallback();
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center',
      backgroundColor: '#0e1628',
      color: '#e0e0e0',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '3rem',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(37, 31, 210, 0.4)',
        maxWidth: '500px',
        width: '100%'
      }}>
        <h2 style={{ color: '#2c3e50', marginBottom: '1.5rem' }}>
          {status === 'processing' && '⏳ Processing...'}
          {status === 'success' && '✅ Success!'}
          {status === 'error' && '❌ Error'}
        </h2>
        
        <p style={{ color: '#555', fontSize: '1.1rem', lineHeight: '1.6' }}>
          {message}
        </p>

        {status === 'processing' && (
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '2rem auto'
          }} />
        )}

        {status === 'error' && (
          <button 
            onClick={() => navigate('/signup')}
            style={{
              marginTop: '1.5rem',
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Try Again
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default AuthCallback;