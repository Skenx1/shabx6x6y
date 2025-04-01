const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const https = require("https")
const dotenv = require("dotenv")
const path = require("path")

// Load environment variables
dotenv.config()

// Create Express app
const app = express()

// Middleware - Updated CORS to allow all origins during development
app.use(cors({
  origin: ['https://gamerzhubgh.web.app', 'https://gamerzhubgh.firebaseapp.com', 'http://localhost:3000', '*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Verify Paystack secret key is available
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY
if (!PAYSTACK_SECRET_KEY) {
  console.warn("PAYSTACK_SECRET_KEY is not set in environment variables")
}

// Helper function to make Paystack API requests
function paystackRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    }

    const req = https.request(options, (res) => {
      let responseData = ""

      res.on("data", (chunk) => {
        responseData += chunk
      })

      res.on("end", () => {
        try {
          const parsedData = JSON.parse(responseData)
          resolve(parsedData)
        } catch (error) {
          reject(new Error(`Failed to parse Paystack response: ${error.message}`))
        }
      })
    })

    req.on("error", (error) => {
      reject(new Error(`Paystack request failed: ${error.message}`))
    })

    if (data) {
      req.write(JSON.stringify(data))
    }

    req.end()
  })
}

// Root endpoint - IMPORTANT for Vercel to recognize the app is working
app.get("/", (req, res) => {
  res.status(200).json({
    status: true,
    message: "GamerzHub API server is running. Frontend is at https://gamerzhubgh.web.app"
  })
})

// Initialize payment
app.post("/api/payment/initialize", async (req, res) => {
  try {
    const { email, amount, metadata, tournamentId, registrationId } = req.body

    if (!email || !amount) {
      return res.status(400).json({
        status: false,
        message: "Email and amount are required",
      })
    }

    // Convert amount to pesewa (Paystack uses pesewa for GHS, which is 1/100 of a Cedi)
    const amountInPesewa = Math.floor(Number.parseFloat(amount) * 100)

    // Use Firebase URL for callback
    const baseUrl = "https://gamerzhubgh.web.app"

    // Construct callback URL with all necessary parameters
    const callbackUrl = `${baseUrl}/payment-callback.html?tournamentId=${tournamentId || ""}&registrationId=${registrationId || ""}`

    const paymentData = {
      email,
      amount: amountInPesewa,
      currency: "GHS", // Explicitly set currency to Ghanaian Cedis
      metadata: metadata || {},
      callback_url: callbackUrl,
    }

    console.log("Initializing payment with data:", {
      ...paymentData,
      amount: `${amountInPesewa} pesewas (${amount} GHS)`,
      callback_url: callbackUrl,
    })

    const response = await paystackRequest("POST", "/transaction/initialize", paymentData)

    console.log("Payment initialization response:", response)

    return res.status(200).json(response)
  } catch (error) {
    console.error("Payment initialization error:", error)
    return res.status(500).json({
      status: false,
      message: "Failed to initialize payment",
      error: error.message,
    })
  }
})

// Verify payment
app.get("/api/payment/verify", async (req, res) => {
  try {
    const { reference } = req.query

    if (!reference) {
      return res.status(400).json({
        status: false,
        message: "Payment reference is required",
      })
    }

    console.log("Verifying payment with reference:", reference)

    const response = await paystackRequest("GET", `/transaction/verify/${encodeURIComponent(reference)}`)

    console.log("Payment verification response:", {
      status: response.status,
      paymentStatus: response.data?.status,
      amount: response.data?.amount ? `${response.data.amount / 100} GHS` : "N/A",
      reference: response.data?.reference,
    })

    // Add CORS headers explicitly for this endpoint
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS")
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    return res.status(200).json(response)
  } catch (error) {
    console.error("Payment verification error:", error)
    return res.status(500).json({
      status: false,
      message: "Failed to verify payment",
      error: error.message,
    })
  }
})

// API endpoint to check if server is connected to Firebase frontend
app.get("/api/check-connection", (req, res) => {
  // Add CORS headers explicitly for this endpoint
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS")
  
  res.status(200).json({
    status: true,
    message: "Server is connected to GamerzHub frontend",
    frontend: "https://gamerzhubgh.web.app",
    timestamp: new Date().toISOString()
  })
})

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    message: "Server is running",
    timestamp: new Date().toISOString()
  })
})

// Test endpoint
app.get("/test", (req, res) => {
  res.status(200).send("Server is working!")
})

// Handle preflight OPTIONS requests
app.options("*", cors())

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
})

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
})

// For local development only
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

// CRITICAL: Export the Express app for Vercel
module.exports = app
