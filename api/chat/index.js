// Import the OpenAI SDK
const OpenAI = require('openai');
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
    
    console.log(`[${requestId}] Message length: ${req.body.message.length}`);
    
    // Initialize OpenAI client with DeepSeek configuration
    // Note: Removed /v1 from baseURL as requested
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK,
      baseURL: 'https://api.deepseek.com',
      timeout: 30000,  // 30 second timeout
      maxRetries: 1    // Minimal retries to avoid prolonging timeouts
    });
    
    console.log(`[${requestId}] Making API call to DeepSeek`);
    
    // Use Promise.race to implement custom timeout handling
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          // Updated system prompt as requested
          { 
            role: "system", 
            content: "You are a helpful assistant that helps people solve problems." 
          },
          { 
            role: "user", 
            content: req.body.message 
          }
        ],
        temperature: 0.7,
        max_tokens: 300,  // Moderate-sized responses
      }),
      // Custom timeout that rejects after 28 seconds
      new Promise((_, reject) => 
        setTimeout(() => {
          metrics.timeouts++;
          reject(new Error("DeepSeek API call timed out"))
        }, 28000)
      )
    ]);
    
    const responseTime = Date.now() - startTime;
    console.log(`[${requestId}] API call completed in ${responseTime}ms`);
    
    // Validate the response
    if (!completion.choices || completion.choices.length === 0) {
      throw new Error("Invalid response from DeepSeek API");
    }
    
    // Return successful response
    metrics.successfulRequests++;
    res.status(200).json({ response: completion.choices[0].message.content });
    
    console.log(`[${requestId}] Request completed successfully in ${Date.now() - startTime}ms`);
    console.log(`Metrics: ${JSON.stringify(metrics)}`);
    
  } catch (error) {
    metrics.failedRequests++;
    console.error(`[${requestId}] Error: ${error.message}`);
    
    if (error.status) {
      console.error(`[${requestId}] API Status Code: ${error.status}`);
    }
    
    let errorMessage = 'Error processing your request';
    let statusCode = 500;
    
    // Handle specific error types
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      errorMessage = 'The AI service is taking too long to respond. Please try a shorter message or try again later.';
      statusCode = 504;
    } else if (error.status === 402) {
      errorMessage = 'Account has insufficient balance. Please contact the administrator.';
      statusCode = 402;
    } else if (error.status === 429) {
      errorMessage = 'Too many requests. Please try again later.';
      statusCode = 429;
    }
    
    // Return error response
    res.status(statusCode).json({ error: errorMessage });
    
    console.log(`[${requestId}] Request failed with status ${statusCode} in ${Date.now() - startTime}ms`);
    console.log(`Error metrics: ${JSON.stringify(metrics)}`);
  }
};