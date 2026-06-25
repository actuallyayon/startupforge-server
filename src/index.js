import 'dotenv/config'
import { createApp } from './app.js'

const PORT = process.env.PORT || 5000

// Local / long-running server (npm run dev, npm start).
createApp()
  .then((app) => {
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
