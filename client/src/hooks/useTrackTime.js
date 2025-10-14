import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

export default function useTrackTime(user) {
  const startRef = useRef(Date.now());
  const intervalRef = useRef(null);
  const unsyncedSecondsRef = useRef(0); // ⬅️ store locally
  const isActiveRef = useRef(true); // Track if user is active

  useEffect(() => {
    if (!user?.id) return;

    console.log('🚀 Starting time tracking for user:', user.id);
    startRef.current = Date.now(); // Reset start time when user changes

    const saveTime = async () => {
      // Only track time if user is active (tab is focused)
      if (!isActiveRef.current) {
        console.log("⏸️ Skipping time tracking - user inactive");
        return;
      }

      const now = Date.now();
      const secondsElapsed = Math.floor((now - startRef.current) / 1000);
      startRef.current = now;

      // ✅ Add to local unsynced counter
      unsyncedSecondsRef.current += secondsElapsed;
      console.log("⏱ Interval tick:", secondsElapsed, "seconds since last save");
      console.log("🕒 Unsynced total seconds:", unsyncedSecondsRef.current);

      const today = new Date().toISOString().slice(0, 10);

      try {
        // 🔄 Fetch existing seconds from Supabase
        const { data, error: selectError } = await supabase
          .from("usage_time")
          .select("seconds_spent")
          .eq("user_id", user.id)
          .eq("date", today)
          .maybeSingle();

        if (selectError) throw selectError;

        const totalSeconds = (data?.seconds_spent || 0) + unsyncedSecondsRef.current;

        // 🔄 Upsert to Supabase
        const { error: upsertError } = await supabase
          .from("usage_time")
          .upsert(
            {
              user_id: user.id,
              date: today,
              seconds_spent: totalSeconds,
            },
            { onConflict: ["user_id", "date"] }
          );

        if (upsertError) throw upsertError;

        console.log("✅ Time synced to Supabase:", totalSeconds);

        // ⬅️ reset local unsynced counter after successful save
        unsyncedSecondsRef.current = 0;
      } catch (err) {
        console.warn("⚠️ Could not sync to Supabase, will retry next interval:", err.message);
        // Keep unsyncedSecondsRef.current intact for retry
      }
    };

    // 👀 Track user activity (focus/blur events)
    const handleFocus = () => {
      if (!isActiveRef.current) {
        console.log('🔄 User returned - resuming time tracking');
        startRef.current = Date.now(); // Reset timer when user returns
        isActiveRef.current = true;
      }
    };

    const handleBlur = () => {
      console.log('⏸️ User left - pausing time tracking');
      isActiveRef.current = false;
    };

    // Add event listeners for tab focus/blur
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        handleBlur();
      } else {
        handleFocus();
      }
    });

    // 🚀 Start tracking every 10s
    intervalRef.current = setInterval(saveTime, 10000);

    // 🎯 Save time immediately when component mounts
    console.log('⏱️ Initial time tracking started');

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('🛑 Time tracking stopped');
      }
      
      // Clean up event listeners
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user]);
}
