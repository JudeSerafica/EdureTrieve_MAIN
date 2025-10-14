import React, { useEffect } from "react";

function SearchPage() {
  useEffect(() => {
    const cx = "c741e6fbbdc3948b7"; // your CX
    const gcseScript = document.createElement("script");
    gcseScript.type = "text/javascript";
    gcseScript.async = true;
    gcseScript.src = "https://cse.google.com/cse.js?cx=" + cx;
    document.body.appendChild(gcseScript);

    return () => {
      document.body.removeChild(gcseScript);
    };
  }, []);

  return (
    <div className="search-page">
      <div className="search-logo">
        <h1>EduRetrieve</h1>
      </div>

      {/* Google CSE element */}
      <div className="gcse-searchbox"></div> 
      <div className="gcse-searchresults"></div>
    </div>
  );
}

export default SearchPage;
