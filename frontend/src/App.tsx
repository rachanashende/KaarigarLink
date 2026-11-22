import { BrowserRouter } from 'react-router'
import { DemoAuthProvider } from './context/DemoAuthProvider'
import { WorkshopDataProvider } from './context/WorkshopDataProvider'
import AppRoutes from './routes/AppRoutes'
import './App.css'

function App() {
  return (
    <DemoAuthProvider>
      <WorkshopDataProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </WorkshopDataProvider>
    </DemoAuthProvider>
  )
}

export default App
