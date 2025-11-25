import React from "react";
import PropTypes from "prop-types";
import { useAuthContext } from "../contexts/AuthContext";
import useGoogleCSE from "../hooks/useGoogleCSE";

/**
 * SearchPage component that integrates Google Custom Search Engine
 * Provides educational content search functionality for EduRetrieve users
 */
function SearchPage() {
  const { user } = useAuthContext();
  const cx = process.env.REACT_APP_GOOGLE_CSE_CX;
  const { isLoading, error, isLoaded } = useGoogleCSE(cx);

  // Loading state
  if (isLoading) {
    return (
      <div className="search-page">
        <div className="search-logo">
          <h1>EduRetrieve</h1>
        </div>
        <div className="search-loading" role="status" aria-live="polite">
          <div className="loading-spinner"></div>
          <p>Loading search functionality...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="search-page">
        <div className="search-logo">
          <h1>EduRetrieve</h1>
        </div>
        <div className="search-error" role="alert">
          <h2>Search Unavailable</h2>
          <p>{error}</p>
          <p>Please try again later or contact support if the problem persists.</p>
          <div className="search-instructions">
            <h3>How to use EduRetrieve Search:</h3>
            <ul>
              <li>Search for educational content, research papers, and learning resources</li>
              <li>Use specific keywords for better results</li>
              <li>Filter by date, file type, or content type when available</li>
              <li>Save interesting results to your EduRetrieve account</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-page">
      <div className="search-logo">
        <h1>EduRetrieve</h1>
        {user && (
          <p className="search-welcome">
            Welcome back, {user.email}! Search for educational resources below.
          </p>
        )}
      </div>

      <div className="search-instructions">
        <p>
          Discover educational content, research papers, and learning resources.
          Use the search box below to find relevant materials for your studies.
        </p>
      </div>

      {/* Google CSE elements with accessibility attributes */}
      <div
        className="gcse-searchbox"
        role="search"
        aria-label="Educational content search"
      ></div>
      <div
        className="gcse-searchresults"
        role="main"
        aria-label="Search results"
      ></div>

      {isLoaded && (
        <div className="search-tips">
          <h3>Search Tips:</h3>
          <ul>
            <li>Use quotes for exact phrases: "machine learning"</li>
            <li>Add site:domain.com to search specific websites</li>
            <li>Use filetype:pdf for PDF documents</li>
            <li>Combine terms with AND/OR for complex queries</li>
          </ul>
        </div>
      )}
    </div>
  );
}

SearchPage.propTypes = {
  // No props currently, but defined for future extensibility
};

export default SearchPage;
