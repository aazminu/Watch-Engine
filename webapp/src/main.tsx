import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Home from './pages/index'

// Every page except the landing search is split into its own chunk,
// so recharts etc. only download when a page that needs them is opened
const About = lazy(() => import('./pages/about'))
const Brands = lazy(() => import('./pages/brands'))
const Login = lazy(() => import('./pages/login'))
const BrandPage = lazy(() => import('./pages/brandPage'))
const WatchDetails = lazy(() => import('./pages/watchDetails'))
const Profile = lazy(() => import('./pages/profile'))
const ProfileSetup = lazy(() => import('./pages/profile-setup'))
const Alerts = lazy(() => import('./pages/alerts'))
const Pricing = lazy(() => import('./pages/pricing'))
const NotFound = lazy(() => import('./pages/notFound'))
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import { ProtectedRoute } from './components/ProtectedRoute'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SubscriptionProvider>
        <BrowserRouter>
          <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a' }} />}>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/login" element={<Login />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/brand/:id" element={<BrandPage />} />
            <Route path="/watch/:id" element={<WatchDetails />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alerts"
              element={
                <ProtectedRoute>
                  <Alerts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile-setup"
              element={
                <ProtectedRoute>
                  <ProfileSetup />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </SubscriptionProvider>
    </AuthProvider>
  </StrictMode>,
)
