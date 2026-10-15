import Navbar from '../components/navbar'  
import './About.css';  // Import the CSS file for styling
export default function About() {
  return (
    <div className="about-page">
    <Navbar />
    <div className="about-container">
      
      <header className="about-header">
      <h1>About Watch Search Engine</h1>
      </header>

    <section className="about-content">
      <h2>What is the Watch Search Engine?</h2>
      <p>
        The Watch Search Engine is a powerful platform that helps users discover the best watches available
        on the market. With access to a vast database of watch brands and models, it allows users to search, 
        compare, and explore watches based on their preferences.
      </p>

      <h2>How Does It Work?</h2>
      <p>
        The platform aggregates data from various watch manufacturers' websites using web scraping techniques. 
        Information such as brand, model, price, features, and images are collected and stored in a MongoDB 
        database. This data is then made accessible via an intuitive user interface.
      </p>

      <h2>Our Mission</h2>
      <p>
        We aim to provide users with a fast and seamless experience when searching for watches, ensuring they 
        have all the details they need to make an informed decision.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have any questions or feedback, feel free to reach out to us at <a href="mailto:watch.engine.customer@gmail.com">watch.engine.customer@gmail.com</a>.
      </p>
    </section>

    <footer className="about-footer">
      <p>&copy; 2025 Watch Search Engine. All rights reserved.</p>
    </footer>
  </div>
  </div>
  );
}
