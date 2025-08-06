import { Link } from 'react-router-dom';

function HomePageContent() {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '92vh',
    padding: '2rem',
    textAlign: 'center',
    backgroundColor: '#0e1628',
    fontFamily: 'Inter, sans-serif',
    color: '#333',
  };

  const headingStyle = {
    fontSize: '3.5rem',
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: '1rem',
    textShadow: '2px 2px 4px rgba(0,0,0,0.4)',
  };

  const paragraphStyle = {
    fontSize: '1.25rem',
    maxWidth: '600px',
    lineHeight: '1.6',
    marginBottom: '2rem',
    color: '#e0e0e0',
  };

  const navStyle = {
    marginTop: '2rem',
  };

  const ulStyle = {
    listStyle: 'none',
    padding: '0',
    margin: '0',
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
  };

  const linkStyle = {
    display: 'inline-block',
    padding: '0.8rem 2rem',
    fontSize: '1.1rem',
    fontWeight: '600',
    textDecoration: 'none',
    color: '#ffffff',
    backgroundColor: '#007bff',
    borderRadius: '8px',
    boxShadow: '0 4px 10px rgba(0, 123, 255, 0.3)',
    transition: 'background-color 0.3s ease, transform 0.2s ease',
  };

  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>Welcome to EduRetrieve!</h1>
      <p style={paragraphStyle}>
        Share and download course modules, connect with a community of students,
        and enhance your learning journey.
      </p>
      <nav style={navStyle}>
        <ul style={ulStyle}>
          <li>
            <Link to="/login" style={linkStyle}>Login</Link>
          </li>
          <li>
            <Link to="/signup" style={linkStyle}>Sign Up</Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export default HomePageContent;
