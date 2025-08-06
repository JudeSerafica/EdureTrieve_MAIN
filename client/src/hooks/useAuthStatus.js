import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const useAuthStatus = ({
  autoRedirect = true,
  fetchProtectedData = true,
  debug = false,
  autoCreateProfile = true,
} = {}) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [protectedData, setProtectedData] = useState(null);
  const [dataError, setDataError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;

      if (error) {
        if (debug) console.error('❌ Error getting session:', error.message);
        setUser(null);
      } else {
        setUser(session?.user || null);
        if (debug && session?.user) console.log('✅ Session user:', session.user.id);
      }

      setAuthLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user || null;
      if (!isMounted) return;

      setUser(currentUser);
      if (debug) console.log(`🔄 Auth event: ${event}`, currentUser?.id);

      // 🔧 Insert profile if needed
      if (event === 'SIGNED_IN' && autoCreateProfile && currentUser) {
        const { data: existing, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', currentUser.id)
          .single();

        if (!existing && !checkError) {
          const { error: insertErr } = await supabase.from('profiles').insert({
            id: currentUser.id,
            email: currentUser.email,
            username: currentUser.user_metadata?.username || 'guest',
          });

          if (insertErr && debug) {
            console.error('❌ Insert profile error:', insertErr.message);
          } else if (debug) {
            console.log('✅ Profile created for new user.');
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [debug, autoCreateProfile]);

  useEffect(() => {
    if (!authLoading && autoRedirect && !user) {
      if (debug) console.warn('➡️ Redirecting to /login (unauthenticated)');
      navigate('/login');
    }
  }, [authLoading, autoRedirect, user, navigate, debug]);

  useEffect(() => {
    let isMounted = true;

    const fetchProtected = async () => {
      if (!user || !fetchProtectedData) return;

      try {
        const { data, error } = await supabase.auth.getSession();
        const token = data?.session?.access_token;

        if (error || !token) throw new Error('No valid Supabase token');

        const res = await fetch('http://localhost:5000/api/protected-data', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to fetch protected data');
        }

        const result = await res.json();
        if (isMounted) {
          setProtectedData(result);
          setDataError('');
        }
      } catch (err) {
        if (isMounted) {
          setProtectedData(null);
          setDataError(err.message);
        }
        if (debug) console.error('❌ Protected fetch error:', err.message);
      }
    };

    fetchProtected();

    return () => {
      isMounted = false;
    };
  }, [user, fetchProtectedData, debug]);

  return {
    user,
    authLoading,
    protectedData,
    dataError,
    isAuthenticated: !!user,
  };
};

export default useAuthStatus;
