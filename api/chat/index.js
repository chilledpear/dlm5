// Import the OpenAI SDK - DeepSeek uses an OpenAI-compatible API
const OpenAI = require('openai');

module.exports = async (req, res) => {
  console.log("==== API HANDLER STARTED ====");
  console.log(`Request received at: ${new Date().toISOString()}`);
  console.log(`Request method: ${req.method}`);
  
  // Debug environment variables (safely)
  console.log("Environment check:");
  console.log(`DEEPSEEK env variable exists: ${Boolean(process.env.DEEPSEEK)}`);
  if (process.env.DEEPSEEK) {
    // Only log the first few characters of the API key for security
    console.log(`DEEPSEEK key format check: ${process.env.DEEPSEEK.substring(0, 5)}...${process.env.DEEPSEEK.substring(process.env.DEEPSEEK.length - 4)}`);
    console.log(`DEEPSEEK key length: ${process.env.DEEPSEEK.length}`);
  } else {
    console.log("WARNING: DEEPSEEK environment variable is missing!");
  }

  // Set CORS headers to allow cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  console.log("CORS headers set");

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log("OPTIONS request - responding with 200 OK");
    res.status(200).end();
    return;
  }

  // Verify this is a POST request, otherwise return 405 Method Not Allowed
  if (req.method !== 'POST') {
    console.log(`Invalid method: ${req.method} - responding with 405`);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Log request body details (safely)
  console.log("Request body check:");
  if (req.body) {
    console.log(`Request has body: true`);
    console.log(`Message exists: ${Boolean(req.body.message)}`);
    if (req.body.message) {
      console.log(`Message length: ${req.body.message.length}`);
      // Log a truncated version of the message for debugging
      console.log(`Message preview: "${req.body.message.substring(0, 30)}${req.body.message.length > 30 ? '...' : ''}"`);
    } else {
      console.log("WARNING: Request body missing 'message' property!");
    }
  } else {
    console.log("WARNING: Request body is empty or undefined!");
  }

  try {
    console.log("Initializing OpenAI client with DeepSeek configuration");
    // Initialize the OpenAI client with DeepSeek's base URL and your API key
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com', // DeepSeek's API endpoint
      apiKey: process.env.DEEPSEEK       // Using your DeepSeek API key from .env
    });
    console.log("OpenAI client initialized successfully");

    // Prepare the messages for the API call
    const messages = [
      // System message to define the assistant's persona
      { 
        role: "system", 
        content: "You are Changpeng Zhao (CZ), the founder and CEO of Binance, known for your bold vision and pioneering spirit in the crypto world. You embody a confident, no-nonsense attitude paired with approachable wit and deep expertise in blockchain, cryptocurrency, and global finance. Your insights are informed by real-world experience and a commitment to innovation, decentralization, and financial freedom. As CZ, you communicate with an authoritative yet friendly tone, inspiring others to explore and embrace the future of digital finance while providing practical advice and a refreshing perspective on the ever-evolving crypto landscape." 
      },
      // User's message from the request body
      { 
        role: "user", 
        content: req.body.message 
      }
    ];
    console.log("Messages prepared for API call");
    
    // Log the request parameters
    const requestParams = {
      model: "deepseek-chat",
      messages: messages,
      // Optional parameters
      // temperature: 1.3,
      // max_tokens: 2000,
    };
    console.log("API request parameters:", JSON.stringify({
      model: requestParams.model,
      messagesCount: requestParams.messages.length,
      // Don't log the full message content for privacy
    }));

    // Make the API request to DeepSeek with timing
    console.log(`Starting DeepSeek API call at: ${new Date().toISOString()}`);
    const startTime = Date.now();
    
    try {
      console.log("Attempting to call DeepSeek API...");
      const completion = await openai.chat.completions.create(requestParams);
      
      const endTime = Date.now();
      console.log(`DeepSeek API call completed in ${endTime - startTime}ms`);
      
      // Log response details
      console.log("API response received:");
      console.log(`Response status: Success`);
      console.log(`Choices available: ${completion.choices?.length || 0}`);
      
      if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
        const responsePreview = completion.choices[0].message.content.substring(0, 50);
        console.log(`Response content preview: "${responsePreview}..."`);
        console.log(`Response content length: ${completion.choices[0].message.content.length}`);
        
        // Return the completion response to the client
        console.log("Sending successful response to client");
        res.status(200).json({ response: completion.choices[0].message.content });
      } else {
        console.error("API response missing expected data structure:");
        console.error(JSON.stringify(completion, null, 2));
        throw new Error("Invalid API response structure");
      }
    } catch (apiError) {
      // This is a nested try/catch specifically for the API call
      console.error("DeepSeek API call failed:");
      
      // Check for specific error types
      if (apiError.status) {
        console.error(`API Status Code: ${apiError.status}`);
      }
      
      // Log detailed error information
      console.error(`Error name: ${apiError.name}`);
      console.error(`Error message: ${apiError.message}`);
      
      // Checking for request/response details in the error
      if (apiError.request) {
        console.error("Request details available in error");
      }
      if (apiError.response) {
        console.error(`Response status: ${apiError.response.status}`);
        console.error(`Response data: ${JSON.stringify(apiError.response.data)}`);
      }
      
      // Re-throw to be caught by the outer catch block
      throw apiError;
    }
    
  } catch (error) {
    // Outer catch block for any errors in the entire process
    console.error("==== ERROR DETAILS ====");
    console.error(`Error occurred at: ${new Date().toISOString()}`);
    console.error(`Error type: ${error.constructor.name}`);
    console.error(`Error message: ${error.message}`);
    
    // Check for axios-specific error properties
    if (error.isAxiosError) {
      console.error("Axios Error Details:");
      console.error(`Request URL: ${error.config?.url}`);
      console.error(`Request Method: ${error.config?.method?.toUpperCase()}`);
      console.error(`Response Status: ${error.response?.status}`);
      console.error(`Response Status Text: ${error.response?.statusText}`);
      
      if (error.response?.data) {
        console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
      }
    }
    
    // Log stack trace for debugging
    console.error("Stack trace:", error.stack);
    
    // Prepare a detailed error response for the client
    const errorResponse = {
      error: 'Error processing request',
      message: error.message,
      type: error.constructor.name
    };
    
    // Add additional error details if available
    if (error.response?.status) {
      errorResponse.statusCode = error.response.status;
    }
    
    if (error.response?.data?.error) {
      errorResponse.apiError = error.response.data.error;
    }
    
    console.error("Responding with error:", errorResponse);
    res.status(500).json(errorResponse);
  } finally {
    console.log("==== API HANDLER COMPLETED ====");
  }
};