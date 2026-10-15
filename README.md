# Watch Engine

A comprehensive watch discovery and recommendation platform that combines AI-powered search capabilities with a modern web interface. Watch Engine helps users find their perfect timepiece through natural language queries, advanced filtering, and intelligent recommendations.

## 🌟 Features

### 🔍 Intelligent Search
- **Natural Language Processing**: Describe your ideal watch in plain English (e.g., "Find me a diving watch with a blue dial under $5000")
- **AI-Powered Query Analysis**: Uses OpenAI's GPT-4 to understand and extract search criteria from user queries
- **Vector Similarity Search**: Advanced semantic search using embeddings for finding watches based on meaning, not just keywords
- **Advanced Filtering**: Comprehensive filters for price, year, movement, function, dial color, and more

### 🎨 Modern User Interface
- **Responsive Design**: Beautiful, modern interface that works on all devices
- **Dark Theme**: Elegant dark gradient background with glassmorphism effects
- **Interactive Components**: Smooth animations and hover effects
- **Real-time Search**: Instant search results with loading states and error handling

### 👤 User Management
- **Authentication**: Secure user authentication powered by Supabase
- **User Profiles**: Personalized user profiles and preferences
- **Favorites System**: Save and manage favorite watches
- **Watch Lists**: Create custom collections of watches
- **Protected Routes**: Secure access to user-specific features

### 📊 Watch Database
- **Comprehensive Database**: Extensive collection of watch data including brands, models, specifications, and pricing
- **High-Quality Images**: Professional watch photography with optimized loading
- **Detailed Specifications**: Complete watch information including movement, function, year, and more
- **Brand Browsing**: Alphabetically organized brand directory

### 🔧 Technical Features
- **API Proxy**: Secure image proxying to prevent CORS issues
- **Rate Limiting**: Built-in API rate limiting for optimal performance
- **Error Handling**: Comprehensive error handling and user feedback
- **TypeScript**: Full type safety throughout the application
- **Modern Build Tools**: Vite for fast development and optimized builds

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Routing**: React Router DOM for client-side navigation
- **Styling**: Styled Components for component-based styling
- **State Management**: React Context for authentication state
- **Build Tool**: Vite for fast development and optimized production builds

### Backend (Node.js + Express)
- **Runtime**: Node.js with Express.js framework
- **AI Integration**: OpenAI GPT-4 for query analysis and watch recommendations
- **Database**: Supabase (PostgreSQL) for data storage and authentication
- **Security**: CORS configuration, rate limiting, and input validation
- **API Design**: RESTful API with proper error handling and response formatting

### Data Pipeline
- **Data Source**: Watch Database API (RapidAPI)
- **Processing**: Automated data fetching and processing scripts
- **Embeddings**: OpenAI text-embedding-3-small for vector similarity search
- **Storage**: Supabase PostgreSQL with vector search capabilities

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Supabase account
- OpenAI API key
- RapidAPI account (for data pipeline)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Watch-Engine
   ```

2. **Install root dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd webapp
   npm install
   ```

4. **Install backend dependencies**
   ```bash
   cd ../backend
   npm install
   ```

5. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   
   # RapidAPI Configuration (for data pipeline)
   RAPIDAPI_KEY=your_rapidapi_key
   
   # Backend Configuration
   NODE_ENV=development
   PORT=5000
   ```

6. **Set up Supabase database**
   
   Create the following tables in your Supabase database:
   
   ```sql
   -- Brands table
   CREATE TABLE brands (
     id SERIAL PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );
   
   -- Watches table
   CREATE TABLE watches (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     reference VARCHAR(255),
     brand_id INTEGER REFERENCES brands(id),
     model_name VARCHAR(255) NOT NULL,
     family_name VARCHAR(255),
     movement_name VARCHAR(255),
     function_name VARCHAR(255),
     year_produced VARCHAR(50),
     limited_edition VARCHAR(255),
     price_eur DECIMAL(10,2),
     image_url TEXT,
     image_filename VARCHAR(255),
     description TEXT,
     dial_color VARCHAR(100),
     source VARCHAR(100),
     raw_data JSONB,
     embedding VECTOR(512),
     created_at TIMESTAMP DEFAULT NOW(),
     last_updated TIMESTAMP DEFAULT NOW()
   );
   
   -- Favorites table
   CREATE TABLE favorites (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id),
     watch_id UUID REFERENCES watches(id),
     created_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(user_id, watch_id)
   );
   
   -- Watch lists table
   CREATE TABLE watch_lists (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id),
     name VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );
   
   -- Watch list items table
   CREATE TABLE watch_list_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     list_id UUID REFERENCES watch_lists(id) ON DELETE CASCADE,
     watch_id UUID REFERENCES watches(id) ON DELETE CASCADE,
     created_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(list_id, watch_id)
   );
   
   -- Enable vector similarity search
   CREATE EXTENSION IF NOT EXISTS vector;
   
   -- Create index for vector similarity search
   CREATE INDEX ON watches USING ivfflat (embedding vector_cosine_ops);
   
   -- Create function for vector similarity search
   CREATE OR REPLACE FUNCTION search_watches_by_similarity(
     query_text TEXT,
     similarity_threshold FLOAT DEFAULT 0.1
   )
   RETURNS TABLE (
     id UUID,
     reference VARCHAR(255),
     brand_id INTEGER,
     model_name VARCHAR(255),
     family_name VARCHAR(255),
     movement_name VARCHAR(255),
     function_name VARCHAR(255),
     year_produced VARCHAR(50),
     limited_edition VARCHAR(255),
     price_eur DECIMAL(10,2),
     image_url TEXT,
     image_filename VARCHAR(255),
     description TEXT,
     dial_color VARCHAR(100),
     source VARCHAR(100),
     raw_data JSONB,
     created_at TIMESTAMP,
     last_updated TIMESTAMP,
     similarity FLOAT
   )
   LANGUAGE plpgsql
   AS $$
   DECLARE
     query_embedding VECTOR(512);
   BEGIN
     -- Generate embedding for the query text using OpenAI
     -- Note: This would typically be done in the application layer
     -- For now, we'll use a placeholder
     query_embedding := array_fill(0.0, ARRAY[512]);
     
     RETURN QUERY
     SELECT 
       w.*,
       1 - (w.embedding <=> query_embedding) as similarity
     FROM watches w
     WHERE 1 - (w.embedding <=> query_embedding) > similarity_threshold
     ORDER BY w.embedding <=> query_embedding
     LIMIT 50;
   END;
   $$;
   ```

### Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start the frontend development server**
   ```bash
   cd webapp
   npm run dev
   ```

3. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

### Data Pipeline

To populate the database with watch data:

1. **Run the data pipeline**
   ```bash
   cd "data pipeline"
   node getWatches.js
   ```

2. **Run the brands pipeline**
   ```bash
   node getBrands.js
   ```

## 📁 Project Structure

```
Watch-Engine/
├── backend/                 # Backend API server
│   ├── server.js           # Main server file
│   ├── server.test.js      # API tests
│   ├── package.json        # Backend dependencies
│   └── jest.config.js      # Test configuration
├── webapp/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   ├── contexts/       # React context providers
│   │   ├── lib/           # Utility libraries
│   │   ├── pages/         # Page components
│   │   └── types/         # TypeScript type definitions
│   ├── public/            # Static assets
│   ├── dist/              # Built application
│   └── package.json       # Frontend dependencies
├── data pipeline/         # Data processing scripts
│   ├── getWatches.js      # Watch data fetcher
│   └── getBrands.js       # Brand data fetcher
├── package.json           # Root dependencies
└── README.md             # This file
```

## 🔧 API Endpoints

### Search Endpoints
- `POST /api/analyze-query` - Analyze natural language queries
- `POST /api/search-watches` - Search watches using AI recommendations

### Utility Endpoints
- `GET /api/proxy-image` - Proxy images to prevent CORS issues

## 🧪 Testing

Run the test suite:

```bash
cd backend
npm test
```

## 🚀 Deployment

### Frontend Deployment (Vercel/Netlify)
1. Build the frontend:
   ```bash
   cd webapp
   npm run build
   ```

2. Deploy the `dist` folder to your hosting platform

### Backend Deployment (Render/Heroku)
1. Set up environment variables in your hosting platform
2. Deploy the backend folder
3. Update CORS settings to include your frontend domain

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) for AI capabilities
- [Supabase](https://supabase.com/) for backend services
- [RapidAPI](https://rapidapi.com/) for watch data
- [React](https://reactjs.org/) and [Vite](https://vitejs.dev/) for the frontend framework
- [Express.js](https://expressjs.com/) for the backend framework

## 📞 Support

If you have any questions or need help, please open an issue in the GitHub repository.

---

**Watch Engine** - Find your perfect timepiece with the power of AI.
