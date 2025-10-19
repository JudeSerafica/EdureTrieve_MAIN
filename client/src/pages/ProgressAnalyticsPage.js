import { useState, useEffect, useCallback, useRef } from "react"
import useAuthStatus from "../hooks/useAuthStatus"
import useTrackTime from "../hooks/useTrackTime"
import { supabase } from "../supabaseClient"
import {
  BarChart as RechartsBarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

function ProgressAnalyticsPage() {
  const { user, authLoading } = useAuthStatus()
  const [uploaded, setUploaded] = useState(0)
  const [saved, setSaved] = useState(0)
  const [timeSpent, setTimeSpent] = useState(0)
  const [daily, setDaily] = useState(0)
  const [weekly, setWeekly] = useState(0)
  const [monthly, setMonthly] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [totalUsers, setTotalUsers] = useState(0)
  const [currentSessionTime, setCurrentSessionTime] = useState(0)
  const [studyStreak, setStudyStreak] = useState(0)
  const [folderStats, setFolderStats] = useState([])
  const [timeSeriesData, setTimeSeriesData] = useState([])
  const sessionTimerRef = useRef(null)
  const lastRefreshTimeRef = useRef(0)

  // Use the useTrackTime hook to track time
  useTrackTime(user)

  // Analytics loading function (with useCallback for performance)
  const loadAnalytics = useCallback(async (withLoader = false) => {
    if (!user?.id) return

    if (withLoader) {
      setLoading(true)
    }
    setError(null)

    try {
      const today = new Date()
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - today.getDay())
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

      const [
        { count: uploadedCount, error: uploadedError },
        { count: savedCount, error: savedError },
        { data: timeRows, error: timeError },
        { count: totalUsersCount, error: totalUsersError },
        { data: saveModulesData, error: saveModulesError },
      ] = await Promise.all([
        supabase.from("modules").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("save_modules").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("usage_time").select("seconds_spent, date").eq("user_id", user.id),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("save_modules").select("folder_id").eq("user_id", user.id),
      ])

      if (uploadedError) throw uploadedError
      if (savedError) throw savedError
      if (timeError) throw timeError
      if (totalUsersError) throw totalUsersError
      if (saveModulesError) throw saveModulesError

      setUploaded(uploadedCount || 0)
      setSaved(savedCount || 0)
      setTotalUsers(totalUsersCount || 0)

      // <CHANGE> Process folder statistics from save_modules data
      const folderCounts = {}
      saveModulesData?.forEach((item) => {
        const folderId = item.folder_id || "Uncategorized"
        folderCounts[folderId] = (folderCounts[folderId] || 0) + 1
      })

      // Get folder names from the folders table
      const folderIds = Object.keys(folderCounts).filter(id => id !== "Uncategorized")
      let folderNames = {}

      if (folderIds.length > 0) {
        const { data: foldersData } = await supabase
          .from('folders')
          .select('id, name')
          .eq('user_id', user.id)
          .in('id', folderIds)

        folderNames = foldersData?.reduce((acc, folder) => {
          acc[folder.id] = folder.name
          return acc
        }, {}) || {}
      }

      const folderData = Object.entries(folderCounts).map(([folderId, count]) => ({
        name: folderId === "Uncategorized" ? "Uncategorized" : (folderNames[folderId] || `Folder ${folderId}`),
        value: count,
      }))
      setFolderStats(folderData)

      // <CHANGE> Process time series data for line chart
      const usageRows = timeRows || []
      let total = 0,
        dailyTotal = 0,
        weeklyTotal = 0,
        monthlyTotal = 0

      const timeSeriesMap = {}
      usageRows.forEach((row) => {
        const seconds = row.seconds_spent || 0
        total += seconds
        const rowDate = new Date(row.date)
        const dateStr = rowDate.toLocaleDateString()

        timeSeriesMap[dateStr] = (timeSeriesMap[dateStr] || 0) + seconds

        if (rowDate.toDateString() === today.toDateString()) dailyTotal += seconds
        if (rowDate >= startOfWeek) weeklyTotal += seconds
        if (rowDate >= startOfMonth) monthlyTotal += seconds
      })

      const timeSeriesArray = Object.entries(timeSeriesMap)
        .map(([date, seconds]) => ({
          date,
          hours: Math.round((seconds / 3600) * 10) / 10,
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-7)

      setTimeSeriesData(timeSeriesArray)
      setTimeSpent(total)
      setDaily(dailyTotal)
      setWeekly(weeklyTotal)
      setMonthly(monthlyTotal)

      // <CHANGE> Calculate study streak
      const usageDates = timeRows?.map((row) => new Date(row.date).toDateString()) || []
      let streak = 0
      const currentDate = new Date(today)

      while (usageDates.includes(currentDate.toDateString()) || currentDate.toDateString() === today.toDateString()) {
        if (usageDates.includes(currentDate.toDateString())) {
          streak++
        } else {
          break
        }
        currentDate.setDate(currentDate.getDate() - 1)
      }

      setStudyStreak(streak)
    } catch (err) {
      console.error("Error loading analytics:", err)
      setError(err.message || "Failed to load analytics data.")
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (authLoading || !user?.id) return

    loadAnalytics(true)

    // Real-time subscription for usage_time table with 5-second throttling
    const handleTimeUpdate = (payload) => {
      const now = Date.now()
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current
      
      // Only listen to INSERT and UPDATE events
      if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') {
        return
      }
      
      // Throttle: only refresh if at least 5 seconds have passed
      if (timeSinceLastRefresh >= 5000) {
        console.log(`📊 Real-time ${payload.eventType}: Synchronizing Today/Week/Month from Supabase`)
        lastRefreshTimeRef.current = now
        loadAnalytics(false) // Silent refresh - recalculates all time metrics
      } else {
        const waitTime = Math.round((5000 - timeSinceLastRefresh) / 1000)
        console.log(`⏳ Throttled: ${waitTime}s until next sync`)
      }
    }

    const channel = supabase
      .channel(`progress-analytics-time-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "usage_time",
          filter: `user_id=eq.${user.id}`
        },
        handleTimeUpdate
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authLoading, user?.id, loadAnalytics])

  useEffect(() => {
    if (!user?.id) {
      setCurrentSessionTime(0)
      return
    }

    const todayDate = new Date().toDateString()
    const storageKey = `sessionStart_${user.id}_${todayDate}`
    const storedStartTime = localStorage.getItem(storageKey)

    let startTime
    if (storedStartTime && JSON.parse(storedStartTime).date === todayDate) {
      startTime = JSON.parse(storedStartTime).timestamp
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setCurrentSessionTime(elapsed)
    } else {
      startTime = Date.now()
      localStorage.setItem(storageKey, JSON.stringify({ timestamp: startTime, date: todayDate }))
      setCurrentSessionTime(0)
    }

    sessionTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setCurrentSessionTime(elapsed)
    }, 1000)

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
      }
    }
  }, [user?.id])

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }

  if (authLoading) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <p>Please log in to view your progress analytics.</p>
        </div>
      </div>
    )
  }

  const COLORS = [
    "#3458bb", // Blue for Uncategorized
    "#10B981", // Green
    "#F59E0B", // Orange
    "#EF4444", // Red
    "#8B5CF6", // Purple
    "#EC4899", // Pink
    "#06B6D4", // Cyan
    "#84CC16", // Lime
    "#F97316", // Deep Orange
    "#14B8A6", // Teal
    "#A855F7", // Violet
    "#F43F5E", // Rose
    "#0EA5E9", // Sky Blue
    "#22C55E", // Emerald
    "#EAB308", // Yellow
    "#DC2626", // Bright Red
    "#7C3AED", // Indigo
    "#DB2777", // Hot Pink
  ]

  // Data sets for updated charts
  const modulesChartData = [
    { name: "Uploaded", value: uploaded }
  ]

  // Assign unique colors to each folder, with Uncategorized always getting #3458bb
  const folderCategories = (folderStats || []).map((item, index) => {
    let colorIndex
    if (item.name === "Uncategorized") {
      colorIndex = 0 // Always use first color (#3458bb) for Uncategorized
    } else {
      // For other folders, skip index 0 and use subsequent colors
      colorIndex = (index % (COLORS.length - 1)) + 1
    }
    
    return {
      ...item,
      color: COLORS[colorIndex],
    }
  })

  // Optional drilldown handler (no-op to keep current logic intact)
  const handleDrillDown = (name) => {
    // Hook up filtering here if needed
  }

  // (deduped) - helper data and handlers already defined above

  return (
    <div className="analytics-page">
      {/* Header */}
      <div className="analytics-header-wrapper">
        <div className="analytics-header">
          <h2>📊 Progress Analytics</h2>
          <button onClick={() => loadAnalytics(true)} className="analytics-refresh-btn">
            🔄 Refresh
          </button>
        </div>
        <div className="analytics-divider"></div>
      </div>

      {error && (
        <div className="analytics-error">
          <p>⚠️ {error}</p>
        </div>
      )}

      {loading ? (
        <div className="analytics-loading">
          <p>Loading your analytics...</p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="analytics-stats-grid">
            <div className="analytics-card">
              <div className="analytics-card-icon" style={{ backgroundColor: "#DBEAFE", color: "#3B82F6" }}>
                📤
              </div>
              <div className="analytics-card-content">
                <p className="analytics-card-label">Modules Uploaded</p>
                <h3 className="analytics-card-value" style={{ color: "#3B82F6" }}>
                  {uploaded}
                </h3>
                <p className="analytics-card-meta">Modules you've shared</p>
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-icon" style={{ backgroundColor: "#DCFCE7", color: "#10B981" }}>
                📥
              </div>
              <div className="analytics-card-content">
                <p className="analytics-card-label">Modules Saved</p>
                <h3 className="analytics-card-value" style={{ color: "#10B981" }}>
                  {saved}
                </h3>
                <p className="analytics-card-meta">In your collection</p>
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-icon" style={{ backgroundColor: "#FEF3C7", color: "#F59E0B" }}>
                ⏱️
              </div>
              <div className="analytics-card-content">
                <p className="analytics-card-label">Total Time Spent</p>
                <h3 className="analytics-card-value" style={{ color: "#F59E0B" }}>
                  {formatTime(timeSpent + currentSessionTime)}
                </h3>
                <p className="analytics-card-meta">Total time on platform</p>
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-icon" style={{ backgroundColor: "#EDE9FE", color: "#8B5CF6" }}>
                👥
              </div>
              <div className="analytics-card-content">
                <p className="analytics-card-label">Total Users</p>
                <h3 className="analytics-card-value" style={{ color: "#8B5CF6" }}>
                  {totalUsers}
                </h3>
                <p className="analytics-card-meta">Community members</p>
              </div>
            </div>
          </div>

          {/* Time Period Cards */}
          <div className="analytics-time-cards-grid" style={{ marginBottom: '2rem' }}>
            <div className="analytics-time-card">
              <div className="analytics-time-card-icon">📅</div>
              <h4 className="analytics-time-card-label">Today</h4>
              <p className="analytics-time-card-value">{formatTime(daily + currentSessionTime)}</p>
            </div>

            <div className="analytics-time-card">
              <div className="analytics-time-card-icon">🗓️</div>
              <h4 className="analytics-time-card-label">This Week</h4>
              <p className="analytics-time-card-value">{formatTime(weekly + currentSessionTime)}</p>
            </div>

            <div className="analytics-time-card">
              <div className="analytics-time-card-icon">📊</div>
              <h4 className="analytics-time-card-label">This Month</h4>
              <p className="analytics-time-card-value">{formatTime(monthly + currentSessionTime)}</p>
            </div>

            <div className="analytics-time-card">
              <div className="analytics-time-card-icon">🔥</div>
              <h4 className="analytics-time-card-label">Study Streak</h4>
              <p className="analytics-time-card-value">
                {studyStreak} {studyStreak === 1 ? "day" : "days"}
              </p>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Bar Chart */}
            <div className="analytics-chart-card" style={{ height: "50vh", padding: '2rem' }}>
              <div className="analytics-chart-header">
                <h3 className="analytics-chart-title">Modules Uploaded</h3>
              </div>
              <div className="analytics-chart-container">
                <ResponsiveContainer width="100%" height={400}>
                  <RechartsBarChart data={modulesChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3458bb" />
                    <XAxis
                      dataKey="name"
                      stroke="#6b7280"
                      fontSize={14}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={14}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #ffffff',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px'
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#3458bb"
                      radius={[4, 4, 0, 0]}
                      stroke="#2563eb"
                      strokeWidth={1}
                    />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="analytics-chart-card" style={{ height: "50vh",padding: '2rem' }}>
              <div className="analytics-chart-header">
                <h3 className="analytics-chart-title">Saved Modules by Folder</h3>
              </div>
              <div className="analytics-chart-container">
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={folderCategories}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      innerRadius={60}
                      fill="#8b5cf6"
                      dataKey="value"
                      onClick={(data) => handleDrillDown(data.name)}
                      label={({ name, percent }) => percent > 5 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {folderCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #3458bb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px'
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

            {/* Line Chart - Time Spent */}
            <div className="analytics-chart-card analytics-chart-full" style={{ height: "45vh",padding: '2rem' }}>
              <div className="analytics-chart-header">
                <h3 className="analytics-chart-title">Time Spent (Last 7 Days)</h3>
              </div>
              <div className="analytics-chart-container">
                <ResponsiveContainer width="100%" height={350}>
                  {timeSeriesData.length > 0 ? (
                    <RechartsLineChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} />
                      <YAxis hide={true} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="analytics-tooltip">
                                <p>{`${payload[0].value} hours`}</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="#3458bb"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "white", stroke: "#3458bb", strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                        name="Hours Spent"
                      />
                    </RechartsLineChart>
                  ) : (
                    <div className="analytics-empty-state">
                      <p>No time data available yet</p>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
        </>
      )}
    </div>
  )
}

export default ProgressAnalyticsPage

