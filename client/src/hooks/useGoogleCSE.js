import { useEffect, useState } from 'react';

/**
 * Custom hook for managing Google Custom Search Engine (CSE) script loading
 * @param {string} cx - Google CSE CX ID from environment variables
 * @returns {Object} - { isLoading, error, isLoaded }
 */
const useGoogleCSE = (cx) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!cx) {
      setError('Google CSE CX ID is not configured');
      setIsLoading(false);
      return;
    }

    // Check if script is already loaded
    const existingScript = document.querySelector(`script[src*="cse.js?cx=${cx}"]`);
    if (existingScript) {
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    const gcseScript = document.createElement('script');
    gcseScript.type = 'text/javascript';
    gcseScript.async = true;
    gcseScript.src = `https://cse.google.com/cse.js?cx=${cx}`;

    const handleLoad = () => {
      setIsLoaded(true);
      setIsLoading(false);
      setError(null);
    };

    const handleError = () => {
      setError('Failed to load Google Custom Search Engine');
      setIsLoading(false);
    };

    gcseScript.addEventListener('load', handleLoad);
    gcseScript.addEventListener('error', handleError);

    document.body.appendChild(gcseScript);

    return () => {
      gcseScript.removeEventListener('load', handleLoad);
      gcseScript.removeEventListener('error', handleError);
      // Only remove if it exists and we're cleaning up
      if (document.body.contains(gcseScript)) {
        document.body.removeChild(gcseScript);
      }
    };
  }, [cx]);

  return { isLoading, error, isLoaded };
};

export default useGoogleCSE;