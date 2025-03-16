// Import the OpenAI SDK - DeepSeek uses an OpenAI-compatible API
const OpenAI = require('openai');

module.exports = async (req, res) => {
  // Create a debug object to collect all information
  const debug = {
    timestamp: new Date().toISOString(),
    envVars: {},
    request: {},
    process: {},
    errors: []
  };

  try {
    // Check environment variables
    debug.envVars.deepseekExists = Boolean(process.env.DEEPSEEK);
    debug.envVars.deepseekLength = process.env.DEEPSEEK ? process.env.DEEPSEEK.length : 0;
    debug.envVars.deepseekPrefix = process.env.DEEPSEEK ? process.env.DEEPSEEK.substring(0, 5) : 'none';
    
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

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      debug.request.method = 'OPTIONS';
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

    // Initialize the OpenAI client
    debug.process.clientInitStart = new Date().toISOString();
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK,
      timeout: 60000, // 60 second timeout
      maxRetries: 3   // Retry API calls up to 3 times
    });
    debug.process.clientInitComplete = new Date().toISOString();

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

    // Test with a tiny request first to verify API connectivity
    debug.process.testCallStart = new Date().toISOString();
    try {
      // This is a minimal test call to verify API connectivity
      const testCall = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5
      });
      debug.process.testCallSuccess = true;
      debug.process.testCallResponse = testCall.choices && testCall.choices.length > 0 ? 
        testCall.choices[0].message.content : "No response";
    } catch (testError) {
      debug.process.testCallError = testError.message;
      debug.process.testCallErrorName = testError.constructor.name;
      // Continue with the main request even if test fails
    }
    debug.process.testCallEnd = new Date().toISOString();

    // Make the main API request
    debug.process.mainCallStart = new Date().toISOString();
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
      temperature: 1.0,
      max_tokens: 1000,
    });
    debug.process.mainCallEnd = new Date().toISOString();

    // Validate response
    debug.process.hasCompletion = Boolean(completion);
    debug.process.hasChoices = Boolean(completion && completion.choices);
    debug.process.choicesLength = completion && completion.choices ? completion.choices.length : 0;
    
    if (!completion || !completion.choices || completion.choices.length === 0) {
      throw new Error("Invalid response from DeepSeek API - no choices returned");
    }
    
    const responseContent = completion.choices[0].message.content;
    debug.process.responseLength = responseContent ? responseContent.length : 0;
    
    // Return successful response
    res.status(200).json({ 
      response: responseContent,
      debug: process.env.NODE_ENV === 'development' ? debug : undefined
    });
    
  } catch (error) {
    // Capture detailed error information
    debug.errors.push({
      message: error.message,
      type: error.constructor.name,
      stack: error.stack,
      time: new Date().toISOString()
    });
    
    // Check for specific API error types
    if (error.status) {
      debug.errors.push({
        apiStatus: error.status,
        apiType: error.type,
        apiMessage: error.message
      });
    }
    
    // Try to extract more information if it's an API response error
    if (error.response) {
      debug.errors.push({
        responseStatus: error.response.status,
        responseData: error.response.data
      });
    }

    // Provide a detailed error response to help diagnose the issue
    const errorResponse = {
      error: 'Error processing request: ' + error.message,
      // Include debug information in the response
      debug: debug
    };
    
    // For security in production, we might want to limit debug info
    if (process.env.NODE_ENV === 'production') {
      // Still include some debug info even in production
      errorResponse.apiDetails = {
        keyFormat: debug.envVars.deepseekPrefix ? 'Valid prefix' : 'Invalid prefix',
        keyLength: debug.envVars.deepseekLength,
        requestValid: debug.request.hasMessage
      };
    }
    
    // Send error response
    res.status(500).json(errorResponse);
  }
};