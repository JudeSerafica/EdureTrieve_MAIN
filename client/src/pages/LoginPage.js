import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        navigate('/dashboard/home');
      }
    };
    checkUser();
  }, [navigate]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session?.user) {
          await syncUserProfile(session.user);
          navigate('/dashboard/home');
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('User signed out');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const syncUserProfile = async (user) => {
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!existingProfile) {
        console.log('Creating profile for user:', user.id);
        
        const { error: insertError } = await supabase
          .from('profiles')
          .insert([{
            id: user.id,
            email: user.email,
            username: user.user_metadata?.full_name?.split(' ')[0] || 
                     user.user_metadata?.name?.split(' ')[0] || 
                     user.email.split('@')[0],
            fullName: user.user_metadata?.full_name || 
                     user.user_metadata?.name || '',
            pfpUrl: user.user_metadata?.avatar_url || 
                   user.user_metadata?.picture || '',
            google_verified: !!user.user_metadata?.iss,
            created_at: new Date().toISOString()
          }]);

        if (insertError) {
          console.warn('Profile creation warning:', insertError.message);
        }
      }
    } catch (error) {
      console.warn('Profile sync error:', error.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setUnverifiedUser(false);
    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (loginError) {
        if (loginError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (loginError.message.includes('Email not confirmed')) {
          setUnverifiedUser(true);
          setError('Please verify your email before logging in. Check your inbox for the verification email.');
        } else {
          setError(loginError.message);
        }
        return;
      }

      if (data.user && !data.user.email_confirmed_at) {
        setUnverifiedUser(true);
        setError('Please verify your email before logging in.');
        await supabase.auth.signOut();
        return;
      }

    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
  setError('');
  setLoading(true);

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard/home`
      }
    });

    if (error) {
      console.error('Google OAuth error:', error);
      setError('Google login failed: ' + error.message);
    }
  } catch (err) {
    console.error('Google login error:', err);
    setError('Google login failed. Please try again.');
  } finally {
    setLoading(false);
  }
};

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });

      if (resendError) {
        setError('Failed to resend verification email: ' + resendError.message);
      } else {
        alert('Verification email resent! Please check your inbox.');
      }
    } catch (err) {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      alert('Password reset email sent! Please check your inbox.');
    } catch (error) {
      setError('Failed to send password reset email: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-container-img" />
      <div className="auth-form-card">
        <div className="auth-header-flex">
          <h2>Login</h2>
          <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-header-flex-img" />
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="Enter your email"
            />
          </div>
          <div className="form-group">
            <label>Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="Enter your password"
            />
          </div>

          <p>
            <button 
              type="button" 
              onClick={handleForgotPassword}
              disabled={loading}
              className="link-button"
            >
              Forgot password?
            </button>
          </p>
          
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button 
          type="button" 
          onClick={handleGoogleLogin}
          disabled={loading}
          className="google-login-button"
        >
          {loading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        {error && (
          <div className="auth-message error">
            <span className="error-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {unverifiedUser && (
          <div className="verification-section">
            <p className="verification-text">
              Haven't received the verification email?
            </p>
            <button 
              onClick={handleResendVerification}
              disabled={loading}
              className="resend-button"
            >
              {loading ? 'Sending...' : 'Resend Verification Email'}
            </button>
          </div>
        )}

        <p className="auth-link">
          Don't have an account? <Link to="/signup">Sign up here</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;