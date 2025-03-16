// Import the OpenAI SDK - DeepSeek uses an OpenAI-compatible API
const OpenAI = require('openai');
require('dotenv').config();

module.exports = async (req, res) => {
  // Create a comprehensive debug object to track the entire request lifecycle
  const debug = {
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substring(2, 15),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.VERCEL ? 'vercel' : 'unknown',
    envVars: {},
    request: {},
    process: {},
    errors: [],
    timings: {
      start: Date.now(),
      steps: {}
    }
  };

  // Add timing function for detailed performance tracking
  const recordTiming = (step) => {
    debug.timings.steps[step] = Date.now() - debug.timings.start;
  };

  try {
    recordTiming('startProcessing');
    console.log(`[${debug.requestId}] Request received at ${debug.timestamp}`);

    // Environment variable checks
    debug.envVars = {
      deepseekExists: Boolean(process.env.DEEPSEEK),
      deepseekLength: process.env.DEEPSEEK ? process.env.DEEPSEEK.length : 0,
      deepseekPrefix: process.env.DEEPSEEK ? process.env.DEEPSEEK.substring(0, 5) : 'none',
      deepseekValid: process.env.DEEPSEEK && process.env.DEEPSEEK.startsWith('sk-')
    };
    
    console.log(`[${debug.requestId}] Environment check: API key exists=${debug.envVars.deepseekExists}, valid prefix=${debug.envVars.deepseekValid}`);
    
    // Validate API key format
    if (!process.env.DEEPSEEK) {
      throw new Error("DEEPSEEK API key is missing from environment variables");
    }
    
    if (!process.env.DEEPSEEK.startsWith('sk-')) {
      throw new Error("DEEPSEEK API key has invalid format - should start with 'sk-'");
    }

    // Set CORS headers to allow cross-origin requests
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
    debug.process.corsSet = true;
    recordTiming('corsHeadersSet');

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      debug.request.method = 'OPTIONS';
      console.log(`[${debug.requestId}] Handling OPTIONS request`);
      res.status(200).end();
      return;
    }

    // Verify this is a POST request
    debug.request.method = req.method;
    if (req.method !== 'POST') {
      throw new Error(`Invalid HTTP method: ${req.method} - only POST is supported`);
    }

    // Validate request body
    debug.request.hasBody = Boolean(req.body);
    debug.request.hasMessage = Boolean(req.body && req.body.message);
    
    if (!req.body) {
      throw new Error("Request body is missing");
    }
    
    if (!req.body.message) {
      throw new Error("Message property is missing from request body");
    }
    
    debug.request.messageLength = req.body.message.length;
    debug.request.messagePreview = req.body.message.substring(0, 30) + (req.body.message.length > 30 ? '...' : '');
    
    console.log(`[${debug.requestId}] Request validated: message length=${debug.request.messageLength}`);
    recordTiming('requestValidated');

    // Initialize the OpenAI client with DeepSeek's configuration
    console.log(`[${debug.requestId}] Initializing OpenAI client with DeepSeek configuration`);
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK,
      timeout: 25000,          // 25 second timeout - reduced from 60s to catch timeouts faster
      maxRetries: 1,           // Reduced retries to diagnose issues more clearly
      defaultHeaders: {         // Add custom headers for debugging
        'X-Request-ID': debug.requestId
      }
    });
    debug.process.clientInitialized = true;
    recordTiming('clientInitialized');

    // Prepare messages for the API call
    const messages = [
      { 
        role: "system", 
        content: "You are Changpeng Zhao (CZ), the founder and CEO of Binance, known for your bold vision and pioneering spirit in the crypto world. You embody a confident, no-nonsense attitude paired with approachable wit and deep expertise in blockchain, cryptocurrency, and global finance. Your insights are informed by real-world experience and a commitment to innovation, decentralization, and financial freedom. As CZ, you communicate with an authoritative yet friendly tone, inspiring others to explore and embrace the future of digital finance while providing practical advice and a refreshing perspective on the ever-evolving crypto landscape." 
      },
      { 
        role: "user", 
        content: req.body.message 
      }
    ];
    debug.process.messagesCreated = true;
    recordTiming('messagesCreated');

    // Small test call to check API connectivity
    console.log(`[${debug.requestId}] Making test API call to DeepSeek`);
    debug.process.testApiCallStarted = true;
    let testCallSuccess = false;
    
    try {
      // Set a shorter timeout for the test call
      const testStart = Date.now();
      const testResponse = await Promise.race([
        openai.chat.completions.create({
          model: "deepseek-chat",
          messages: [{ role: "user", content: "Test" }],
          max_tokens: 5
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Test call timeout")), 10000)
        )
      ]);
      
      const testDuration = Date.now() - testStart;
      testCallSuccess = true;
      
      debug.process.testApiCallCompleted = true;
      debug.process.testApiCallDuration = testDuration;
      debug.process.testResponseReceived = Boolean(testResponse);
      
      console.log(`[${debug.requestId}] Test API call succeeded in ${testDuration}ms`);
    } catch (testError) {
      console.error(`[${debug.requestId}] Test API call failed: ${testError.message}`);
      debug.process.testApiCallError = testError.message;
      debug.process.testApiCallErrorType = testError.constructor.name;
      
      // If this is an API error with status code, capture it
      if (testError.status) {
        debug.process.testApiCallErrorStatus = testError.status;
        debug.process.testApiCallErrorDetails = testError.error || testError.message;
      }
      
      // We'll continue with the main request even if the test fails
      // This helps diagnose if there's something specific about the main request that's failing
    }
    recordTiming('testApiCallCompleted');
    
    // Only proceed with main call if test call succeeded, or we're in production
    // In production, we'll try the main call even if the test failed
    const shouldProceedWithMainCall = testCallSuccess || process.env.NODE_ENV === 'production';
    
    if (!shouldProceedWithMainCall) {
      throw new Error(`Skipping main API call because test call failed: ${debug.process.testApiCallError}`);
    }

    // Make the main API request
    console.log(`[${debug.requestId}] Making main API call to DeepSeek`);
    debug.process.mainApiCallStarted = true;
    recordTiming('mainApiCallStarted');
    
    // Use Promise.race to implement our own timeout handling
    const mainCallStart = Date.now();
    const mainApiResult = await Promise.race([
      openai.chat.completions.create({
        model: "deepseek-chat",
        messages: messages,
        temperature: 1.0,
        max_tokens: 800,
      }),
      // Custom timeout promise that rejects after 25 seconds
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("DeepSeek API call timed out after 25 seconds")), 25000)
      )
    ]);
    
    const mainCallDuration = Date.now() - mainCallStart;
    debug.process.mainApiCallDuration = mainCallDuration;
    debug.process.mainApiCallCompleted = true;
    
    console.log(`[${debug.requestId}] Main API call completed in ${mainCallDuration}ms`);
    recordTiming('mainApiCallCompleted');

    // Validate the response
    if (!mainApiResult || !mainApiResult.choices || mainApiResult.choices.length === 0) {
      throw new Error("Invalid response from DeepSeek API - no choices returned");
    }
    
    const responseContent = mainApiResult.choices[0].message.content;
    debug.process.responseLength = responseContent.length;
    debug.process.responsePreview = responseContent.substring(0, 50) + (responseContent.length > 50 ? '...' : '');
    
    console.log(`[${debug.requestId}] Valid response received, length: ${debug.process.responseLength}`);
    recordTiming('responseValidated');
    
    // Complete timing information
    debug.timings.total = Date.now() - debug.timings.start;
    debug.timings.apiCallPercentage = Math.round((debug.process.mainApiCallDuration / debug.timings.total) * 100);
    
    // Return successful response
    res.status(200).json({ 
      response: responseContent,
      // Include debug info in non-production environments
      debug: process.env.NODE_ENV !== 'production' ? debug : undefined
    });
    
    console.log(`[${debug.requestId}] Request completed successfully in ${debug.timings.total}ms`);
    
  } catch (error) {
    // Calculate total processing time so far
    debug.timings.error = Date.now() - debug.timings.start;
    
    // Log the error
    console.error(`[${debug.requestId}] Error: ${error.message}`);
    
    // Capture detailed error information
    const errorDetails = {
      message: error.message,
      type: error.constructor.name,
      time: new Date().toISOString(),
      stack: error.stack
    };
    
    debug.errors.push(errorDetails);
    
    // Add more specific error diagnosis for timeout issues
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      debug.errors.push({
        diagnosis: 'TIMEOUT_ERROR',
        suggestion: 'The DeepSeek API is taking too long to respond. This could be due to high load on their servers, network issues, or the complexity of your request.'
      });
    }
    
    // Check for specific API error types
    if (error.status) {
      debug.errors.push({
        apiStatus: error.status,
        apiType: error.type || 'unknown',
        apiMessage: error.message,
        apiCode: error.code
      });
      
      // Special handling for common API error codes
      if (error.status === 402) {
        debug.errors.push({
          diagnosis: 'INSUFFICIENT_BALANCE',
          suggestion: 'Your DeepSeek account has insufficient balance. Please add credits to your account.'
        });
      } else if (error.status === 429) {
        debug.errors.push({
          diagnosis: 'RATE_LIMIT_EXCEEDED',
          suggestion: 'You have exceeded the rate limit for the DeepSeek API. Please reduce the frequency of your requests.'
        });
      }
    }
    
    // Try to extract more information if it's an API response error
    if (error.response) {
      debug.errors.push({
        responseStatus: error.response.status,
        responseData: error.response.data
      });
    }

    // Provide a user-friendly error message based on the error type
    let userErrorMessage = 'Error processing your request.';
    let statusCode = 500;
    
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      userErrorMessage = 'The AI service is taking too long to respond. Please try again with a shorter message.';
      statusCode = 504; // Gateway Timeout
    } else if (error.status === 402) {
      userErrorMessage = 'Account has insufficient balance. Please contact the administrator.';
      statusCode = 402;
    } else if (error.status === 429) {
      userErrorMessage = 'Too many requests. Please try again later.';
      statusCode = 429;
    } else if (!process.env.DEEPSEEK || !process.env.DEEPSEEK.startsWith('sk-')) {
      userErrorMessage = 'Server configuration error. Please contact the administrator.';
      statusCode = 500;
    }

    // Send error response with debug information
    res.status(statusCode).json({
      error: userErrorMessage,
      // Include debug info in development or if explicitly requested
      debug: process.env.NODE_ENV !== 'production' ? debug : undefined
    });
    
    console.log(`[${debug.requestId}] Request failed with status ${statusCode} in ${debug.timings.error}ms`);
  }
};