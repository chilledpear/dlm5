// Import the OpenAI SDK and Vercel KV
const OpenAI = require('openai');
const { kv } = require('@vercel/kv');
require('dotenv').config();

// Track request metrics for debugging
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  timeouts: 0
};

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
    
    // Store the request in Vercel KV with 15-minute expiry
    await kv.set(`chat:${requestId}`, {
      status: 'pending',
      message: req.body.message,
      timestamp: Date.now()
    }, { ex: 900 }); // 900 seconds = 15 minutes
    
    // Start processing in the background
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
    // Get the pending request from KV
    const request = await kv.get(`chat:${requestId}`);
    if (!request) {
      throw new Error('Request not found in KV store');
    }
    
    console.log(`[${requestId}] Starting background processing for message: ${request.message}`);
    
    // Initialize OpenAI client with DeepSeek configuration
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK,
      baseURL: 'https://api.deepseek.com',
      timeout: 35000,  // 35 second timeout to stay under Vercel's limit
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
        temperature: 0.3,    // Lower temperature for faster responses
        max_tokens: 100,     // Reduced tokens for faster responses
        stream: false
      }),
      // Custom timeout that rejects after 30 seconds
      new Promise((_, reject) => 
        setTimeout(() => {
          metrics.timeouts++;
          reject(new Error("DeepSeek API call timed out"))
        }, 30000)
      )
    ]);
    
    // Check for valid response
    if (!completion.choices || completion.choices.length === 0) {
      throw new Error("Invalid response from DeepSeek API");
    }
    
    // Update the request in KV with the completed status and result
    await kv.set(`chat:${requestId}`, {
      status: 'completed',
      result: completion.choices[0].message.content,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime
    }, { ex: 900 }); // Keep result for 15 minutes
    
    metrics.successfulRequests++;
    console.log(`[${requestId}] Processing completed successfully in ${Date.now() - startTime}ms`);
    
  } catch (error) {
    metrics.failedRequests++;
    
    // Update the request with the error status
    await kv.set(`chat:${requestId}`, {
      status: 'error',
      error: error.message || 'Unknown error',
      timestamp: Date.now(),
      processingTime: Date.now() - startTime
    }, { ex: 900 });
    
    console.error(`[${requestId}] Processing error: ${error.message}`);
    
    if (error.status) {
      console.error(`[${requestId}] API Status Code: ${error.status}`);
    }
  }
}