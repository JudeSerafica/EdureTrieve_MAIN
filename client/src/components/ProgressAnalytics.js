import React, { useState, useEffect } from 'react';

function ProgressAnalytics({ user }) {
  const [uploaded, setUploaded] = useState(0);
  const [saved, setSaved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`http://localhost:5000/api/analytics/${user.id}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch analytics');
        }

        const data = await res.json();
        setUploaded(data.modulesUploaded || 0);
        setSaved(data.modulesSaved || 0);
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

  if (error)
    return (
      <div className="analytics-panel">
        <h4>Your Progress</h4>
        <p className="error-message">⚠️ {error}</p>
      </div>
    );

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
