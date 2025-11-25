import { Link } from "react-router-dom"
import { useState, useEffect } from "react"

function HomePageContent() {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  })

  const navBarStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1.5rem 3rem",
    background: "rgba(15, 23, 42, 0.95)",
    backdropFilter: "blur(10px)",
    zIndex: 1000,
    borderBottom: "1px solid rgba(224, 224, 224, 0.1)",
  }

  const logoStyle = {
    fontSize: "1.7rem",
    fontWeight: "700",
    color: "#e0e0e0",
    textDecoration: "none",
  }

  const navButtonsStyle = {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
  }

  const logInButtonStyle = {
    padding: "0.6rem 1.5rem",
    fontSize: "1rem",
    fontWeight: "600",
    textDecoration: "none",
    color: "#e0e0e0",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    transition: "color 0.3s ease",
  }

  const signUpButtonStyle = {
    padding: "0.6rem 1.5rem",
    fontSize: "1rem",
    fontWeight: "600",
    textDecoration: "none",
    color: "#e0e0e0",
    backgroundColor: "#3458bb",
    borderRadius: "20px",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.3s ease, transform 0.2s ease",
  }

  const containerStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "92.2vh",
    paddingTop: "6rem",
    padding: "2rem",
    textAlign: "center",
    background: "linear-gradient(180deg, #0f172a, #001652, #0f172a)",
    fontFamily: "Inter, sans-serif",
    color: "#333",
  }


  const headingStyle = {
    fontSize: "3.5rem",
    fontWeight: "700",
    color: "#e0e0e0",
    marginBottom: "1rem",
    textShadow: "2px 2px 4px rgba(0,0,0,0.4)",
    lineHeight: "1.2",
    maxWidth: "900px",
  }

  const paragraphStyle = {
    fontSize: "1.1rem",
    maxWidth: "700px",
    lineHeight: "1.6",
    marginBottom: "3rem",
    color: "#a0a0a0",
  }

  const scrollIndicatorStyle = {
    fontSize: "2rem",
    color: "#a0a0a0",
    marginBottom: "2rem",
    animation: "bounce 2s infinite",
  }

  const ctaButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.8rem 2rem",
    fontSize: "1.2rem",
    fontWeight: "600",
    textDecoration: "none",
    color: "#e0e0e0",
    backgroundColor: "#3458bb",
    borderRadius: "30px",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.3s ease, transform 0.2s ease",
    marginBottom: "2rem",
  }

  const arrowStyle = {
    fontSize: "1.5rem",
  }

  return (
    <>
      <nav style={navBarStyle}>
        <div style={logoStyle}>EDURETRIEVE</div>
        <div style={navButtonsStyle}>
          <Link to="/login" style={logInButtonStyle}>
            Sign In
          </Link>
          <Link to="/signup" style={signUpButtonStyle}>
            Sign Up
          </Link>
        </div>
      </nav>

      <div style={containerStyle}>

        <h1 style={headingStyle}>Learn Smarter with EduRerieve AI</h1>
        <p style={paragraphStyle}>
          Upload your study materials and chat with AI to get instant answers, summaries, and personalized learning
          insights.
        </p>

        <div style={scrollIndicatorStyle}>↓</div>

        <Link to="/signup" style={ctaButtonStyle}>
          Get started
          <span style={arrowStyle}>→</span>
        </Link>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </>
  )
}

export default HomePageContent