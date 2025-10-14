import React, { useState, useEffect, useCallback, useRef } from 'react';
import useAuthStatus from '../hooks/useAuthStatus';
import useTrackTime from '../hooks/useTrackTime';
import { supabase } from '../supabaseClient';

// ------------------------
// 📊 ProgressAnalyticsPage Component
// ------------------------
function ProgressAnalyticsPage() {
  const { user, authLoading } = useAuthStatus();
  const [uploaded, setUploaded] = useState(0);
  const [saved, setSaved] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [daily, setDaily] = useState(0);
  const [weekly, setWeekly] = useState(0);
  const [monthly, setMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [usersUpdated, setUsersUpdated] = useState(false);
  const [currentSessionTime, setCurrentSessionTime] = useState(0);
  const [studyStreak, setStudyStreak] = useState(0);
  const sessionTimerRef = useRef(null);

  // ✅ Start tracking usage time as soon as user logs in
  useTrackTime(user);

  const loadAnalytics = useCallback(
    async (withLoader = false) => {
      if (!user?.id) return;

      if (withLoader) {
        setLoading(true);
      }
      setError(null);

      try {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        console.log('🔍 Fetching total users count...');
        const [
          { count: uploadedCount, error: uploadedError },
          { count: savedCount, error: savedError },
          { data: timeRows, error: timeError },
          { data: profilesRows, error: profilesError },
          { count: totalUsersCount, error: totalUsersError },
        ] = await Promise.all([
          supabase
            .from('modules')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('save_modules')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('usage_time')
            .select('seconds_spent, date')
            .eq('user_id', user.id),
          supabase
            .from('profiles')
            .select('*'),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true }),
        ]);

        console.log('📊 Raw data:', {
          uploadedCount,
          savedCount,
          timeRowsLength: timeRows?.length || 0,
          profilesRowsLength: profilesRows?.length || 0,
          totalUsersCount,
        });

        if (uploadedError) {
          console.error('❌ Upload error:', uploadedError);
          throw uploadedError;
        }
        if (savedError) {
          console.error('❌ Saved error:', savedError);
          throw savedError;
        }
        if (timeError) {
          console.error('❌ Time error:', timeError);
          throw timeError;
        }
        if (profilesError) {
          console.error('❌ Profiles error:', profilesError);
          throw profilesError;
        }
        if (totalUsersError) {
          console.error('❌ Total users error:', totalUsersError);
          throw totalUsersError;
        }

        console.log('✅ Data fetched successfully, setting states...');
        setUploaded(uploadedCount || 0);
        setSaved(savedCount || 0);
        setTotalUsers(totalUsersCount || 0);
        setUsersUpdated(true); // Mark as updated on initial load
        setTimeout(() => setUsersUpdated(false), 2000); // Reset after 2 seconds

        const usageRows = timeRows || [];
        let total = 0,
          dailyTotal = 0,
          weeklyTotal = 0,
          monthlyTotal = 0;

        usageRows.forEach((row) => {
          const seconds = row.seconds_spent || 0;
          total += seconds;
          const rowDate = new Date(row.date);

          if (rowDate.toDateString() === today.toDateString()) dailyTotal += seconds;
          if (rowDate >= startOfWeek) weeklyTotal += seconds;
          if (rowDate >= startOfMonth) monthlyTotal += seconds;
        });

        setTimeSpent(total);
        setDaily(dailyTotal);
        setWeekly(weeklyTotal);
        setMonthly(monthlyTotal);

        // Calculate study streak
        const usageDates = timeRows?.map(row => new Date(row.date).toDateString()) || [];
        let streak = 0;
        let currentDate = new Date(today);

        while (usageDates.includes(currentDate.toDateString()) || currentDate.toDateString() === today.toDateString()) {
          if (usageDates.includes(currentDate.toDateString()) || (currentDate.toDateString() === today.toDateString() && currentSessionTime > 0)) {
            streak++;
          } else {
            break;
          }
          currentDate.setDate(currentDate.getDate() - 1);
        }

        setStudyStreak(streak);
      } catch (err) {
        console.error('❌ Error loading analytics:', err);
        setError(err.message || 'Failed to load analytics data.');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id]
  );

  useEffect(() => {
    if (authLoading || !user?.id) return;

    loadAnalytics(true);

    const channel = supabase
      .channel(`progress-analytics-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'modules', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('🔄 Modules changed:', payload);
          loadAnalytics();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'save_modules', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('🔄 Save modules changed:', payload);
          loadAnalytics();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usage_time', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('🔄 Usage time changed:', payload);
          loadAnalytics();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          console.log('🔄 New profile inserted:', payload);
          setUsersUpdated(true);
          loadAnalytics();
        }
      )
      .subscribe((status) => {
        console.log('📡 Supabase subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id, loadAnalytics]);

  // ⏱️ Real-time session timer with persistence
  useEffect(() => {
    if (!user?.id) {
      setCurrentSessionTime(0);
      return;
    }

    const today = new Date().toDateString();
    const storageKey = `sessionStart_${user.id}_${today}`;
    const storedStartTime = localStorage.getItem(storageKey);

    let startTime;
    if (storedStartTime && JSON.parse(storedStartTime).date === today) {
      startTime = JSON.parse(storedStartTime).timestamp;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setCurrentSessionTime(elapsed);
    } else {
      startTime = Date.now();
      localStorage.setItem(storageKey, JSON.stringify({ timestamp: startTime, date: today }));
      setCurrentSessionTime(0);
    }

    sessionTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setCurrentSessionTime(elapsed);
    }, 1000);

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
  }, [user?.id]);

  // Clean up old localStorage entries for previous days
  useEffect(() => {
    if (!user?.id) return;

    const today = new Date().toDateString();
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`sessionStart_${user.id}_`) && !key.includes(today)) {
        localStorage.removeItem(key);
      }
    });
  }, [user?.id]);

  // Update time displays when current session time changes
  useEffect(() => {
    if (timeSpent > 0 || currentSessionTime > 0) {
      // This will trigger a re-render with updated time displays
      // The formatTime function will be called with the new total
    }
  }, [currentSessionTime, timeSpent, daily, weekly, monthly]);

  // ------------------------
  // ⏱ Time Formatter
  // ------------------------
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  if (authLoading) {
    return (
      <div className="dashboard-page">
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dashboard-page">
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <p>Please log in to view your progress analytics.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-headerss-wrapper">
          <div className="dashboard-headerss">
            <h2>📊 Progress Analytics</h2>
          </div>
          <div className="dashboard-divider"></div>
        </div>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <p>Loading your progress...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-headerss-wrapper">
          <div className="dashboard-headerss">
            <h2>📊 Progress Analytics</h2>
          </div>
          <div className="dashboard-divider"></div>
        </div>
        <div className="analytics-panel">
          <h4>Your Progress</h4>
          <p className="error-message">⚠️ {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboards-page" style={{ padding: '1rem' }}>
      <div className="dashboard-headerss-wrapper">
        <div className="dashboards-headerss">
          <h2>📊 Progress Analytics</h2>
          <button
            onClick={() => loadAnalytics(true)}
            style={{
              marginLeft: '10px',
              padding: '5px 10px',
              backgroundColor: '#3458bb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh
          </button>
        </div>
        <div className="dashboard-divider"></div>
      </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '15px',
          marginTop: '20px'
        }}>
          {/* Users Card - Monthly Trends */}
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #e9ecef',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#6f42c1', marginBottom: '8px' }}>👥</div>
            <h5 style={{ color: '#333', marginBottom: '8px', fontSize: '1em' }}>Users</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#6f42c1', margin: '8px 0' }}>
              {totalUsers}
              {usersUpdated && <span style={{ fontSize: '0.7em', color: '#28a745', marginLeft: '5px' }}>●</span>}
            </p>
            <p style={{ fontSize: '0.8em', color: '#666' }}>Total users</p>
          </div>

          {/* Modules Upload Card */}
          <div style={{
            backgroundColor: '#fff3cd',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #ffeaa7',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#856404', marginBottom: '8px' }}>📤</div>
            <h5 style={{ color: '#856404', marginBottom: '8px', fontSize: '1em' }}>Modules upload</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#856404', margin: '8px 0' }}>{uploaded}</p>
            <p style={{ fontSize: '0.8em', color: '#856404' }}>Modules you've shared</p>
          </div>

          {/* Modules Saved Card */}
          <div style={{
            backgroundColor: '#d1ecf1',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #bee5eb',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#0c5460', marginBottom: '8px' }}>📥</div>
            <h5 style={{ color: '#0c5460', marginBottom: '8px', fontSize: '1em' }}>Modules saved</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#0c5460', margin: '8px 0' }}>{saved}</p>
            <p style={{ fontSize: '0.8em', color: '#0c5460' }}>Modules in your library</p>
          </div>

          {/* Total Time Spent Card */}
          <div style={{
            backgroundColor: '#d4edda',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #c3e6cb',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#155724', marginBottom: '8px' }}>⏱️</div>
            <h5 style={{ color: '#155724', marginBottom: '8px', fontSize: '1em' }}>Total time spent</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#155724', margin: '8px 0' }}>
              {formatTime(timeSpent + currentSessionTime)}
              {currentSessionTime > 0 && <span style={{ fontSize: '0.7em', color: '#28a745', marginLeft: '5px' }}>●</span>}
            </p>
            <p style={{ fontSize: '0.8em', color: '#155724' }}>Total time on platform (including current session)</p>
          </div>

          {/* Today Card */}
          <div style={{
            backgroundColor: '#e2e3e5',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #d6d8db',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#383d41', marginBottom: '8px' }}>📅</div>
            <h5 style={{ color: '#383d41', marginBottom: '8px', fontSize: '1em' }}>Today</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#383d41', margin: '8px 0' }}>
              {formatTime(daily + currentSessionTime)}
              {currentSessionTime > 0 && <span style={{ fontSize: '0.7em', color: '#28a745', marginLeft: '5px' }}>●</span>}
            </p>
            <p style={{ fontSize: '0.8em', color: '#383d41' }}>Time spent today</p>
          </div>

          {/* This Week Card */}
          <div style={{
            backgroundColor: '#f8d7da',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #f5c6cb',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#721c24', marginBottom: '8px' }}>🗓️</div>
            <h5 style={{ color: '#721c24', marginBottom: '8px', fontSize: '1em' }}>This week</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#721c24', margin: '8px 0' }}>
              {formatTime(weekly + currentSessionTime)}
              {currentSessionTime > 0 && <span style={{ fontSize: '0.7em', color: '#28a745', marginLeft: '5px' }}>●</span>}
            </p>
            <p style={{ fontSize: '0.8em', color: '#721c24' }}>Weekly activity time</p>
          </div>

          {/* This Month Card */}
          <div style={{
            backgroundColor: '#e9ecef',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #dee2e6',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5em', color: '#495057', marginBottom: '8px' }}>📊</div>
            <h5 style={{ color: '#495057', marginBottom: '8px', fontSize: '1em' }}>This month</h5>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#495057', margin: '8px 0' }}>
              {formatTime(monthly + currentSessionTime)}
              {currentSessionTime > 0 && <span style={{ fontSize: '0.7em', color: '#28a745', marginLeft: '5px' }}>●</span>}
            </p>
            <p style={{ fontSize: '0.8em', color: '#495057' }}>Monthly activity time</p>
          </div>
        </div>

        {/* Study Streak Tracker */}
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '15px',
          borderRadius: '6px',
          border: '1px solid #ffeaa7',
          textAlign: 'center',
          marginTop: '20px'
        }}>
          <div style={{ fontSize: '2.5em', marginBottom: '8px' }}>🔥</div>
          <h5 style={{ color: '#856404', marginBottom: '8px', fontSize: '1em' }}>Study Streak</h5>
          <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#856404', margin: '8px 0' }}>
            {studyStreak} {studyStreak === 1 ? 'day' : 'days'}
          </p>
          <p style={{ fontSize: '0.8em', color: '#856404' }}>Consecutive days of learning</p>
        </div>

      </div>
  );
}

export default ProgressAnalyticsPage;
