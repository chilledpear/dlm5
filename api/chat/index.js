// Import the OpenAI SDK
const OpenAI = require('openai');
require('dotenv').config();

// Initialize global storage for pending requests
// Note: This is for demonstration purposes only
// In production, use a persistent storage solution like Redis, MongoDB, etc.
if (!global.pendingRequests) {
  global.pendingRequests = {};
}

// Track request metrics for debugging
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  timeouts: 0
};

// Main handler function for the /api/chat endpoint
module.exports = async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  const startTime = Date.now();
  
  console.log(`[${requestId}] Request started at ${new Date().toISOString()}`);
  metrics.totalRequests++;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Validate request body
    if (!req.body || !req.body.message) {
      throw new Error('Message is required in request body');
    }
    
    // Message length validation - limit to 200 characters for better performance
    if (req.body.message.length > 200) {
      throw new Error('Message too long (max 200 characters)');
    }
    
    console.log(`[${requestId}] Message length: ${req.body.message.length}`);
    
    // Store the request in our global storage
    global.pendingRequests[requestId] = {
      status: 'pending',
      message: req.body.message,
      timestamp: Date.now()
    };
    
    // Start processing in the background
    // This won't block the response
    processRequestInBackground(requestId);
    
    // Return immediately with the request ID
    res.status(202).json({ 
      requestId: requestId,
      status: 'pending',
      message: 'Request accepted and being processed'
    });
    
    console.log(`[${requestId}] Request acknowledged in ${Date.now() - startTime}ms`);
    
  } catch (error) {
    metrics.failedRequests++;
    console.error(`[${requestId}] Error: ${error.message}`);
    
    let errorMessage = 'Error processing your request';
    let statusCode = 500;
    
    // Handle specific error types
    if (error.message.includes('too long')) {
      errorMessage = 'Message too long (max 200 characters)';
      statusCode = 400;
    }
    
    // Return error response
    res.status(statusCode).json({ error: errorMessage });
    
    console.log(`[${requestId}] Request failed with status ${statusCode} in ${Date.now() - startTime}ms`);
  }
};

// Background processing function that doesn't block the response
async function processRequestInBackground(requestId) {
  const startTime = Date.now();
  
  try {
    // Get the pending request
    const request = global.pendingRequests[requestId];
    if (!request) {
      throw new Error('Request not found');
    }
    
    console.log(`[${requestId}] Starting background processing for message: ${request.message}`);
    
    // Initialize OpenAI client with DeepSeek configuration
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK,
      baseURL: 'https://api.deepseek.com',
      timeout: 45000,  // 45 second timeout 
      maxRetries: 0    // No retries to avoid prolonging timeouts
    });
    
    console.log(`[${requestId}] Making API call to DeepSeek`);
    
    // Use Promise.race to implement custom timeout handling
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { 
            role: "system", 
            content: "You are an AI assistant that helps people solve problems. Keep responses brief and to the point." 
          },
          { 
            role: "user", 
            content: request.message 
          }
        ],
        temperature: 0.5,    // Lower temperature for faster, more deterministic responses
        max_tokens: 150,     // Limited tokens for faster responses
        stream: false        // Ensure streaming is disabled for faster response
      }),
      // Custom timeout that rejects after 40 seconds
      new Promise((_, reject) => 
        setTimeout(() => {
          metrics.timeouts++;
          reject(new Error("DeepSeek API call timed out"))
        }, 40000)
      )
    ]);
    
    // Check for valid response
    if (!completion.choices || completion.choices.length === 0) {
      throw new Error("Invalid response from DeepSeek API");
    }
    
    // Update the request with the completed status and result
    global.pendingRequests[requestId] = {
      status: 'completed',
      result: completion.choices[0].message.content,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime
    };
    
    metrics.successfulRequests++;
    console.log(`[${requestId}] Processing completed successfully in ${Date.now() - startTime}ms`);
    
    // Perform cleanup of old requests (older than 10 minutes)
    cleanupOldRequests();
    
  } catch (error) {
    metrics.failedRequests++;
    
    // Update the request with the error status
    if (global.pendingRequests[requestId]) {
      global.pendingRequests[requestId] = {
        status: 'error',
        error: error.message || 'Unknown error',
        timestamp: Date.now(),
        processingTime: Date.now() - startTime
      };
    }
    
    console.error(`[${requestId}] Processing error: ${error.message}`);
    
    if (error.status) {
      console.error(`[${requestId}] API Status Code: ${error.status}`);
    }
    
    // Perform cleanup even if there's an error
    cleanupOldRequests();
  }
}

// Helper function to clean up old requests to prevent memory leaks
function cleanupOldRequests() {
  try {
    const now = Date.now();
    const tenMinutesAgo = now - (10 * 60 * 1000); // 10 minutes in milliseconds
    
    let cleanedCount = 0;
    
    // Remove completed or error requests older than 10 minutes
    Object.keys(global.pendingRequests).forEach(id => {
      const request = global.pendingRequests[id];
      if (request.status !== 'pending' && request.timestamp < tenMinutesAgo) {
        delete global.pendingRequests[id];
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old requests`);
    }
    
  } catch (error) {
    console.error(`Error during cleanup: ${error.message}`);
  }
}