import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './styles/themes.css'
import './styles/podcast.css'
import './styles/library.css'
import './styles/transcript.css'

const container = document.getElementById('root')
if (container) {
  ReactDOM.createRoot(container).render(<App />)
}
