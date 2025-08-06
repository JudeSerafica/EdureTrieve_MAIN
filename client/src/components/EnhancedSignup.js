import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const EnhancedSignup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('email'); 
  const [userInfo, setUserInfo] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const checkVerificationStatus = async () => {
      const verified = searchParams.get('verified');
      const error = searchParams.get('error');
      
      if (error) {
        setError(decodeURIComponent(error));
        setStep('email');
        return;
      }
      
      if (verified === 'true') {
        const storedEmail = sessionStorage.getItem('auth_email');
        const storedName = sessionStorage.getItem('auth_name');
        
        if (storedEmail && storedName) {
          setEmail(storedEmail);
          setUserInfo({
            name: storedName,
            email: storedEmail,
            googleVerified: true
          });
          setStep('verification');
          setMessage('Google verification successful! Please enter the verification code sent to your email.');
          
          try {
            const response = await fetch('http://localhost:5000/api/auth/check-verification-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: storedEmail }),
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.hasVerification && result.timeRemaining > 0) {
                setTimeRemaining(Math.floor(result.timeRemaining / 1000));
              }
            }
          } catch (err) {
            console.warn('Could not check verification status:', err);
          }
          
          sessionStorage.removeItem('auth_email');
          sessionStorage.removeItem('auth_name');
          sessionStorage.removeItem('google_verified');
        }
      }
    };

    checkVerificationStatus();
  }, [searchParams]);

  useEffect(() => {
    let timer;
    if (timeRemaining > 0 && step === 'verification') {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setStep('email');
            setError('Verification code expired. Please start over.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timeRemaining, step]);

  const handleGoogleSignup = async (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('http://localhost:5000/api/auth/google/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to initiate Google signup');
      }

      sessionStorage.setItem('signup_email', email.trim());
      
      setStep('google-auth');
      setMessage('Redirecting to Google for verification...');
      
      setTimeout(() => {
        window.location.href = result.authUrl;
      }, 1500);

    } catch (err) {
      console.error('Google signup error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    
    if (!verificationCode.trim() || !password.trim()) {
      setError('Please enter both verification code and password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:5000/api/auth/verify-signup-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          code: verificationCode.trim(),
          password: password.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Verification failed');
      }

      if (result.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });

        if (sessionError) {
          console.warn('Session set warning:', sessionError.message);
        }
      }

      setStep('completed');
      setMessage('Signup completed successfully! Redirecting to dashboard...');
      
      setTimeout(() => {
        navigate('/dashboard/home');
      }, 2000);

    } catch (err) {
      console.error('Verification error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setStep('email');
    setEmail('');
    setPassword('');
    setVerificationCode('');
    setUserInfo(null);
    setError('');
    setMessage('');
    setTimeRemaining(0);
    
    sessionStorage.removeItem('signup_email');
    sessionStorage.removeItem('auth_email');
    sessionStorage.removeItem('auth_name');
    sessionStorage.removeItem('google_verified');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="auth-container">
      <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-container-img" />
      <div className="auth-form-card">
        <div className="auth-header-flex">
          <h2>Sign Up</h2>
          <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-header-flex-img" />
        </div>

        {step === 'email' && (
          <form onSubmit={handleGoogleSignup}>
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
              {loading ? 'Processing...' : 'Continue with Google'}
            </button>
            <p className="auth-note">You'll be redirected to Google to verify your email address</p>
          </form>
        )}

        {step === 'google-auth' && (
          <div className="auth-loading">
            <div className="loading-spinner"></div>
            <p>Redirecting to Google for verification...</p>
            <p>Please complete the authentication process with Google.</p>
            <button onClick={handleStartOver} className="secondary-button">
              Start Over
            </button>
          </div>
        )}

        {step === 'verification' && (
          <div>
            <div className="verification-success">
              <span className="success-icon">✅</span>
              <span>Google verification successful!</span>
            </div>
            
            <div className="user-info">
              <p><strong>Name:</strong> {userInfo?.name}</p>
              <p><strong>Email:</strong> {userInfo?.email}</p>
            </div>

            <form onSubmit={handleVerifyCode}>
              <div className="form-group">
                <label>Enter Verification Code:</label>
                <input
                  type="text"
                  placeholder="6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength="6"
                  required
                  disabled={loading}
                />
                {timeRemaining > 0 && (
                  <small className="code-timer">
                    Code expires in: {formatTime(timeRemaining)}
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>Create Password:</label>
                <input
                  type="password"
                  placeholder="Enter a secure password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength="6"
                />
              </div>

              <button type="submit" disabled={loading || timeRemaining === 0}>
                {loading ? 'Verifying...' : 'Complete Signup'}
              </button>
              
              <button 
                type="button" 
                onClick={handleStartOver} 
                className="secondary-button"
                disabled={loading}
              >
                Start Over
              </button>
            </form>

            <div className="verification-note">
              <span className="info-icon">📧</span>
              <span>Verification code sent to {email}. Please check your inbox.</span>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <div className="completion-screen">
            <div className="success-animation">
              <span className="success-icon large">🎉</span>
              <h3>Welcome to EduRetrieve!</h3>
              <p>Your account has been created successfully.</p>
              <div className="loading-spinner small"></div>
              <p>Redirecting to dashboard...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="auth-message error">
            <span className="error-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {message && !error && (
          <div className="auth-message success">
            <span className="success-icon">✅</span>
            <span>{message}</span>
          </div>
        )}

        {step !== 'completed' && (
          <p className="auth-link">
            Already have an account? <a href="/login">Login here</a>
          </p>
        )}
      </div>

      <style jsx>{`
        .verification-success {
          background-color: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-info {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #dee2e6;
        }

        .user-info p {
          margin: 5px 0;
          font-size: 14px;
        }

        .verification-note {
          background-color: #e3f2fd;
          border: 1px solid #bbdefb;
          color: #0d47a1;
          padding: 10px;
          border-radius: 5px;
          margin-top: 15px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .code-timer {
          color: #666;
          font-size: 12px;
          margin-top: 5px;
          display: block;
        }

        .auth-loading {
          text-align: center;
          padding: 20px;
        }

        .loading-spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #007bff;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto 15px;
        }

        .loading-spinner.small {
          width: 20px;
          height: 20px;
          border-width: 2px;
        }

        .completion-screen {
          text-align: center;
          padding: 20px;
        }

        .success-animation h3 {
          color: #28a745;
          margin: 15px 0;
        }

        .success-icon.large {
          font-size: 48px;
          display: block;
          margin-bottom: 15px;
        }

        .secondary-button {
          background-color: #6c757d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          margin-top: 10px;
          width: 100%;
        }

        .secondary-button:hover {
          background-color: #5a6268;
        }

        .secondary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-note {
          font-size: 12px;
          color: #666;
          text-align: center;
          margin-top: 10px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .success-icon, .error-icon, .info-icon {
          font-size: 16px;
        }

        .auth-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border-radius: 5px;
          margin: 15px 0;
          font-size: 14px;
        }

        .auth-message.error {
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }

        .auth-message.success {
          background-color: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }
      `}</style>
    </div>
  );
};

export default EnhancedSignup;