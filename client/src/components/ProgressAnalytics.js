import React, { useState, useEffect } from 'react';

function ProgressAnalytics({ user }) {
  const [uploaded, setUploaded] = useState(0);
  const [saved, setSaved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        console.log('🔍 Starting token search...');
        let token = null;
        const debugData = {};

        const allKeys = Object.keys(localStorage);
        console.log('All localStorage keys:', allKeys);
        debugData.localStorageKeys = allKeys;

        const authKeys = allKeys.filter(key => 
          key.includes('auth') || 
          key.includes('token') || 
          key.includes('supabase') || 
          key.includes('sb-') ||
          key.includes('session')
        );

        console.log('Potential auth keys:', authKeys);
        debugData.authKeys = authKeys;

        for (const key of authKeys) {
          const value = localStorage.getItem(key);
          if (!value) continue;
          
          console.log(`🔍 Checking ${key}:`, value?.substring(0, 100) + '...');
          
          try {
            const parsed = JSON.parse(value);
            debugData[key] = 'JSON object';
            
            if (parsed.access_token) {
              token = parsed.access_token;
              console.log(`✅ Found access_token in ${key}`);
              break;
            }
            
            if (parsed.session?.access_token) {
              token = parsed.session.access_token;
              console.log(`✅ Found session.access_token in ${key}`);
              break;
            }
            
            if (parsed.user && parsed.session?.access_token) {
              token = parsed.session.access_token;
              console.log(`✅ Found Supabase token in ${key}`);
              break;
            }

            const searchObject = (obj, path = '') => {
              for (const [objKey, objValue] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${objKey}` : objKey;
                if (typeof objValue === 'string' && objValue.startsWith('eyJ') && objValue.length > 100) {
                  token = objValue;
                  console.log(`✅ Found JWT token at ${key}.${currentPath}`);
                  return true;
                }
                if (typeof objValue === 'object' && objValue !== null) {
                  if (searchObject(objValue, currentPath)) return true;
                }
              }
              return false;
            };

            if (searchObject(parsed)) break;
            
          } catch (e) {
            // Handle non-JSON values
            debugData[key] = 'String value';
            if (typeof value === 'string' && value.startsWith('eyJ') && value.length > 100) {
              token = value;
              console.log(`✅ Found direct JWT token in ${key}`);
              break;
            }
          }
        }

        if (!token) {
          console.log('🔍 Checking sessionStorage...');
          const sessionKeys = Object.keys(sessionStorage);
          debugData.sessionStorageKeys = sessionKeys;
          
          for (const key of sessionKeys) {
            if (key.includes('auth') || key.includes('token') || key.includes('sb-')) {
              try {
                const value = sessionStorage.getItem(key);
                const parsed = JSON.parse(value);
                
                if (parsed.access_token) {
                  token = parsed.access_token;
                  console.log(`✅ Found token in sessionStorage: ${key}`);
                  break;
                }
                
                if (parsed.session?.access_token) {
                  token = parsed.session.access_token;
                  console.log(`✅ Found session token in sessionStorage: ${key}`);
                  break;
                }
              } catch (e) {
                // Try as direct string
                const value = sessionStorage.getItem(key);
                if (typeof value === 'string' && value.startsWith('eyJ')) {
                  token = value;
                  console.log(`✅ Found direct token in sessionStorage: ${key}`);
                  break;
                }
              }
            }
          }
        }

        if (!token) {
          console.log('🔍 Checking cookies...');
          const cookies = document.cookie.split(';');
          for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name && (name.includes('auth') || name.includes('token')) && value) {
              try {
                const decoded = decodeURIComponent(value);
                if (decoded.startsWith('eyJ')) {
                  token = decoded;
                  console.log(`✅ Found token in cookie: ${name}`);
                  break;
                }
              } catch (e) {
                console.log(`⚠️ Error decoding cookie ${name}:`, e);
              }
            }
          }
        }

        if (!token) {
          console.log('🔍 Attempting to get session from server...');
          try {
            const sessionRes = await fetch('http://localhost:5000/api/auth/get-current-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                email: user.email || '202312280@gordoncollege.edu.ph',
                userId: user.id
              }),
              credentials: 'include'
            });
            
            if (sessionRes.ok) {
              const sessionData = await sessionRes.json();
              if (sessionData.token || sessionData.access_token) {
                token = sessionData.token || sessionData.access_token;
                console.log('✅ Got token from server session');
              }
            } else {
              console.log('⚠️ Server session request failed:', sessionRes.status);
            }
          } catch (e) {
            console.log('⚠️ Could not get session from server:', e.message);
          }
        }

        setDebugInfo(debugData);

        if (!token) {
          throw new Error('No authentication token found. Please try logging out and logging back in.');
        }

        console.log('🚀 Making analytics request with token...');
        console.log('Token preview:', token.substring(0, 20) + '...' + token.substring(token.length - 20));
        
        const res = await fetch(`http://localhost:5000/api/analytics/${user.id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error || `Request failed with status ${res.status}`);
        }

        const data = await res.json();
        setUploaded(data.modulesUploaded || 0);
        setSaved(data.modulesSaved || 0);
        
        console.log('✅ Analytics loaded successfully:', data);
        
      } catch (err) {
        console.error('❌ Error loading analytics:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, [user]);

  if (!user) return <p>Please log in to view your progress.</p>;

  if (loading) return <p>Loading your progress...</p>;

  if (error) {
    return (
      <div className="analytics-panel">
        <h4>Your Progress</h4>
        <p className="error-message">⚠️ {error}</p>
        <div style={{ marginTop: '10px' }}>
          <button onClick={() => window.location.reload()}>Retry</button>
          <button 
            onClick={() => {
              console.log('🔍 Full Debug Info:');
              console.log('User object:', user);
              console.log('Debug data:', debugInfo);
              console.log('All localStorage:', Object.fromEntries(
                Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])
              ));
              console.log('All sessionStorage:', Object.fromEntries(
                Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])
              ));
              console.log('Cookies:', document.cookie);
              
              if (debugInfo) {
                alert(`Debug Info:
LocalStorage keys: ${debugInfo.localStorageKeys?.length || 0}
SessionStorage keys: ${debugInfo.sessionStorageKeys?.length || 0}
Auth-related keys: ${debugInfo.authKeys?.length || 0}
Check console for full details.`);
              }
            }}
            style={{ marginLeft: '10px' }}
          >
            Debug Info
          </button>
          <button 
            onClick={() => {
              const keysToRemove = Object.keys(localStorage).filter(key => 
                key.includes('auth') || key.includes('token') || key.includes('supabase') || key.includes('sb-')
              );
              keysToRemove.forEach(key => localStorage.removeItem(key));
              
              const sessionKeysToRemove = Object.keys(sessionStorage).filter(key => 
                key.includes('auth') || key.includes('token') || key.includes('supabase') || key.includes('sb-')
              );
              sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
              
              window.location.href = '/login';
            }}
            style={{ marginLeft: '10px', backgroundColor: '#dc3545', color: 'white' }}
          >
            Clear Auth & Re-login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-panel">
      <h4>Your Progress</h4>
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        <li style={{ color: 'green', fontWeight: 'bold' }}>
          📤 Modules Uploaded: {uploaded}
        </li>
        <li style={{ color: 'green', fontWeight: 'bold' }}>
          📥 Modules Saved: {saved}
        </li>
      </ul>
    </div>
  );
}

export default ProgressAnalytics;