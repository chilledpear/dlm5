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

// Configuration options - adjust these to balance speed vs quality
const CONFIG = {
  // Set to true for faster, shorter responses (recommended for reliability)
  // Set to false for more detailed responses (may cause timeouts)
  PRIORITIZE_SPEED: true,
  
  // Maximum wait time for API response in milliseconds
  // Vercel Hobby plan has a 10 second limit, Pro plan has 60 seconds
  MAX_TIMEOUT: 9500,  // Set to 9.5 seconds for hobby plan, up to 58000 for pro plan
  
  // Maximum tokens to generate
  MAX_TOKENS: PRIORITIZE_SPEED ? 50 : 250,
  
  // Temperature setting (lower = more deterministic/faster)
  TEMPERATURE: PRIORITIZE_SPEED ? 0.3 : 0.7
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
    
    // For longer messages, warn the user if we're likely to time out
    const messageLength = req.body.message.length;
    console.log(`[${requestId}] Message length: ${messageLength}`);
    
    if (messageLength > 100 && CONFIG.PRIORITIZE_SPEED) {
      console.log(`[${requestId}] Long message detected, may cause timeout`);
    }
    
    // Initialize OpenAI client with DeepSeek configuration
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK,
      baseURL: 'https://api.deepseek.com',  // No /v1 as confirmed working
      timeout: CONFIG.MAX_TIMEOUT - 500,    // Slightly shorter than our overall timeout
      maxRetries: CONFIG.PRIORITIZE_SPEED ? 0 : 1  // No retries in speed mode
    });
    
    console.log(`[${requestId}] Making API call to DeepSeek`);
    
    // Select appropriate system message based on mode
    const systemMessage = CONFIG.PRIORITIZE_SPEED
      ? "You are a helpful assistant. Keep responses extremely brief and concise."
      : "You are an AI assistant that helps people solve problems.";
    
    // Use Promise.race to implement custom timeout handling
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: req.body.message }
        ],
        temperature: CONFIG.TEMPERATURE,
        max_tokens: CONFIG.MAX_TOKENS,
        presence_penalty: CONFIG.PRIORITIZE_SPEED ? -0.5 : 0, // Encourage brevity in speed mode
      }),
      // Custom timeout that rejects just before Vercel would timeout
      new Promise((_, reject) => 
        setTimeout(() => {
          metrics.timeouts++;
          reject(new Error("DeepSeek API call timed out"))
        }, CONFIG.MAX_TIMEOUT)
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